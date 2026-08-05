import type { ChartSeries, Split } from "./track.ts";

/**
 * Fastest time over each standard distance, Strava-style.
 *
 * There are two paths here because the history has two kinds of run. A run
 * imported with its sample stream has a STREAM item, and the window can start
 * anywhere — that is the exact answer. Most runs in this table predate that and
 * only kept per-kilometre splits, where a window can only start on a kilometre
 * boundary. A fast 5K spanning km 2.4 to 7.4 is invisible to the splits path, so
 * a splits-derived time is an upper bound on the truth: never faster than
 * reality, sometimes slower. Every result records which path produced it so the
 * UI can say so.
 */

export type BestEffortSource = "series" | "splits";

/** Compact enough to ride along on every activity item. */
export type StoredBest = {
  /** Distance in metres. */
  m: number;
  /** Time in seconds. */
  t: number;
  /** Average heart rate over the winning window, when known. */
  hr?: number;
  /**
   * Cumulative km where the winning window starts, so the run's map can
   * highlight it. On the splits path this is always a whole kilometre.
   */
  startKm: number;
  src: BestEffortSource;
};

type Distance = { meters: number; label: string };

/** Standard Strava best-effort distances. Miles use Strava's rounded metres. */
export const DISTANCES: Distance[] = [
  { meters: 400, label: "400m" },
  { meters: 805, label: "1/2 milha" },
  { meters: 1000, label: "1K" },
  { meters: 1609, label: "1 milha" },
  { meters: 3219, label: "2 milhas" },
  { meters: 5000, label: "5K" },
  { meters: 10000, label: "10K" },
  { meters: 15000, label: "15K" },
  { meters: 16093, label: "10 milhas" },
  { meters: 21097, label: "Meia maratona" },
  { meters: 42195, label: "Maratona" },
];

const LABELS = new Map(DISTANCES.map((d) => [d.meters, d.label]));

export function distanceLabel(meters: number): string {
  return LABELS.get(meters) ?? `${(meters / 1000).toFixed(1)}K`;
}

/**
 * The subset the splits path can answer: whole kilometres only. Pro-rating a
 * 21-km window into a 21.097-km half-marathon time would invent a record that
 * was never run, so distances that aren't kilometre multiples are simply absent
 * for runs without a sample stream.
 */
const SPLIT_DISTANCES = DISTANCES.filter((d) => d.meters % 1000 === 0);

/**
 * Windows implying more than this are discarded as bad data, not celebrated as
 * records. 8 m/s is 2:05/km — faster than the 1500 m world record pace, so no
 * human log has a legitimate entry above it, while every real result sits far
 * below. Without this a single GPS jump produces a 3-second 400m, and taking a
 * maximum across a whole history is precisely the operation that finds the one
 * worst glitch in years of running.
 */
const MAX_SPEED_MPS = 8;

/**
 * How far a run's sample stream may disagree with the distance the device
 * reported before the stream is treated as corrupt. A stream whose cumulative
 * distance runs away from reality yields both impossible paces and records at
 * distances longer than the run.
 */
const SERIES_DISTANCE_TOLERANCE = 0.05;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Cumulative distance must be non-decreasing for the sliding window to mean
 * anything, and must roughly agree with the distance the device recorded.
 */
function seriesIsTrustworthy(
  series: ChartSeries,
  distanceMeters: number,
): boolean {
  const { km, elapsed } = series;
  const n = Math.min(km.length, elapsed.length);
  if (n < 2 || distanceMeters <= 0) return false;
  for (let i = 1; i < n; i++) {
    if (km[i]! < km[i - 1]! || elapsed[i]! < elapsed[i - 1]!) return false;
  }
  const streamMeters = km[n - 1]! * 1000;
  return (
    Math.abs(streamMeters - distanceMeters) / distanceMeters <=
    SERIES_DISTANCE_TOLERANCE
  );
}

/**
 * Exact path: slide a window across the cumulative-distance series. The window
 * end is interpolated to the target distance so down-sampling doesn't bias the
 * result.
 */
