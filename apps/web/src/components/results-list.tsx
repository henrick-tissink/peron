"use client";

import type { SearchResponse } from "@peron/types";
import { ItineraryCard } from "./itinerary-card";
import { ErrorState, type ErrorQuery } from "./error-state";

export function ResultsList({
  data,
  query,
}: {
  data: SearchResponse;
  query: ErrorQuery;
}) {
  return (
    <div>
      {data.warning?.kind === "partial" && (
        <div className="px-7 py-3">
          <ErrorState error={data.warning} query={query} />
        </div>
      )}
      {data.itineraries.map((it) => (
        <ItineraryCard key={it.id} itinerary={it} />
      ))}
    </div>
  );
}
