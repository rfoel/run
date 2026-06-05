import { type ChartSeries } from "./api.ts";

export type BestEffort = {
  meters: number;
  label: string;
  timeSec: number;
  paceSecPerKm: number;
  /** Cumulative km where the fastest window starts. */
  startKm: number;
  avgHr: number | null;
};

// Standard Strava best-effort distances (metres). 1/2 mile and miles use
// Strava's rounded metre values.
const DISTANCES: { meters: number; label: string }[] = [
  { meters: 400, label: "400m" },
  { meters: 805, label: "1/2 mile" },
  { meters: 1000, label: "1K" },
  { meters: 1609, label: "1 mile" },
  { meters: 3219, label: "2 mile" },
  { meters: 5000, label: "5K" },
  { meters: 10000, label: "10K" },
  { meters: 15000, label: "15K" },
  { meters: 16093, label: "10 mile" },
  { meters: 21097, label: "Meia maratona" },
  { meters: 42195, label: "Maratona" },
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Fastest time over each standard distance within a single run, found by
 * sliding a window across the cumulative-distance series. The window end is
 * interpolated to the exact target distance so down-sampling doesn't bias the
 * result. Pure maths — no AI.
 */
export function computeBestEfforts(series: ChartSeries): BestEffort[] {
  const { km, elapsed, hr } = series;
  const n = Math.min(km.length, elapsed.length);
  if (n < 2) return [];
  const totalKm = km[n - 1]!;

  const out: BestEffort[] = [];
  for (const d of DISTANCES) {
    const dKm = d.meters / 1000;
    if (dKm > totalKm) break;

    let bestTime = Infinity;
    let bestStartKm = 0;
    let bestEndIdx = 0;
    let bestStartIdx = 0;
    let j = 1;
    for (let i = 0; i < n; i++) {
      if (j <= i) j = i + 1;
      while (j < n && km[j]! - km[i]! < dKm) j++;
      if (j >= n) break; // window can't reach dKm from here on

      // Interpolate the elapsed time at exactly km[i] + dKm, between j-1 and j.
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

    // Average HR over the winning window, if HR is present there.
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
      meters: d.meters,
      label: d.label,
      timeSec: Math.round(bestTime),
      paceSecPerKm: Math.round(bestTime / dKm),
      startKm: bestStartKm,
      avgHr: hrCount ? Math.round(hrSum / hrCount) : null,
    });
  }
  return out;
}
