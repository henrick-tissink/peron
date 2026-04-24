"use client";

import { useState, type ReactNode } from "react";
import type { Itinerary } from "@peron/types";
import { Bike, UtensilsCrossed, Moon, Bed } from "lucide-react";
import { CfrLink } from "./cfr-link.js";

function transferLabel(n: number): string {
  if (n === 0) return "Direct";
  return `${n} transfer${n === 1 ? "" : "s"}`;
}

function formatDuration(d: { hours: number; minutes: number }): string {
  if (d.hours === 0) return `${d.minutes}m`;
  if (d.minutes === 0) return `${d.hours}h`;
  return `${d.hours}h ${d.minutes}m`;
}

function formatPrice(p: Itinerary["priceFrom"]): string {
  if (!p) return "—";
  const cleaned = Number.isInteger(p.amount) ? `${p.amount}` : p.amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${cleaned.replace(".", ",")} lei`;
}

export function ItineraryCard({
  itinerary,
  children,
}: {
  itinerary: Itinerary;
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const firstSeg = itinerary.segments[0]!;

  return (
    <article className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4">
        <div className="flex flex-col items-end">
          <span className="num-time text-base">{itinerary.departure.time}</span>
          <span className="text-xs text-[var(--color-text-muted)]">{itinerary.departure.station}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-[var(--color-text-muted)]">{formatDuration(itinerary.duration)}</span>
          <span className="h-px w-24 bg-[var(--color-border)]" aria-hidden="true" />
          <span className="text-xs text-[var(--color-text-muted)]">{transferLabel(itinerary.transferCount)}</span>
        </div>
        <div className="flex flex-col items-start">
          <span className="num-time text-base">{itinerary.arrival.time}</span>
          <span className="text-xs text-[var(--color-text-muted)]">{itinerary.arrival.station}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
          <span>
            {firstSeg.trainCategory} {firstSeg.trainNumber}
          </span>
          <ServiceIcons services={itinerary.services} />
        </div>
        <div className="flex items-center gap-3">
          <span data-testid="price-from" className="num-time text-sm">
            {formatPrice(itinerary.priceFrom)}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="rounded-[var(--radius-control)] border border-[var(--color-border)] px-3 py-1 text-xs hover:border-[var(--color-peron-blue)] hover:text-[var(--color-peron-blue)]"
          >
            {expanded ? "Hide" : "Details"}
          </button>
          <CfrLink href={itinerary.bookingUrl} label="Book on CFR ↗" />
        </div>
      </div>

      {expanded && <div className="mt-4 border-t border-[var(--color-border)] pt-4">{children}</div>}
    </article>
  );
}

function ServiceIcons({ services }: { services: Itinerary["services"] }) {
  return (
    <span className="flex items-center gap-2">
      {services.bikeCar && <Bike size={14} aria-label="bike car" />}
      {services.barRestaurant && <UtensilsCrossed size={14} aria-label="bar / restaurant" />}
      {services.sleeper && <Bed size={14} aria-label="sleeper car" />}
      {services.couchette && <Moon size={14} aria-label="couchette" />}
    </span>
  );
}
