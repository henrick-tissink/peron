import { Hono } from "hono";
import { z } from "zod";
import type { PriceResponse } from "@peron/types";
import type { AppEnv } from "../app.js";
import { priceRateLimit } from "../middleware/rate-limit.js";
import { priceRaw } from "../cfr/client.js";
import { parsePriceSnippet } from "../parser/price.js";
import { CaptchaError, UpstreamError } from "../cfr/errors.js";

const PriceBodySchema = z.object({
  transactionString: z.string().min(1),
  fareTypeId: z.enum(["73", "71", "72", "50", "74", "53"]),
  serviceKey: z.string().min(1),
});

export function priceRoute() {
  const r = new Hono<AppEnv>();

  r.use("/", priceRateLimit);

  r.post("/", async (c) => {
    const deps = c.get("deps");
    const log = c.get("log");

    const rawBody = await c.req.json().catch(() => null);
    const parsed = PriceBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ ok: false, reason: "unavailable" } satisfies PriceResponse, 400);
    }

    const sessionId = deps.pins.get(parsed.data.transactionString);
    if (!sessionId) {
      return c.json({ ok: false, reason: "expired" } satisfies PriceResponse, 410);
    }

    try {
      const html = await deps.pool.withPinnedSession(sessionId, async (session) => {
        const creds = (session as unknown as { creds_: {
          cookie: string;
          confirmationKey: string;
          requestVerificationToken: string;
        } }).creds_;
        return priceRaw(creds, parsed.data);
      });
      const result = parsePriceSnippet(html);
      log.info({
        msg: "price.ok",
        ok: result.ok,
        amount: result.ok ? result.amount : undefined,
      });
      return c.json(result);
    } catch (err) {
      if (err instanceof CaptchaError) {
        return c.json({ ok: false, reason: "unavailable" } satisfies PriceResponse);
      }
      if (err instanceof UpstreamError) {
        if (err.httpStatus === 410) {
          return c.json({ ok: false, reason: "expired" } satisfies PriceResponse, 410);
        }
        return c.json({ ok: false, reason: "unavailable" } satisfies PriceResponse);
      }
      log.error({ msg: "price.error", err: (err as Error).message });
      return c.json({ ok: false, reason: "unavailable" } satisfies PriceResponse, 500);
    }
  });

  return r;
}
