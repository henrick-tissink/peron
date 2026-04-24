import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractAvailableStations } from "../../src/parser/stations.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(__dirname, "../fixtures");

describe("extractAvailableStations", () => {
  it("parses availableStations array from landing page", async () => {
    const html = await readFile(resolve(FIX, "stations-landing.html"), "utf8");
    const stations = extractAvailableStations(html);
    expect(stations.length).toBeGreaterThan(1000);
    // Compare using diacritic-stripped lowercase so "București" matches "bucuresti".
    // The registry itself preserves real diacritics — the frontend handles normalization on display.
    const normalize = (s: string) =>
      s.replace(/[ȘșŞş]/g, "s").replace(/[ȚțŢţ]/g, "t")
        .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const bucuresti = stations.find((s) => normalize(s.name).includes("bucuresti"));
    expect(bucuresti).toBeDefined();
    expect(bucuresti?.name).toMatch(/Bucure[sș]ti/); // preserves real Romanian name
    for (const s of stations.slice(0, 10)) {
      expect(typeof s.name).toBe("string");
      expect(typeof s.isImportant).toBe("boolean");
    }
  });

  it("handles inline JSON variations (pretty/compact)", () => {
    const html = `<script>
      var availableStations = [
        { "name": "A", "isImportant": true },
        { "name": "B", "isImportant": false }
      ];
    </script>`;
    const stations = extractAvailableStations(html);
    expect(stations).toEqual([
      { name: "A", isImportant: true },
      { name: "B", isImportant: false },
    ]);
  });

  it("returns empty array when array not found", () => {
    expect(extractAvailableStations("<html>nothing</html>")).toEqual([]);
  });

  it("returns empty array on malformed JSON", () => {
    const html = `<script>var availableStations = [{ "name": }];</script>`;
    expect(extractAvailableStations(html)).toEqual([]);
  });
});
