const RO_MAP: Record<string, string> = {
  "Ș": "S", "ș": "s",
  "Ț": "T", "ț": "t",
  "Ş": "S", "ş": "s",
  "Ţ": "T", "ţ": "t",
};

export function normalize(s: string): string {
  if (!s) return "";
  const mapped = s.replace(/[ȘșȚțŞşŢţ]/g, (ch) => RO_MAP[ch] ?? ch);
  return mapped
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function matches(
  candidate: string,
  query: string,
  opts: { substring?: boolean } = {},
): boolean {
  const q = normalize(query);
  if (q.length === 0) return true;
  const c = normalize(candidate);
  return opts.substring ? c.includes(q) : c.startsWith(q);
}

// Mirrors apps/api/src/cfr/slug.ts:toStationSlug. Keep in sync — if this drifts
// from the API's slug convention, /station/:slug links built on the client will
// 404 against the board endpoint.
export function toStationSlug(name: string): string {
  if (!name) return "";
  const mapped = name.replace(/[ȘșȚțŞşŢţ]/g, (ch) => RO_MAP[ch] ?? ch);
  const stripped = mapped.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return stripped
    .replace(/[^A-Za-z0-9\s\-()]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
