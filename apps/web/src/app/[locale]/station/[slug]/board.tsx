"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BoardResponse, BoardDirection } from "@peron/types";
import { fetchBoard } from "../../../../lib/api-board";
import { BoardRow } from "../../../../components/board-row";
import { Clock } from "../../../../components/clock";

type Labels = {
  metaDepartures: string; metaArrivals: string;
  tabDepartures: string; tabArrivals: string;
  headTime: string; headDestination: string; headOrigin: string; headTrain: string; headDuration: string;
  updatedLabel: string; annotation: string; backToSearch: string; noEntries: string;
};

export function BoardClient({
  slug, stationName, initialDepartures, labels,
}: {
  slug: string; stationName: string; initialDepartures: BoardResponse | null; labels: Labels;
}) {
  const [direction, setDirection] = useState<BoardDirection>("departures");
  const [data, setData] = useState<BoardResponse | null>(initialDepartures);

  // Refetch on direction change
  useEffect(() => {
    let cancelled = false;
    fetchBoard(slug, direction)
      .then((r) => !cancelled && setData(r))
      .catch(() => !cancelled && setData(null));
    return () => { cancelled = true; };
  }, [direction, slug]);

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(() => {
      fetchBoard(slug, direction).then(setData).catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, [direction, slug]);

  const meta = direction === "departures" ? labels.metaDepartures : labels.metaArrivals;
  const counterpartHead = direction === "departures" ? labels.headDestination : labels.headOrigin;

  return (
    <>
      <div className="flex items-end justify-between gap-4 border-b border-[var(--color-border)] px-7 py-8 flex-wrap">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-[var(--color-accent)] uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] pulse" />
            {meta}
          </div>
          <h1 className="mt-2 font-display text-5xl font-bold tracking-tight md:text-6xl">{stationName}</h1>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] tracking-widest text-[var(--color-text-subtle)] uppercase">{labels.updatedLabel}</div>
          <div className="mt-1"><Clock /></div>
        </div>
      </div>

      <div className="flex border-b border-[var(--color-border)] px-7" role="tablist">
        {(["departures", "arrivals"] as BoardDirection[]).map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={direction === d}
            onClick={() => setDirection(d)}
            className={`-mb-px px-6 py-3.5 font-mono text-xs tracking-widest uppercase border-b-2 ${
              direction === d
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-transparent text-[var(--color-text-subtle)]"
            }`}
          >
            {d === "departures" ? labels.tabDepartures : labels.tabArrivals}
            {data && direction === d ? <span className="ml-2 text-[var(--color-text-subtle)]">{data.entries.length}</span> : null}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[90px_1fr_100px_100px] gap-5 border-b border-[var(--color-border)] px-7 py-3 font-mono text-[10px] tracking-widest text-[var(--color-text-subtle)] uppercase">
        <span>{labels.headTime}</span>
        <span>{counterpartHead}</span>
        <span className="text-right">{labels.headTrain}</span>
        <span className="text-right">{labels.headDuration}</span>
      </div>

      {data && data.entries.length === 0 ? (
        <div className="px-7 py-12 text-center font-mono text-sm text-[var(--color-text-muted)]">{labels.noEntries}</div>
      ) : (
        data?.entries.map((e, i) => <BoardRow key={`${e.time}-${e.train.number}-${i}`} entry={e} stationSlug={slug} direction={direction} />)
      )}

      <div className="px-7 pt-4 pb-1 font-mono text-[10px] tracking-widest text-[var(--color-text-subtle)] uppercase">{labels.annotation}</div>
      <footer className="flex justify-between border-t border-[var(--color-border)] px-7 py-4 font-mono text-[11px] tracking-widest text-[var(--color-text-subtle)] uppercase">
        <span>PERON · GARALAGARA.COM</span>
        <Link href="/" className="hover:text-[var(--color-accent)]">{labels.backToSearch}</Link>
      </footer>
    </>
  );
}
