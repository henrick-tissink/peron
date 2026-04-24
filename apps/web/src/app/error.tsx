"use client";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something broke.</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        {error.digest ? `Error ID: ${error.digest}` : "An unexpected error occurred."}
      </p>
      <div className="mt-6 flex justify-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="rounded-[var(--radius-control)] bg-[var(--color-peron-blue)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-peron-blue-hover)]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
