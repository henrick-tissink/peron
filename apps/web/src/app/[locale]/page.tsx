import type { Station } from "@peron/types";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { fetchStations } from "../../lib/api";
import { HomeSearch } from "../../components/home-search";
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
        <HomeSearch stations={stations} />
      </div>
    </>
  );
}
