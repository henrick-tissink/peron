import { Hono } from "hono";
import { requestLogger, type PeronLogger } from "./middleware/logger.js";
import { corsMiddleware } from "./middleware/cors.js";
import { SessionPool } from "./pool/pool.js";
import { PinMap } from "./pins.js";
import { StationRegistry } from "./stations/registry.js";
import { stationsRoute } from "./routes/stations.js";
import { searchRoute } from "./routes/search.js";
import { priceRoute } from "./routes/price.js";
import { boardRoute } from "./routes/board.js";

export type AppDeps = {
  pool: SessionPool;
  pins: PinMap;
  stations: StationRegistry;
};

// Shared across app and all sub-routers so context typing stays consistent.
// Do NOT use `declare module "hono"` augmentation — the explicit generic here
// overrides ContextVariableMap, so we must include every Variables key explicitly.
export type AppEnv = {
  Variables: {
    deps: AppDeps;
    log: PeronLogger;
    requestId: string;
  };
};

export function makeApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use("*", corsMiddleware);
  app.use("*", requestLogger);
  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      pool: { size: deps.pool.size, breakerOpen: deps.pool.breakerOpen },
      stations: { cached: deps.stations.size },
    }),
  );

  app.route("/api/stations", stationsRoute());
  app.route("/api/search", searchRoute());
  app.route("/api/price", priceRoute());
  app.route("/api/board", boardRoute());

  return app;
}

// Default app used by tests and dev: build fresh deps.
export const app = makeApp({
  // maxSize tuned for: (12-cell fare matrix on /api/price) × (concurrent users)
  // + (board aggregator parallelism, 5 destinations) + (live ticker polling).
  // Each session is ~1KB of cookies+tokens, so 30 is a free upgrade. The
  // previous size 3 caused fare-matrix cells to return "expired" on any
  // concurrent traffic — confirmed via QA suite.
  pool: new SessionPool({ maxSize: 30 }),
  pins: new PinMap({ ttlMs: 30 * 60 * 1000 }),
  stations: new StationRegistry(),
});
