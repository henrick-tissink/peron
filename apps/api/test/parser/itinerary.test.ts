import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { parseOne, parseItineraries } from "../../src/parser/itinerary.js";

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

async function loadFixture(name: string): Promise<string> {
  return readFile(resolve(FIX, name), "utf8");
}

describe("parseItineraries", () => {
  it("direct-bucuresti-brasov: parses multiple itineraries with high success rate", async () => {
    const html = await loadFixture("direct-bucuresti-brasov.html");
    const result = parseItineraries(html, "sess-direct");
    expect(result.itineraries.length).toBeGreaterThan(0);
    expect(result.warning).toBeNull();
    expect(result.meta.parseSuccessRate).toBeGreaterThanOrEqual(0.9);
    expect(result.meta.detectedCount).toBeGreaterThan(0);
    for (const it of result.itineraries) {
      expect(it.transferCount).toBe(0);
    }
  });

  it("with-transfer-bucuresti-sibiu: includes at least one multi-segment itinerary", async () => {
    const html = await loadFixture("with-transfer-bucuresti-sibiu.html");
    const result = parseItineraries(html, "sess-transfer");
    expect(result.itineraries.length).toBeGreaterThan(0);
    const withTransfer = result.itineraries.filter((it) => it.transferCount >= 1);
    expect(withTransfer.length).toBeGreaterThan(0);
  });

  it("sleeper-bucuresti-cluj: detects sleeper or couchette service on at least one train", async () => {
    const html = await loadFixture("sleeper-bucuresti-cluj.html");
    const result = parseItineraries(html, "sess-sleeper");
    expect(result.itineraries.length).toBeGreaterThan(0);
    const nightTrains = result.itineraries.filter(
      (it) => it.services.sleeper || it.services.couchette,
    );
    expect(nightTrains.length).toBeGreaterThan(0);
  });

  it("international-timisoara-budapest: parses without throwing (shape may differ)", async () => {
    const html = await loadFixture("international-timisoara-budapest.html");
    const result = parseItineraries(html, "sess-intl");
    expect(result.meta).toBeDefined();
    expect(result.meta.parseSuccessRate).toBeGreaterThanOrEqual(0);
    expect(result.meta.parseSuccessRate).toBeLessThanOrEqual(1);
  });

  it("no-results-remote-pair: returns empty list + no-results warning", async () => {
    const html = await loadFixture("no-results-remote-pair.html");
    const result = parseItineraries(html, "sess-empty");
    expect(result.itineraries).toHaveLength(0);
    expect(result.warning).toEqual({ kind: "no-results" });
    expect(result.meta.detectedCount).toBe(0);
  });

  it("captcha-response: returns captcha warning, no itineraries", async () => {
    const html = await loadFixture("captcha-response.txt");
    const result = parseItineraries(html, "sess-captcha");
    expect(result.itineraries).toHaveLength(0);
    expect(result.warning?.kind).toBe("captcha");
    if (result.warning?.kind === "captcha") {
      expect(result.warning.retryAfterSec).toBeGreaterThan(0);
    }
  });

  it("empty body: returns parser-failure warning", async () => {
    const result = parseItineraries("", "sess-empty");
    expect(result.itineraries).toHaveLength(0);
    expect(result.warning?.kind).toBe("parser-failure");
  });

  it("partial parse: emits partial warning when some cards fail Zod", async () => {
    // Card 0 uses CFR's real selector structure so parseOne + Zod succeeds.
    // Card 1 is empty so Zod rejects it → partial warning.
    const synthetic = `
      <ul id="itineraries-list">
        <li id="li-itinerary-0">
          <div class="div-itinerary-station line-height-1-5">
            <div>
              <div class="row div-itineraries-row-main">
                <div class="col-sm-2 col-md-3 pl-lg-4">
                  <div class="div-middle">
                    <div>
                      <div class="div-middle line-height-1">
                        <div><span class="text-1-4rem">08:30</span></div>
                      </div>
                      <div class="d-block">
                        <span class="text-0-8rem">București Nord</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="col-7 col-sm-4">
                  <div class="div-middle">
                    <div>
                      <div>
                        <span class="span-train-category-ir">IR</span>
                        <a href="/ro-RO/Tren/1741?Date=29.04.2026">1741</a>
                        <div class="badge badge-light text-0-7rem"><span>Tren direct</span></div>
                      </div>
                      <div><span class="d-inline-block">2 ore 30 min</span></div>
                    </div>
                  </div>
                </div>
                <div class="col-5 col-sm-2 col-xl-3 p-1">
                  <button id="button-itinerary-0-details">Detalii</button>
                </div>
                <div class="col-sm-4 col-md-3 col-xl-2 d-none d-sm-block">
                  <div class="div-middle float-sm-right">
                    <div>
                      <div class="d-block"><span class="text-0-8rem">Sosire la</span></div>
                      <div class="d-block"><span class="text-1-4rem">11:00</span></div>
                      <div class="d-block"><span class="text-0-8rem">Brașov</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <form id="form-buy-itinerary-0" method="post" action="/ro-RO/Buying/Itinerary">
            <input name="TransactionString" type="hidden" value="tx-synthetic-valid-1741" />
          </form>
        </li>
        <li id="li-itinerary-1">
          <!-- intentionally empty — Zod rejects: no times, no station, no transactionString -->
        </li>
      </ul>
    `;
    const result = parseItineraries(synthetic, "sess-partial");
    expect(result.itineraries.length).toBeLessThan(result.meta.detectedCount);
    expect(result.meta.parseSuccessRate).toBeGreaterThan(0);
    expect(result.meta.parseSuccessRate).toBeLessThan(1);
    expect(result.warning?.kind).toBe("partial");
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
