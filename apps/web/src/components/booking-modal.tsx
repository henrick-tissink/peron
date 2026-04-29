"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import type { Itinerary } from "@peron/types";

export function BookingModal({
  itinerary,
  date,
  bookingUrl,
  onClose,
}: {
  itinerary: Itinerary;
  date: Date;
  bookingUrl: string;
  onClose: () => void;
}) {
  const t = useTranslations("booking");
  const format = useFormatter();
  const [copied, setCopied] = useState(false);
  const continueRef = useRef<HTMLButtonElement>(null);
  const headingId = "booking-modal-heading";

  // Format date as DD.MM.YYYY (CFR's expected display format)
  const cfrDate =
    String(date.getDate()).padStart(2, "0") + "." +
    String(date.getMonth() + 1).padStart(2, "0") + "." +
    date.getFullYear();

  const seg = itinerary.segments[0];
  const trainCategory = seg?.trainCategory ?? "";
  const trainNumber = seg?.trainNumber ?? "";

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus primary action on open
  useEffect(() => {
    continueRef.current?.focus();
  }, []);

  async function copyDate() {
    try {
      await navigator.clipboard.writeText(cfrDate);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available — silently no-op */
    }
  }

  function openCfr() {
    window.open(bookingUrl, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby={headingId}
        aria-modal="true"
        className="w-full max-w-lg bg-[var(--color-bg-elev)] border border-[var(--color-border-strong)] rounded-lg p-6 font-mono text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-5">
          <h2 id={headingId} className="font-display text-2xl tracking-tight font-bold">
            {t("title")}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("close")}
            className="text-[var(--color-text-subtle)] hover:text-[var(--color-text)] text-lg leading-none px-2"
          >
            ✕
          </button>
        </div>

        <div className="border-t border-b border-[var(--color-border)] py-4 mb-5">
          <div className="text-[10px] tracking-widest text-[var(--color-text-subtle)] uppercase mb-2">
            {t("trainHeader")}
          </div>
          <div className="text-base">
            <span className="text-[var(--color-accent)] font-semibold">{trainCategory}</span>{" "}
            <span className="text-[var(--color-text)]">{trainNumber}</span>
          </div>
          <div className="text-xs text-[var(--color-text-muted)] mt-1">
            {itinerary.departure.station} → {itinerary.arrival.station}
          </div>
          <div className="text-xs text-[var(--color-text-muted)] mt-1">
            {format.dateTime(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            <span className="mx-2 text-[var(--color-text-subtle)]">·</span>
            <span className="text-[var(--color-accent)]">{itinerary.departure.time}</span>
          </div>
        </div>

        <p className="text-xs text-[var(--color-text-muted)] mb-4 leading-relaxed">
          {t("preamble", { count: 3 })}
        </p>

        <ol className="space-y-3 text-xs mb-6">
          <li className="flex gap-3">
            <span className="text-[var(--color-accent)] font-bold w-4">1.</span>
            <div className="flex-1">
              <div className="text-[var(--color-text-muted)] leading-relaxed">{t("step1")}</div>
              <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                <span className="text-base text-[var(--color-text)] font-semibold">{cfrDate}</span>
                <button
                  onClick={copyDate}
                  className="text-[10px] tracking-widest text-[var(--color-accent)] uppercase hover:underline"
                >
                  {copied ? t("dateCopied") : t("copyDate")}
                </button>
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="text-[var(--color-accent)] font-bold w-4">2.</span>
            <span className="text-[var(--color-text-muted)] leading-relaxed">{t("step2")}</span>
          </li>
          <li className="flex gap-3">
            <span className="text-[var(--color-accent)] font-bold w-4">3.</span>
            <span className="text-[var(--color-text-muted)] leading-relaxed">
              {t("step3", { time: itinerary.departure.time, category: trainCategory, number: trainNumber })}
            </span>
          </li>
        </ol>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs tracking-widest text-[var(--color-text-muted)] uppercase hover:text-[var(--color-text)]"
          >
            {t("cancelButton")}
          </button>
          <button
            ref={continueRef}
            onClick={openCfr}
            className="bg-[var(--color-accent)] px-5 py-2 text-xs tracking-widest font-semibold text-[var(--color-bg)] uppercase hover:bg-[var(--color-accent)]/90"
          >
            {t("openCfrButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
