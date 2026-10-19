// Stats scopes, free of the DynamoDB client so the web can bucket runs the
// same way the stored totals do.

export type StatsScope =
  | "TOTAL"
  | `YEAR#${string}`
  | `MONTH#${string}`
  | `WEEK#${string}`;

export function scopesForDate(startDate: string): StatsScope[] {
  const d = new Date(startDate);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return [
    "TOTAL",
    `YEAR#${yyyy}`,
    `MONTH#${yyyy}-${mm}`,
    `WEEK#${isoWeek(d)}`,
  ];
}

/** ISO 8601 week: "2026-W19". Thursday rule. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
