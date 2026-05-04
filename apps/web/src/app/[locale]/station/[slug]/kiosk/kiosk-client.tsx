"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { BoardEntry, BoardResponse, BoardDirection } from "@peron/types";
import { fetchBoard } from "../../../../../lib/api-board";
import { SplitFlap } from "../../../../../components/split-flap";
import { StatusPill } from "../../../../../components/status-pill";
import { MinutesToGo } from "../../../../../components/minutes-to-go";
import { Link } from "../../../../../i18n/navigation";

const KIOSK_REFRESH_MS = 30_000;
const KIOSK_LIMIT = 8;

type Labels = {
  departures: string;
  arrivals: string;
  time: string;
  destination: string;
  origin: string;
  train: string;
  platform: string;
  via: string;
  direct: string;
  exit: string;
  noEntries: string;
};

export function KioskClient({
  slug,
  stationName,
  direction,
  initial,
  labels,
}: {
  slug: string;
  stationName: string;
  direction: BoardDirection;
  initial: BoardResponse | null;
  labels: Labels;
}) {
  const [data, setData] = useState<BoardResponse | null>(initial);
  const [clock, setClock] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetchBoard(slug, direction)
        .then((r) => !cancelled && setData(r))
        .catch(() => {});
    }
    load();
    const id = setInterval(load, KIOSK_REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [slug, direction]);

  useEffect(() => {
    // HH:MM only: seconds would tick every 1s and dominate the visual budget
    // on a wall-mounted kiosk. Real station boards render HH:MM.
    function tick() {
      const fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Bucharest",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      setClock(fmt.format(new Date()));
    }
    tick();
    // Re-check every 5 s; only flips on minute-change because SplitFlap diffs
    // per cell now and ignores no-op writes.
    const id = setInterval(tick, 5_000);
    return () => clearInterval(id);
  }, []);

  const top = (data?.entries ?? []).slice(0, KIOSK_LIMIT);
  const counterpartHeader = direction === "departures" ? labels.destination : labels.origin;
  const directionLabel = direction === "departures" ? labels.departures : labels.arrivals;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* HEADER */}
      <div className="flex items-baseline justify-between border-b-2 border-[var(--color-accent)] px-8 py-5 sm:px-12 sm:py-6">
        <div className="flex items-baseline gap-3 sm:gap-6 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-accent)] pulse shrink-0" />
          <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight truncate">
            {stationName}
          </h1>
          <span className="hidden sm:inline font-mono text-xs tracking-[0.3em] text-[var(--color-text-subtle)] uppercase">
            {directionLabel}
          </span>
        </div>
        <SplitFlap
          value={clock || "--:--"}
          className="font-mono text-2xl sm:text-4xl font-bold text-[var(--color-accent)]"
        />
      </div>

      {/* COLUMN HEADERS — desktop only. Widths match KioskRow grid below. */}
      <div className="hidden md:grid grid-cols-[200px_minmax(0,1fr)_180px_100px_140px] gap-6 border-b border-[var(--color-border)] px-12 py-3 font-mono text-[10px] tracking-[0.3em] text-[var(--color-text-subtle)] uppercase">
        <span>{labels.time}</span>
        <span>{counterpartHeader}</span>
        <span>{labels.train}</span>
        <span>{labels.platform}</span>
        <span className="text-right" aria-hidden="true" />
      </div>

      {/* ROWS */}
      <div className="flex-1 overflow-hidden">
        {top.length === 0 ? (
          <div className="flex h-full items-center justify-center font-mono text-xl text-[var(--color-text-muted)]">
            {labels.noEntries}
          </div>
        ) : (
          top.map((e, i) => (
            <KioskRow key={`${e.time}-${e.train.number}-${i}`} entry={e} viaLabel={labels.via} directLabel={labels.direct} />
          ))
        )}
      </div>

      {/* FOOTER — exit + faint annotation */}
      <div className="flex items-center justify-between border-t border-[var(--color-border)] px-8 py-3 sm:px-12 font-mono text-[10px] tracking-[0.3em] text-[var(--color-text-subtle)] uppercase">
        <span>INFOFER · live · refresh 30s</span>
        <Link
          href={`/station/${slug}`}
          className="hover:text-[var(--color-accent)]"
        >
          {labels.exit}
        </Link>
      </div>
    </div>
  );
}

function KioskRow({
  entry,
  viaLabel,
  directLabel,
}: {
  entry: BoardEntry;
  viaLabel: string;
  directLabel: string;
}) {
  const VIA_DISPLAY_LIMIT = 3;
  const viaDisplay = entry.via.slice(0, VIA_DISPLAY_LIMIT);
  const viaOverflow = entry.via.length - viaDisplay.length;
  const cancelled = entry.status?.kind === "cancelled";

  return (
    <div
      className={`grid grid-cols-[1fr_auto] md:grid-cols-[200px_minmax(0,1fr)_180px_100px_140px] gap-4 md:gap-6 border-b border-[var(--color-border)] px-8 md:px-12 py-5 md:py-6 ${
        cancelled ? "opacity-60" : ""
      }`}
    >
      {/* TIME — split-flap fits well on short numeric values like HH:MM. */}
      <SplitFlap
        value={entry.time}
        className={`font-mono text-3xl sm:text-4xl md:text-5xl font-medium leading-none ${
          cancelled ? "text-red-500 line-through decoration-1" : "text-[var(--color-accent)]"
        }`}
      />

      {/* DESTINATION + via — plain bold display text. SplitFlap on long Romanian
          station names with diacritics (e.g. "Aeroport Henri Coandă") at this
          size renders one dark cell per character with visible gaps; reads as
          stutter instead of a Solari board. Time and platform stay flapped. */}
      <div className="md:order-none order-3 col-span-2 md:col-span-1 min-w-0 flex flex-col justify-center">
        <span className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-[var(--color-text)] truncate leading-tight">
          {entry.counterpart.name}
        </span>
        <div className="mt-1.5 font-mono text-[11px] sm:text-xs tracking-wider text-[var(--color-text-subtle)] uppercase truncate">
          {entry.via.length === 0
            ? directLabel
            : `${viaLabel} ${viaDisplay.join(" · ")}${viaOverflow > 0 ? ` +${viaOverflow}` : ""}`}
        </div>
      </div>

      {/* TRAIN — category badge + number + operator */}
      <div className="hidden md:flex flex-col justify-center font-mono text-xl leading-none">
        <div className="flex items-baseline gap-2">
          <span className="text-[var(--color-accent)] font-bold">{entry.train.category}</span>
          <span className="text-[var(--color-text-muted)]">{entry.train.number}</span>
        </div>
        {entry.operator ? (
          <div className="mt-1.5 text-[10px] tracking-wider text-[var(--color-text-subtle)] uppercase truncate">
            {entry.operator}
          </div>
        ) : null}
      </div>

      {/* PLATFORM — visually loud only when populated; absent state fades. */}
      <div className="hidden md:flex items-center justify-start font-mono">
        {entry.platform ? (
          <SplitFlap
            value={entry.platform}
            className="text-3xl font-bold text-[var(--color-accent)] leading-none"
          />
        ) : (
          <span className="text-base text-[var(--color-text-subtle)]/60">·</span>
        )}
      </div>

      {/* STATUS / countdown */}
      <div className="md:order-none order-2 flex flex-col items-end justify-center gap-1 text-right">
        <StatusPill entry={entry} variant="prominent" />
        <MinutesToGo time={entry.time} className="text-xs sm:text-sm tracking-widest" />
      </div>
    </div>
  );
}
