import type { ChartSeries } from "@run/core/track";
import type { DeviceLap, WorkoutSection } from "@run/core/workout";

/**
 * Section arithmetic for the workout analysis. The model only decides where
 * each section starts and ends (and what it is); every number in a section
 * comes from the watch lap it maps to, or is computed here from the
 * full-resolution series — never read off the downsampled trace the model sees.
 */

/** A pace band in sec/km; `fast` is the smaller number. */
export type PaceBand = { fast: number; slow: number };

/** Index of the last sample at or before `km` (series.km is cumulative). */
function sampleAt(km: number[], at: number): number {
  let lo = 0;
  let hi = km.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (km[mid]! <= at) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Elapsed seconds when the runner reached `at` km, interpolated. */
function elapsedAt(s: ChartSeries, at: number): number {
  const i = sampleAt(s.km, at);
  const j = Math.min(i + 1, s.km.length - 1);
  const k0 = s.km[i]!;
  const k1 = s.km[j]!;
  const t0 = s.elapsed[i]!;
  const t1 = s.elapsed[j]!;
  if (k1 <= k0) return t0;
  return t0 + ((Math.min(Math.max(at, k0), k1) - k0) / (k1 - k0)) * (t1 - t0);
}

/** Pace vs a band: negative = faster than the band, positive = slower, 0 inside. */
export function vsBand(pace: number, band: PaceBand): number {
  if (pace < band.fast) return pace - band.fast;
  if (pace > band.slow) return pace - band.slow;
  return 0;
}

/** One section's stats over [startKm, endKm] of the series. */
export function sectionStats(
  s: ChartSeries,
  kind: WorkoutSection["kind"],
  index: number | undefined,
  startKm: number,
  endKm: number,
  band?: PaceBand,
): WorkoutSection {
  const total = s.km[s.km.length - 1] ?? 0;
  const a = Math.max(0, Math.min(startKm, total));
  const b = Math.max(a, Math.min(endKm, total));
  const duration = elapsedAt(s, b) - elapsedAt(s, a);
  const distanceM = (b - a) * 1000;

  // Heart rate weighted by how long each sample lasted inside the section.
  let hrSum = 0;
  let hrTime = 0;
  let maxHr: number | undefined;
  const from = sampleAt(s.km, a);
  for (let i = from; i < s.km.length && s.km[i]! <= b; i++) {
    const hr = s.hr[i];
    if (hr == null) continue;
    const dt = i > 0 ? s.elapsed[i]! - s.elapsed[i - 1]! : 0;
    hrSum += hr * dt;
    hrTime += dt;
    maxHr = maxHr == null ? hr : Math.max(maxHr, hr);
  }

  const pace = distanceM > 0 ? duration / (distanceM / 1000) : 0;
  const section: WorkoutSection = {
    kind,
    index,
    start_km: Math.round(a * 100) / 100,
    end_km: Math.round(b * 100) / 100,
    distance_m: Math.round(distanceM),
    duration_sec: Math.round(duration),
    avg_pace_sec_per_km: Math.round(pace),
    avg_hr: hrTime > 0 ? Math.round(hrSum / hrTime) : undefined,
    max_hr: maxHr != null ? Math.round(maxHr) : undefined,
  };
  if (band && pace > 0 && (kind === "rep" || kind === "tempo" || kind === "tempo_split")) {
    section.vs_target_sec_per_km = Math.round(vsBand(pace, band));
  }
  return section;
}

/**
 * A section that is exactly one watch lap: the watch's own distance, time and
 * heart rate, which are more accurate than re-cutting the GPS series — lap and
 * series distances drift apart over a run, so km boundaries taken from laps
 * land slightly off on the series.
 */
export function lapSection(
  lap: DeviceLap,
  kind: WorkoutSection["kind"],
  index: number | undefined,
  startKm: number,
  band?: PaceBand,
): WorkoutSection {
  const pace =
    lap.paceSecPerKm ?? (lap.distance > 0 ? lap.duration / (lap.distance / 1000) : 0);
  const section: WorkoutSection = {
    kind,
    index,
    start_km: Math.round(startKm * 100) / 100,
    end_km: Math.round((startKm + lap.distance / 1000) * 100) / 100,
    distance_m: Math.round(lap.distance),
    duration_sec: Math.round(lap.duration),
    avg_pace_sec_per_km: Math.round(pace),
    avg_hr: lap.avgHr != null ? Math.round(lap.avgHr) : undefined,
    max_hr: lap.maxHr != null ? Math.round(lap.maxHr) : undefined,
  };
  if (band && pace > 0 && (kind === "rep" || kind === "tempo" || kind === "tempo_split")) {
    section.vs_target_sec_per_km = Math.round(vsBand(pace, band));
  }
  return section;
}

/** Cumulative km at the start of each lap, as the analysis prompt lists them. */
export function lapStarts(laps: DeviceLap[]): number[] {
  let m = 0;
  return laps.map((l) => {
    const start = m / 1000;
    m += l.distance;
    return start;
  });
}

/**
 * Whole-kilometre splits from `fromKm` to `toKm`, the last one taking the
 * leftover distance. Used for easy/long runs (from 0) and to break a tempo
 * block into its kilometres (from the block's start).
 */
export function kmSplits(
  s: ChartSeries,
  kind: "easy_split" | "tempo_split",
  fromKm: number,
  toKm: number,
  band?: PaceBand,
): WorkoutSection[] {
  const out: WorkoutSection[] = [];
  let start = fromKm;
  let index = 1;
  while (toKm - start > 0.05) {
    // A sliver under 50 m joins the previous split rather than standing alone.
    const end = toKm - (start + 1) < 0.05 ? toKm : start + 1;
    out.push(sectionStats(s, kind, index++, start, end, band));
    start = end;
  }
  return out;
}

/** "4:30" -> 270. */
export function paceFromText(text: string | undefined): number | undefined {
  const m = text?.match(/^(\d+):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
}
