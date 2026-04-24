"use client";

import type { SearchResponse } from "@peron/types";
import { ItineraryCard } from "./itinerary-card.js";
import { FareMatrix } from "./fare-matrix.js";
import { ErrorState, type ErrorQuery } from "./error-state.js";

export function ResultsList({
  data,
  query,
}: {
  data: SearchResponse;
  query: ErrorQuery;
}) {
  return (
    <div className="flex flex-col gap-3">
      {data.warning?.kind === "partial" && <ErrorState error={data.warning} query={query} />}
      {data.itineraries.map((it) => (
        <ItineraryCard key={it.id} itinerary={it}>
          <FareMatrix transactionString={it.transactionString} />
        </ItineraryCard>
      ))}
    </div>
  );
}
