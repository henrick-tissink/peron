"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { minutesUntil } from "../lib/board-time";

/**
 * Renders a "minutes-to-go" indicator next to a board entry's scheduled time.
 *
 * - Hidden when the train is > {hideAfterMinutes} minutes away (default 60). The
 *   scheduled HH:MM is already visible elsewhere — adding "in 4h 12min" would
 *   clutter without helping.
 * - "Now" between -1 and +1 minute (boarding/just departed feel).
 * - "in N min" otherwise. Re-renders every 10 s.
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
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);

  if (now === null) return null; // SSR — defer to client to avoid hydration mismatch

  const delta = minutesUntil(time, now);
  if (delta === null) return null;
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
