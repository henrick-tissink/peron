import * as Sentry from "@sentry/node";
import { Hono } from "hono";
import type { TrainResponse } from "@peron/types";
import type { AppEnv } from "../app.js";
import { fetchTrainResultHtml } from "../infofer/client.js";
import { parseTrain } from "../infofer/train-parser.js";

type CacheEntry = { value: TrainResponse; expiresAt: number };
const CACHE_TTL_MS = 30_000; // tighter than board cache — live position changes within a minute

export function trainRoute() {
  const r = new Hono<AppEnv>();
  const cache = new Map<string, CacheEntry>();

  r.get("/:number", async (c) => {
    const log = c.get("log");
    const number = c.req.param("number");
    const now = Date.now();

    const hit = cache.get(number);
    if (hit && hit.expiresAt > now) {
      return c.json(hit.value);
    }

    try {
      const html = await fetchTrainResultHtml(number);
      const parsed = parseTrain(html);

      if (!parsed.number || parsed.stops.length === 0) {
        // INFOFER returned a result but we couldn't extract a valid train —
        // most likely an unknown / out-of-date running number.
        return c.json({ error: "train-not-found", number }, 404);
      }

      // Reconcile position prose names against parsed stop slugs so the web UI
      // can highlight by exact slug match instead of fuzzy comparing display
      // names. INFOFER's prose uses the display name, not the slug.
      let position = parsed.position;
      if (position) {
        const fromMatch = parsed.stops.find(
          (s) => s.station.name === position!.betweenSlug.from.replace(/-/g, " "),
        );
        const toMatch = parsed.stops.find(
          (s) => s.station.name === position!.betweenSlug.to.replace(/-/g, " "),
        );
        position = {
          ...position,
          betweenSlug: {
            from: fromMatch?.station.slug ?? position.betweenSlug.from,
            to: toMatch?.station.slug ?? position.betweenSlug.to,
          },
        };
      }

      const value: TrainResponse = {
        number: parsed.number,
        category: parsed.category ?? "",
        date: new Date(now).toISOString().slice(0, 10),
        origin: parsed.origin ?? parsed.stops[0]?.station.name ?? "",
        terminus:
          parsed.terminus ?? parsed.stops[parsed.stops.length - 1]?.station.name ?? "",
        stops: parsed.stops,
        ...(position ? { position } : {}),
        updatedAt: new Date(now).toISOString(),
        source: "infofer",
      };
      cache.set(number, { value, expiresAt: now + CACHE_TTL_MS });
      log.info({ msg: "train.ok", number, stops: value.stops.length, hasPosition: !!value.position });
      return c.json(value);
    } catch (err) {
      log.error({ msg: "train.error", number, err: (err as Error).message });
      Sentry.captureException(err, { tags: { route: "train", number } });
      return c.json({ error: "upstream-failed", number }, 502);
    }
  });

  return r;
}
