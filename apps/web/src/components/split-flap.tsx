"use client";

import { useEffect, useRef } from "react";

const ALPHABET = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzăâîșțĂÂÎȘȚ:→·-/";

export function SplitFlap({
  value,
  charStaggerMs = 25,
  className = "",
}: {
  value: string;
  charStaggerMs?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const prevValueRef = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (prevValueRef.current === value) return;
    prevValueRef.current = value;

    const target = Array.from(value);

    // Build/rebuild cells if structure mismatch (initial render or value length change)
    if (container.children.length !== target.length) {
      container.innerHTML = "";
      for (const ch of target) {
        const cell = document.createElement("span");
        cell.className = ch === " " ? "sf-cell sf-cell-space" : "sf-cell";
        cell.textContent = " ";
        container.appendChild(cell);
      }
    }

    const cells = Array.from(container.children) as HTMLSpanElement[];

    // prefers-reduced-motion → instant snap
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const timers: ReturnType<typeof setTimeout>[] = [];

    if (reducedMotion) {
      for (let i = 0; i < cells.length; i++) {
        const ch = target[i] ?? " ";
        cells[i]!.textContent = ch;
        cells[i]!.className = ch === " " ? "sf-cell sf-cell-space" : "sf-cell";
      }
      return;
    }

    for (let i = 0; i < cells.length; i++) {
      const ch = target[i] ?? " ";
      const cell = cells[i]!;

      if (ch === " ") {
        cell.textContent = " ";
        cell.className = "sf-cell sf-cell-space";
        continue;
      }

      cell.className = "sf-cell";
      const startDelay = i * charStaggerMs;
      const totalMs = 400 + Math.random() * 300;
      const stepMs = 35 + Math.random() * 15;

      timers.push(
        setTimeout(() => {
          const cellStart = performance.now();
          const tick = () => {
            const elapsed = performance.now() - cellStart;
            if (elapsed >= totalMs) {
              cell.textContent = ch;
              cell.classList.add("sf-flipping");
              timers.push(setTimeout(() => cell.classList.remove("sf-flipping"), 60));
              return;
            }
            cell.textContent = ALPHABET[Math.floor(Math.random() * ALPHABET.length)] ?? " ";
            cell.classList.add("sf-flipping");
            timers.push(setTimeout(() => cell.classList.remove("sf-flipping"), 50));
            timers.push(setTimeout(tick, stepMs));
          };
          tick();
        }, startDelay),
      );
    }

    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [value, charStaggerMs]);

  // SSR-safe: server renders empty span; client mounts and animates.
  // aria-label exposes the actual value to screen readers (cycling chars are decorative).
  return <span ref={containerRef} className={className} aria-label={value} style={{ whiteSpace: "nowrap" }} />;
}
