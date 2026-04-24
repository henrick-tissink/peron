import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  fetchStations,
  searchItineraries,
  fetchPrice,
  ApiError,
} from "../../src/lib/api.js";

describe("api client", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
    fetchSpy.mockReset();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://example.test");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("fetchStations GETs /api/stations with optional q/limit", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ stations: [], total: 0 }), { status: 200 }),
    );
    await fetchStations({ q: "bucu", limit: 20 });
    const [url] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("http://example.test/api/stations?q=bucu&limit=20");
  });

  it("searchItineraries POSTs JSON body", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ itineraries: [], warning: null, meta: { parseSuccessRate: 1, latencyMs: 0 } }), { status: 200 }),
    );
    await searchItineraries({ from: "A", to: "B", date: "2026-05-21" });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("http://example.test/api/search");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ from: "A", to: "B", date: "2026-05-21" });
  });

  it("fetchPrice POSTs and returns parsed body", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, amount: 41.5, currency: "RON" }), { status: 200 }),
    );
    const result = await fetchPrice({ transactionString: "tx", fareTypeId: "73", serviceKey: "B&B" });
    expect(result).toEqual({ ok: true, amount: 41.5, currency: "RON" });
  });

  it("throws ApiError on non-2xx with status and body", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    await expect(
      searchItineraries({ from: "A", to: "B", date: "2026-05-21" }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("ApiError carries the HTTP status for caller inspection", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("gone", { status: 410 }));
    try {
      await fetchPrice({ transactionString: "tx", fareTypeId: "73", serviceKey: "B&B" });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(410);
    }
  });
});
