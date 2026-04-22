import { describe, it, expect } from "vitest";
import { ItinerarySchema, PriceSnippetSchema } from "../../src/parser/schemas.js";

const validItinerary = {
  id: "itinerary-0",
  transactionString: "opaque-token-xyz",
  sessionId: "sess-abc",
  departure: { time: "08:30", station: "București Nord" },
  arrival: { time: "11:00", station: "Brașov" },
  duration: { hours: 2, minutes: 30 },
  segments: [
    {
      trainCategory: "IR",
      trainNumber: "1741",
      from: "București Nord",
      to: "Brașov",
      departTime: "08:30",
      arriveTime: "11:00",
    },
  ],
  transferCount: 0,
  priceFrom: {
    amount: 41.5,
    currency: "RON" as const,
    fareType: "Adult" as const,
    class: "2" as const,
  },
  services: {
    bikeCar: false,
    barRestaurant: true,
    sleeper: false,
    couchette: false,
    onlineBuying: true,
  },
  trainDetailUrl: "https://bilete.cfrcalatori.ro/ro-RO/Tren/1741",
  bookingUrl: "https://bilete.cfrcalatori.ro/ro-RO/Rute-trenuri/Bucuresti-Nord/Brasov?DepartureDate=20.04.2026",
};

describe("ItinerarySchema", () => {
  it("accepts a valid itinerary", () => {
    const result = ItinerarySchema.safeParse(validItinerary);
    expect(result.success).toBe(true);
  });

  it("accepts null priceFrom", () => {
    const result = ItinerarySchema.safeParse({ ...validItinerary, priceFrom: null });
    expect(result.success).toBe(true);
  });

  it("strips unknown fields (forward-compat)", () => {
    const withExtra = { ...validItinerary, newCfrField: "whatever" };
    const result = ItinerarySchema.safeParse(withExtra);
    expect(result.success).toBe(true);
    if (result.success) {
      expect("newCfrField" in result.data).toBe(false);
    }
  });

  it("rejects missing id", () => {
    const { id: _id, ...bad } = validItinerary;
    const result = ItinerarySchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects empty segments array", () => {
    const result = ItinerarySchema.safeParse({ ...validItinerary, segments: [] });
    expect(result.success).toBe(false);
  });

  it("rejects invalid time format", () => {
    const result = ItinerarySchema.safeParse({
      ...validItinerary,
      departure: { ...validItinerary.departure, time: "not-a-time" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative transferCount", () => {
    const result = ItinerarySchema.safeParse({ ...validItinerary, transferCount: -1 });
    expect(result.success).toBe(false);
  });
});

describe("PriceSnippetSchema", () => {
  it("accepts a well-formed price payload", () => {
    const result = PriceSnippetSchema.safeParse({ amount: 41.5, currency: "RON" });
    expect(result.success).toBe(true);
  });

  it("rejects non-positive amount", () => {
    expect(PriceSnippetSchema.safeParse({ amount: 0, currency: "RON" }).success).toBe(false);
    expect(PriceSnippetSchema.safeParse({ amount: -1, currency: "RON" }).success).toBe(false);
  });

  it("rejects currency other than RON", () => {
    expect(PriceSnippetSchema.safeParse({ amount: 41.5, currency: "EUR" }).success).toBe(false);
  });
});
