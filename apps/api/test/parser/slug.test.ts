import { describe, it, expect } from "vitest";
import { toStationSlug } from "../../src/cfr/slug.js";

describe("toStationSlug", () => {
  it("transliterates ă/î/â to a/i/a", () => {
    expect(toStationSlug("Brașov")).toBe("Brasov");
    expect(toStationSlug("Câmpulung")).toBe("Campulung");
    expect(toStationSlug("Bistrița")).toBe("Bistrita");
  });

  it("transliterates Ș/Ț with comma-below", () => {
    expect(toStationSlug("București Nord")).toBe("Bucuresti-Nord");
    expect(toStationSlug("Târgoviște")).toBe("Targoviste");
  });

  it("transliterates Ş/Ţ with cedilla (legacy encoding)", () => {
    expect(toStationSlug("Bucureşti Nord")).toBe("Bucuresti-Nord");
  });

  it("replaces spaces with single hyphens", () => {
    expect(toStationSlug("Cluj Napoca")).toBe("Cluj-Napoca");
    expect(toStationSlug("  Cluj   Napoca  ")).toBe("Cluj-Napoca");
  });

  it("collapses multiple hyphens", () => {
    expect(toStationSlug("Cluj--Napoca")).toBe("Cluj-Napoca");
  });

  it("preserves existing hyphens", () => {
    expect(toStationSlug("Cluj-Napoca")).toBe("Cluj-Napoca");
  });

  it("strips non-alphanumeric punctuation (keeps hyphen)", () => {
    expect(toStationSlug("Piatra Neamț.")).toBe("Piatra-Neamt");
    expect(toStationSlug("Sf. Gheorghe")).toBe("Sf-Gheorghe");
  });

  it("returns empty string on empty input", () => {
    expect(toStationSlug("")).toBe("");
  });
});
