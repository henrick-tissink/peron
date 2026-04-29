import Link from "next/link";
import { useTranslations } from "next-intl";
import { LanguageSelector } from "../components/language-selector";

export function Header() {
  const t = useTranslations("header");
  return (
    <header className="flex items-center justify-between border-b border-[var(--color-border)] px-7 py-4 text-xs">
      <Link href="/" className="font-mono font-semibold tracking-widest uppercase">
        PERON<span className="text-[var(--color-accent)]">/</span>RO
      </Link>
      <LanguageSelector />
    </header>
  );
}
