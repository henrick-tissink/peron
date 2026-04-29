"use client";

// Root-level error boundary: no locale provider available here.
// Locale-scoped errors are handled by app/[locale]/error.tsx.
export default function RootError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="font-mono text-[11px] tracking-widest text-[var(--color-err)]">ERR_INTERNAL</span>
      <h1 className="font-display text-4xl font-bold">Something went wrong</h1>
      <button
        onClick={reset}
        className="mt-2 bg-[var(--color-accent)] px-5 py-2 font-mono text-xs tracking-widest text-[var(--color-bg)] uppercase"
      >
        Try again
      </button>
    </div>
  );
}
