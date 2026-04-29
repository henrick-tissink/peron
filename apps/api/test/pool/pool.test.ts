import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../setup.js";
import { SessionPool } from "../../src/pool/pool.js";
import { CaptchaError } from "../../src/cfr/errors.js";

const CFR_BASE = "https://bilete.cfrcalatori.ro";

function mockBootstrap(record?: Array<{ from: string; to: string }>) {
  server.use(
    http.get(`${CFR_BASE}/ro-RO/Rute-trenuri/:from/:to`, ({ params }) => {
      record?.push({ from: String(params.from), to: String(params.to) });
      return new HttpResponse(
        `<input name="__RequestVerificationToken" value="tok" /><input name="ConfirmationKey" value="ck" />`,
        { status: 200, headers: { "set-cookie": "s=1" } },
      );
    }),
  );
}

describe("SessionPool", () => {
  beforeEach(() => mockBootstrap());

  it("bootstraps a fresh session per call", async () => {
    const pool = new SessionPool({ maxSize: 3 });
    await pool.withSession("A", "B", async () => {});
    expect(pool.size).toBe(1);
  });

  it("bootstraps against the user's (from, to) pair, not a fixed warm pair", async () => {
    const calls: Array<{ from: string; to: string }> = [];
    mockBootstrap(calls);
    const pool = new SessionPool({ maxSize: 3 });

    await pool.withSession("Brasov", "Iasi", async () => {});
    await pool.withSession("Sibiu", "Cluj-Napoca", async () => {});

    // Each call must scrape the page for that exact pair — CFR's
    // ConfirmationKey is route-bound. Sharing across pairs returns 400.
    expect(calls).toEqual([
      { from: "Brasov", to: "Iasi" },
      { from: "Sibiu", to: "Cluj-Napoca" },
    ]);
  });

  it("never reuses a session across different (from, to) pairs", async () => {
    const pool = new SessionPool({ maxSize: 3 });
    const ids = new Set<string>();
    await pool.withSession("Brasov", "Iasi", async (s) => { ids.add(s.id); });
    await pool.withSession("Sibiu", "Cluj-Napoca", async (s) => { ids.add(s.id); });
    expect(ids.size).toBe(2);
  });

  it("evicts the oldest idle session when at maxSize", async () => {
    const pool = new SessionPool({ maxSize: 2 });
    let firstId = "";
    await pool.withSession("A", "B", async (s) => { firstId = s.id; });
    await pool.withSession("C", "D", async () => {});
    await pool.withSession("E", "F", async () => {});
    expect(pool.size).toBe(2);
    expect(pool.getById(firstId)).toBeUndefined();
  });

  it("fans concurrent requests across multiple sessions up to maxSize", async () => {
    const pool = new SessionPool({ maxSize: 3 });
    const sessionIds = new Set<string>();

    await Promise.all(
      [0, 1, 2].map((i) =>
        pool.withSession(`From${i}`, `To${i}`, async (s) => {
          sessionIds.add(s.id);
          await new Promise((r) => setTimeout(r, 30));
        }),
      ),
    );

    expect(sessionIds.size).toBe(3);
    expect(pool.size).toBeLessThanOrEqual(3);
  });

  it("finds a session by id (for transactionString pinning)", async () => {
    const pool = new SessionPool({ maxSize: 3 });
    let id = "";
    await pool.withSession("A", "B", async (s) => { id = s.id; });
    const found = pool.getById(id);
    expect(found?.id).toBe(id);
  });

  it("getById returns undefined for unknown id", async () => {
    const pool = new SessionPool({ maxSize: 3 });
    expect(pool.getById("nonexistent")).toBeUndefined();
  });
});

describe("SessionPool — circuit breaker", () => {
  it("rejects with CaptchaError when breaker is open, without touching CFR", async () => {
    mockBootstrap();
    const pool = new SessionPool({
      maxSize: 3,
      breaker: { threshold: 3, windowMs: 60_000, cooldownMs: 120_000 },
    });

    server.use(
      http.post("https://bilete.cfrcalatori.ro/ro-RO/Itineraries/GetItineraries", () =>
        new HttpResponse("ReCaptchaFailed", { status: 200 }),
      ),
    );

    for (let i = 0; i < 3; i++) {
      try {
        await pool.withSession("A", "B", async (s) => {
          const { searchRaw } = await import("../../src/cfr/client.js");
          await searchRaw((s as unknown as { creds_: { cookie: string; confirmationKey: string; requestVerificationToken: string } }).creds_, { from: "A", to: "B", date: "2026-05-21" });
        });
      } catch {}
    }

    await expect(
      pool.withSession("A", "B", async () => "should-not-run"),
    ).rejects.toBeInstanceOf(CaptchaError);
  });
});
