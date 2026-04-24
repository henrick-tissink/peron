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
      className={`inline-flex items-center gap-1 font-medium text-[var(--color-peron-blue)] hover:underline ${className}`}
    >
      {label}
    </a>
  );
}
