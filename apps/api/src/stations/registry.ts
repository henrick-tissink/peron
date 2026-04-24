import type { Station } from "@peron/types";
import { fetchStationsPage } from "../cfr/client.js";
import { extractAvailableStations } from "../parser/stations.js";

export class StationRegistry {
  private cached: Station[] | null = null;
  private inflight: Promise<Station[]> | null = null;

  get size(): number {
    return this.cached?.length ?? 0;
  }

  async getAll(): Promise<Station[]> {
    if (this.cached) return this.cached;
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      const html = await fetchStationsPage();
      const stations = extractAvailableStations(html);
      this.cached = stations;
      this.inflight = null;
      return stations;
    })();

    return this.inflight;
  }

  invalidate(): void {
    this.cached = null;
    this.inflight = null;
  }
}
