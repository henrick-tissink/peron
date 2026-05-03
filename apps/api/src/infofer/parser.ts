import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import type { BoardEntry, BoardStatus } from "@peron/types";
import { toStationSlug } from "../cfr/slug.js";

export type ParsedBoard = {
  stationName: string | null;
  departures: BoardEntry[];
  arrivals: BoardEntry[];
};

const TIME_RX = /^(\d{1,2}):(\d{2})$/;
const DELAY_RX = /\+\s*(\d+)\s*min/i;
const PLATFORM_RX = /linia\s+([A-Za-z0-9]+)/i;

function normaliseSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function parseTime(raw: string): string | null {
  const t = normaliseSpaces(raw);
  const m = t.match(TIME_RX);
  if (!m) return null;
  const h = m[1]!.padStart(2, "0");
  return `${h}:${m[2]}`;
}

function parseStatus(badgeText: string): BoardStatus | undefined {
  const t = normaliseSpaces(badgeText).toLowerCase();
  if (!t) return undefined;
  if (t.startsWith("la timp")) return { kind: "on-time" };
  if (t.startsWith("anulat") || t.includes("suspendat")) return { kind: "cancelled" };
  const delay = t.match(DELAY_RX);
  if (delay) return { kind: "delayed", minutes: Number(delay[1]) };
  return undefined;
}

function parseVia(directionText: string, counterpartName: string, stationName: string | null): string[] {
  // Direcția is "STATION_A - VIA1 - VIA2 - STATION_B". Drop the two endpoints —
  // whichever one is "this" station and whichever one is the counterpart — and
  // return whatever's between. The text uses ASCII " - " as a separator.
  const parts = directionText.split(/\s+-\s+/).map((p) => normaliseSpaces(p)).filter(Boolean);
  if (parts.length <= 2) return [];

  // Remove leading and trailing entries that match this station or the counterpart
  // (so via excludes both endpoints and the train's true origin/terminus).
  const counterSlug = toStationSlug(counterpartName);
  const stationSlug = stationName ? toStationSlug(stationName) : "";
  const isEndpoint = (s: string) => {
    const slug = toStationSlug(s);
    return slug === counterSlug || (stationSlug !== "" && slug === stationSlug);
  };

  let start = 0;
  let end = parts.length;
  while (start < end && isEndpoint(parts[start]!)) start++;
  while (end > start && isEndpoint(parts[end - 1]!)) end--;
  return parts.slice(start, end);
}

function parseEntry(
  $: CheerioAPI,
  li: Element,
  direction: "departures" | "arrivals",
  stationName: string | null,
): BoardEntry | null {
  const $li = $(li);

  const timeLabel = direction === "departures" ? "Pleacă la" : "Sosește la";
  const counterpartLabel = direction === "departures" ? "Către" : "De la";

  // Each labelled value sits in `<div class="text-0-7rem">{label}</div>` followed
  // by a sibling `<div>{value}</div>` (or `<div><a>...</a></div>` for the counterpart).
  // Use empty-string sentinels rather than `string | null` because TypeScript can't
  // narrow let-bindings reassigned inside an .each() callback.
  let time = "";
  let counterpartName = "";
  let counterpartHref = "";

  $li.find("div.text-0-7rem").each((_, el) => {
    const label = normaliseSpaces($(el).text());
    const $value = $(el).next("div");
    if (!$value.length) return;
    if (label === timeLabel && !time) {
      const t = parseTime($value.text());
      if (t) time = t;
    } else if (label === counterpartLabel && !counterpartName) {
      const $a = $value.find("a").first();
      counterpartName = normaliseSpaces($a.length ? $a.text() : $value.text());
      counterpartHref = $a.attr("href") ?? "";
    }
  });

  if (!time || !counterpartName) return null;

  // Train: <span class="span-train-category-{rc|ir|ic|r|rr|...}">CAT</span> +
  // <a href="/ro-RO/Tren/...">NUMBER</a>. INFOFER uses one CSS class per category
  // (rc=Regio Călători, ir=InterRegio, ic=InterCity, r=Regio, rr=Regio-Regio…),
  // so match the prefix rather than enumerating.
  const $cat = $li.find('span[class^="span-train-category-"]').first();
  const category = normaliseSpaces($cat.text());
  let number = "";
  const $trenLink = $li.find('a[href*="/Tren/"]').first();
  if ($trenLink.length) {
    number = normaliseSpaces($trenLink.text());
  }
  if (!category || !number) return null;

  // Counterpart slug — prefer the slug embedded in the href, else slugify the name.
  let counterpartSlug = "";
  if (counterpartHref) {
    const m = counterpartHref.match(/\/Statie\/([^?#]+)/);
    if (m?.[1]) counterpartSlug = decodeURIComponent(m[1]);
  }
  if (!counterpartSlug) counterpartSlug = toStationSlug(counterpartName);

  // Direction text + via — only present in the expandation block.
  let directionText = "";
  $li.find("span.color-blue").each((_, el) => {
    if (normaliseSpaces($(el).text()) === "Direcția:") {
      const $row = $(el).closest(".row");
      const $val = $row.find(".col-sm-9, .col-md-10").last();
      if ($val.length) directionText = normaliseSpaces($val.text());
    }
  });
  const via = directionText ? parseVia(directionText, counterpartName, stationName) : [];

  // Real-time badge: status text + platform.
  const $badge = $li.find("div.div-stations-train-real-time-badge").first();
  let status: BoardStatus | undefined;
  let platform: string | undefined;
  if ($badge.length) {
    // First inline-block child holds the status text.
    const $status = $badge.find("div.d-inline-block").first();
    status = parseStatus($status.text());
    const platMatch = $badge.text().match(PLATFORM_RX);
    if (platMatch?.[1]) platform = platMatch[1];
  }

  // Operator from the expandation block ("Operat de:" row).
  let operator: string | undefined;
  $li.find("span.color-blue").each((_, el) => {
    if (normaliseSpaces($(el).text()) === "Operat de:") {
      const $row = $(el).closest(".row");
      const $val = $row.find(".col-sm-9, .col-md-10").last();
      if ($val.length) {
        const t = normaliseSpaces($val.text());
        if (t) operator = t;
      }
    }
  });

  const entry: BoardEntry = {
    time,
    counterpart: { name: counterpartName, slug: counterpartSlug },
    via,
    train: { category, number },
  };
  if (status) entry.status = status;
  if (platform) entry.platform = platform;
  if (operator) entry.operator = operator;
  return entry;
}

export function parseStationBoard(html: string): ParsedBoard {
  const $ = cheerio.load(html);

  // Heading: "<station-name> în <date>" — pull the station name from the first
  // .color-blue span inside the jumbotron.
  let stationName: string | null = null;
  const $h2 = $(".jumbotron h2").first();
  if ($h2.length) {
    const $span = $h2.find("span.color-blue").first();
    if ($span.length) stationName = normaliseSpaces($span.text());
  }

  const departures: BoardEntry[] = [];
  $('li[id^="li-train-departures-"]').each((_, li) => {
    const e = parseEntry($, li, "departures", stationName);
    if (e) departures.push(e);
  });

  const arrivals: BoardEntry[] = [];
  $('li[id^="li-train-arrivals-"]').each((_, li) => {
    const e = parseEntry($, li, "arrivals", stationName);
    if (e) arrivals.push(e);
  });

  return { stationName, departures, arrivals };
}
