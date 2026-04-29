import type { SearchError } from "@peron/types";
import { useTranslations } from "next-intl";
import { CfrLink } from "./cfr-link";

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
  const t = useTranslations("results");
  const cfrUrl = cfrSearchUrl(query);

  switch (error.kind) {
    case "no-results":
      return (
        <section className="flex flex-col items-center gap-3 py-12 font-mono text-sm text-[var(--color-text-muted)]">
          <span className="text-[10px] tracking-widest text-[var(--color-err)] uppercase">ERR_NO_RESULTS</span>
          <p>{t("noResults")}</p>
          <div className="mt-2 flex justify-center">
            <CfrLink href={cfrUrl} label="View on CFR ↗" />
          </div>
        </section>
      );

    case "captcha":
      return (
        <section className="flex flex-col items-center gap-3 py-12 font-mono text-sm text-[var(--color-text-muted)]">
          <span className="text-[10px] tracking-widest text-[var(--color-err)] uppercase">ERR_CAPTCHA</span>
          <p>{t("warningCaptcha")}</p>
          <p className="text-[var(--color-text-subtle)]">
            Try again in {error.retryAfterSec}s, or search directly on CFR.
          </p>
          <div className="mt-2 flex justify-center">
            <CfrLink href={cfrUrl} label="View on CFR ↗" />
          </div>
        </section>
      );

    case "partial": {
      const missing = error.detectedCount - error.parsedCount;
      return (
        <section className="flex flex-col items-center gap-3 py-6 font-mono text-sm text-[var(--color-text-muted)]">
          <p>
            {missing} more trains found — <CfrLink href={cfrUrl} label="view all on CFR ↗" />
          </p>
        </section>
      );
    }

    case "parser-failure":
      return (
        <section className="flex flex-col items-center gap-3 py-12 font-mono text-sm text-[var(--color-text-muted)]">
          <span className="text-[10px] tracking-widest text-[var(--color-err)] uppercase">ERR_PARSER</span>
          <p>Something on CFR's side changed and we can't read the response right now.</p>
          <p className="text-[var(--color-text-subtle)]">We've been notified.</p>
          <div className="mt-2 flex justify-center">
            <CfrLink href={cfrUrl} label="Search on CFR ↗" />
          </div>
        </section>
      );

    case "cfr-unavailable":
      return (
        <section className="flex flex-col items-center gap-3 py-12 font-mono text-sm text-[var(--color-text-muted)]">
          <span className="text-[10px] tracking-widest text-[var(--color-err)] uppercase">ERR_UNAVAILABLE</span>
          <p>{t("warningUnavailable")}</p>
          <p className="text-[var(--color-text-subtle)]">
            HTTP {error.httpStatus} — check @CFRCalatori on Twitter for updates.
          </p>
        </section>
      );

    case "our-bug":
      return (
        <section className="flex flex-col items-center gap-3 py-12 font-mono text-sm text-[var(--color-text-muted)]">
          <span className="text-[10px] tracking-widest text-[var(--color-err)] uppercase">ERR_INTERNAL</span>
          <p>{t("warningOurBug", { errorId: error.errorId })}</p>
        </section>
      );
  }
}
