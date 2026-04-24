import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-[var(--color-border)]">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Peron
        </Link>
        <span className="text-xs text-[var(--color-text-muted)]">
          Train search for Romania
        </span>
      </div>
    </header>
  );
}
