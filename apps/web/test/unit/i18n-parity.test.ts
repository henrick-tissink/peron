import { describe, it, expect } from "vitest";
import en from "../../messages/en.json";
import ro from "../../messages/ro.json";
import de from "../../messages/de.json";

function flatKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...flatKeys(v as Record<string, unknown>, path));
    else out.push(path);
  }
  return out.sort();
}

describe("i18n parity", () => {
  const enKeys = flatKeys(en);
  const roKeys = flatKeys(ro);
  const deKeys = flatKeys(de);

  it("ro has every key en has", () => {
    expect(roKeys).toEqual(enKeys);
  });
  it("de has every key en has", () => {
    expect(deKeys).toEqual(enKeys);
  });
});
