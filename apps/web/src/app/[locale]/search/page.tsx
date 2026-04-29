import { notFound } from "next/navigation";
import { z } from "zod";
import type { SearchResponse } from "@peron/types";
import { setRequestLocale, getTranslations, getFormatter } from "next-intl/server";
import { searchItineraries, ApiError } from "../../../lib/api";
import { ResultsList } from "../../../components/results-list";
import { ErrorState } from "../../../components/error-state";

const QuerySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("results");
  const format = await getFormatter();

  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") flat[k] = v;
  }

  const parsed = QuerySchema.safeParse(flat);
  if (!parsed.success) notFound();

  const query = parsed.data;
  const fromName = query.from;
  const toName = query.to;
  const date = new Date(`${query.date}T12:00:00`);

  let data: SearchResponse;
  try {
    data = await searchItineraries(query, { cache: "no-store" });
  } catch (err) {
    const httpStatus = err instanceof ApiError ? err.status : 0;
    return (
      <div className="mx-auto max-w-5xl">
        <div className="border-b border-[var(--color-border)] px-7 py-6">
          <div className="font-mono text-[11px] tracking-widest text-[var(--color-text-subtle)] uppercase">
            {t("metaLabel")}
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
            <span className="whitespace-nowrap">{fromName}</span>
            <span className="mx-3 text-[var(--color-accent)]">→</span>
            <span className="whitespace-nowrap">{toName}</span>
          </h1>
          <div className="mt-2 font-mono text-xs text-[var(--color-text-muted)]">
            {format.dateTime(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" }).toUpperCase()}
          </div>
        </div>
        <div className="px-7 py-8">
          <ErrorState error={{ kind: "cfr-unavailable", httpStatus }} query={query} />
        </div>
      </div>
    );
  }

  const itineraries = data.itineraries;
  const hasResults = itineraries.length > 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="border-b border-[var(--color-border)] px-7 py-6">
        <div className="font-mono text-[11px] tracking-widest text-[var(--color-text-subtle)] uppercase">
          {t("metaLabel")}
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
          <span className="whitespace-nowrap">{fromName}</span>
          <span className="mx-3 text-[var(--color-accent)]">→</span>
          <span className="whitespace-nowrap">{toName}</span>
        </h1>
        <div className="mt-2 font-mono text-xs text-[var(--color-text-muted)]">
          {format.dateTime(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" }).toUpperCase()}
          {" · "}
          {t("stats", { count: itineraries.length, latencyMs: data.meta.latencyMs })}
        </div>
      </div>
      {!hasResults && data.warning ? (
        <div className="px-7 py-8">
          <ErrorState error={data.warning} query={query} />
        </div>
      ) : !hasResults ? (
        <div className="px-7 py-8">
          <ErrorState error={{ kind: "no-results" }} query={query} />
        </div>
      ) : (
        <ResultsList data={data} query={query} />
      )}
    </div>
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const from = typeof params["from"] === "string" ? params["from"] : "";
  const to = typeof params["to"] === "string" ? params["to"] : "";
  return {
    title: from && to ? `${from} → ${to} · Peron` : "Search · Peron",
  };
}
