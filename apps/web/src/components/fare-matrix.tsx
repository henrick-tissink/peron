"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { FareTypeId, PriceResponse } from "@peron/types";
import { FARE_TYPES, SERVICE_KEYS, type ServiceKey } from "../lib/fares";
import { fetchPrice } from "../lib/api";

type CellKey = `${FareTypeId}:${ServiceKey}`;
type CellState =
  | { status: "loading" }
  | { status: "done"; result: PriceResponse };

function key(f: FareTypeId, s: ServiceKey): CellKey {
  return `${f}:${s}`;
}

export function FareMatrix({ transactionString }: { transactionString: string }) {
  const t = useTranslations("fareMatrix");
  const tFares = useTranslations("fares");

  const [cells, setCells] = useState<Record<CellKey, CellState>>(() => {
    const init: Record<CellKey, CellState> = {} as Record<CellKey, CellState>;
    for (const f of FARE_TYPES) for (const s of SERVICE_KEYS) init[key(f.id, s.key)] = { status: "loading" };
    return init;
  });

  useEffect(() => {
    let cancelled = false;

    for (const f of FARE_TYPES) {
      for (const s of SERVICE_KEYS) {
        fetchPrice({ transactionString, fareTypeId: f.id, serviceKey: s.key }).then(
          (result) => {
            if (cancelled) return;
            setCells((prev) => ({ ...prev, [key(f.id, s.key)]: { status: "done", result } }));
          },
          () => {
            if (cancelled) return;
            setCells((prev) => ({
              ...prev,
              [key(f.id, s.key)]: { status: "done", result: { ok: false, reason: "unavailable" } },
            }));
          },
        );
      }
    }

    return () => {
      cancelled = true;
    };
  }, [transactionString]);

  return (
    <table className="w-full font-mono text-xs">
      <thead>
        <tr className="border-b border-[var(--color-border)]">
          <th className="py-2 px-3 text-left text-[10px] tracking-widest text-[var(--color-text-subtle)] uppercase">{t("fareType")}</th>
          {SERVICE_KEYS.map((s) => (
            <th key={s.key} className="py-2 px-3 text-right text-[10px] tracking-widest text-[var(--color-text-subtle)] uppercase">
              {s.key === "A&A" ? t("class1") : t("class2")}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {FARE_TYPES.map((f) => (
          <tr key={f.id}>
            <td className="py-2 px-3 text-[var(--color-text-muted)]">{tFares(f.labelKey)}</td>
            {SERVICE_KEYS.map((s) => {
              const cell = cells[key(f.id, s.key)]!;
              if (cell.status === "loading") return <td key={s.key} role="cell" className="py-2 px-3 text-right text-[var(--color-text-subtle)]">{t("loading")}</td>;
              const r = cell.result;
              if (!r.ok) return <td key={s.key} role="cell" className="py-2 px-3 text-right text-[var(--color-border-strong)]">{t("unavailable")}</td>;
              return (
                <td key={s.key} role="cell" className="py-2 px-3 text-right">
                  <span className="text-[var(--color-accent)]">{r.amount}</span>{" "}
                  <span className="text-[var(--color-text-subtle)]">{r.currency}</span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
