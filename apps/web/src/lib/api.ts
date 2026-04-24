import type {
  SearchRequest,
  SearchResponse,
  PriceRequest,
  PriceResponse,
  StationSearchResult,
} from "@peron/types";

export class ApiError extends Error {
  override readonly name = "ApiError";
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function baseUrl(): string {
  return (
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3001"
  );
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(`${res.status} ${text || res.statusText}`.trim(), res.status);
  }
  return (await res.json()) as T;
}

export async function fetchStations(
  params: { q?: string; limit?: number } = {},
  init?: RequestInit,
): Promise<StationSearchResult> {
  const url = new URL("/api/stations", baseUrl());
  if (params.q) url.searchParams.set("q", params.q);
  if (params.limit !== undefined) url.searchParams.set("limit", String(params.limit));
  const res = await fetch(url.toString(), { ...init, method: "GET" });
  return jsonOrThrow<StationSearchResult>(res);
}

export async function searchItineraries(
  body: SearchRequest,
  init?: RequestInit,
): Promise<SearchResponse> {
  const res = await fetch(`${baseUrl()}/api/search`, {
    ...init,
    method: "POST",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    body: JSON.stringify(body),
  });
  return jsonOrThrow<SearchResponse>(res);
}

export async function fetchPrice(
  body: PriceRequest,
  init?: RequestInit,
): Promise<PriceResponse> {
  const res = await fetch(`${baseUrl()}/api/price`, {
    ...init,
    method: "POST",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    body: JSON.stringify(body),
  });
  return jsonOrThrow<PriceResponse>(res);
}
