"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

function bucharestNowMinutes(): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bucharest",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [h, m] = fmt.format(new Date()).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function timeToMinutes(t: string): number | null {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Renders a "minutes-to-go" indicator next to a board entry's scheduled time.
 *
 * - Hidden when the train is > {hideAfterMinutes} minutes away (default 60). The
 *   scheduled HH:MM is already visible elsewhere — adding "in 4h 12min" would
 *   clutter without helping.
 * - "Now" between -1 and +1 minute (boarding/just departed feel).
 * - "in N min" otherwise. Re-renders every 10 s.
 *
 * Works around the day-rollover edge case: if a 00:30 train is parsed at 23:55,
 * the naive subtraction returns -1405. We treat any large negative value as a
 * next-day departure and add 24h.
 */
export function MinutesToGo({
  time,
  hideAfterMinutes = 60,
  className = "",
}: {
  time: string;
  hideAfterMinutes?: number;
  className?: string;
}) {
  const t = useTranslations("liveBadge");
  const [nowMin, setNowMin] = useState<number | null>(null);

  useEffect(() => {
    setNowMin(bucharestNowMinutes());
    const id = setInterval(() => setNowMin(bucharestNowMinutes()), 10_000);
    return () => clearInterval(id);
  }, []);

  if (nowMin === null) return null; // SSR — defer to client to avoid hydration mismatch

  const target = timeToMinutes(time);
  if (target === null) return null;

  let delta = target - nowMin;
  // Day-rollover: a 00:30 train viewed at 23:55 is 35 min away, not -1405.
  if (delta < -120) delta += 24 * 60;

  if (delta > hideAfterMinutes) return null;
  if (delta < -2) return null;

  if (delta <= 1 && delta >= -1) {
    return (
      <span className={`font-mono text-[10px] tracking-widest text-[var(--color-accent)] uppercase ${className}`}>
        {t("now")}
      </span>
    );
  }

  // Tight tone for trains <= 10 min: accent. Beyond that: subtle.
  const tone =
    delta <= 10
      ? "text-[var(--color-accent)]"
      : "text-[var(--color-text-subtle)]";

  return (
    <span className={`font-mono text-[10px] tracking-widest uppercase ${tone} ${className}`}>
      {t("inMinutes", { n: delta })}
    </span>
  );
}
