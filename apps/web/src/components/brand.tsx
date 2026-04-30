/**
 * The user-facing brand wordmark: GARA·LA·GARA.
 * - "GARA" in default text color
 * - "·" mid-dots in muted (text-subtle) gray
 * - "LA" in amber (the connecting word — the journey)
 * - "GARA" in default text color
 *
 * Codename in repo / packages / infra is "peron"; this is the public name.
 */
export function Brand({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-mono font-semibold tracking-widest uppercase ${className}`}
      aria-label="Gara la Gara"
    >
      GARA
      <span className="text-[var(--color-text-subtle)]" aria-hidden="true">·</span>
      <span className="text-[var(--color-accent)]">LA</span>
      <span className="text-[var(--color-text-subtle)]" aria-hidden="true">·</span>
      GARA
    </span>
  );
}
