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
