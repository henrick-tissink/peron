import type { Station } from "@peron/types";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { fetchStations } from "../../lib/api";
import { SearchForm } from "../../components/search-form";

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
    <div className="mx-auto max-w-3xl px-4 py-12 md:py-20">
      <section className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          {t("heroTitle")}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          {t("heroSubtitle")}
        </p>
      </section>
      <SearchForm stations={stations} />
    </div>
  );
}
