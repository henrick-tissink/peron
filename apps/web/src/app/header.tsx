import Link from "next/link";
import { LanguageSelector } from "../components/language-selector";
import { Brand } from "../components/brand";

export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-[var(--color-border)] px-7 py-4 text-xs">
      <Link href="/">
        <Brand />
      </Link>
      <LanguageSelector />
    </header>
  );
}
