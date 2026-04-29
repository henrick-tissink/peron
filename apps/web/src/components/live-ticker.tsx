"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { BoardResponse } from "@peron/types";
import { fetchBoard } from "../lib/api-board";

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

  const top3 = (data?.entries ?? []).slice(0, 3);

  return (
    <div className="border-y border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-7 py-3.5">
      <div className="mb-2 flex items-center gap-2 font-mono text-[10px] tracking-widest text-[var(--color-accent)] uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] pulse" />
        {t("tickerLabel")}
      </div>
      {top3.length === 0 ? (
        <div className="font-mono text-xs text-[var(--color-text-subtle)]">…</div>
      ) : (
        top3.map((e, i) => (
          <div key={i} className="grid grid-cols-[80px_1fr_100px] gap-4 py-1 font-mono text-[13px]">
            <span className="text-[var(--color-accent)]">{e.time}</span>
            <span>→ {e.counterpart.name}</span>
            <span className="text-[var(--color-text-muted)]">{e.train.category}-{e.train.number}</span>
          </div>
        ))
      )}
    </div>
  );
}
