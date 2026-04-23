export type Duration = { hours: number; minutes: number };

export function parseDuration(input: string): Duration {
  if (!input) return { hours: 0, minutes: 0 };
  const s = input.trim().toLowerCase();

  // Romanian "ore"/"ora" (hours) — must be checked before the `h`-variant
  // since "ora"/"ore" don't contain the "h" marker but still encode hours.
  const roHm = s.match(/(\d+)\s*or[ae]\b(?:\s*(\d+)\s*min?)?/);
  if (roHm && roHm[1]) {
    return {
      hours: parseInt(roHm[1], 10),
      minutes: roHm[2] ? parseInt(roHm[2], 10) : 0,
    };
  }

  const hm = s.match(/(\d+)\s*h(?:\s+(\d+)\s*m(?:in)?)?/);
  if (hm && hm[1]) {
    return {
      hours: parseInt(hm[1], 10),
      minutes: hm[2] ? parseInt(hm[2], 10) : 0,
    };
  }

  const colon = s.match(/^(\d+):(\d{1,2})$/);
  if (colon && colon[1] && colon[2]) {
    return { hours: parseInt(colon[1], 10), minutes: parseInt(colon[2], 10) };
  }

  const mOnly = s.match(/^(\d+)\s*m(in)?$/);
  if (mOnly && mOnly[1]) {
    const t = parseInt(mOnly[1], 10);
    return { hours: Math.floor(t / 60), minutes: t % 60 };
  }

  return { hours: 0, minutes: 0 };
}
