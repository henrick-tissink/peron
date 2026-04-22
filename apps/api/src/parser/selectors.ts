import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

export function tryText(
  _$: CheerioAPI,
  $root: Cheerio<AnyNode>,
  selectors: string[],
  fallback = "",
): string {
  for (const sel of selectors) {
    const txt = $root.find(sel).first().text().trim();
    if (txt.length > 0) return txt;
  }
  return fallback;
}
