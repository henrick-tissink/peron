import * as Sentry from "@sentry/node";
import { Hono } from "hono";
import { z } from "zod";
import type { SearchResponse } from "@peron/types";
import type { AppEnv } from "../app.js";
import { searchRateLimit } from "../middleware/rate-limit.js";
import { searchRaw } from "../cfr/client.js";
import { parseItineraries } from "../parser/itinerary.js";
import { CaptchaError, UpstreamError } from "../cfr/errors.js";

const SearchBodySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export function searchRoute() {
  const r = new Hono<AppEnv>();

  r.use("/", searchRateLimit);

  r.post("/", async (c) => {
    const deps = c.get("deps");
    const log = c.get("log");

    const rawBody = await c.req.json().catch(() => null);
    const parsed = SearchBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          itineraries: [],
          warning: {
            kind: "our-bug" as const,
            errorId: "invalid-request",
          },
          meta: { parseSuccessRate: 0, latencyMs: 0 },
        } satisfies SearchResponse,
        400,
      );
    }

    const start = Date.now();

    try {
      const result = await deps.pool.withSession(parsed.data.from, parsed.data.to, async (session) => {
        const creds = (session as unknown as { creds_: {
          cookie: string;
          confirmationKey: string;
          requestVerificationToken: string;
        } }).creds_;
        const html = await searchRaw(creds, parsed.data);
        return { html, sessionId: session.id };
      });

      const parseResult = parseItineraries(result.html, result.sessionId);

      const txs = parseResult.itineraries.map((it) => it.transactionString).filter(Boolean);
      deps.pins.setMany(result.sessionId, txs);

      log.info({
        msg: "search.ok",
        detectedCount: parseResult.meta.detectedCount,
        parseSuccessRate: parseResult.meta.parseSuccessRate,
      });

      const response: SearchResponse = {
        itineraries: parseResult.itineraries,
        warning: parseResult.warning,
        meta: {
          parseSuccessRate: parseResult.meta.parseSuccessRate,
          latencyMs: Date.now() - start,
        },
      };
      return c.json(response);
    } catch (err) {
      if (err instanceof CaptchaError) {
        const response: SearchResponse = {
          itineraries: [],
          warning: { kind: "captcha", retryAfterSec: 60 },
          meta: { parseSuccessRate: 0, latencyMs: Date.now() - start },
        };
        return c.json(response, 200);
      }
      if (err instanceof UpstreamError) {
        const response: SearchResponse = {
          itineraries: [],
          warning: { kind: "cfr-unavailable", httpStatus: err.httpStatus },
          meta: { parseSuccessRate: 0, latencyMs: Date.now() - start },
        };
        return c.json(response, 200);
      }
      const errorId = crypto.randomUUID();
      log.error({ msg: "search.error", errorId, err: (err as Error).message });
      Sentry.captureException(err, { tags: { errorId, route: "search" } });
      const response: SearchResponse = {
        itineraries: [],
        warning: { kind: "our-bug", errorId },
        meta: { parseSuccessRate: 0, latencyMs: Date.now() - start },
      };
      return c.json(response, 500);
    }
  });

  return r;
}
