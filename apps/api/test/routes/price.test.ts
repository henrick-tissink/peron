import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../setup.js";
import { makeApp } from "../../src/app.js";
import { SessionPool } from "../../src/pool/pool.js";
import { PinMap } from "../../src/pins.js";
import { StationRegistry } from "../../src/stations/registry.js";
import { resetRateLimits } from "../../src/middleware/rate-limit.js";

const CFR_BASE = "https://bilete.cfrcalatori.ro";

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

describe("POST /api/price", () => {
  beforeEach(() => resetRateLimits());

  it("returns price for a valid transactionString routed to its pinned session", async () => {
    mockBootstrap();
    server.use(
      http.post(`${CFR_BASE}/api/ro-RO/Itineraries/Price`, () =>
        new HttpResponse(`<span class="price">41,5 lei</span>`, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    const pool = new SessionPool({ maxSize: 3 });
    const pins = new PinMap({ ttlMs: 60_000 });
    const app = makeApp({ pool, pins, stations: new StationRegistry() });

    let sessionId = "";
    await pool.withSession("Bucuresti-Nord", "Brasov", async (s) => { sessionId = s.id; });
    pins.set("tx-abc", sessionId);

    const res = await app.request("/api/price", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transactionString: "tx-abc",
        fareTypeId: "73",
        serviceKey: "B&B",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; amount: number; currency: "RON" };
    expect(body).toEqual({ ok: true, amount: 41.5, currency: "RON" });
  });

  it("returns 410 Gone when transactionString has no pin (session restarted)", async () => {
    const app = makeApp({
      pool: new SessionPool({ maxSize: 3 }),
      pins: new PinMap({ ttlMs: 60_000 }),
      stations: new StationRegistry(),
    });
    const res = await app.request("/api/price", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transactionString: "unknown-tx",
        fareTypeId: "73",
        serviceKey: "B&B",
      }),
    });
    expect(res.status).toBe(410);
  });

  it("returns 400 on malformed body", async () => {
    const app = makeApp({
      pool: new SessionPool({ maxSize: 3 }),
      pins: new PinMap({ ttlMs: 60_000 }),
      stations: new StationRegistry(),
    });
    const res = await app.request("/api/price", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transactionString: "x" }),
    });
    expect(res.status).toBe(400);
  });
});
