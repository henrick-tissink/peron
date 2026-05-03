import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseStationBoard } from "../../src/infofer/parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(__dirname, "../fixtures/infofer-station-board.html"), "utf8");

describe("parseStationBoard", () => {
  it("extracts the station name from the heading", () => {
    const board = parseStationBoard(FIXTURE);
    expect(board.stationName).toBe("București Nord");
  });

  it("parses departures", () => {
    const board = parseStationBoard(FIXTURE);
    expect(board.departures).toHaveLength(2);

    const [first, second] = board.departures;
    expect(first).toMatchObject({
      time: "00:30",
      counterpart: { name: "Aeroport Henri Coandă", slug: "Aeroport-Henri-Coanda" },
      train: { category: "R-E", number: "7901" },
      via: ["Parc Mogoșoaia"],
      status: { kind: "on-time" },
      platform: "5A",
      operator: "CFR Călători",
    });

    expect(second).toMatchObject({
      time: "06:55",
      counterpart: { name: "Brașov", slug: "Brasov" },
      train: { category: "IR", number: "1622" },
      via: ["Ploiești Vest", "Sinaia"],
      status: { kind: "delayed", minutes: 7 },
      platform: "2A",
    });
  });

  it("parses arrivals", () => {
    const board = parseStationBoard(FIXTURE);
    expect(board.arrivals).toHaveLength(1);

    const [first] = board.arrivals;
    expect(first).toMatchObject({
      time: "00:17",
      counterpart: { name: "Aeroport Henri Coandă", slug: "Aeroport-Henri-Coanda" },
      train: { category: "R-E", number: "7948" },
      via: ["Parc Mogoșoaia"],
      status: { kind: "on-time" },
      platform: "1B",
    });
  });

  it("returns empty arrays for blank input", () => {
    const board = parseStationBoard("<div></div>");
    expect(board.departures).toEqual([]);
    expect(board.arrivals).toEqual([]);
    expect(board.stationName).toBeNull();
  });

  it("skips entries missing required fields", () => {
    const html = `
      <li id="li-train-departures-0">
        <div class="text-0-7rem">Pleacă la</div><div>10:00</div>
        <!-- missing Către and train -->
      </li>
    `;
    const board = parseStationBoard(html);
    expect(board.departures).toEqual([]);
  });
});
