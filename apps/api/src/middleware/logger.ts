import { createMiddleware } from "hono/factory";
import { pino } from "pino";
import { randomUUID } from "node:crypto";

const baseLogger = pino({ level: process.env.LOG_LEVEL ?? "info" });

export type PeronLogger = ReturnType<typeof baseLogger.child>;

export const requestLogger = createMiddleware(async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? randomUUID();
  const child = baseLogger.child({ requestId });
  c.set("requestId", requestId);
  c.set("log", child);
  c.header("x-request-id", requestId);

  const start = performance.now();
  try {
    await next();
  } finally {
    const latencyMs = Math.round(performance.now() - start);
    child.info({
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      latencyMs,
    });
  }
});

export { baseLogger };
