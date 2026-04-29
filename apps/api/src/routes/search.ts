import * as Sentry from "@sentry/node";
import { Hono } from "hono";
import { z } from "zod";
import type { SearchResponse } from "@peron/types";
import type { AppEnv } from "../app.js";
import { searchRateLimit } from "../middleware/rate-limit.js";
import { searchItineraries } from "../services/search-service.js";
import { BootstrapError, CaptchaError, UpstreamError } from "../cfr/errors.js";

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
          warning: { kind: "our-bug" as const, errorId: "invalid-request" },
          meta: { parseSuccessRate: 0, latencyMs: 0 },
        } satisfies SearchResponse,
        400,
      );
    }

    const start = Date.now();

    try {
      const result = await searchItineraries(deps, parsed.data);
      log.info({
        msg: "search.ok",
        parseSuccessRate: result.parseSuccessRate,
      });
      const response: SearchResponse = {
        itineraries: result.itineraries,
        warning: result.warning,
        meta: {
          parseSuccessRate: result.parseSuccessRate,
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
      if (err instanceof BootstrapError) {
        // CFR served a 200 but no extractable tokens — most likely a captcha page
        // variant or maintenance HTML. From the user's POV that's an upstream
        // issue, not a Peron bug. Still log + Sentry-capture so we can investigate
        // if frequency creeps up (could signal a real form-schema regression).
        log.warn({ msg: "search.bootstrap-fail", err: err.message, detail: err.detail });
        Sentry.captureException(err, { tags: { route: "search", kind: "bootstrap" } });
        const response: SearchResponse = {
          itineraries: [],
          warning: { kind: "cfr-unavailable", httpStatus: 0 },
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
