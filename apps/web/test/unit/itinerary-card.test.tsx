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
    if (k === "bookOnCfr") return "Continue on CFR ↗";
    if (k === "title") return "Continuing on CFR";
    if (k === "close") return "Close";
    if (k === "trainHeader") return "TRAIN";
    if (k === "preamble") return `CFR's site doesn't accept deep links, so you'll retrace ${params?.count} quick steps:`;
    if (k === "step1") return "Date defaults to today on CFR — change it to:";
    if (k === "step2") return 'Click "Caută" (Search)';
    if (k === "step3") return `Click "Detalii" on the ${params?.time} ${params?.category} ${params?.number} train and pick your fare class`;
    if (k === "copyDate") return "📋 Copy date";
    if (k === "dateCopied") return "✓ Copied";
    if (k === "cancelButton") return "Cancel";
    if (k === "openCfrButton") return "Open CFR ↗";
    return k;
  },
  useFormatter: () => ({
    dateTime: (_date: Date, _opts: Record<string, unknown>) => "Wed, 21 May 2026",
  }),
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

const TEST_DATE_ISO = "2026-04-30";

describe("ItineraryCard", () => {
  it("renders departure + arrival + duration + train", () => {
    render(<ItineraryCard itinerary={direct} dateIso={TEST_DATE_ISO} />);
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
    render(<ItineraryCard itinerary={direct} dateIso={TEST_DATE_ISO} />);
    expect(screen.getByText("41.5")).toBeInTheDocument();
    expect(screen.getByText("RON")).toBeInTheDocument();
  });

  it("shows nothing in price cell when priceFrom is null", () => {
    render(<ItineraryCard itinerary={{ ...direct, priceFrom: null }} dateIso={TEST_DATE_ISO} />);
    expect(screen.queryByText("FROM")).not.toBeInTheDocument();
  });

  it("renders 'DIRECT' label when transferCount is 0", () => {
    render(<ItineraryCard itinerary={direct} dateIso={TEST_DATE_ISO} />);
    expect(screen.getByText("DIRECT")).toBeInTheDocument();
  });

  it("renders changes label when transferCount > 0", () => {
    render(<ItineraryCard itinerary={{ ...direct, transferCount: 2 }} dateIso={TEST_DATE_ISO} />);
    expect(screen.getByText(/2 changes/i)).toBeInTheDocument();
  });

  it("clicking the row expands the card and reveals FareMatrix", async () => {
    const user = userEvent.setup();
    render(<ItineraryCard itinerary={direct} dateIso={TEST_DATE_ISO} />);
    expect(screen.queryByTestId("fare-matrix")).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button")[0]);
    expect(screen.getByTestId("fare-matrix")).toBeInTheDocument();
  });

  it("clicking 'Continue on CFR' opens the booking modal with train info", async () => {
    const user = userEvent.setup();
    render(<ItineraryCard itinerary={direct} dateIso={TEST_DATE_ISO} />);
    // expand the card
    await user.click(screen.getAllByRole("button")[0]);
    // click the CTA
    const cfrButton = screen.getByRole("button", { name: /Continue on CFR/i });
    await user.click(cfrButton);
    // modal should be visible
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Continuing on CFR")).toBeInTheDocument();
    // train info visible in the modal
    expect(screen.getAllByText(/IR/).length).toBeGreaterThanOrEqual(1);
    // CFR open button is present
    expect(screen.getByRole("button", { name: /Open CFR/i })).toBeInTheDocument();
  });
});
