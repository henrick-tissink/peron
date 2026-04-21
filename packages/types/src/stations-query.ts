import type { Station } from "./station.js";

export type StationQuery = {
  q: string;
  limit?: number;
};

export type StationSearchResult = {
  stations: Station[];
  total: number;
};
