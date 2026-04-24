import { Hono } from "hono";
import type { Station, StationSearchResult } from "@peron/types";
import type { AppEnv } from "../app.js";

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[ȘșŞş]/g, "s")
    .replace(/[ȚțŢţ]/g, "t")
    .toLowerCase();
}

export function stationsRoute() {
  const r = new Hono<AppEnv>();

  r.get("/", async (c) => {
    const { stations } = c.get("deps");
    const all = await stations.getAll();

    const q = c.req.query("q")?.trim() ?? "";
    const limitStr = c.req.query("limit");
    const limit = limitStr ? Math.max(1, Math.min(500, Number(limitStr))) : all.length;

    let filtered: Station[] = all;
    if (q) {
      const nq = normalize(q);
      filtered = all.filter((s) => normalize(s.name).includes(nq));
    }

    const result: StationSearchResult = {
      stations: filtered.slice(0, limit),
      total: filtered.length,
    };
    return c.json(result);
  });

  return r;
}
