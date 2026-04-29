import * as Sentry from "@sentry/node";
import { Hono } from "hono";
import type { BoardResponse, BoardDirection } from "@peron/types";
import type { AppEnv } from "../app.js";
import { aggregateBoard } from "../services/board-aggregator.js";
import { searchItinerariesSafe } from "../services/search-service.js";
import { destinationsFor } from "../cfr/board-roster.js";

type CacheEntry = { value: BoardResponse; expiresAt: number };
const CACHE_TTL_MS = 60_000;

export function boardRoute() {
  const r = new Hono<AppEnv>();
  const cache = new Map<string, CacheEntry>();

  r.get("/:slug", async (c) => {
    const deps = c.get("deps");
    const log = c.get("log");
    const slug = c.req.param("slug");
    const direction: BoardDirection = c.req.query("direction") === "arrivals" ? "arrivals" : "departures";
    const cacheKey = `${slug}:${direction}`;
    const now = Date.now();

    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > now) {
      return c.json(hit.value);
    }

    try {
      const today = new Date().toISOString().slice(0, 10);
      const value = await aggregateBoard({
        slug,
        direction,
        destinations: destinationsFor(slug),
        search: (from, to) => searchItinerariesSafe(deps, { from, to, date: today }),
      });
      cache.set(cacheKey, { value, expiresAt: now + CACHE_TTL_MS });
      log.info({ msg: "board.ok", slug, direction, entries: value.entries.length });
      return c.json(value);
    } catch (err) {
      log.error({ msg: "board.error", slug, err: (err as Error).message });
      Sentry.captureException(err, { tags: { route: "board", slug } });
      return c.json(
        {
          station: { name: slug, slug },
          direction,
          entries: [],
          updatedAt: new Date().toISOString(),
          source: "aggregated" as const,
          warning: { kind: "rate-limited" as const },
        } satisfies BoardResponse,
        500,
      );
    }
  });

  return r;
}
