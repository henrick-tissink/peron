import type { SearchError } from "@peron/types";
import { CfrLink } from "./cfr-link.js";

export type ErrorQuery = { from: string; to: string; date: string };

function cfrSearchUrl(q: ErrorQuery): string {
  const [y, m, d] = q.date.split("-");
  return `https://bilete.cfrcalatori.ro/ro-RO/Rute-trenuri/${encodeURIComponent(q.from)}/${encodeURIComponent(q.to)}?DepartureDate=${d}.${m}.${y}`;
}

export function ErrorState({
  error,
  query,
}: {
  error: SearchError;
  query: ErrorQuery;
}) {
  const cfrUrl = cfrSearchUrl(query);

  switch (error.kind) {
    case "no-results":
      return (
        <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-6 text-center">
          <p className="text-base">
            No trains between <strong>{query.from}</strong> and <strong>{query.to}</strong> on {query.date}.
          </p>
          <div className="mt-4 flex justify-center">
            <CfrLink href={cfrUrl} label="View on CFR ↗" />
          </div>
        </section>
      );

    case "captcha":
      return (
        <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-peron-blue-soft)] p-6 text-center">
          <p className="text-base">
            CFR is temporarily blocking automated searches.
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Try again in {error.retryAfterSec}s, or search directly on CFR.
          </p>
          <div className="mt-4 flex justify-center">
            <CfrLink href={cfrUrl} label="View on CFR ↗" />
          </div>
        </section>
      );

    case "partial": {
      const missing = error.detectedCount - error.parsedCount;
      return (
        <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-muted)] p-4 text-sm">
          <p>
            {missing} more trains found — <CfrLink href={cfrUrl} label="view all on CFR ↗" />
          </p>
        </section>
      );
    }

    case "parser-failure":
      return (
        <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-6 text-center">
          <p className="text-base">
            Something on CFR's side changed and we can't read the response right now.
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">We've been notified.</p>
          <div className="mt-4 flex justify-center">
            <CfrLink href={cfrUrl} label="Search on CFR ↗" />
          </div>
        </section>
      );

    case "cfr-unavailable":
      return (
        <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-6 text-center">
          <p className="text-base">CFR's booking system seems to be down.</p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            HTTP {error.httpStatus} — check @CFRCalatori on Twitter for updates.
          </p>
        </section>
      );

    case "our-bug":
      return (
        <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-6 text-center">
          <p className="text-base">Something broke on our side.</p>
          <p className="mt-2 font-mono text-xs text-[var(--color-text-muted)]">
            Error ID: {error.errorId}
          </p>
        </section>
      );
  }
}
