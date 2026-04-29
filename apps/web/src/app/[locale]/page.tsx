import type { Station } from "@peron/types";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { fetchStations } from "../../lib/api";
import { SearchForm } from "../../components/search-form";
import { LiveTicker } from "../../components/live-ticker";

async function loadStations(): Promise<Station[]> {
  try {
    const result = await fetchStations({ limit: 500 });
    return result.stations;
  } catch {
    return [];
  }
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const stations = await loadStations();

  return (
    <>
      <LiveTicker />
      <div className="mx-auto max-w-3xl px-4 py-20 md:py-28">
        <section className="mb-12 text-center">
          <h1 className="font-display text-5xl font-bold tracking-tight md:text-7xl">
            {t("heroTitle").replace(/\.$/, "")}
            <span className="text-[var(--color-accent)]">.</span>
          </h1>
          <p className="mt-5 font-mono text-xs tracking-widest text-[var(--color-text-muted)] uppercase">
            {t("heroSubtitle")}
          </p>
        </section>
        <SearchForm stations={stations} />
        <p className="mt-10 text-center font-mono text-[11px] tracking-widest text-[var(--color-text-subtle)] uppercase">
          {t("popularLabel")} ·
          <PopularChip from="Bucuresti-Nord" to="Cluj-Napoca" label="BUC NORD → CLUJ" />
          ·
          <PopularChip from="Bucuresti-Nord" to="Brasov" label="BUC NORD → BRAȘOV" />
          ·
          <PopularChip from="Timisoara-Nord" to="Bucuresti-Nord" label="TIMIȘOARA → BUC NORD" />
        </p>
      </div>
    </>
  );
}

function PopularChip({ from, to, label }: { from: string; to: string; label: string }) {
  const params = new URLSearchParams({ from, to, date: new Date(Date.now() + 86400_000).toISOString().slice(0, 10) });
  return (
    <a
      href={`/search?${params.toString()}`}
      className="mx-1.5 border-b border-dashed border-[var(--color-accent)]/40 text-[var(--color-accent)] hover:border-[var(--color-accent)]"
    >
      {label}
    </a>
  );
}
