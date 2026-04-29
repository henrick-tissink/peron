const CFR_HOSTS = new Set(["bilete.cfrcalatori.ro", "cfrcalatori.ro", "www.cfrcalatori.ro"]);

function isCfrHref(href: string): boolean {
  try {
    const u = new URL(href);
    return CFR_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

export function CfrLink({
  href,
  label = "Open on CFR ↗",
  className = "",
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  if (!isCfrHref(href)) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`bg-[var(--color-accent)] px-5 py-2 font-mono text-xs font-semibold tracking-wide text-[var(--color-bg)] hover:bg-[var(--color-accent)]/90 ${className}`}
    >
      {label}
    </a>
  );
}
