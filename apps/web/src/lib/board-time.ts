/**
 * Minutes until the next occurrence of the given HH:MM in Europe/Bucharest.
 *
 * Handles the day-rollover edge case: if a 00:30 train is queried at 23:55, the
 * naïve subtraction returns -1405. Anything < -120 is treated as a next-day
 * departure and shifted by 24 h.
 *
 * Returns null when the input doesn't parse.
 */
export function minutesUntil(time: string, now: Date = new Date()): number | null {
  const m = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const target = Number(m[1]) * 60 + Number(m[2]);

  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bucharest",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [nh, nm] = fmt.format(now).split(":").map(Number);
  const nowMin = (nh ?? 0) * 60 + (nm ?? 0);

  let delta = target - nowMin;
  if (delta < -120) delta += 24 * 60;
  return delta;
}
