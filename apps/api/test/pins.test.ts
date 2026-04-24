import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PinMap } from "../src/pins.js";

describe("PinMap", () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => vi.useRealTimers());

  it("stores and retrieves a pin", () => {
    const m = new PinMap({ ttlMs: 30 * 60 * 1000 });
    m.set("tx-1", "sess-a");
    expect(m.get("tx-1")).toBe("sess-a");
  });

  it("returns undefined after TTL expires", () => {
    const m = new PinMap({ ttlMs: 1_000 });
    m.set("tx-1", "sess-a");
    vi.advanceTimersByTime(1_500);
    expect(m.get("tx-1")).toBeUndefined();
  });

  it("refreshes TTL on re-set", () => {
    const m = new PinMap({ ttlMs: 1_000 });
    m.set("tx-1", "sess-a");
    vi.advanceTimersByTime(500);
    m.set("tx-1", "sess-a");
    vi.advanceTimersByTime(800);
    expect(m.get("tx-1")).toBe("sess-a");
  });

  it("supports bulk registration from an array", () => {
    const m = new PinMap({ ttlMs: 60_000 });
    m.setMany("sess-a", ["tx-1", "tx-2", "tx-3"]);
    expect(m.get("tx-1")).toBe("sess-a");
    expect(m.get("tx-3")).toBe("sess-a");
  });

  it("sweeps expired entries lazily (does not grow unboundedly)", () => {
    const m = new PinMap({ ttlMs: 1_000 });
    m.setMany("s", Array.from({ length: 50 }, (_, i) => `t-${i}`));
    vi.advanceTimersByTime(1_500);
    m.set("t-new", "s");
    expect(m.size).toBeLessThanOrEqual(1);
  });
});
