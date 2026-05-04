import { Link } from "../i18n/navigation";
import { useTranslations } from "next-intl";
import type { BoardEntry, BoardDirection } from "@peron/types";
import { SplitFlap } from "./split-flap";
import { MinutesToGo } from "./minutes-to-go";

export function BoardRow({ entry, stationSlug, direction }: { entry: BoardEntry; stationSlug: string; direction: BoardDirection }) {
  const t = useTranslations("stationBoard");
  const today = new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams(
    direction === "departures"
      ? { from: stationSlug, to: entry.counterpart.slug, date: today }
      : { from: entry.counterpart.slug, to: stationSlug, date: today },
  );
  const hours = entry.durationMinutes !== undefined ? Math.floor(entry.durationMinutes / 60) : null;
  const minutes = entry.durationMinutes !== undefined ? entry.durationMinutes % 60 : null;
  const delayMinutes = entry.status?.kind === "delayed" ? entry.status.minutes : null;
  const cancelled = entry.status?.kind === "cancelled";
  // INFOFER's "Direcția" string can list 15+ intermediate stations on
  // long-distance trains. Cap rendering at the three most prominent so the row
  // height stays reasonable; the full route is still available in the API payload.
  const VIA_DISPLAY_LIMIT = 3;
  const viaDisplay = entry.via.slice(0, VIA_DISPLAY_LIMIT);
  const viaOverflow = entry.via.length - viaDisplay.length;

  return (
    <Link
      href={`/search?${params.toString()}`}
      className="grid grid-cols-[80px_minmax(0,1fr)_100px] sm:grid-cols-[90px_1fr_100px_100px] items-center gap-3 sm:gap-5 border-b border-[var(--color-border)] px-4 sm:px-7 py-4 sm:py-5 transition-colors hover:bg-[var(--color-bg-subtle)]"
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
          {cancelled ? (
            <span className="font-semibold text-red-500 uppercase tracking-wider">CANCELLED</span>
          ) : delayMinutes !== null ? (
            <span className="font-semibold text-amber-500">+{delayMinutes}m</span>
          ) : null}
          {entry.platform ? (
            <span className="text-[var(--color-text-muted)]">· {entry.platform}</span>
          ) : null}
        </div>
      </div>
      {/* keep train + duration as static for now — too many concurrent SplitFlaps gets dense */}
      <div className="text-right font-mono text-sm">
        <div>
          <span className="text-[var(--color-accent)] font-semibold">{entry.train.category}</span>{" "}
          <span className="text-[var(--color-text-muted)]">{entry.train.number}</span>
        </div>
        {entry.operator ? (
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)] truncate">
            {entry.operator}
          </div>
        ) : null}
      </div>
      <div className="text-right font-mono text-sm text-[var(--color-text-muted)] hidden sm:block">
        {hours !== null && minutes !== null ? `${hours}h ${String(minutes).padStart(2, "0")}m` : ""}
      </div>
    </Link>
  );
}
