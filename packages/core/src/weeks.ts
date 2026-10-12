// Training weeks run Monday to Sunday. Dates are plain YYYY-MM-DD strings, and
// the arithmetic runs in UTC so no timezone can shift a day.

const DAY_MS = 86_400_000;

const toMs = (date: string) => Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  return toIso(toMs(date) + days * DAY_MS);
}

/** The Monday of the week containing `date`. */
export function mondayOf(date: string): string {
  const dow = new Date(toMs(date)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toMs(b) - toMs(a)) / DAY_MS);
}
