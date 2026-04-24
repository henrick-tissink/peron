import { describe, it, expect, beforeEach } from "vitest";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { http, HttpResponse } from "msw";
import { server } from "../setup.js";
import { makeApp } from "../../src/app.js";
import { SessionPool } from "../../src/pool/pool.js";
import { PinMap } from "../../src/pins.js";
import { StationRegistry } from "../../src/stations/registry.js";
import { resetRateLimits } from "../../src/middleware/rate-limit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(__dirname, "../fixtures");
const CFR_BASE = "https://bilete.cfrcalatori.ro";

function buildApp() {
  return makeApp({
    pool: new SessionPool({ maxSize: 3 }),
    pins: new PinMap({ ttlMs: 60_000 }),
    stations: new StationRegistry(),
  });
}

function mockBootstrap() {
  server.use(
    http.get(`${CFR_BASE}/ro-RO/Rute-trenuri/:from/:to`, () =>
      new HttpResponse(
        `<input name="__RequestVerificationToken" value="tok" /><input name="ConfirmationKey" value="ck" />`,
        { status: 200, headers: { "set-cookie": "s=1" } },
      ),
    ),
  );
}

describe("POST /api/search", () => {
  beforeEach(() => resetRateLimits());

  it("returns parsed itineraries for a valid request", async () => {
    mockBootstrap();
    const html = await readFile(resolve(FIX, "direct-bucuresti-brasov.html"), "utf8");
    server.use(
      http.post(`${CFR_BASE}/ro-RO/Itineraries/GetItineraries`, () =>
        new HttpResponse(html, { status: 200, headers: { "content-type": "text/html" } }),
      ),
    );

    const app = buildApp();
    const res = await app.request("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "Bucuresti Nord", to: "Brasov", date: "2026-05-21" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { itineraries: unknown[]; meta: { parseSuccessRate: number } };
    expect(body.itineraries.length).toBeGreaterThan(0);
    expect(body.meta.parseSuccessRate).toBeGreaterThanOrEqual(0.9);
  });

  it("registers transactionString pins for each parsed itinerary", async () => {
    mockBootstrap();
    const html = await readFile(resolve(FIX, "direct-bucuresti-brasov.html"), "utf8");
    server.use(
      http.post(`${CFR_BASE}/ro-RO/Itineraries/GetItineraries`, () =>
        new HttpResponse(html, { status: 200, headers: { "content-type": "text/html" } }),
      ),
    );

    const pool = new SessionPool({ maxSize: 3 });
    const pins = new PinMap({ ttlMs: 60_000 });
    const app = makeApp({ pool, pins, stations: new StationRegistry() });

    const res = await app.request("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "Bucuresti Nord", to: "Brasov", date: "2026-05-21" }),
    });
    const body = (await res.json()) as { itineraries: Array<{ transactionString: string; sessionId: string }> };
    const first = body.itineraries[0]!;
    expect(pins.get(first.transactionString)).toBe(first.sessionId);
  });

  it("returns 400 on missing fields", async () => {
    const app = buildApp();
    const res = await app.request("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "A" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns captcha warning when backend trips breaker", async () => {
    mockBootstrap();
    server.use(
      http.post(`${CFR_BASE}/ro-RO/Itineraries/GetItineraries`, () =>
        new HttpResponse("ReCaptchaFailed", { status: 200 }),
      ),
    );
    const app = buildApp();
    const res = await app.request("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "A", to: "B", date: "2026-05-21" }),
    });
    const body = (await res.json()) as { warning: { kind: string; retryAfterSec?: number } };
    expect(body.warning.kind).toBe("captcha");
  });
});
