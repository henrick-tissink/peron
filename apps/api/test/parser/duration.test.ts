import { describe, it, expect } from "vitest";
import { parseDuration } from "../../src/parser/duration.js";

describe("parseDuration", () => {
  it("parses '2h 30m'", () => {
    expect(parseDuration("2h 30m")).toEqual({ hours: 2, minutes: 30 });
  });

  it("parses '2h' (no minutes)", () => {
    expect(parseDuration("2h")).toEqual({ hours: 2, minutes: 0 });
  });

  it("parses '45m' only", () => {
    expect(parseDuration("45m")).toEqual({ hours: 0, minutes: 45 });
  });

  it("parses '2:30' colon format", () => {
    expect(parseDuration("2:30")).toEqual({ hours: 2, minutes: 30 });
  });

  it("parses Romanian '2 h 30 min' with spaces", () => {
    expect(parseDuration("2 h 30 min")).toEqual({ hours: 2, minutes: 30 });
  });

  it("returns zeros on unknown format", () => {
    expect(parseDuration("something weird")).toEqual({ hours: 0, minutes: 0 });
  });

  it("returns zeros on empty string", () => {
    expect(parseDuration("")).toEqual({ hours: 0, minutes: 0 });
  });

  it("normalizes minutes > 59 from minutes-only input", () => {
    expect(parseDuration("125m")).toEqual({ hours: 2, minutes: 5 });
  });
});
