import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../setup.js";
import { makeApp } from "../../src/app.js";
import { SessionPool } from "../../src/pool/pool.js";
import { PinMap } from "../../src/pins.js";
import { StationRegistry } from "../../src/stations/registry.js";

const CFR_BASE = "https://bilete.cfrcalatori.ro";

const LANDING = `<html><script>var availableStations = [
  { "name": "București Nord", "isImportant": true },
  { "name": "Brașov", "isImportant": true }
];</script></html>`;

function buildApp() {
  return makeApp({
    pool: new SessionPool({ maxSize: 3 }),
    pins: new PinMap({ ttlMs: 60_000 }),
    stations: new StationRegistry(),
  });
}

describe("GET /api/stations", () => {
  beforeEach(() => {
    server.use(
      http.get(`${CFR_BASE}/ro-RO`, () =>
        new HttpResponse(LANDING, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
  });

  it("returns the full cached station list", async () => {
    const app = buildApp();
    const res = await app.request("/api/stations");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stations: unknown[]; total: number };
    expect(body.total).toBe(2);
    expect(body.stations).toHaveLength(2);
  });

  it("filters by ?q= substring (case/diacritic-insensitive)", async () => {
    const app = buildApp();
    const res = await app.request("/api/stations?q=bras");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stations: { name: string }[] };
    expect(body.stations.map((s) => s.name)).toContain("Brașov");
    expect(body.stations.map((s) => s.name)).not.toContain("locuitori Nord");
  });

  it("respects ?limit= cap", async () => {
    const app = buildApp();
    const res = await app.request("/api/stations?limit=1");
    const body = (await res.json()) as { stations: unknown[] };
    expect(body.stations).toHaveLength(1);
  });
});
