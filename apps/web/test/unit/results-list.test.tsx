import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SearchResponse } from "@peron/types";
import { ResultsList } from "../../src/components/results-list.js";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, params?: Record<string, unknown>) => {
    if (k === "direct") return "DIRECT";
    if (k === "changes") return `${params?.count} changes`;
    if (k === "from") return "FROM";
    if (k === "bookOnCfr") return "Book on CFR →";
    return k;
  },
}));

vi.mock("../../src/components/fare-matrix.js", () => ({
  FareMatrix: () => <div data-testid="fare-matrix" />,
}));

const twoTrains: SearchResponse = {
  itineraries: [
    {
      id: "itinerary-0",
      transactionString: "tx-a",
      sessionId: "s-1",
      departure: { time: "08:30", station: "București Nord" },
      arrival: { time: "11:00", station: "Brașov" },
      duration: { hours: 2, minutes: 30 },
      segments: [{ trainCategory: "IR", trainNumber: "1741", from: "A", to: "B", departTime: "08:30", arriveTime: "11:00" }],
      transferCount: 0,
      priceFrom: { amount: 41.5, currency: "RON", fareType: "Adult", class: "2" },
      services: { bikeCar: false, barRestaurant: false, sleeper: false, couchette: false, onlineBuying: true },
      trainDetailUrl: "https://bilete.cfrcalatori.ro/ro-RO/Tren/1741",
      bookingUrl: "https://bilete.cfrcalatori.ro/ro-RO/x",
    },
    {
      id: "itinerary-1",
      transactionString: "tx-b",
      sessionId: "s-1",
      departure: { time: "10:00", station: "București Nord" },
      arrival: { time: "13:00", station: "Brașov" },
      duration: { hours: 3, minutes: 0 },
      segments: [{ trainCategory: "R", trainNumber: "3021", from: "A", to: "B", departTime: "10:00", arriveTime: "13:00" }],
      transferCount: 0,
      priceFrom: null,
      services: { bikeCar: false, barRestaurant: false, sleeper: false, couchette: false, onlineBuying: true },
      trainDetailUrl: "https://bilete.cfrcalatori.ro/ro-RO/Tren/3021",
      bookingUrl: "https://bilete.cfrcalatori.ro/ro-RO/y",
    },
  ],
  warning: null,
  meta: { parseSuccessRate: 1, latencyMs: 120 },
};

describe("ResultsList", () => {
  it("renders one row button per itinerary", () => {
    render(<ResultsList data={twoTrains} query={{ from: "A", to: "B", date: "2026-05-21" }} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("shows a partial-results banner above the list when warning.kind === partial", () => {
    const withWarning: SearchResponse = {
      ...twoTrains,
      warning: { kind: "partial", parsedCount: 2, detectedCount: 5 },
    };
    render(<ResultsList data={withWarning} query={{ from: "A", to: "B", date: "2026-05-21" }} />);
    expect(screen.getByText(/3 more/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("does not show a banner for non-partial warnings (they're full-page replacements)", () => {
    const captcha: SearchResponse = {
      ...twoTrains,
      warning: { kind: "captcha", retryAfterSec: 60 },
    };
    render(<ResultsList data={captcha} query={{ from: "A", to: "B", date: "2026-05-21" }} />);
    expect(screen.queryByText(/automated searches/i)).not.toBeInTheDocument();
  });
});
