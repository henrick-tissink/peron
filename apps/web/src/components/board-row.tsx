"use client";

import { Link, useRouter } from "../i18n/navigation";
import { useTranslations } from "next-intl";
import type { BoardEntry, BoardDirection } from "@peron/types";
import { SplitFlap } from "./split-flap";
import { MinutesToGo } from "./minutes-to-go";
import { StatusPill } from "./status-pill";

export function BoardRow({ entry, stationSlug, direction }: { entry: BoardEntry; stationSlug: string; direction: BoardDirection }) {
  const t = useTranslations("stationBoard");
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams(
    direction === "departures"
      ? { from: stationSlug, to: entry.counterpart.slug, date: today }
      : { from: entry.counterpart.slug, to: stationSlug, date: today },
  );
  const searchHref = `/search?${params.toString()}`;
  const trainHref = `/train/${encodeURIComponent(entry.train.number)}`;
  const hours = entry.durationMinutes !== undefined ? Math.floor(entry.durationMinutes / 60) : null;
  const minutes = entry.durationMinutes !== undefined ? entry.durationMinutes % 60 : null;
  // INFOFER's "Direcția" string can list 15+ intermediate stations on
  // long-distance trains. Cap rendering at the three most prominent so the row
  // height stays reasonable; the full route is still available in the API payload.
  const VIA_DISPLAY_LIMIT = 3;
  const viaDisplay = entry.via.slice(0, VIA_DISPLAY_LIMIT);
  const viaOverflow = entry.via.length - viaDisplay.length;

  // The row is a div (not <a>) because we host TWO interactive targets — the
  // bulk of the row navigates to fare search; the train chip drills into the
  // live train timeline. Nested <a> tags are invalid, so the row uses a click
  // handler with keyboard equivalents to stay accessible.
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={(e) => {
        // Don't hijack clicks that landed on an inner Link.
        if ((e.target as HTMLElement).closest("a")) return;
        router.push(searchHref);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(searchHref);
        }
      }}
      className="grid grid-cols-[80px_minmax(0,1fr)_100px] sm:grid-cols-[90px_1fr_100px_100px] items-center gap-3 sm:gap-5 border-b border-[var(--color-border)] px-4 sm:px-7 py-4 sm:py-5 transition-colors hover:bg-[var(--color-bg-subtle)] cursor-pointer focus:outline-none focus:bg-[var(--color-bg-subtle)]"
    >
      <div className="flex flex-col items-start gap-0.5">
        <SplitFlap value={entry.time} className="font-mono text-2xl font-medium text-[var(--color-accent)]" />
        <MinutesToGo time={entry.time} />
      </div>
      <div className="font-mono text-sm min-w-0">
        <SplitFlap value={entry.counterpart.name} className="text-[var(--color-text)] block truncate" />
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--color-text-subtle)]">
          <span>
            {entry.via.length === 0
              ? t("direct")
              : t("via", { stops: viaDisplay.join(" · ") + (viaOverflow > 0 ? ` +${viaOverflow}` : "") })}
          </span>
          <StatusPill entry={entry} variant="compact" />
          {entry.platform ? (
            <span className="text-[var(--color-text-muted)]">· {entry.platform}</span>
          ) : null}
        </div>
      </div>
      <div className="text-right font-mono text-sm">
        <Link
          href={trainHref}
          onClick={(e) => e.stopPropagation()}
          className="hover:text-[var(--color-accent)]"
          aria-label={`Live status for train ${entry.train.category} ${entry.train.number}`}
        >
          <span className="text-[var(--color-accent)] font-semibold">{entry.train.category}</span>{" "}
          <span className="text-[var(--color-text-muted)]">{entry.train.number}</span>
        </Link>
        {entry.operator ? (
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)] truncate">
            {entry.operator}
          </div>
        ) : null}
      </div>
      <div className="text-right font-mono text-sm text-[var(--color-text-muted)] hidden sm:block">
        {hours !== null && minutes !== null ? `${hours}h ${String(minutes).padStart(2, "0")}m` : ""}
      </div>
    </div>
  );
}
