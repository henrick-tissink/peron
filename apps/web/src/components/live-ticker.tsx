"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { BoardEntry, BoardResponse } from "@peron/types";
import { Link, useRouter } from "../i18n/navigation";
import { fetchBoard } from "../lib/api-board";
import { SplitFlap } from "./split-flap";
import { MinutesToGo } from "./minutes-to-go";
import { StatusPill } from "./status-pill";

const TICKER_LIMIT = 3;

export function LiveTicker() {
  const t = useTranslations("home");
  const [data, setData] = useState<BoardResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetchBoard("Bucuresti-Nord", "departures")
        .then((r) => !cancelled && setData(r))
        .catch(() => {});
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const top = (data?.entries ?? []).slice(0, TICKER_LIMIT);

  return (
    <div className="border-y border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-7 py-4">
      <div className="mb-2.5 flex items-center gap-2 font-mono text-[10px] tracking-widest text-[var(--color-accent)] uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] pulse" />
        {t("tickerLabel")}
      </div>
      {top.length === 0 ? (
        <div className="font-mono text-xs text-[var(--color-text-subtle)]">…</div>
      ) : (
        <div className="space-y-2">
          {top.map((e, i) => <TickerRow key={`${e.time}-${e.train.number}-${i}`} entry={e} />)}
        </div>
      )}
    </div>
  );
}

function TickerRow({ entry }: { entry: BoardEntry }) {
  const router = useRouter();
  const trainHref = `/train/${encodeURIComponent(entry.train.number)}`;
  const stationHref = `/station/${entry.counterpart.slug}`;

  // Whole row navigates to train tracking — that's the live magic. The
  // destination name is a nested Link to its station board for users who care
  // about the destination, not the train. Stop propagation so the inner Link
  // wins. Same pattern as components/board-row.tsx.
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) return;
        router.push(trainHref);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(trainHref);
        }
      }}
      className="grid grid-cols-[60px_minmax(0,1fr)_auto] sm:grid-cols-[80px_minmax(0,1fr)_auto] items-baseline gap-3 sm:gap-4 font-mono text-[13px] cursor-pointer transition-colors hover:bg-[var(--color-bg-elev)]/40 focus:outline-none focus:bg-[var(--color-bg-elev)]/40 -mx-3 px-3 py-1 rounded-sm"
    >
      <SplitFlap value={entry.time} className="text-[var(--color-accent)]" />

      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5 sm:gap-2 truncate">
          <span className="text-[var(--color-text-subtle)]">→</span>
          <Link
            href={stationHref}
            onClick={(e) => e.stopPropagation()}
            className="truncate hover:text-[var(--color-accent)]"
            aria-label={`Live board for ${entry.counterpart.name}`}
          >
            <SplitFlap value={entry.counterpart.name} className="text-[var(--color-text)] truncate" />
          </Link>
          <StatusPill entry={entry} variant="compact" />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] tracking-wider text-[var(--color-text-muted)] uppercase">
          <span className="text-[var(--color-accent)] font-semibold">
            {entry.train.category}
          </span>
          <span>{entry.train.number}</span>
          {entry.platform ? (
            <span aria-label="platform">· {entry.platform}</span>
          ) : null}
          {entry.operator ? (
            <span className="hidden sm:inline truncate max-w-[8rem]">· {entry.operator}</span>
          ) : null}
        </div>
      </div>

      <div className="text-right">
        <MinutesToGo time={entry.time} />
      </div>
    </div>
  );
}
