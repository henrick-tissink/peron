const RO_MAP: Record<string, string> = {
  "Ș": "S", "ș": "s",
  "Ț": "T", "ț": "t",
  "Ş": "S", "ş": "s",
  "Ţ": "T", "ţ": "t",
};

export function toStationSlug(name: string): string {
  if (!name) return "";
  const mapped = name.replace(/[ȘșȚțŞşŢţ]/g, (ch) => RO_MAP[ch] ?? ch);
  const stripped = mapped.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return stripped
    .replace(/[^A-Za-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
