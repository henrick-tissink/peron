export function Footer() {
  return (
    <footer className="mt-16 border-t border-[var(--color-border)]">
      <div className="mx-auto max-w-3xl px-4 py-6 text-xs text-[var(--color-text-muted)]">
        <p>
          Peron is an unofficial frontend for{" "}
          <a
            href="https://bilete.cfrcalatori.ro"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--color-peron-blue)]"
          >
            bilete.cfrcalatori.ro
          </a>
          . Booking happens on CFR.
        </p>
      </div>
    </footer>
  );
}
