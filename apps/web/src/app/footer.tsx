import { useTranslations } from "next-intl";
import { Brand } from "../components/brand";

export function Footer() {
  const t = useTranslations("footer");
  return (
    <footer className="flex items-center justify-between border-t border-[var(--color-border)] px-7 py-4 font-mono text-[11px] tracking-wider text-[var(--color-text-subtle)] uppercase">
      <Brand className="!text-[11px] !font-medium tracking-wider" />
      <span>{t("tagline")}</span>
    </footer>
  );
}
