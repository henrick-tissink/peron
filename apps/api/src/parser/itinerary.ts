import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type { SearchError } from "@peron/types";
import { tryText } from "./selectors.js";
import { parseDuration } from "./duration.js";
import { toStationSlug } from "../cfr/slug.js";
import { ItinerarySchema } from "./schemas.js";

const CFR_BASE = "https://bilete.cfrcalatori.ro";

export type RawItinerary = {
  id: string;
  transactionString: string;
  sessionId: string;
  departure: { time: string; station: string; platform?: string };
  arrival: { time: string; station: string; platform?: string };
  duration: { hours: number; minutes: number };
  segments: Array<{
    trainCategory: string;
    trainNumber: string;
    from: string;
    to: string;
    departTime: string;
    arriveTime: string;
  }>;
  transferCount: number;
  priceFrom:
    | { amount: number; currency: "RON"; fareType: "Adult"; class: "1" | "2" }
    | null;
  services: {
    bikeCar: boolean;
    barRestaurant: boolean;
    sleeper: boolean;
    couchette: boolean;
    onlineBuying: boolean;
  };
  trainDetailUrl: string;
  bookingUrl: string;
};

function parseTimeAttr(raw: string): string {
  const m = raw.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
}

function parsePriceText(raw: string): number | null {
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*lei/i);
  if (!m || !m[1]) return null;
  const n = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function absoluteUrl(href: string): string {
  if (!href) return CFR_BASE;
  if (/^https?:\/\//i.test(href)) return href;
  return `${CFR_BASE}${href.startsWith("/") ? "" : "/"}${href}`;
}

/**
 * Detect a service icon via multiple strategies:
 *   1. `<img alt="keyword…">`  — CFR's primary approach (alt attribute in Romanian)
 *   2. `<img title="keyword…">` — fallback
 *   3. `[class*="keyword"]`    — sprite-style icons (fa-bike, icon-restaurant)
 *   4. `<img src*="keyword">`  — svg filename fallback
 */
function hasService($card: Cheerio<AnyNode>, keywords: string[]): boolean {
  for (const kw of keywords) {
    if ($card.find(`img[alt*="${kw}" i]`).length > 0) return true;
    if ($card.find(`img[title*="${kw}" i]`).length > 0) return true;
    if ($card.find(`img[src*="${kw}" i]`).length > 0) return true;
    if ($card.find(`[class*="${kw}" i]`).length > 0) return true;
    if ($card.find(`[title*="${kw}" i]`).length > 0) return true;
  }
  return false;
}

export function parseOne(
  $: CheerioAPI,
  el: Cheerio<AnyNode>,
  sessionId: string,
  index: number,
): RawItinerary {
  // --- TransactionString -------------------------------------------------
  // CFR ships multiple <input name="TransactionString"> per card (one in the
  // outer form, one in the fares form). Pick the first non-empty value.
  let transactionString = "";
  el.find('input[name="TransactionString"], input[name*="TransactionString" i]').each(
    (_i, inp) => {
      if (transactionString) return;
      const v = $(inp).attr("value");
      if (v && v.length > 0) transactionString = v;
    },
  );
  if (!transactionString) {
    transactionString = el.attr("data-transaction-string") ?? "";
  }

  // --- Departure / arrival columns --------------------------------------
  // Main row layout (desktop):
  //   col-sm-2 col-md-3 pl-lg-4             -> departure column
  //   col-7 col-sm-4                        -> train info / duration / services
  //   col-5 col-sm-2 col-xl-3                -> buttons
  //   col-sm-4 col-md-3 col-xl-2             -> arrival column
  const $mainRow = el.find(".div-itineraries-row-main").first();
  const $depCol = $mainRow.find(".col-sm-2.col-md-3.pl-lg-4").first();
  const $arrCol = $mainRow.find(".col-sm-4.col-md-3.col-xl-2").first();
  const $midCol = $mainRow.find(".col-7.col-sm-4").first();

  // Times live in <span class="text-1-4rem"> inside their respective columns.
  const departTimeRaw = tryText($, $depCol, [
    ".text-1-4rem",
    ".departure-time",
    "[class*='depart' i] [class*='time' i]",
    "time.depart",
  ]);
  const arriveTimeRaw = tryText($, $arrCol, [
    ".text-1-4rem",
    ".arrival-time",
    "[class*='arriv' i] [class*='time' i]",
    "time.arrive",
  ]);

  // Station names: <span class="text-0-8rem"> inside a .d-block wrapper.
  // In the dep column the first .d-block (not .d-sm-none) holds the station;
  // the dep column also has a .d-block.d-sm-none copy of the arrival station
  // for mobile — exclude it by filtering to the non-mobile one.
  const depStation =
    tryText($, $depCol, [
      ".d-block:not(.d-sm-none) > .text-0-8rem",
      ".departure-station",
      "[class*='depart' i] [class*='station' i]",
    ]) ||
    // Fallback: last text-0-8rem that isn't the "Plecare la" label.
    $depCol
      .find(".text-0-8rem")
      .toArray()
      .map((e) => $(e).text().trim())
      .filter((t) => t && !/^plecare/i.test(t))[0] ||
    "";

  const arrStation = tryText($, $arrCol, [
    // The arrival column has two spans: "Sosire la" label + station name.
    // Skip the first (label) by excluding its ancestor pattern.
    ".d-block:not(.d-sm-none) + .d-block .text-0-8rem",
    ".text-0-8rem:not(:contains('Sosire'))",
    ".arrival-station",
    "[class*='arriv' i] [class*='station' i]",
  ]);
  // Fallback: any text-0-8rem that isn't the "Sosire la" label.
  const arrStationFinal =
    arrStation ||
    $arrCol
      .find(".text-0-8rem")
      .toArray()
      .map((e) => $(e).text().trim())
      .filter((t) => t && !/^sosire/i.test(t))[0] ||
    "";

  // --- Duration ----------------------------------------------------------
  // In the middle column — e.g. "3 ore 41 min".
  const durationRaw = tryText($, $midCol, [
    "span.d-inline-block",
    ".duration",
    "[class*='duration' i]",
    "[class*='travel-time' i]",
  ]);

  // --- Price (may be absent on initial render) --------------------------
  const priceRaw = tryText($, el, [
    ".price",
    "[class*='price' i]",
    "[class*='tarif' i]",
    "[class*='pret' i]",
  ]);

  // --- Segments ----------------------------------------------------------
  // CFR puts each train leg as a <span class="span-train-category-rr"> followed
  // by an <a> with the train number. For a direct train there's one category
  // span (others may appear in collapsed details sections; we dedupe by number).
  const segmentSeeds: Array<{ category: string; number: string; href: string }> = [];
  $mainRow
    .find("[class*='span-train-category']")
    .each((_i, seg) => {
      const $seg = $(seg);
      const category = $seg.text().trim();
      const $link = $seg.nextAll("a").first();
      const href = $link.attr("href") ?? "";
      const number = $link.text().trim().replace(/\D/g, "");
      if (number && !segmentSeeds.some((s) => s.number === number)) {
        segmentSeeds.push({ category, number, href });
      }
    });

  // Build segments from detected train category spans.
  // The main row shows the overall dep/arr only; per-leg stations live in
  // the collapsed details section. We fill from/to with overall endpoints
  // for now — sufficient for transfer-count detection and Zod validation.
  const depTime = parseTimeAttr(departTimeRaw);
  const arrTime = parseTimeAttr(arriveTimeRaw);
  const fromStation = depStation || "—";
  const toStation = arrStationFinal || fromStation;

  const segments = segmentSeeds.length > 0
    ? segmentSeeds.map((seed) => ({
        trainCategory: seed.category,
        trainNumber: seed.number,
        from: fromStation,
        to: toStation,
        departTime: depTime,
        arriveTime: arrTime,
      }))
    : [];

  // transferCount: derive from the "Tren direct" badge if present, else from
  // segment count. A card without any category span falls back to 0.
  const badgeText = tryText($, el, [".badge.badge-light span", ".badge span"]);
  const isDirect = /direct/i.test(badgeText);
  const transferCount = isDirect ? 0 : Math.max(0, segments.length - 1);

  const priceAmount = parsePriceText(priceRaw);

  // --- URLs --------------------------------------------------------------
  const firstTrainHref =
    $mainRow.find("[class*='span-train-category']").first().nextAll("a").first().attr("href") ?? "";
  const trainDetailUrl = firstTrainHref
    ? absoluteUrl(firstTrainHref)
    : segments[0]?.trainNumber
      ? `${CFR_BASE}/ro-RO/Tren/${segments[0].trainNumber}`
      : CFR_BASE;

  // Booking URL: deep-link to the search-prefilled page. CFR's `/Buying/Go` is
  // POST-only and 302s to home on GET, so the form-action URL embedded in the
  // itinerary HTML is not usable as a public link. CFR also doesn't honor any
  // query-param date prefill on `/Rute-trenuri/{from}/{to}` (returns 405 with
  // any query string), so the user re-picks the date once they land. Industry-
  // standard deep-link fidelity for train aggregators.
  const bookingUrl = `${CFR_BASE}/ro-RO/Rute-trenuri/${toStationSlug(depStation)}/${toStationSlug(arrStationFinal)}`;

  return {
    id: `itinerary-${index}`,
    transactionString,
    sessionId,
    departure: { time: parseTimeAttr(departTimeRaw), station: depStation },
    arrival: { time: parseTimeAttr(arriveTimeRaw), station: arrStationFinal },
    duration: parseDuration(durationRaw),
    segments: segments.length > 0
      ? segments
      : [{
          trainCategory: "—",
          trainNumber: "0",
          from: fromStation,
          to: toStation,
          departTime: depTime,
          arriveTime: arrTime,
        }],
    transferCount,
    priceFrom:
      priceAmount !== null
        ? { amount: priceAmount, currency: "RON", fareType: "Adult", class: "2" }
        : null,
    services: {
      // CFR uses Romanian alt text: "Biciclete", "Bar/Restaurant", "Vagon de dormit",
      // "Cușetă", "Cumpărare online" — we match on substrings (case-insensitive).
      bikeCar: hasService(el, ["bicicl", "bike"]),
      barRestaurant: hasService(el, ["restaur", "bar"]),
      sleeper: hasService(el, ["vagon de dormit", "vagon-dormit", "dormit", "sleeper"]),
      couchette: hasService(el, ["cușet", "cuset", "couchette"]),
      onlineBuying: hasService(el, ["online", "cumpăr", "cumpar"]),
    },
    trainDetailUrl,
    bookingUrl,
  };
}

const PRIMARY_SELECTOR = 'li[id^="li-itinerary-"]';
const FALLBACK_SELECTORS = [
  "li.itinerary",
  "div[class*='itinerary' i]",
  "[data-itinerary]",
];

export type ParseResult = {
  itineraries: RawItinerary[];
  warning: SearchError | null;
  meta: { parseSuccessRate: number; detectedCount: number };
};

export function parseItineraries(html: string, sessionId: string): ParseResult {
  if (!html || html.trim().length === 0) {
    return {
      itineraries: [],
      warning: { kind: "parser-failure", detail: "empty response body" },
      meta: { parseSuccessRate: 0, detectedCount: 0 },
    };
  }

  if (html.trim() === "ReCaptchaFailed" || html.includes("ReCaptchaFailed")) {
    return {
      itineraries: [],
      warning: { kind: "captcha", retryAfterSec: 60 },
      meta: { parseSuccessRate: 0, detectedCount: 0 },
    };
  }

  const $ = cheerio.load(html);

  function findItems() {
    const primary = $(PRIMARY_SELECTOR);
    if (primary.length > 0) return primary;
    for (const sel of FALLBACK_SELECTORS) {
      const found = $(sel);
      if (found.length > 0) return found;
    }
    return primary; // empty
  }
  const $items = findItems();

  const detectedCount = $items.length;

  if (detectedCount === 0) {
    const regexHits = html.match(/id="li-itinerary-\d+"/g) ?? [];
    if (regexHits.length === 0) {
      return {
        itineraries: [],
        warning: { kind: "no-results" },
        meta: { parseSuccessRate: 1, detectedCount: 0 },
      };
    }
    return {
      itineraries: [],
      warning: {
        kind: "parser-failure",
        detail: `regex detected ${regexHits.length} itineraries but cheerio selectors failed`,
      },
      meta: { parseSuccessRate: 0, detectedCount: regexHits.length },
    };
  }

  const parsed: RawItinerary[] = [];
  const errors: string[] = [];

  $items.each((idx, el) => {
    try {
      const raw = parseOne($, $(el), sessionId, idx);
      const result = ItinerarySchema.safeParse(raw);
      if (result.success) {
        parsed.push(raw);
      } else {
        errors.push(
          `itinerary-${idx}: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
        );
      }
    } catch (err) {
      errors.push(`itinerary-${idx}: ${(err as Error).message}`);
    }
  });

  const parseSuccessRate = parsed.length / detectedCount;

  let warning: SearchError | null = null;
  if (parsed.length === 0 && detectedCount > 0) {
    warning = {
      kind: "parser-failure",
      detail: `all ${detectedCount} itineraries failed validation: ${errors.slice(0, 3).join(" | ")}`,
    };
  } else if (parsed.length < detectedCount) {
    warning = {
      kind: "partial",
      parsedCount: parsed.length,
      detectedCount,
    };
  }

  return {
    itineraries: parsed,
    warning,
    meta: { parseSuccessRate, detectedCount },
  };
}
