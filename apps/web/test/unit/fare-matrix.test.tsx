import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FareMatrix } from "../../src/components/fare-matrix.js";

vi.mock("../../src/lib/api.js", () => ({
  fetchPrice: vi.fn(),
}));

import { fetchPrice } from "../../src/lib/api.js";

describe("FareMatrix", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders 12 loading cells on mount, then fills them as promises resolve", async () => {
    vi.mocked(fetchPrice).mockResolvedValue({ ok: true, amount: 41.5, currency: "RON" });

    render(<FareMatrix transactionString="tx-1" />);

    expect(screen.getAllByRole("cell").length).toBeGreaterThanOrEqual(12);

    await waitFor(() => {
      expect(screen.getAllByText(/41[,.]5/).length).toBeGreaterThanOrEqual(12);
    });

    expect(vi.mocked(fetchPrice)).toHaveBeenCalledTimes(12);
  });

  it("renders em-dash in cells that resolve with ok:false", async () => {
    vi.mocked(fetchPrice).mockResolvedValue({ ok: false, reason: "unavailable" });

    render(<FareMatrix transactionString="tx-2" />);

    await waitFor(() => {
      expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(12);
    });
  });

  it("handles mixed ok/not-ok per cell independently", async () => {
    vi.mocked(fetchPrice).mockImplementation(async ({ fareTypeId }) =>
      fareTypeId === "73"
        ? { ok: true, amount: 50, currency: "RON" }
        : { ok: false, reason: "unavailable" },
    );

    render(<FareMatrix transactionString="tx-3" />);

    await waitFor(() => {
      expect(screen.getAllByText(/50/).length).toBe(2);
      expect(screen.getAllByText("—").length).toBe(10);
    });
  });
});
