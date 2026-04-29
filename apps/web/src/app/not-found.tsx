import Link from "next/link";

// Root-level not-found: no locale provider available here.
// Locale-scoped 404s are handled by app/[locale]/not-found.tsx.
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="font-mono text-[11px] tracking-widest text-[var(--color-accent)]">ERR_NOT_FOUND</span>
      <h1 className="font-display text-4xl font-bold">Page not found</h1>
      <Link
        href="/"
        className="mt-2 font-mono text-xs tracking-widest text-[var(--color-text-muted)] uppercase hover:text-[var(--color-accent)]"
      >
        ← BACK TO HOME
      </Link>
    </div>
  );
}
