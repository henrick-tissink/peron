import { rateLimiter, MemoryStore } from "hono-rate-limiter";
import type { Context } from "hono";

function clientIp(c: Context): string {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return c.req.header("x-real-ip") ?? "unknown";
}

const WINDOW_MS = 5 * 60 * 1000;

export const searchStore = new MemoryStore();
export const priceStore = new MemoryStore();

export const searchRateLimit = rateLimiter({
  windowMs: WINDOW_MS,
  limit: 50,
  standardHeaders: "draft-7",
  store: searchStore,
  keyGenerator: clientIp,
  handler: (c, _next, options) => {
    const info = (c as any).get("rateLimit") as { resetTime?: Date } | undefined;
    const retryAfterSec = info?.resetTime
      ? Math.max(1, Math.ceil((info.resetTime.getTime() - Date.now()) / 1000))
      : Math.ceil(WINDOW_MS / 1000);
    c.status(options.statusCode as 429);
    return c.json({ kind: "rate-limited" as const, retryAfterSec });
  },
});

export const priceRateLimit = rateLimiter({
  windowMs: WINDOW_MS,
  limit: 100,
  standardHeaders: "draft-7",
  store: priceStore,
  keyGenerator: clientIp,
  handler: (c, _next, options) => {
    const info = (c as any).get("rateLimit") as { resetTime?: Date } | undefined;
    const retryAfterSec = info?.resetTime
      ? Math.max(1, Math.ceil((info.resetTime.getTime() - Date.now()) / 1000))
      : Math.ceil(WINDOW_MS / 1000);
    c.status(options.statusCode as 429);
    return c.json({ kind: "rate-limited" as const, retryAfterSec });
  },
});

export function resetRateLimits(): void {
  searchStore.resetAll?.();
  priceStore.resetAll?.();
}
