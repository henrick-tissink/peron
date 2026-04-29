import Link from "next/link";
import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("errors");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="font-mono text-[11px] tracking-widest text-[var(--color-accent)]">{t("code404")}</span>
      <h1 className="font-display text-4xl font-bold">{t("title404")}</h1>
      <Link
        href="/"
        className="mt-2 font-mono text-xs tracking-widest text-[var(--color-text-muted)] uppercase hover:text-[var(--color-accent)]"
      >
        {t("back")}
      </Link>
    </div>
  );
}
