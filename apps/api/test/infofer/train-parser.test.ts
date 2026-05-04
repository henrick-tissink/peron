import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseTrain } from "../../src/infofer/train-parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(__dirname, "../fixtures/infofer-train-1622.html"), "utf8");

describe("parseTrain", () => {
  it("extracts the running number", () => {
    const t = parseTrain(FIXTURE);
    expect(t.number).toBe("1622");
  });

  it("extracts category", () => {
    const t = parseTrain(FIXTURE);
    expect(t.category).toBe("IR");
  });

  it("extracts origin and terminus from the Parcurs tren header", () => {
    const t = parseTrain(FIXTURE);
    expect(t.origin).toBe("Sibiu");
    expect(t.terminus).toBe("București Nord");
  });

  it("parses every stop in the first branch", () => {
    const t = parseTrain(FIXTURE);
    // 1622 Sibiu → București Nord stops at ~16 stations; assert a meaningful floor.
    expect(t.stops.length).toBeGreaterThan(10);
  });

  it("first stop is the origin (departure-only, km 0, no arrival)", () => {
    const t = parseTrain(FIXTURE);
    const first = t.stops[0]!;
    expect(first.station.name).toBe("Sibiu");
    expect(first.station.slug).toBe("Sibiu");
    expect(first.km).toBe(0);
    expect(first.departure?.scheduled).toBe("16:33");
    expect(first.arrival).toBeUndefined();
  });

  it("last stop is the terminus (arrival-only, no departure)", () => {
    const t = parseTrain(FIXTURE);
    const last = t.stops[t.stops.length - 1]!;
    expect(last.station.name.toLowerCase()).toContain("bucure");
    expect(last.arrival).toBeDefined();
    expect(last.departure).toBeUndefined();
  });

  it("through-stops have both arrival and departure", () => {
    const t = parseTrain(FIXTURE);
    const middle = t.stops.find((s) => s.arrival && s.departure);
    expect(middle).toBeDefined();
  });

  it("captures live position when reported", () => {
    const t = parseTrain(FIXTURE);
    expect(t.position).toBeDefined();
    expect(t.position?.reportedAt).toMatch(/^\d{1,2}:\d{2}$/);
    // Names parsed from prose; real values were "Avrig" → "Ucea" in the fixture.
    expect(t.position?.betweenSlug.from).toMatch(/Avrig/);
    expect(t.position?.betweenSlug.to).toMatch(/Ucea/);
  });

  it("returns empty stops for empty html", () => {
    const t = parseTrain("<div></div>");
    expect(t.stops).toEqual([]);
    expect(t.number).toBeNull();
  });
});
