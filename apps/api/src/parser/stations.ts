import type { Station } from "@peron/types";

const ARRAY_RX = /availableStations\s*=\s*(\[[\s\S]*?\]\s*);?/;

export function extractAvailableStations(html: string): Station[] {
  const match = html.match(ARRAY_RX);
  if (!match || !match[1]) return [];

  // Convert JavaScript object literals to JSON by quoting unquoted keys
  let jsonStr = match[1].replace(/(\w+):/g, '"$1":');
  // Remove trailing commas before closing brackets
  jsonStr = jsonStr.replace(/,\s*\]/g, "]");

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const valid: Station[] = [];
  for (const entry of parsed) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as { name?: unknown }).name === "string" &&
      typeof (entry as { isImportant?: unknown }).isImportant === "boolean"
    ) {
      const e = entry as { name: string; isImportant: boolean };
      // Normalize station name to ASCII for matching purposes
      const normalizedName = e.name
        .replace(/[ȘșŞş]/g, "s")
        .replace(/[ȚțŢţ]/g, "t")
        .replace(/[Ăă]/g, "a")
        .replace(/[Ââ]/g, "a")
        .replace(/[Îî]/g, "i")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
      valid.push({ name: normalizedName, isImportant: e.isImportant });
    }
  }
  return valid;
}
