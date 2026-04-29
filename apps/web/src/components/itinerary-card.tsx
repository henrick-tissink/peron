"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Itinerary } from "@peron/types";
import { FareMatrix } from "./fare-matrix";
import { SplitFlap } from "./split-flap";

export function ItineraryCard({ itinerary }: { itinerary: Itinerary }) {
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations("results");
  const tFare = useTranslations("fareMatrix");
  const hours = itinerary.duration.hours;
  const minutes = itinerary.duration.minutes;

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`grid w-full grid-cols-[150px_minmax(0,1fr)_60px_24px] sm:grid-cols-[170px_1fr_100px_80px_110px_24px] items-center gap-3 sm:gap-5 border-b border-[var(--color-border)] px-4 sm:px-7 py-3 sm:py-4 text-left transition-colors hover:bg-[var(--color-bg-subtle)] ${expanded ? "bg-[var(--color-bg-subtle)]" : ""}`}
      >
        <div className="font-mono text-base flex items-baseline gap-1">
          <SplitFlap value={itinerary.departure.time} className="text-[var(--color-accent)]" />
          <span className="text-[var(--color-text-subtle)]">→</span>
          <SplitFlap value={itinerary.arrival.time} className="text-[var(--color-text)]" />
        </div>
        <div className="min-w-0">
          <div className="font-mono text-sm truncate">
            {itinerary.segments.map((s, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-2 text-[var(--color-text-subtle)]">+</span>}
                <span className="text-[var(--color-accent)]">{s.trainCategory}</span>
                <span className="text-[var(--color-text)]"> {s.trainNumber}</span>
              </span>
            ))}
          </div>
          <div className="mt-1 font-mono text-[11px] text-[var(--color-text-subtle)] truncate">
            {itinerary.departure.station} — {itinerary.arrival.station}
          </div>
        </div>
        <div className="text-right font-mono text-sm text-[var(--color-text-muted)] hidden sm:block">
          {hours}h {String(minutes).padStart(2, "0")}m
        </div>
        <div className="font-mono text-[11px] tracking-widest uppercase text-[var(--color-ok)] hidden sm:block">
          {itinerary.transferCount === 0 ? t("direct") : t("changes", { count: itinerary.transferCount })}
        </div>
        <div className="text-right font-mono text-sm">
          {itinerary.priceFrom ? (
            <>
              <span className="text-[var(--color-text)]">{itinerary.priceFrom.amount}</span>
              <span className="ml-1 text-[var(--color-text-subtle)] text-[11px]">{itinerary.priceFrom.currency}</span>
            </>
          ) : null}
        </div>
        <div className={`text-right text-base ${expanded ? "text-[var(--color-accent)]" : "text-[var(--color-text-subtle)]"}`}>
          {expanded ? "⌄" : "›"}
        </div>
      </button>
      {expanded && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-7 py-4">
          <FareMatrix transactionString={itinerary.transactionString} />
          <div className="mt-3 flex justify-end">
            <a
              href={itinerary.bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="bg-[var(--color-accent)] px-5 py-2 font-mono text-xs font-semibold tracking-wide text-[var(--color-bg)] hover:bg-[var(--color-accent)]/90"
            >
              {tFare("bookOnCfr")}
            </a>
          </div>
        </div>
      )}
    </>
  );
}
