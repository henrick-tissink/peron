"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { TrainResponse, TrainStop } from "@peron/types";
import { fetchTrain } from "../../../../lib/api-train";
import { Link } from "../../../../i18n/navigation";

const REFRESH_MS = 30_000;

export function TrainTimeline({ number, initial }: { number: string; initial: TrainResponse | null }) {
  const t = useTranslations("train");
  const [data, setData] = useState<TrainResponse | null>(initial);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetchTrain(number)
        .then((r) => !cancelled && r && setData(r))
        .catch(() => {});
    }
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [number]);

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-7 py-16 text-center font-mono text-sm text-[var(--color-text-muted)]">
        {t("notFound", { number })}
      </div>
    );
  }

  const positionFromIdx = data.position
    ? data.stops.findIndex((s) => s.station.slug === data.position!.betweenSlug.from)
    : -1;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-7 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-[var(--color-accent)] uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] pulse" />
          {t("liveLabel")}
        </div>
        <h1 className="mt-2 font-display text-4xl sm:text-5xl font-bold tracking-tight">
          <span className="text-[var(--color-accent)]">{data.category}</span>{" "}
          <span className="text-[var(--color-text-muted)]">{data.number}</span>
        </h1>
        <div className="mt-2 font-mono text-sm text-[var(--color-text-muted)]">
          {data.origin} <span className="text-[var(--color-accent)]">→</span> {data.terminus}
        </div>
        {data.position ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 font-mono text-xs text-[var(--color-text)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] pulse" />
            {t("currentlyBetween", {
              from: data.stops[positionFromIdx]?.station.name ?? data.position.betweenSlug.from.replace(/-/g, " "),
              to: data.stops[positionFromIdx + 1]?.station.name ?? data.position.betweenSlug.to.replace(/-/g, " "),
            })}
            <span className="text-[var(--color-text-subtle)]">· {t("reportedAt", { time: data.position.reportedAt })}</span>
            {data.position.delayMinutes && data.position.delayMinutes > 0 ? (
              <span className="font-semibold text-amber-500">+{data.position.delayMinutes}m</span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Stop timeline */}
      <ol className="relative">
        {data.stops.map((stop, i) => {
          const isCurrent = positionFromIdx === i;
          const isPast = positionFromIdx >= 0 && i < positionFromIdx;
          return (
            <StopRow
              key={`${stop.station.slug}-${i}`}
              stop={stop}
              isCurrent={isCurrent}
              isPast={isPast}
              isFirst={i === 0}
              isLast={i === data.stops.length - 1}
            />
          );
        })}
      </ol>

      <div className="mt-12 flex items-center justify-between font-mono text-[10px] tracking-widest text-[var(--color-text-subtle)] uppercase">
        <span>{t("annotation")}</span>
        <Link href="/" className="hover:text-[var(--color-accent)]">{t("backToSearch")}</Link>
      </div>
    </div>
  );
}

function StopRow({
  stop,
  isCurrent,
  isPast,
  isFirst,
  isLast,
}: {
  stop: TrainStop;
  isCurrent: boolean;
  isPast: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const arrDelay = stop.arrival?.status?.kind === "delayed" ? stop.arrival.status.minutes : null;
  const depDelay = stop.departure?.status?.kind === "delayed" ? stop.departure.status.minutes : null;
  const cancelled =
    stop.arrival?.status?.kind === "cancelled" || stop.departure?.status?.kind === "cancelled";

  // Visual treatment by position state.
  const dotClass = isCurrent
    ? "bg-[var(--color-accent)] ring-4 ring-[var(--color-accent)]/30"
    : isPast
    ? "bg-[var(--color-text-subtle)]"
    : "bg-[var(--color-border-strong)]";
  const lineClass = isPast ? "bg-[var(--color-text-subtle)]" : "bg-[var(--color-border)]";
  const textTone = isPast
    ? "text-[var(--color-text-subtle)]"
    : "text-[var(--color-text)]";

  return (
    <li className="relative grid grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-3 sm:gap-5 pb-6">
      {/* Timeline rail */}
      <div className="relative flex items-center justify-center pt-2">
        <span className={`relative z-10 block h-3 w-3 rounded-full ${dotClass}`} />
        {!isFirst ? (
          <span className={`absolute top-0 bottom-1/2 left-1/2 w-px -translate-x-1/2 ${lineClass}`} />
        ) : null}
        {!isLast ? (
          <span className={`absolute top-1/2 bottom-[-1.5rem] left-1/2 w-px -translate-x-1/2 ${lineClass}`} />
        ) : null}
      </div>

      {/* Station + meta */}
      <div className="min-w-0">
        <Link
          href={`/station/${stop.station.slug}`}
          className={`block truncate font-mono text-base font-medium hover:text-[var(--color-accent)] ${textTone} ${cancelled ? "line-through decoration-1" : ""}`}
        >
          {stop.station.name}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-[var(--color-text-subtle)]">
          {stop.km !== null ? <span>km {stop.km}</span> : null}
          {stop.platform ? <span>· linia {stop.platform}</span> : null}
          {isCurrent ? (
            <span className="font-semibold text-[var(--color-accent)] uppercase tracking-wider">→ now</span>
          ) : null}
        </div>
      </div>

      {/* Times */}
      <div className="text-right font-mono text-sm">
        {stop.arrival?.scheduled ? (
          <div className={textTone}>
            {stop.arrival.scheduled}
            {arrDelay !== null ? <span className="ml-1 text-amber-500 text-xs">+{arrDelay}m</span> : null}
          </div>
        ) : null}
        {stop.departure?.scheduled ? (
          <div className={`${textTone} ${stop.arrival?.scheduled ? "text-[var(--color-text-muted)] text-xs" : ""}`}>
            {stop.departure.scheduled}
            {depDelay !== null ? <span className="ml-1 text-amber-500 text-xs">+{depDelay}m</span> : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
