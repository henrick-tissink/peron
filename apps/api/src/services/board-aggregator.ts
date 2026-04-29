import type { Itinerary, BoardEntry, BoardResponse, BoardDirection } from "@peron/types";

export type SearchFn = (from: string, to: string) => Promise<Itinerary[]>;

export type AggregateInput = {
  slug: string;
  direction: BoardDirection;
  destinations: string[];
  search: SearchFn;
  now?: Date;
  concurrency?: number;
};

function nowMinutes(now: Date): number {
  // Bucharest is UTC+2 (winter) / UTC+3 (summer). Use Intl to derive HH:MM in Europe/Bucharest.
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Bucharest", hour: "2-digit", minute: "2-digit", hour12: false });
  const [hh, mm] = fmt.format(now).split(":").map(Number);
  return hh * 60 + mm;
}

function timeToMinutes(t: string): number {
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}

async function pmap<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]!);
      }
    }),
  );
  return out;
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[ȘșŞş]/g, "s")
    .replace(/[ȚțŢţ]/g, "t")
    .replace(/[^A-Za-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export async function aggregateBoard(input: AggregateInput): Promise<BoardResponse> {
  const now = input.now ?? new Date();
  const nowMin = nowMinutes(now);
  const concurrency = input.concurrency ?? 5;

  const results = await pmap(input.destinations, concurrency, async (other) => {
    const [from, to] = input.direction === "departures" ? [input.slug, other] : [other, input.slug];
    return { other, itineraries: await input.search(from, to) };
  });

  const entries: BoardEntry[] = [];
  const seen = new Set<string>();
  for (const { other, itineraries } of results) {
    for (const it of itineraries) {
      // departures: when the train LEAVES this station; arrivals: when it ARRIVES here.
      const time = input.direction === "departures" ? it.departure.time : it.arrival.time;
      if (!time) continue;
      if (timeToMinutes(time) < nowMin) continue; // already passed
      const seg0 = it.segments[0];
      if (!seg0) continue;
      const key = `${time}/${seg0.trainCategory}${seg0.trainNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Build via list from segment intermediate stops if available; else from segment chain.
      const via: string[] = it.segments.length > 1
        ? it.segments.slice(0, -1).map((s) => s.to).filter(Boolean)
        : [];

      entries.push({
        time,
        counterpart: { name: other.replace(/-/g, " "), slug: slugify(other) },
        via,
        train: { category: seg0.trainCategory, number: seg0.trainNumber },
        durationMinutes: it.duration.hours * 60 + it.duration.minutes,
      });
    }
  }

  entries.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

  return {
    station: { name: input.slug.replace(/-/g, " "), slug: input.slug },
    direction: input.direction,
    entries,
    updatedAt: now.toISOString(),
    source: "aggregated",
    ...(entries.length === 0 ? { warning: { kind: "no-data" as const } } : {}),
  };
}
