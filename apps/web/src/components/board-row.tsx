import { Link } from "../i18n/navigation";
import { useTranslations } from "next-intl";
import type { BoardEntry, BoardDirection } from "@peron/types";
import { SplitFlap } from "./split-flap";

export function BoardRow({ entry, stationSlug, direction }: { entry: BoardEntry; stationSlug: string; direction: BoardDirection }) {
  const t = useTranslations("stationBoard");
  const today = new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams(
    direction === "departures"
      ? { from: stationSlug, to: entry.counterpart.slug, date: today }
      : { from: entry.counterpart.slug, to: stationSlug, date: today },
  );
  const hours = Math.floor(entry.durationMinutes / 60);
  const minutes = entry.durationMinutes % 60;

  return (
    <Link
      href={`/search?${params.toString()}`}
      className="grid grid-cols-[80px_minmax(0,1fr)_100px] sm:grid-cols-[90px_1fr_100px_100px] items-center gap-3 sm:gap-5 border-b border-[var(--color-border)] px-4 sm:px-7 py-4 sm:py-5 transition-colors hover:bg-[var(--color-bg-subtle)]"
    >
      <SplitFlap value={entry.time} className="font-mono text-2xl font-medium text-[var(--color-accent)]" />
      <div className="font-mono text-sm min-w-0">
        <SplitFlap value={entry.counterpart.name} className="text-[var(--color-text)] block truncate" />
        <div className="mt-1 text-[11px] text-[var(--color-text-subtle)]">
          {entry.via.length === 0 ? t("direct") : t("via", { stops: entry.via.join(" · ") })}
        </div>
      </div>
      {/* keep train + duration as static for now — too many concurrent SplitFlaps gets dense */}
      <div className="text-right font-mono text-sm">
        <span className="text-[var(--color-accent)] font-semibold">{entry.train.category}</span>{" "}
        <span className="text-[var(--color-text-muted)]">{entry.train.number}</span>
      </div>
      <div className="text-right font-mono text-sm text-[var(--color-text-muted)] hidden sm:block">
        {hours}h {String(minutes).padStart(2, "0")}m
      </div>
    </Link>
  );
}
