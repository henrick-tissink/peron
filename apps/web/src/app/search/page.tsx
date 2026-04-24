import { notFound } from "next/navigation";
import { z } from "zod";
import type { SearchResponse } from "@peron/types";
import { searchItineraries, ApiError } from "../../lib/api";
import { ResultsList } from "../../components/results-list";
import { ErrorState } from "../../components/error-state";

const QuerySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") flat[k] = v;
  }

  const parsed = QuerySchema.safeParse(flat);
  if (!parsed.success) notFound();

  const query = parsed.data;

  let data: SearchResponse;
  try {
    data = await searchItineraries(query, { cache: "no-store" });
  } catch (err) {
    const httpStatus = err instanceof ApiError ? err.status : 0;
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <HeaderQuery query={query} />
        <ErrorState error={{ kind: "cfr-unavailable", httpStatus }} query={query} />
      </div>
    );
  }

  const hasResults = data.itineraries.length > 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <HeaderQuery query={query} />
      {!hasResults && data.warning ? (
        <ErrorState error={data.warning} query={query} />
      ) : !hasResults ? (
        <ErrorState error={{ kind: "no-results" }} query={query} />
      ) : (
        <ResultsList data={data} query={query} />
      )}
    </div>
  );
}

function HeaderQuery({ query }: { query: { from: string; to: string; date: string } }) {
  return (
    <div className="mb-6">
      <h1 className="text-lg font-semibold tracking-tight">
        {query.from} → {query.to}
      </h1>
      <p className="text-xs text-[var(--color-text-muted)]">{query.date}</p>
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