export function bestEffortsFromSeries(
  series: ChartSeries,
  distanceMeters: number,
): StoredBest[] {
  const { km, elapsed, hr } = series;
  const n = Math.min(km.length, elapsed.length);
  if (n < 2) return [];
  // Bounded by the distance the device reported as well as by the stream's own
  // length, so a stream that overshoots can't mint a record at a distance the
  // run never covered.
  const limitKm = Math.min(km[n - 1]!, distanceMeters / 1000);

  const out: StoredBest[] = [];
  for (const d of DISTANCES) {
    const dKm = d.meters / 1000;
    if (dKm > limitKm) break;

    let bestTime = Infinity;
    let bestStartKm = 0;
    let bestStartIdx = 0;
    let bestEndIdx = 0;
    let j = 1;
    for (let i = 0; i < n; i++) {
      if (j <= i) j = i + 1;
      while (j < n && km[j]! - km[i]! < dKm) j++;
      if (j >= n) break; // window can't reach dKm from here on

      const targetKm = km[i]! + dKm;
      const k0 = km[j - 1]!;
      const k1 = km[j]!;
      const t = k1 > k0 ? (targetKm - k0) / (k1 - k0) : 0;
      const endElapsed = lerp(elapsed[j - 1]!, elapsed[j]!, t);
      const time = endElapsed - elapsed[i]!;
      if (time < bestTime) {
        bestTime = time;
        bestStartKm = km[i]!;
        bestStartIdx = i;
        bestEndIdx = j;
      }
    }
    if (bestTime === Infinity) continue;
    if (bestTime <= 0 || d.meters / bestTime > MAX_SPEED_MPS) continue;

    let hrSum = 0;
    let hrCount = 0;
    for (let k = bestStartIdx; k <= bestEndIdx && k < n; k++) {
      const v = hr[k];
      if (v != null) {
        hrSum += v;
        hrCount++;
      }
    }

    out.push({
      m: d.meters,
      t: Math.round(bestTime),
      hr: hrCount ? Math.round(hrSum / hrCount) : undefined,
      startKm: bestStartKm,
      src: "series",
    });
  }
  return out;
}

/**
 * Fallback path: sum runs of consecutive whole-kilometre splits.
 *
 * buildChartSeries appends a trailing partial kilometre when the run ends
 * mid-km, and stores it looking exactly like a full split. Including it would
 * credit a short final stretch as a whole kilometre, so it is dropped by
 * comparing the split count against the run's actual distance.
 */
export function bestEffortsFromSplits(
  splits: Split[],
  distanceMeters: number,
): StoredBest[] {
  const wholeKm = Math.floor(distanceMeters / 1000);
  const full = splits.slice(0, wholeKm);
  if (full.length === 0) return [];

  const out: StoredBest[] = [];
  for (const d of SPLIT_DISTANCES) {
    const windowKm = d.meters / 1000;
    if (windowKm > full.length) break;

    let bestTime = Infinity;
    let bestStart = 0;
    for (let i = 0; i + windowKm <= full.length; i++) {
      let time = 0;
      for (let k = i; k < i + windowKm; k++) time += full[k]!.elapsedSec;
      if (time < bestTime) {
        bestTime = time;
        bestStart = i;
      }
    }
    if (bestTime === Infinity) continue;
    if (bestTime <= 0 || d.meters / bestTime > MAX_SPEED_MPS) continue;

    let hrSum = 0;
    let hrCount = 0;
    for (let k = bestStart; k < bestStart + windowKm; k++) {
      const v = full[k]!.avgHr;
      if (v != null) {
        hrSum += v;
        hrCount++;
      }
    }

    out.push({
      m: d.meters,
      t: Math.round(bestTime),
      hr: hrCount ? Math.round(hrSum / hrCount) : undefined,
      startKm: bestStart,
      src: "splits",
    });
  }
  return out;
}

/**
 * A run's bests from whatever it has: the sample stream if it was kept, its
 * splits otherwise. Returns an empty array for a run with neither.
 */
export function bestEffortsFor(input: {
  series?: ChartSeries;
  splits?: Split[];
  distance: number;
}): StoredBest[] {
  if (input.series && seriesIsTrustworthy(input.series, input.distance)) {
    const fromSeries = bestEffortsFromSeries(input.series, input.distance);
    if (fromSeries.length > 0) return fromSeries;
  }
  if (input.splits && input.splits.length > 0) {
    return bestEffortsFromSplits(input.splits, input.distance);
  }
  return [];
}

/** An all-time record and the run that holds it. */
export type AllTimeRecord = {
  meters: number;
  label: string;
  timeSec: number;
  paceSecPerKm: number;
  avgHr?: number;
  src: BestEffortSource;
  source: string;
  externalId: string;
  startDate: string;
  activityName: string;
};

/**
 * The fastest run at each distance. Ties go to the earlier run — the record was
 * set the first time it was reached.
 */
export function aggregateRecords(
  activities: {
    source: string;
    externalId: string;
    startDate: string;
    name: string;
    bestEfforts?: StoredBest[];
  }[],
): AllTimeRecord[] {
  const best = new Map<number, AllTimeRecord>();
  for (const a of activities) {
    for (const effort of a.bestEfforts ?? []) {
      const held = best.get(effort.m);
      if (
        held &&
        (held.timeSec < effort.t ||
          (held.timeSec === effort.t && held.startDate <= a.startDate))
      ) {
        continue;
      }
      best.set(effort.m, {
        meters: effort.m,
        label: distanceLabel(effort.m),
        timeSec: effort.t,
        paceSecPerKm: Math.round(effort.t / (effort.m / 1000)),
        avgHr: effort.hr,
        src: effort.src,
        source: a.source,
        externalId: a.externalId,
        startDate: a.startDate,
        activityName: a.name,
      });
    }
  }
  // Shortest distance first, matching how Strava lists them.
  return [...best.values()].sort((a, b) => a.meters - b.meters);
}
