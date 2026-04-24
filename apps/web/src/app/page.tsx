import type { Station } from "@peron/types";
import { fetchStations } from "../lib/api";
import { SearchForm } from "../components/search-form";

async function loadStations(): Promise<Station[]> {
  try {
    const result = await fetchStations({ limit: 500 });
    return result.stations;
  } catch {
    return [];
  }
}

export default async function Home() {
  const stations = await loadStations();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:py-20">
      <section className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Find a train.
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Search Romania's national rail network. Book on CFR.
        </p>
      </section>
      <SearchForm stations={stations} />
    </div>
  );
}
