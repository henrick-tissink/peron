import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Itinerary } from "@peron/types";
import { ItineraryCard } from "../../src/components/itinerary-card.js";

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
  FareMatrix: ({ transactionString }: { transactionString: string }) => (
    <div data-testid="fare-matrix">{transactionString}</div>
  ),
}));

const direct: Itinerary = {
  id: "itinerary-0",
  transactionString: "tx-direct",
  sessionId: "s-1",
  departure: { time: "08:30", station: "București Nord" },
  arrival: { time: "11:00", station: "Brașov" },
  duration: { hours: 2, minutes: 30 },
  segments: [
    { trainCategory: "IR", trainNumber: "1741", from: "București Nord", to: "Brașov", departTime: "08:30", arriveTime: "11:00" },
  ],
  transferCount: 0,
  priceFrom: { amount: 41.5, currency: "RON", fareType: "Adult", class: "2" },
  services: { bikeCar: true, barRestaurant: false, sleeper: false, couchette: false, onlineBuying: true },
  trainDetailUrl: "https://bilete.cfrcalatori.ro/ro-RO/Tren/1741",
  bookingUrl: "https://bilete.cfrcalatori.ro/ro-RO/Rute-trenuri/Bucuresti-Nord/Brasov?DepartureDate=21.05.2026",
};

describe("ItineraryCard", () => {
  it("renders departure + arrival + duration + train", () => {
    render(<ItineraryCard itinerary={direct} />);
    // departure + arrival times are now in SplitFlap aria-labels
    expect(screen.getByLabelText("08:30")).toBeInTheDocument();
    expect(screen.getByLabelText("11:00")).toBeInTheDocument();
    expect(screen.getByText(/București Nord/)).toBeInTheDocument();
    expect(screen.getByText(/Brașov/)).toBeInTheDocument();
    expect(screen.getByText(/2h 30m/)).toBeInTheDocument();
    expect(screen.getAllByText(/IR/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("1741")).toBeInTheDocument();
  });

  it("shows priceFrom amount and currency when present", () => {
    render(<ItineraryCard itinerary={direct} />);
    expect(screen.getByText("41.5")).toBeInTheDocument();
    expect(screen.getByText("RON")).toBeInTheDocument();
  });

  it("shows nothing in price cell when priceFrom is null", () => {
    render(<ItineraryCard itinerary={{ ...direct, priceFrom: null }} />);
    expect(screen.queryByText("FROM")).not.toBeInTheDocument();
  });

  it("renders 'DIRECT' label when transferCount is 0", () => {
    render(<ItineraryCard itinerary={direct} />);
    expect(screen.getByText("DIRECT")).toBeInTheDocument();
  });

  it("renders changes label when transferCount > 0", () => {
    render(<ItineraryCard itinerary={{ ...direct, transferCount: 2 }} />);
    expect(screen.getByText(/2 changes/i)).toBeInTheDocument();
  });

  it("clicking the row expands the card and reveals FareMatrix", async () => {
    const user = userEvent.setup();
    render(<ItineraryCard itinerary={direct} />);
    expect(screen.queryByTestId("fare-matrix")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(screen.getByTestId("fare-matrix")).toBeInTheDocument();
  });

  it("renders 'Book on CFR' link pointing to the itinerary's bookingUrl when expanded", async () => {
    const user = userEvent.setup();
    render(<ItineraryCard itinerary={direct} />);
    await user.click(screen.getByRole("button"));
    const link = screen.getByRole("link", { name: /Book on CFR/i });
    expect(link).toHaveAttribute("href", direct.bookingUrl);
  });
});
