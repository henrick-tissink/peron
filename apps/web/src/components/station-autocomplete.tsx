"use client";

import { useId, useMemo, useState } from "react";
import type { Station } from "@peron/types";
import { matches } from "../lib/normalize";

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
        className="sr-only"
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
        className="bg-transparent text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] outline-none w-full font-mono text-sm"
      />
      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-2 w-full rounded border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] shadow-lg max-h-64 overflow-y-auto"
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
              className={`px-4 py-2 font-mono text-sm cursor-pointer text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] ${
                i === activeIdx
                  ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                  : ""
              }`}
            >
              {s.isImportant && (
                <span className="mr-1.5 inline-block h-1 w-1 rounded-full bg-[var(--color-accent)]" />
              )}
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
