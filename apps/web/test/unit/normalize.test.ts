import { describe, it, expect } from "vitest";
import { normalize, matches } from "../../src/lib/normalize.js";

describe("normalize", () => {
  it("lowercases and strips diacritics", () => {
    expect(normalize("București")).toBe("bucuresti");
    expect(normalize("Brașov")).toBe("brasov");
    expect(normalize("Cluj-Napoca")).toBe("cluj-napoca");
  });

  it("handles Romanian Ș/Ț (comma-below) and Ş/Ţ (cedilla)", () => {
    expect(normalize("Bucureşti")).toBe("bucuresti");
    expect(normalize("Târgovişte")).toBe("targoviste");
  });

  it("handles empty input", () => {
    expect(normalize("")).toBe("");
  });
});

describe("matches", () => {
  it("prefers startsWith match", () => {
    expect(matches("Brașov", "bra")).toBe(true);
    expect(matches("bucuresti Nord", "bras")).toBe(false);
  });

  it("falls back to substring match via 3rd arg", () => {
    expect(matches("București Nord", "Nord", { substring: true })).toBe(true);
  });

  it("is case and diacritic insensitive", () => {
    expect(matches("BRAȘOV", "bras")).toBe(true);
    expect(matches("Brasov", "BRAȘ")).toBe(true);
  });

  it("empty query matches anything", () => {
    expect(matches("anywhere", "")).toBe(true);
  });
});
