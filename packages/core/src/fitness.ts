/** The few run fields the trend reads; any activity shape with them fits. */
type RunLike = {
  startDate: string;
  distance: number;
  movingTime: number;
  avgHr?: number;
  indoor?: boolean;
};

/**
 * Aerobic fitness trend: the pace you would hold at a fixed heart rate, month
 * over month.
 *
 * Raw average pace is useless as a fitness signal — it mostly tracks how hard
 * you decided to run that day. Dividing speed by heart rate removes the effort
 * decision: (metres/second) per beat is the classic efficiency factor, and
 * multiplying it back by one reference heart rate turns it into a pace anyone
 * can read. Getting faster at the same heart rate is what "fitter" means.
 *
 * What this deliberately does NOT correct for, and why the number should be read
 * as a trend rather than a measurement:
 *
 * - Elevation. A hilly month looks slower. Grade-adjusted pace exists in the
 *   activity extras but not in the list payload this runs on.
 * - Heat and humidity, which raise heart rate at any given pace.
 * - Cardiac drift on long runs, which does the same over time-on-feet.
 *
 * Those wash out across a month of runs far better than they do within one run,
 * which is why the output is a monthly median and not a per-run series.
 */

/** Shorter runs are dominated by warm-up, where heart rate lags pace badly. */
const MIN_DISTANCE_M = 2000;

/**
 * Only runs whose average heart rate is near the reference count. Speed per beat
 * is not linear across the whole range, so normalising a hard interval session
 * down to an easy heart rate would overstate it. The band also has the useful
 * side effect of excluding races and interval days on its own.
 */
const HR_BAND_BPM = 15;

/** A median of one or two runs is noise, not a month. */
const MIN_RUNS_PER_MONTH = 3;

export type TrendPoint = {
  /** "YYYY-MM". */
  month: string;
  label: string;
  /**
   * Median normalised pace, seconds per km. Lower is fitter. Null for a month
   * inside the range with too little running to say anything — the line breaks
   * there rather than drawing across the gap.
   */
  paceSecPerKm: number | null;
  runs: number;
};

export type FitnessTrend = {
  /** Heart rate the paces are normalised to — the athlete's own median. */
  refHr: number;
  /** Every month spanned by the range, gaps included, oldest first. */
  points: TrendPoint[];
  /** Runs that fed the trend. */
  sampled: number;
  /** Runs dropped: indoor, no heart rate, too short, or outside the band. */
  excluded: number;
  /**
   * Change from the first to the last month that has data, in seconds per km.
   * Positive means faster at the same heart rate.
   */
  deltaSecPerKm: number | null;
};

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); ) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const MONTH_NAMES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

// Built by hand rather than via Intl: pt-BR renders month+year as "jun. de 19",
// which is too wide for an axis tick.
function monthLabel(month: string): string {
  const [y, m] = month.split("-") as [string, string];
  return `${MONTH_NAMES[Number(m) - 1]}/${y.slice(2)}`;
}

export function fitnessTrend(
  activities: RunLike[],
  opts: { monthsBack?: number } = {},
): FitnessTrend | null {
  const windowed = opts.monthsBack
    ? activities.filter((a) => {
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - opts.monthsBack!);
        return new Date(a.startDate) >= cutoff;
      })
    : activities;

  const eligible = windowed.filter(
    (a) =>
      !a.indoor &&
      a.avgHr != null &&
      a.avgHr > 0 &&
      a.movingTime > 0 &&
      a.distance >= MIN_DISTANCE_M,
  );
  if (eligible.length < MIN_RUNS_PER_MONTH) return null;

  // The reference is the athlete's own median effort, rounded to something
  // readable. Anchoring to their data keeps every normalisation small.
  const refHr = Math.round(median(eligible.map((a) => a.avgHr!)) / 5) * 5;

  const byMonth = new Map<string, number[]>();
  let sampled = 0;
  for (const a of eligible) {
    if (Math.abs(a.avgHr! - refHr) > HR_BAND_BPM) continue;
    const metresPerSecondPerBeat = a.distance / a.movingTime / a.avgHr!;
    const paceAtRef = 1000 / (metresPerSecondPerBeat * refHr);
    const month = a.startDate.slice(0, 7);
    const bucket = byMonth.get(month);
    if (bucket) bucket.push(paceAtRef);
    else byMonth.set(month, [paceAtRef]);
    sampled++;
  }

  const scored = new Map<string, { pace: number; runs: number }>();
  for (const [month, paces] of byMonth) {
    if (paces.length < MIN_RUNS_PER_MONTH) continue;
    scored.set(month, { pace: median(paces), runs: paces.length });
  }
  if (scored.size === 0) return null;

  // Walk every month in the span, not just the ones with data. A four-year break
  // from running must render as a break in the line, not a straight segment
  // joining 2021 to 2025.
  const months = [...scored.keys()].sort();
  const points: TrendPoint[] = monthsBetween(months[0]!, months[months.length - 1]!).map(
    (month) => {
      const hit = scored.get(month);
      return {
        month,
        label: monthLabel(month),
        paceSecPerKm: hit ? hit.pace : null,
        runs: hit ? hit.runs : 0,
      };
    },
  );

  const withData = points.filter((p) => p.paceSecPerKm != null);
  const first = withData[0]!;
  const last = withData[withData.length - 1]!;
  return {
    refHr,
    points,
    sampled,
    excluded: windowed.length - sampled,
    // Positive = the last month's pace is lower (faster) than the first's.
    deltaSecPerKm:
      withData.length >= 2
        ? first.paceSecPerKm! - last.paceSecPerKm!
        : null,
  };
}
