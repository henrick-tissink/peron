import type { TrainResponse } from "@peron/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function fetchTrain(number: string): Promise<TrainResponse | null> {
  const res = await fetch(`${API}/api/train/${encodeURIComponent(number)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`train returned ${res.status}`);
  return res.json();
}
