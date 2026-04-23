import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { parseOne } from "../../src/parser/itinerary.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(__dirname, "../fixtures");

describe("parseOne (single card)", () => {
  it("extracts a complete itinerary from direct-bucuresti-brasov fixture", async () => {
    const html = await readFile(resolve(FIX, "direct-bucuresti-brasov.html"), "utf8");
    const $ = cheerio.load(html);
    const $cards = $('li[id^="li-itinerary-"]');
    expect($cards.length).toBeGreaterThan(0);

    const first = $cards.first();
    const raw = parseOne($, first, "test-session-id", 0);

    expect(raw).toMatchObject({
      id: "itinerary-0",
      sessionId: "test-session-id",
      segments: expect.arrayContaining([
        expect.objectContaining({
          trainNumber: expect.stringMatching(/^\d+$/),
          from: expect.any(String),
          to: expect.any(String),
        }),
      ]),
    });
    expect(raw.transactionString.length).toBeGreaterThan(0);
    expect(raw.departure.time).toMatch(/^\d{1,2}:\d{2}$/);
    expect(raw.arrival.time).toMatch(/^\d{1,2}:\d{2}$/);
    expect(raw.duration.hours).toBeGreaterThanOrEqual(0);
    expect(raw.transferCount).toBe(0);
    expect(raw.services).toMatchObject({
      bikeCar: expect.any(Boolean),
      barRestaurant: expect.any(Boolean),
      sleeper: expect.any(Boolean),
      couchette: expect.any(Boolean),
      onlineBuying: expect.any(Boolean),
    });
    expect(raw.trainDetailUrl).toMatch(/^https:\/\/bilete\.cfrcalatori\.ro\//);
    expect(raw.bookingUrl).toMatch(/^https:\/\/bilete\.cfrcalatori\.ro\//);
  });
});

describe.skip("debug — dump first card HTML for selector exploration", () => {
  it("prints first itinerary card", async () => {
    const html = await readFile(resolve(FIX, "direct-bucuresti-brasov.html"), "utf8");
    const $ = cheerio.load(html);
    const first = $('li[id^="li-itinerary-"]').first();
    console.log("--- first card HTML (first 5000 chars) ---");
    console.log($.html(first)?.slice(0, 5000));
    console.log("--- first card class names ---");
    first.find("*").each((_i, el) => {
      const c = $(el).attr("class");
      if (c) console.log(c);
    });
  });
});
