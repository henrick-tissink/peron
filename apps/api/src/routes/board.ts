import * as Sentry from "@sentry/node";
import { Hono } from "hono";
import type { BoardResponse, BoardDirection, BoardEntry } from "@peron/types";
import type { AppEnv } from "../app.js";
import { aggregateBoard } from "../services/board-aggregator.js";
import { searchItinerariesSafe } from "../services/search-service.js";
import { destinationsFor } from "../cfr/board-roster.js";
import { fetchStationBoardHtml, fetchTrainResultHtml } from "../infofer/client.js";
import { parseStationBoard } from "../infofer/parser.js";
import { parseTrain } from "../infofer/train-parser.js";

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

const ENRICH_LIMIT = 12;          // top-N entries per direction to enrich
const ENRICH_WINDOW_MIN = 240;     // skip enrichment for trains > 4h out — too many fetches for trains nobody's looking at yet
const ENRICH_CONCURRENCY = 5;      // concurrent /Tren/:n fetches against INFOFER

/**
 * INFOFER's station-board listing only populates `linia X` ~15-30 min before
 * a train is due. Per-train detail (`/ro-RO/Tren/:n`) carries the schedule's
 * pre-assigned platform from the moment the timetable is published — so the
 * data exists, just not in the station feed.
 *
 * Enrich the top N entries per direction by fan-out: fetch each train's
 * detail, find the stop matching this station, copy `platform` across.
 * Capped to imminent + bounded concurrency so cold-fill latency stays
 * reasonable. Errors are swallowed per-train: one missing platform shouldn't
 * sink the whole board.
 */
async function enrichPlatforms(
  entries: BoardEntry[],
  stationSlug: string,
  stationName: string,
  nowMin: number,
): Promise<BoardEntry[]> {
  const candidates: { idx: number; entry: BoardEntry }[] = [];
  for (let i = 0; i < entries.length && candidates.length < ENRICH_LIMIT; i++) {
    const e = entries[i]!;
    if (e.platform) continue;
    let delta = timeToMinutes(e.time) - nowMin;
    if (delta < -120) delta += 24 * 60; // post-midnight
    if (delta > ENRICH_WINDOW_MIN) continue;
    candidates.push({ idx: i, entry: e });
  }

  if (candidates.length === 0) return entries;

  const out = entries.slice();
  let next = 0;

  async function worker() {
    while (next < candidates.length) {
      const slot = next++;
      const c = candidates[slot]!;
      try {
        const html = await fetchTrainResultHtml(c.entry.train.number);
        const t = parseTrain(html);
        // Match by slug first (canonical) and fall back to display-name
        // comparison since INFOFER occasionally uses different formatting.
        const stop = t.stops.find(
          (s) => s.station.slug === stationSlug || s.station.name === stationName,
        );
        if (stop?.platform) {
          out[c.idx] = { ...c.entry, platform: stop.platform };
        }
      } catch {
        /* one bad train shouldn't kill the board enrichment */
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(ENRICH_CONCURRENCY, candidates.length) }, worker),
  );
  return out;
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

        // Sort + filter once here so the enrichment pass runs against the
        // imminent trains the user is actually about to see, not the whole day.
        const nowMin = nowMinutesBucharest(new Date(now));
        const futureDep = filterAndSort(parsed.departures, nowMin);
        const futureArr = filterAndSort(parsed.arrivals, nowMin);

        const [enrichedDep, enrichedArr] = await Promise.all([
          enrichPlatforms(futureDep, slug, stationName, nowMin),
          enrichPlatforms(futureArr, slug, stationName, nowMin),
        ]);

        const value: ParsedCachePayload = {
          station: { name: stationName, slug },
          departures: enrichedDep,
          arrivals: enrichedArr,
          source: "infofer",
          updatedAt: new Date(now).toISOString(),
        };
        payload = { value, expiresAt: now + CACHE_TTL_MS };
        cache.set(slug, payload);
        log.info({
          msg: "board.infofer.ok",
          slug,
          departures: enrichedDep.length,
          arrivals: enrichedArr.length,
          platformsEnrichedDep: enrichedDep.filter((e) => e.platform).length,
          platformsEnrichedArr: enrichedArr.filter((e) => e.platform).length,
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
