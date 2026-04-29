import { describe, it, expect, vi, beforeEach } from "vitest";
import { aggregateBoard } from "../../src/services/board-aggregator.js";
import type { Itinerary } from "@peron/types";

function fakeItinerary(time: string, dest: string, train: string, durationMin: number, via: string[] = []): Itinerary {
  const cat = train.match(/^[A-Z]+/)?.[0] ?? "R";
  const num = train.match(/\d+/)?.[0] ?? "0";
  const timeParts = time.split(":").map(Number);
  const total = (timeParts[0] ?? 0) * 60 + (timeParts[1] ?? 0) + durationMin;
  const arriveTime = `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  return {
    id: `itin-${time}-${dest}`,
    transactionString: "tx",
    sessionId: "sid",
    departure: { time, station: "București Nord" },
    arrival: { time: arriveTime, station: dest },
    duration: { hours: Math.floor(durationMin / 60), minutes: durationMin % 60 },
    segments: [{ trainCategory: cat, trainNumber: num, from: "București Nord", to: dest, departTime: time, arriveTime, via }],
    transferCount: 0,
    priceFrom: null,
    services: { bikeCar: false, barRestaurant: false, sleeper: false, couchette: false, onlineBuying: false },
    trainDetailUrl: "",
    bookingUrl: "",
  } as unknown as Itinerary;
}

describe("aggregateBoard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T10:00:00Z")); // 13:00 Bucharest
  });

  it("calls search per destination, sorts by time, dedupes by (time, train number)", async () => {
    const search = vi.fn(async (from: string, to: string) => {
      if (to === "Brasov") return [fakeItinerary("14:25", "Brașov", "IR1735", 152)];
      if (to === "Cluj-Napoca") return [
        fakeItinerary("14:25", "Brașov", "IR1735", 152), // duplicate via Brasov-Cluj train
        fakeItinerary("14:48", "Cluj-Napoca", "IR1733", 432),
      ];
      return [];
    });
    const result = await aggregateBoard({ slug: "Bucuresti-Nord", direction: "departures", search, destinations: ["Brasov", "Cluj-Napoca"] });
    expect(result.entries.map((e) => `${e.time}/${e.train.category}${e.train.number}`)).toEqual([
      "14:25/IR1735",
      "14:48/IR1733",
    ]);
    expect(result.station.slug).toBe("Bucuresti-Nord");
    expect(result.direction).toBe("departures");
  });

  it("filters out itineraries that have already departed", async () => {
    const search = vi.fn(async () => [
      fakeItinerary("09:00", "Brașov", "IR111", 90), // past
      fakeItinerary("15:30", "Brașov", "IR222", 90), // future
    ]);
    const result = await aggregateBoard({ slug: "Bucuresti-Nord", direction: "departures", search, destinations: ["Brasov"] });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.time).toBe("15:30");
  });

  it("returns warning kind=no-data when all searches are empty", async () => {
    const search = vi.fn(async () => []);
    const result = await aggregateBoard({ slug: "Bucuresti-Nord", direction: "departures", search, destinations: ["Brasov"] });
    expect(result.entries).toHaveLength(0);
    expect(result.warning?.kind).toBe("no-data");
  });

  it("for arrivals direction, runs searches as (other -> this) and sets counterpart=origin", async () => {
    const search = vi.fn(async (from: string, to: string) => {
      expect(to).toBe("Bucuresti-Nord");
      return [fakeItinerary("13:30", "Bucuresti-Nord", "IR3000", 90)];
    });
    const result = await aggregateBoard({ slug: "Bucuresti-Nord", direction: "arrivals", search, destinations: ["Brasov"] });
    expect(result.entries[0]?.counterpart.slug).toBe("Brasov");
  });
});
