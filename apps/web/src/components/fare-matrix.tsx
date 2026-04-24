"use client";

import { useEffect, useState } from "react";
import type { FareTypeId, PriceResponse } from "@peron/types";
import { FARE_TYPES, SERVICE_KEYS, type ServiceKey } from "../lib/fares";
import { fetchPrice } from "../lib/api";
import { Skeleton } from "./skeleton";

type CellKey = `${FareTypeId}:${ServiceKey}`;
type CellState =
  | { status: "loading" }
  | { status: "done"; result: PriceResponse };

function key(f: FareTypeId, s: ServiceKey): CellKey {
  return `${f}:${s}`;
}

function formatCell(r: PriceResponse): string {
  if (!r.ok) return "—";
  const n = r.amount;
  const cleaned = Number.isInteger(n) ? `${n}` : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${cleaned.replace(".", ",")} lei`;
}

export function FareMatrix({ transactionString }: { transactionString: string }) {
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
    <table role="table" className="w-full text-sm">
      <thead>
        <tr>
          <th scope="col" className="text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            Fare
          </th>
          {SERVICE_KEYS.map((s) => (
            <th
              key={s.key}
              scope="col"
              className="pl-4 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]"
            >
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {FARE_TYPES.map((f) => (
          <tr key={f.id}>
            <th scope="row" className="py-2 text-left text-sm font-normal">
              {f.label}
            </th>
            {SERVICE_KEYS.map((s) => {
              const cell = cells[key(f.id, s.key)]!;
              return (
                <td key={s.key} role="cell" className="num-time py-2 pl-4">
                  {cell.status === "loading" ? (
                    <Skeleton width={48} height={16} />
                  ) : (
                    formatCell(cell.result)
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
