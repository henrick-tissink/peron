import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import type { BoardStatus, TrainStop, TrainPosition } from "@peron/types";

export type ParsedTrain = {
  number: string | null;
  category: string | null;
  origin: string | null;
  terminus: string | null;
  stops: TrainStop[];
  position?: TrainPosition;
};

const TIME_RX = /(\d{1,2}):(\d{2})/;
const DELAY_RX = /\+\s*(\d+)\s*min/i;
const KM_RX = /km\s+(\d+)/i;
const PLATFORM_RX = /linia\s+([A-Za-z0-9]+)/i;
const REPORTED_AT_RX = /Raportat\s+la\s+(\d{1,2}:\d{2})/i;
const POSITION_RX = /între sta[țt]iile\s*([^<\n]*?)\s*-\s*([^<\n]*?)\.?\s*(?:Pute[țt]i|$)/i;

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function parseTime(raw: string): string | null {
  const m = raw.match(TIME_RX);
  if (!m) return null;
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

function parseStatus(raw: string): BoardStatus | undefined {
  const t = clean(raw).toLowerCase();
  if (!t) return undefined;
  if (t.startsWith("la timp")) return { kind: "on-time" };
  if (t.startsWith("anulat") || t.includes("suspendat")) return { kind: "cancelled" };
  const d = t.match(DELAY_RX);
  if (d) return { kind: "delayed", minutes: Number(d[1]) };
  return undefined;
}

function slugFromHref(href: string | undefined): string | null {
  if (!href) return null;
  const m = href.match(/\/Statie\/([^?#]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function parseStop($: CheerioAPI, li: Element): TrainStop | null {
  const $li = $(li);

  // Station name + slug from the .col-md-5.color-blue link inside the row.
  const $stationLink = $li.find("div.col-md-5.color-blue a").first();
  const stationName = clean($stationLink.text());
  if (!stationName) return null;
  const stationSlug = slugFromHref($stationLink.attr("href")) ?? stationName.replace(/\s+/g, "-");

  // km / platform live in sibling `.col-md-2` and `.col-md-3` elements; both are
  // free-text so we just grep the row's combined text.
  const rowText = clean($li.text());
  const kmMatch = rowText.match(KM_RX);
  const km = kmMatch?.[1] ? Number(kmMatch[1]) : null;
  const platMatch = rowText.match(PLATFORM_RX);
  const platform = platMatch?.[1];

  // Times: arrival (left side, plain) and departure (right side, .float-right
  // / .text-right). Each lives in a `.text-1-3rem` div; the matching status sits
  // in its sibling `.text-0-8rem`. The origin has only departure; the terminus
  // has only arrival; through-stops have both.
  const $arrivalTime = $li.find(".col-3.col-md-2").not(":has(.float-right)").find(".text-1-3rem").first();
  const $arrivalStatus = $li.find(".col-3.col-md-2").not(":has(.float-right)").find(".text-0-8rem").first();
  const $depWrap = $li.find(".float-right");
  const $departureTime = $depWrap.find(".text-1-3rem").first();
  const $departureStatus = $depWrap.find(".text-0-8rem").first();

  const arrTime = $arrivalTime.length ? parseTime($arrivalTime.text()) : null;
  const depTime = $departureTime.length ? parseTime($departureTime.text()) : null;

  const stop: TrainStop = {
    station: { name: stationName, slug: stationSlug },
    km,
  };
  if (platform) stop.platform = platform;
  if (arrTime) {
    stop.arrival = { scheduled: arrTime };
    const s = parseStatus($arrivalStatus.text());
    if (s) stop.arrival.status = s;
  }
  if (depTime) {
    stop.departure = { scheduled: depTime };
    const s = parseStatus($departureStatus.text());
    if (s) stop.departure.status = s;
  }

  return stop;
}

export function parseTrain(html: string): ParsedTrain {
  const $ = cheerio.load(html);

  // Header: "<number> în <date>". Pull number from the first .color-blue span
  // in the heading.
  let number: string | null = null;
  const $heading = $("h2").first();
  const $headSpan = $heading.find("span.color-blue").first();
  if ($headSpan.length) number = clean($headSpan.text());

  // Train category — look for any span-train-category-* near the top of the
  // result; the parser uses the first one it finds.
  let category: string | null = null;
  const $cat = $('span[class^="span-train-category-"]').first();
  if ($cat.length) category = clean($cat.text());

  // Origin/terminus from the "Parcurs tren" h4 — the en-dash separates them.
  // Several h4s exist on the page (map header, services, related trains); pick
  // the first one whose text starts with "Parcurs tren".
  let origin: string | null = null;
  let terminus: string | null = null;
  const $parcursH4 = $("h4")
    .filter((_, el) => /^\s*Parcurs tren/i.test($(el).text()))
    .first();
  if ($parcursH4.length) {
    const headerText = clean($parcursH4.text()).replace(/^Parcurs tren\s*/i, "");
    const parts = headerText.split(/\s*[–\-]\s*/);
    if (parts.length >= 2) {
      origin = parts[0]!;
      terminus = parts[parts.length - 1]!;
    }
  }

  // Position: parse the prose paragraph that lives under the .fa-stopwatch icon.
  let position: TrainPosition | undefined;
  const $statusBlock = $("i.fa-stopwatch").first().parent();
  if ($statusBlock.length) {
    const text = clean($statusBlock.text());
    const reportedMatch = text.match(REPORTED_AT_RX);
    const positionMatch = text.match(POSITION_RX);
    if (positionMatch && reportedMatch) {
      // Position prose names stations by display name; we don't have slugs at
      // hand here so we slugify by trimming whitespace and replacing with
      // hyphens. The /api/train route reconciles against parsed stops.
      const fromName = clean(positionMatch[1] ?? "");
      const toName = clean(positionMatch[2] ?? "");
      if (fromName && toName) {
        position = {
          betweenSlug: {
            from: fromName.replace(/\s+/g, "-"),
            to: toName.replace(/\s+/g, "-"),
          },
          reportedAt: reportedMatch[1]!,
        };
        const delay = text.match(DELAY_RX);
        if (delay) position.delayMinutes = Number(delay[1]);
      }
    }
  }

  // Stops: each li.list-group-item inside any div-stations-branch-… block.
  // INFOFER occasionally splits a train into multiple branches (e.g. shared
  // stretches with another running number). We parse the FIRST branch only;
  // multi-branch handling would need user-controlled selection.
  const stops: TrainStop[] = [];
  const $firstBranch = $('[id^="div-stations-branch-"]').first();
  const $items = $firstBranch.length
    ? $firstBranch.find("li.list-group-item")
    : $("li.list-group-item");

  $items.each((_, li) => {
    const s = parseStop($, li);
    if (s) stops.push(s);
  });

  return { number, category, origin, terminus, stops, ...(position ? { position } : {}) };
}
