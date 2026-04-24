import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../setup.js";
import { SessionPool } from "../../src/pool/pool.js";

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

describe("SessionPool", () => {
  beforeEach(() => mockBootstrap());

  it("lazily spawns sessions up to maxSize on demand", async () => {
    const pool = new SessionPool({ maxSize: 3 });
    await pool.withSession(async () => {});
    expect(pool.size).toBe(1);
  });

  it("reuses an existing fresh session for subsequent requests", async () => {
    const pool = new SessionPool({ maxSize: 3 });
    const ids = new Set<string>();
    await pool.withSession(async (s) => { ids.add(s.id); });
    await pool.withSession(async (s) => { ids.add(s.id); });
    expect(ids.size).toBe(1);
  });

  it("fans concurrent requests across multiple sessions up to maxSize", async () => {
    const pool = new SessionPool({ maxSize: 3 });
    const sessionIds = new Set<string>();

    await Promise.all(
      [0, 1, 2].map(() =>
        pool.withSession(async (s) => {
          sessionIds.add(s.id);
          await new Promise((r) => setTimeout(r, 30));
        }),
      ),
    );

    expect(sessionIds.size).toBeGreaterThan(1);
    expect(pool.size).toBeLessThanOrEqual(3);
  });

  it("finds a session by id (for transactionString pinning)", async () => {
    const pool = new SessionPool({ maxSize: 3 });
    let id = "";
    await pool.withSession(async (s) => { id = s.id; });
    const found = pool.getById(id);
    expect(found?.id).toBe(id);
  });

  it("getById returns undefined for unknown id", async () => {
    const pool = new SessionPool({ maxSize: 3 });
    expect(pool.getById("nonexistent")).toBeUndefined();
  });
});
