import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        The route you requested doesn't exist.
      </p>
      <div className="mt-6 flex justify-center gap-4">
        <Link
          href="/"
          className="rounded-[var(--radius-control)] bg-[var(--color-peron-blue)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-peron-blue-hover)]"
        >
          Back to search
        </Link>
        <a
          href="https://bilete.cfrcalatori.ro"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium hover:border-[var(--color-peron-blue)] hover:text-[var(--color-peron-blue)]"
        >
          cfrcalatori.ro ↗
        </a>
      </div>
    </div>
  );
}
