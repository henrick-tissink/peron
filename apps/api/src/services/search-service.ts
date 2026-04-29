import { searchRaw } from "../cfr/client.js";
import { parseItineraries } from "../parser/itinerary.js";
import { CaptchaError, UpstreamError } from "../cfr/errors.js";
import type { Itinerary, SearchResponse } from "@peron/types";
import type { AppDeps } from "../app.js";

export type SearchInput = { from: string; to: string; date: string };

export type SearchResult = {
  itineraries: Itinerary[];
  warning: SearchResponse["warning"];
  parseSuccessRate: number;
};

/**
 * Run a search through the CFR scrape pipeline. Throws CaptchaError /
 * UpstreamError; the caller decides how to surface those (route handler
 * shapes them into the SearchResponse warning union; board aggregator
 * silently returns []).
 */
export async function searchItineraries(deps: AppDeps, params: SearchInput): Promise<SearchResult> {
  const result = await deps.pool.withSession(params.from, params.to, async (session) => {
    const creds = session.creds_;
    const html = await searchRaw(creds, params);
    return { html, sessionId: session.id };
  });

  const parseResult = parseItineraries(result.html, result.sessionId);
  const txs = parseResult.itineraries.map((it) => it.transactionString).filter(Boolean);
  deps.pins.setMany(result.sessionId, txs);

  return {
    itineraries: parseResult.itineraries,
    warning: parseResult.warning,
    parseSuccessRate: parseResult.meta.parseSuccessRate,
  };
}

/**
 * Convenience wrapper for the board aggregator: returns [] on captcha/upstream
 * errors so a single failed (from, to) pair doesn't take down the whole board.
 */
export async function searchItinerariesSafe(deps: AppDeps, params: SearchInput): Promise<Itinerary[]> {
  try {
    const r = await searchItineraries(deps, params);
    return r.itineraries;
  } catch (err) {
    if (err instanceof CaptchaError) return [];
    if (err instanceof UpstreamError) return [];
    // Any other CFR/pool-level error (BootstrapError, session race, etc.) should
    // not take down the whole board — swallow it and contribute an empty list.
    if (err instanceof Error) return [];
    throw err;
  }
}
