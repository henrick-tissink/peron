import { describe, it, expect } from "vitest";
import { SerializedQueue } from "../../src/pool/queue.js";
import { Session } from "../../src/pool/session.js";
import { http, HttpResponse } from "msw";
import { server } from "../setup.js";

const CFR_BASE = "https://bilete.cfrcalatori.ro";

function mockBootstrap(token = "tok", key = "ck") {
  server.use(
    http.get(`${CFR_BASE}/ro-RO/Rute-trenuri/:from/:to`, () =>
      new HttpResponse(
        `<input name="__RequestVerificationToken" value="${token}" /><input name="ConfirmationKey" value="${key}" />`,
        { status: 200, headers: { "set-cookie": "s=1" } },
      ),
    ),
  );
}

describe("SerializedQueue", () => {
  it("runs tasks in submission order and never in parallel", async () => {
    const q = new SerializedQueue();
    const log: string[] = [];

    const results = await Promise.all([
      q.run(async () => { log.push("a-start"); await new Promise((r) => setTimeout(r, 20)); log.push("a-end"); return "A"; }),
      q.run(async () => { log.push("b-start"); await new Promise((r) => setTimeout(r, 10)); log.push("b-end"); return "B"; }),
      q.run(async () => { log.push("c-start"); return "C"; }),
    ]);

    expect(results).toEqual(["A", "B", "C"]);
    expect(log).toEqual(["a-start", "a-end", "b-start", "b-end", "c-start"]);
  });

  it("propagates errors to the submitter, continues queue", async () => {
    const q = new SerializedQueue();
    const p1 = q.run(async () => { throw new Error("boom"); });
    const p2 = q.run(async () => "ok");
    await expect(p1).rejects.toThrow("boom");
    await expect(p2).resolves.toBe("ok");
  });
});

describe("Session", () => {
  it("starts in state 'fresh' after bootstrap", async () => {
    mockBootstrap();
    const s = new Session("id-1");
    await s.warm("Bucuresti-Nord", "Brasov");
    expect(s.state).toBe("fresh");
    expect(s.id).toBe("id-1");
  });

  it("tracks age so the pool can refresh stale sessions", async () => {
    mockBootstrap();
    const s = new Session("id-2");
    await s.warm("A", "B");
    const now = Date.now();
    expect(s.lastWarmedAt).toBeLessThanOrEqual(now);
    expect(s.lastWarmedAt).toBeGreaterThan(now - 1000);
  });

  it("marks itself dead after 'kill()' is called", async () => {
    mockBootstrap();
    const s = new Session("id-3");
    await s.warm("A", "B");
    s.kill("captcha");
    expect(s.state).toBe("dead");
    expect(s.deathReason).toBe("captcha");
  });

  it("serializes two concurrent run() calls via its queue", async () => {
    mockBootstrap();
    const s = new Session("id-4");
    await s.warm("A", "B");
    const log: string[] = [];
    await Promise.all([
      s.run(async () => { log.push("1-start"); await new Promise((r) => setTimeout(r, 10)); log.push("1-end"); }),
      s.run(async () => { log.push("2-start"); log.push("2-end"); }),
    ]);
    expect(log).toEqual(["1-start", "1-end", "2-start", "2-end"]);
  });
});
