"use client";

import { useTranslations } from "next-intl";

export default function Error({ error: _error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("errors");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="font-mono text-[11px] tracking-widest text-[var(--color-err)]">{t("code500")}</span>
      <h1 className="font-display text-4xl font-bold">{t("title500")}</h1>
      <button
        onClick={reset}
        className="mt-2 bg-[var(--color-accent)] px-5 py-2 font-mono text-xs tracking-widest text-[var(--color-bg)] uppercase"
      >
        {t("retry")}
      </button>
    </div>
  );
}
