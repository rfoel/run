import type { BlockWeek, TrainingBlock } from "./block.ts";
import { blockOn, blockWeekOn } from "./block.ts";
import type { PlannedRun } from "./plan.ts";
import type { ActivityExtras } from "./workout.ts";
import { addDays, mondayOf } from "./weeks.ts";

// --- VDOT and training paces -------------------------------------------------
//
// Jack Daniels' running formula: a race performance gives a VDOT (an effective
// VO2max), and each kind of training runs at a fraction of it. Pace for a
// fraction comes from inverting the oxygen-cost curve.

/** Oxygen cost (ml/kg/min) of running at `v` metres per minute. */
const vo2At = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v;

/** Fraction of VO2max sustainable for a race lasting `t` minutes. */
const sustainable = (t: number) =>
  0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);

export function vdotFromRace(meters: number, seconds: number): number {
  const minutes = seconds / 60;
  return vo2At(meters / minutes) / sustainable(minutes);
}

/** Pace (sec/km) that costs `fraction` of the given VDOT. */
export function paceAtFraction(vdot: number, fraction: number): number {
  const target = vdot * fraction;
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - target;
  const v = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a); // m/min
  return Math.round(60_000 / v);
}

/** sec/km bounds: `fast` is the smaller number. */
export type PaceRange = { fast: number; slow: number };

export type TrainingPaces = {
  vdot: number;
  easy: PaceRange;
  marathon: PaceRange;
  threshold: PaceRange;
  interval: PaceRange;
  repetition: PaceRange;
};

const range = (vdot: number, lo: number, hi: number): PaceRange => ({
  fast: paceAtFraction(vdot, hi),
  slow: paceAtFraction(vdot, lo),
});

/** Daniels' training intensities as fractions of VDOT. */
export function trainingPaces(vdot: number): TrainingPaces {
  return {
    vdot: Math.round(vdot * 10) / 10,
    easy: range(vdot, 0.62, 0.7),
    marathon: range(vdot, 0.78, 0.82),
    threshold: range(vdot, 0.86, 0.89),
    interval: range(vdot, 0.96, 1.0),
    repetition: range(vdot, 1.03, 1.07),
  };
}

export type VdotBasis = {
  vdot: number;
  label: string;
  meters: number;
  timeSec: number;
  date?: string;
  activityName?: string;
};

/**
 * Best VDOT among race-like efforts: 3 km and longer, where Daniels' formula
 * holds. Shorter windows overstate it. Efforts inside training runs understate
 * a real race, so this is a floor on fitness, not a ceiling.
 */
export function bestVdot(
  efforts: Array<Omit<VdotBasis, "vdot">>,
): VdotBasis | undefined {
  let best: VdotBasis | undefined;
  for (const e of efforts) {
    if (e.meters < 3000 || e.timeSec <= 0) continue;
    const vdot = vdotFromRace(e.meters, e.timeSec);
    if (!best || vdot > best.vdot) best = { ...e, vdot: Math.round(vdot * 10) / 10 };
  }
  return best;
}

// --- Heart-rate zones ---------------------------------------------------------

export type HrZone = { zone: number; low: number; high: number };

/** Zones 1–5 from the watch's floors; zone 5 tops out at max HR. */
export function hrZonesFromFloors(floors: number[], maxHr?: number): HrZone[] {
  return floors.map((low, i) => ({
    zone: i + 1,
    low,
    high: i < floors.length - 1 ? floors[i + 1]! - 1 : (maxHr ?? low + 20),
  }));
}

// --- Weekly summaries ---------------------------------------------------------

type RunLike = {
  source: string;
  externalId: string;
  startDate: string;
  distance: number;
  movingTime: number;
  avgHr?: number;
};

export type WeekSummary = {
  weekStart: string;
  km: number;
  runs: number;
  longestKm: number;
  minutes: number;
  /** Sum of Garmin's per-run training load, where the run has one. */
  load?: number;
  /** Minutes in heart-rate zones 4 and 5. */
  z45Minutes?: number;
  /** Mean RPE entered on the watch. */
  avgRpe?: number;
  plannedKm: number;
  plannedRuns: number;
  doneRuns: number;
  partialRuns: number;
  skippedRuns: number;
  /** The block week this falls in, if any. */
  block?: { name: string; number: number; of: number } & Pick<
    BlockWeek,
    "phase" | "targetKm" | "focus"
  >;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Week-by-week totals for the `weeks` Monday-to-Sunday weeks ending with the
 * one containing `today`, oldest first.
 */
export function weeklySummaries(input: {
  today: string;
  weeks: number;
  runs: RunLike[];
  extras: Map<string, ActivityExtras>;
  plans: PlannedRun[];
  blocks: TrainingBlock[];
}): WeekSummary[] {
  const lastMonday = mondayOf(input.today);
  const out: WeekSummary[] = [];
  for (let i = input.weeks - 1; i >= 0; i--) {
    const weekStart = addDays(lastMonday, -7 * i);
    const weekEnd = addDays(weekStart, 6);
    const inWeek = (date: string) => {
      const d = date.slice(0, 10);
      return d >= weekStart && d <= weekEnd;
    };
    const runs = input.runs.filter((r) => inWeek(r.startDate));
    const plans = input.plans.filter((p) => inWeek(p.date));

    let load = 0;
    let loadRuns = 0;
    let z45 = 0;
    let zoneRuns = 0;
    const rpes: number[] = [];
    for (const r of runs) {
      const x = input.extras.get(`${r.source}#${r.externalId}`);
      const l = x?.physio?.trainingLoad;
      if (l != null) {
        load += l;
        loadRuns++;
      }
      if (x?.hrZones?.length) {
        z45 += x.hrZones
          .filter((z) => z.zone >= 4)
          .reduce((sum, z) => sum + z.secs, 0);
        zoneRuns++;
      }
      if (x?.feedback?.rpe != null) rpes.push(x.feedback.rpe);
    }

    const block = blockOn(input.blocks, weekStart);
    const bw = block ? blockWeekOn(block, weekStart) : undefined;
    out.push({
      weekStart,
      km: round1(runs.reduce((s, r) => s + r.distance, 0) / 1000),
      runs: runs.length,
      longestKm: round1(Math.max(0, ...runs.map((r) => r.distance)) / 1000),
      minutes: Math.round(runs.reduce((s, r) => s + r.movingTime, 0) / 60),
      load: loadRuns > 0 ? Math.round(load) : undefined,
      z45Minutes: zoneRuns > 0 ? Math.round(z45 / 60) : undefined,
      avgRpe:
        rpes.length > 0
          ? round1(rpes.reduce((s, v) => s + v, 0) / rpes.length)
          : undefined,
      plannedKm: round1(plans.reduce((s, p) => s + (p.distance ?? 0), 0) / 1000),
      plannedRuns: plans.length,
      doneRuns: plans.filter((p) => p.status === "done").length,
      partialRuns: plans.filter((p) => p.status === "partial").length,
      skippedRuns: plans.filter((p) => p.status === "skipped").length,
      block:
        block && bw
          ? {
              name: block.name,
              number: bw.number,
              of: block.weeks.length,
              phase: bw.week.phase,
              targetKm: bw.week.targetKm,
              focus: bw.week.focus,
            }
          : undefined,
    });
  }
  return out;
}
