import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Itinerary } from "@peron/types";
import { ItineraryCard } from "../../src/components/itinerary-card.js";

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
    expect(screen.getByText("08:30")).toBeInTheDocument();
    expect(screen.getByText("11:00")).toBeInTheDocument();
    expect(screen.getByText(/București Nord/)).toBeInTheDocument();
    expect(screen.getByText(/Brașov/)).toBeInTheDocument();
    expect(screen.getByText(/2h 30m/)).toBeInTheDocument();
    expect(screen.getByText(/IR 1741/)).toBeInTheDocument();
  });

  it("shows priceFrom when present", () => {
    render(<ItineraryCard itinerary={direct} />);
    expect(screen.getByText(/41[.,]5/)).toBeInTheDocument();
    expect(screen.getByText(/lei/i)).toBeInTheDocument();
  });

  it("shows em-dash when priceFrom is null", () => {
    render(<ItineraryCard itinerary={{ ...direct, priceFrom: null }} />);
    expect(screen.getByTestId("price-from")).toHaveTextContent("—");
  });

  it("renders 'Direct' label when transferCount is 0", () => {
    render(<ItineraryCard itinerary={direct} />);
    expect(screen.getByText(/Direct/i)).toBeInTheDocument();
  });

  it("renders '{n} transfer' label when transferCount > 0", () => {
    render(<ItineraryCard itinerary={{ ...direct, transferCount: 2 }} />);
    expect(screen.getByText(/2 transfer/i)).toBeInTheDocument();
  });

  it("clicking Details expands the card and reveals children", async () => {
    const user = userEvent.setup();
    render(
      <ItineraryCard itinerary={direct}>
        <div data-testid="expanded-content">fare matrix placeholder</div>
      </ItineraryCard>,
    );
    expect(screen.queryByTestId("expanded-content")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /details/i }));
    expect(screen.getByTestId("expanded-content")).toBeInTheDocument();
  });

  it("renders service icons for present services", () => {
    render(<ItineraryCard itinerary={direct} />);
    expect(screen.getByLabelText(/bike/i)).toBeInTheDocument();
  });

  it("renders 'Book on CFR' link pointing to the itinerary's bookingUrl", () => {
    render(<ItineraryCard itinerary={direct} />);
    const link = screen.getByRole("link", { name: /Book on CFR/i });
    expect(link).toHaveAttribute("href", direct.bookingUrl);
  });
});
