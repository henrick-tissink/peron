import type { Itinerary } from "./itinerary.js";
import type { SearchError } from "./error.js";

export type SearchRequest = {
  from: string;
  to: string;
  date: string;
};

export type SearchResponse = {
  itineraries: Itinerary[];
  warning: SearchError | null;
  meta: {
    parseSuccessRate: number;
    latencyMs: number;
  };
};
