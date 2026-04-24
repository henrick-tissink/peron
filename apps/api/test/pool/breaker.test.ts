import { describe, it, expect } from "vitest";
import { CircuitBreaker } from "../../src/pool/breaker.js";

describe("CircuitBreaker", () => {
  it("starts closed (allows traffic)", () => {
    const b = new CircuitBreaker({ threshold: 3, windowMs: 60_000, cooldownMs: 120_000 });
    expect(b.isOpen(0)).toBe(false);
  });

  it("opens after `threshold` failures within the window", () => {
    const b = new CircuitBreaker({ threshold: 3, windowMs: 60_000, cooldownMs: 120_000 });
    b.record(0);
    b.record(10_000);
    b.record(20_000);
    expect(b.isOpen(21_000)).toBe(true);
  });

  it("stays closed if failures are spread beyond the window", () => {
    const b = new CircuitBreaker({ threshold: 3, windowMs: 60_000, cooldownMs: 120_000 });
    b.record(0);
    b.record(30_000);
    b.record(61_000);
    expect(b.isOpen(61_001)).toBe(false);
  });

  it("auto-closes after cooldown expires", () => {
    const b = new CircuitBreaker({ threshold: 3, windowMs: 60_000, cooldownMs: 120_000 });
    b.record(0);
    b.record(10_000);
    b.record(20_000);
    expect(b.isOpen(21_000)).toBe(true);
    expect(b.isOpen(141_000)).toBe(false);
  });

  it("reports retryAfterSec while open", () => {
    const b = new CircuitBreaker({ threshold: 3, windowMs: 60_000, cooldownMs: 120_000 });
    b.record(0);
    b.record(10_000);
    b.record(20_000);
    expect(b.retryAfterSec(21_000)).toBeGreaterThan(0);
    expect(b.retryAfterSec(21_000)).toBeLessThanOrEqual(120);
  });
});
