import * as Sentry from "@sentry/node";
import { Hono } from "hono";
import type { BoardResponse, BoardDirection, BoardEntry } from "@peron/types";
import type { AppEnv } from "../app.js";
import { aggregateBoard } from "../services/board-aggregator.js";
import { searchItinerariesSafe } from "../services/search-service.js";
import { destinationsFor } from "../cfr/board-roster.js";
import { fetchStationBoardHtml } from "../infofer/client.js";
import { parseStationBoard } from "../infofer/parser.js";

type CacheEntry = { value: ParsedCachePayload; expiresAt: number };
type ParsedCachePayload = {
  station: { name: string; slug: string };
  departures: BoardEntry[];
  arrivals: BoardEntry[];
  source: BoardResponse["source"];
  updatedAt: string;
  warning?: BoardResponse["warning"];
};

const CACHE_TTL_MS = 60_000;

function nowMinutesBucharest(now: Date): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bucharest",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.format(now).split(":").map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

function timeToMinutes(t: string): number {
  const parts = t.split(":").map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

function filterAndSort(entries: BoardEntry[], nowMin: number): BoardEntry[] {
  const future = entries.filter((e) => timeToMinutes(e.time) >= nowMin);
  return future.slice().sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
}

export function boardRoute() {
  const r = new Hono<AppEnv>();
  // One cache entry per station — INFOFER returns both directions in a single
  // payload, so a /departures hit warms /arrivals for free.
  const cache = new Map<string, CacheEntry>();

  r.get("/:slug", async (c) => {
    const deps = c.get("deps");
    const log = c.get("log");
    const slug = c.req.param("slug");
    const direction: BoardDirection =
      c.req.query("direction") === "arrivals" ? "arrivals" : "departures";
    const now = Date.now();

    let payload = cache.get(slug);
    if (!payload || payload.expiresAt <= now) {
      try {
        const html = await fetchStationBoardHtml(slug);
        const parsed = parseStationBoard(html);
        const stationName = parsed.stationName ?? slug.replace(/-/g, " ");

        const nowMin = nowMinutesBucharest(new Date(now));
        const futureDep = filterAndSort(parsed.departures, nowMin);
        const futureArr = filterAndSort(parsed.arrivals, nowMin);

        const value: ParsedCachePayload = {
          station: { name: stationName, slug },
          departures: futureDep,
          arrivals: futureArr,
          source: "infofer",
          updatedAt: new Date(now).toISOString(),
        };
        payload = { value, expiresAt: now + CACHE_TTL_MS };
        cache.set(slug, payload);
        log.info({
          msg: "board.infofer.ok",
          slug,
          departures: futureDep.length,
          arrivals: futureArr.length,
          platformsDep: futureDep.filter((e) => e.platform).length,
          platformsArr: futureArr.filter((e) => e.platform).length,
        });
      } catch (err) {
        // INFOFER unavailable — fall back to the CFR booking-site aggregator
        // so the homepage ticker keeps working even when INFOFER is rate-limiting,
        // captcha-walled, or returning 5xx. Aggregator coverage is narrower
        // (12 hardcoded destinations) but better than an empty board.
        log.warn({
          msg: "board.infofer.fail",
          slug,
          err: (err as Error).message,
        });
        Sentry.captureException(err, { tags: { route: "board", upstream: "infofer", slug } });

        try {
          const today = new Date().toISOString().slice(0, 10);
          const [aggDep, aggArr] = await Promise.all([
            aggregateBoard({
              slug,
              direction: "departures",
              destinations: destinationsFor(slug),
              search: (from, to) => searchItinerariesSafe(deps, { from, to, date: today }),
            }),
            aggregateBoard({
              slug,
              direction: "arrivals",
              destinations: destinationsFor(slug),
              search: (from, to) => searchItinerariesSafe(deps, { from, to, date: today }),
            }),
          ]);
          const value: ParsedCachePayload = {
            station: aggDep.station,
            departures: aggDep.entries,
            arrivals: aggArr.entries,
            source: "aggregated",
            updatedAt: new Date(now).toISOString(),
          };
          payload = { value, expiresAt: now + CACHE_TTL_MS };
          cache.set(slug, payload);
          log.info({ msg: "board.aggregator.fallback.ok", slug });
        } catch (innerErr) {
          log.error({
            msg: "board.error",
            slug,
            err: (innerErr as Error).message,
          });
          Sentry.captureException(innerErr, { tags: { route: "board", slug } });
          return c.json(
            {
              station: { name: slug, slug },
              direction,
              entries: [],
              updatedAt: new Date(now).toISOString(),
              source: "aggregated" as const,
              warning: { kind: "rate-limited" as const },
            } satisfies BoardResponse,
            500,
          );
        }
      }
    }

    const nowMin = nowMinutesBucharest(new Date(now));
    const raw = direction === "departures" ? payload.value.departures : payload.value.arrivals;
    const entries = filterAndSort(raw, nowMin);
    const response: BoardResponse = {
      station: payload.value.station,
      direction,
      entries,
      updatedAt: payload.value.updatedAt,
      source: payload.value.source,
      ...(entries.length === 0 ? { warning: { kind: "no-data" as const } } : {}),
    };
    return c.json(response);
  });

  return r;
}
