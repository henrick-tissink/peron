"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Station } from "@peron/types";
import { ArrowLeftRight } from "lucide-react";
import { StationAutocomplete } from "./station-autocomplete.js";
import { DatePicker, defaultDatePickerValue } from "./date-picker.js";

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
      className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr_auto_auto]"
    >
      <StationAutocomplete
        name="from"
        label="From"
        stations={stations}
        value={from}
        onChange={setFrom}
        placeholder="Departure station"
      />
      <button
        type="button"
        aria-label="swap"
        onClick={() => {
          const newFrom = to;
          const newTo = from;
          setFrom(newFrom);
          setTo(newTo);
        }}
        className="hidden self-end rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2 text-[var(--color-text-muted)] hover:border-[var(--color-peron-blue)] hover:text-[var(--color-peron-blue)] md:block"
      >
        <ArrowLeftRight size={16} aria-hidden="true" />
      </button>
      <StationAutocomplete
        name="to"
        label="To"
        stations={stations}
        value={to}
        onChange={setTo}
        placeholder="Arrival station"
      />
      <DatePicker name="date" value={date} onChange={setDate} />
      <button
        type="submit"
        disabled={!canSubmit}
        className="self-end rounded-[var(--radius-control)] bg-[var(--color-peron-blue)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-peron-blue-hover)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Search
      </button>
    </form>
  );
}
