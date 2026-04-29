import { describe, it, expect, beforeEach } from "vitest";
import { http, passthrough } from "msw";
import { server } from "../setup.js";

const LIVE = process.env.PERON_LIVE === "1";
const BASE = process.env.PERON_API_BASE ?? "http://localhost:3001";

// Allow real outbound traffic to the local API server in live tests.
// Re-register before each test because the global afterEach calls server.resetHandlers().
beforeEach(() => {
  const basePattern = BASE.replace(/\/$/, "");
  server.use(http.all(`${basePattern}/*`, () => passthrough()));
});

describe.runIf(LIVE)("/api/board live", () => {
  it("returns ≥1 entry for Bucuresti-Nord departures", async () => {
    const res = await fetch(`${BASE}/api/board/Bucuresti-Nord?direction=departures`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: Array<{ time: string }> };
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.entries[0]!.time).toMatch(/^\d{2}:\d{2}$/);
  }, 30_000);

  it("returns ≥0 entries for Bucuresti-Nord arrivals (some times of day may have none)", async () => {
    const res = await fetch(`${BASE}/api/board/Bucuresti-Nord?direction=arrivals`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: unknown[]; direction: string };
    expect(body.direction).toBe("arrivals");
  }, 30_000);
});
