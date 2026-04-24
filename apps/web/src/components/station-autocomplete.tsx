"use client";

import { useId, useMemo, useState } from "react";
import type { Station } from "@peron/types";
import { matches } from "../lib/normalize.js";

const MAX_SUGGESTIONS = 8;

function suggest(stations: Station[], query: string, limit: number): Station[] {
  if (!query.trim()) return [];
  const prefix: Station[] = [];
  const substr: Station[] = [];
  for (const s of stations) {
    if (matches(s.name, query)) {
      prefix.push(s);
    } else if (matches(s.name, query, { substring: true })) {
      substr.push(s);
    }
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...substr].slice(0, limit);
}

export function StationAutocomplete({
  name,
  label,
  value,
  onChange,
  stations,
  placeholder,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  stations: Station[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const listboxId = useId();
  const labelId = `${name}-label`;

  const suggestions = useMemo(
    () => suggest(stations, value, MAX_SUGGESTIONS),
    [stations, value],
  );

  const showList = open && suggestions.length > 0;

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (showList && suggestions[activeIdx]) {
        e.preventDefault();
        onChange(suggestions[activeIdx].name);
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-1">
      <label
        id={labelId}
        htmlFor={name}
        className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        role="combobox"
        aria-labelledby={labelId}
        aria-controls={listboxId}
        aria-expanded={showList}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIdx(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-peron-blue)]"
      />
      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-auto rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg)] py-1 shadow-md"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.name}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(s.name);
                setOpen(false);
              }}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === activeIdx
                  ? "bg-[var(--color-peron-blue-soft)] text-[var(--color-peron-blue)]"
                  : "text-[var(--color-text)]"
              }`}
            >
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
