"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Station } from "@peron/types";
import { useRouter, Link } from "../i18n/navigation";
import { toStationSlug } from "../lib/normalize";
import { SearchForm } from "./search-form";
import { StationAutocomplete } from "./station-autocomplete";

type Mode = "journey" | "station" | "train";

const POPULAR_STATIONS: Array<{ slug: string; label: string }> = [
  { slug: "Bucuresti-Nord", label: "BUC NORD" },
  { slug: "Cluj-Napoca", label: "CLUJ" },
  { slug: "Brasov", label: "BRAȘOV" },
  { slug: "Timisoara-Nord", label: "TIMIȘOARA" },
  { slug: "Iasi", label: "IAȘI" },
];

const POPULAR_JOURNEYS: Array<{ from: string; to: string; label: string }> = [
  { from: "Bucuresti-Nord", to: "Cluj-Napoca", label: "BUC NORD → CLUJ" },
  { from: "Bucuresti-Nord", to: "Brasov", label: "BUC NORD → BRAȘOV" },
  { from: "Timisoara-Nord", to: "Bucuresti-Nord", label: "TIMIȘOARA → BUC NORD" },
];

export function HomeSearch({ stations }: { stations: Station[] }) {
  const t = useTranslations("home");
  const tForm = useTranslations("searchForm");
  const [mode, setMode] = useState<Mode>("journey");

  return (
    <div>
      <div
        role="tablist"
        aria-label={t("modeLabel")}
        className="mx-auto max-w-2xl mb-3 flex items-end gap-6 px-1 font-mono text-[11px] tracking-widest uppercase"
      >
        <Tab active={mode === "journey"} onClick={() => setMode("journey")}>
          {t("tabJourney")}
        </Tab>
        <Tab active={mode === "station"} onClick={() => setMode("station")}>
          {t("tabStation")}
        </Tab>
        <Tab active={mode === "train"} onClick={() => setMode("train")}>
          {t("tabTrain")}
        </Tab>
      </div>

      {mode === "journey" ? (
        <>
          <SearchForm stations={stations} />
          <PopularRow label={t("popularLabel")}>
            {POPULAR_JOURNEYS.map((p) => (
              <PopularChip
                key={p.label}
                href={`/search?${new URLSearchParams({
                  from: p.from,
                  to: p.to,
                  date: new Date(Date.now() + 86400_000).toISOString().slice(0, 10),
                }).toString()}`}
                label={p.label}
              />
            ))}
          </PopularRow>
        </>
      ) : null}

      {mode === "station" ? (
        <>
          <StationModeForm
            stations={stations}
            label={tForm("stationLabel")}
            placeholder={tForm("stationPlaceholder")}
            submitLabel={tForm("submit")}
          />
          <PopularRow label={t("popularStationsLabel")}>
            {POPULAR_STATIONS.map((s) => (
              <PopularChip
                key={s.slug}
                href={`/station/${s.slug}`}
                label={s.label}
              />
            ))}
          </PopularRow>
        </>
      ) : null}

      {mode === "train" ? (
        <TrainModeForm
          label={tForm("trainLabel")}
          placeholder={tForm("trainPlaceholder")}
          submitLabel={tForm("submit")}
        />
      ) : null}
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`pb-1.5 border-b transition-colors ${
        active
          ? "border-[var(--color-accent)] text-[var(--color-accent)]"
          : "border-transparent text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
      }`}
    >
      {children}
    </button>
  );
}

function StationModeForm({
  stations,
  label,
  placeholder,
  submitLabel,
}: {
  stations: Station[];
  label: string;
  placeholder: string;
  submitLabel: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");

  // Resolve typed text to a real station entry first (case/diacritic-insensitive
  // exact match) so we use the canonical name for slugging. Fall back to the
  // typed text if the user submitted free input.
  function resolveSlug(): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const trimmedSlug = toStationSlug(trimmed);
    if (!trimmedSlug) return null;
    const match = stations.find((s) => toStationSlug(s.name) === trimmedSlug);
    return match ? toStationSlug(match.name) : trimmedSlug;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const slug = resolveSlug();
    if (!slug) return;
    router.push(`/station/${slug}`);
  }

  const canSubmit = value.trim().length > 0;

  return (
    <form
      onSubmit={handleSubmit}
      className="grid max-w-2xl mx-auto grid-cols-1 md:grid-cols-[1fr_auto] gap-px border border-[var(--color-border-strong)] bg-[var(--color-border-strong)]"
    >
      <SegField label={label}>
        <StationAutocomplete
          name="station"
          label={label}
          stations={stations}
          value={value}
          onChange={setValue}
          placeholder={placeholder}
        />
      </SegField>
      <button
        type="submit"
        disabled={!canSubmit}
        aria-label={submitLabel}
        className="bg-[var(--color-accent)] px-8 font-mono font-semibold text-[var(--color-bg)] hover:bg-[var(--color-accent)]/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        →
      </button>
    </form>
  );
}

function TrainModeForm({
  label,
  placeholder,
  submitLabel,
}: {
  label: string;
  placeholder: string;
  submitLabel: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");

  // INFOFER's per-train endpoint takes the running number (digits). Be lenient
  // about how the user types it — accept "1666", "IR-1666", "ir 1666" — and
  // forward only the digits.
  function extractNumber(): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const m = trimmed.match(/\d+/);
    return m ? m[0] : null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const number = extractNumber();
    if (!number) return;
    router.push(`/train/${encodeURIComponent(number)}`);
  }

  const canSubmit = extractNumber() !== null;

  return (
    <form
      onSubmit={handleSubmit}
      className="grid max-w-2xl mx-auto grid-cols-1 md:grid-cols-[1fr_auto] gap-px border border-[var(--color-border-strong)] bg-[var(--color-border-strong)]"
    >
      <SegField label={label}>
        <input
          name="trainNumber"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="bg-transparent text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] outline-none w-full font-mono text-sm"
        />
      </SegField>
      <button
        type="submit"
        disabled={!canSubmit}
        aria-label={submitLabel}
        className="bg-[var(--color-accent)] px-8 font-mono font-semibold text-[var(--color-bg)] hover:bg-[var(--color-accent)]/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        →
      </button>
    </form>
  );
}

function SegField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-bg-elev)] px-4 py-3">
      <div className="font-mono text-[10px] tracking-widest text-[var(--color-text-subtle)] uppercase">{label}</div>
      <div className="mt-1 font-mono text-sm text-[var(--color-text)]">{children}</div>
    </div>
  );
}

function PopularRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <p className="mt-10 text-center font-mono text-[11px] tracking-widest text-[var(--color-text-subtle)] uppercase">
      {label} ·{" "}
      {items.flatMap((c, i) => (i === 0 ? [c] : [
        <span key={`sep-${i}`} className="mx-0.5">·</span>,
        c,
      ]))}
    </p>
  );
}

function PopularChip({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mx-1.5 border-b border-dashed border-[var(--color-accent)]/40 text-[var(--color-accent)] hover:border-[var(--color-accent)]"
    >
      {label}
    </Link>
  );
}
