"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { routing } from "../i18n/routing";

export function LanguageSelector() {
  const t = useTranslations("language");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchTo(target: string) {
    if (target === locale) return;
    // Strip current locale prefix if present, then prepend new prefix unless target is default ("as-needed").
    const stripped = pathname.replace(new RegExp(`^/(${routing.locales.join("|")})(?=/|$)`), "") || "/";
    const next = target === routing.defaultLocale ? stripped : `/${target}${stripped === "/" ? "" : stripped}`;
    document.cookie = `NEXT_LOCALE=${target}; path=/; max-age=31536000; samesite=lax`;
    router.replace(next);
  }

  return (
    <div
      role="group"
      aria-label={t("selectorLabel")}
      className="inline-flex items-center gap-1 rounded border border-[var(--color-border-strong)] px-2 py-1 font-mono text-[11px] tracking-widest"
    >
      {routing.locales.map((l) => (
        <button
          key={l}
          onClick={() => switchTo(l)}
          aria-current={l === locale ? "true" : "false"}
          className={
            l === locale
              ? "rounded-sm bg-[var(--color-accent)] px-1.5 py-0.5 text-[var(--color-bg)]"
              : "px-1.5 py-0.5 text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)]"
          }
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
