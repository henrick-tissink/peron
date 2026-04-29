import type { BoardResponse, BoardDirection } from "@peron/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function fetchBoard(slug: string, direction: BoardDirection): Promise<BoardResponse> {
  const res = await fetch(`${API}/api/board/${slug}?direction=${direction}`);
  if (!res.ok) throw new Error(`board returned ${res.status}`);
  return res.json();
}
