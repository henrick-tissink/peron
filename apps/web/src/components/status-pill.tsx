"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { BoardEntry } from "@peron/types";
import { minutesUntil } from "../lib/board-time";

type Variant = "compact" | "prominent";

/**
 * Single source of truth for the "what's the live state of this train" badge.
 *
 * Render priority (highest wins):
 *   1. CANCELLED — INFOFER explicitly reports it, always show.
 *   2. BOARDING — synthetic. INFOFER doesn't expose a boarding flag, but a
 *      train with a platform assigned that's < 10 min from departure is, in
 *      practice, what a Solari labels "ÎMBARCARE". Mirror that.
 *   3. Delayed — graduated amber → orange → red as the delay grows.
 *   4. On-time — implicit (returns null) so the row stays calm.
 *
 * `variant="compact"` is for the homepage ticker / per-row UI; `prominent` is
 * for the kiosk-mode large board.
 */
export function StatusPill({
  entry,
  variant = "compact",
}: {
  entry: BoardEntry;
  variant?: Variant;
}) {
  const t = useTranslations("liveBadge");
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);

  const sizing =
    variant === "prominent"
      ? "px-2 py-0.5 text-sm tracking-widest"
      : "text-[10px] tracking-widest";

  if (entry.status?.kind === "cancelled") {
    return (
      <span className={`font-semibold uppercase text-red-500 ${sizing}`}>
        {t("cancelled")}
      </span>
    );
  }

  // Boarding — synthesised. Only fires once a platform is assigned AND the
  // departure is imminent. Both conditions matter: a train 5 min away with no
  // platform isn't boarding yet (it hasn't pulled in); a train 30 min away
  // with a platform is technically platforming early but isn't "ÎMBARCARE"
  // — keep the threshold tight.
  if (now && entry.platform && entry.status?.kind !== "delayed") {
    const delta = minutesUntil(entry.time, now);
    if (delta !== null && delta <= 10 && delta >= -2) {
      return (
        <span
          className={`font-semibold uppercase rounded bg-[var(--color-accent)] text-[var(--color-bg)] ${sizing} ${variant === "compact" ? "px-1.5 py-px" : ""}`}
        >
          {t("boarding")} · {entry.platform}
        </span>
      );
    }
  }

  if (entry.status?.kind === "delayed") {
    const m = entry.status.minutes;
    // Stratified: short delays (<5) read as a heads-up; medium (5-14) as a
    // real concern; long (15+) as red, the "you might want to know NOW" tone.
    const tone =
      m >= 15 ? "text-red-500" : m >= 5 ? "text-orange-500" : "text-amber-500";
    return (
      <span className={`font-semibold ${tone} ${sizing}`}>
        +{m}m
      </span>
    );
  }

  return null;
}
