"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Station } from "@peron/types";
import { StationAutocomplete } from "./station-autocomplete";
import { DatePicker, defaultDatePickerValue } from "./date-picker";

export function SearchForm({
  stations,
  defaultFrom = "",
  defaultTo = "",
  defaultDate,
}: {
  stations: Station[];
  defaultFrom?: string;
  defaultTo?: string;
  defaultDate?: string;
}) {
  const router = useRouter();
  const t = useTranslations("searchForm");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [date, setDate] = useState(defaultDate ?? defaultDatePickerValue());

  const canSubmit = from.trim() !== "" && to.trim() !== "" && from !== to && /^\d{4}-\d{2}-\d{2}$/.test(date);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const params = new URLSearchParams({ from, to, date });
    router.push(`/search?${params.toString()}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid max-w-2xl mx-auto grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-px overflow-hidden rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-border-strong)]"
    >
      <SegField label={t("fromLabel")}>
        <StationAutocomplete
          name="from"
          label={t("fromLabel")}
          stations={stations}
          value={from}
          onChange={setFrom}
          placeholder={t("fromPlaceholder")}
        />
      </SegField>
      <SegField label={t("toLabel")}>
        <StationAutocomplete
          name="to"
          label={t("toLabel")}
          stations={stations}
          value={to}
          onChange={setTo}
          placeholder={t("toPlaceholder")}
        />
      </SegField>
      <SegField label={t("dateLabel")}>
        <DatePicker name="date" value={date} onChange={setDate} />
      </SegField>
      <button
        type="submit"
        aria-label={t("submit")}
        className="bg-[var(--color-accent)] px-8 font-mono font-semibold text-[var(--color-bg)] hover:bg-[var(--color-accent)]/90"
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
