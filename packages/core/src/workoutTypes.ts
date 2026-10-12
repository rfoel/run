// The structured-workout model: warmup / repeat blocks / recovery / cooldown
// steps with pace or heart-rate targets. Types only, so the web can share them
// without pulling in the Garmin client.

export type StepKind = "warmup" | "run" | "recovery" | "cooldown" | "rest";

export type Duration =
  | { kind: "time"; seconds: number }
  | { kind: "distance"; meters: number }
  | { kind: "lap" };

export type StepSpec = {
  kind: StepKind;
  duration: Duration;
  /** Single center pace, sec/km. A ± margin is applied at build time. */
  paceTargetSec?: number;
  /** Explicit faster bound of a pace band, sec/km (the smaller number). */
  paceFastSec?: number;
  /** Explicit slower bound of a pace band, sec/km (the larger number). */
  paceSlowSec?: number;
  /**
   * Heart-rate zone 1–5 from the watch's own zones. Used when the step has no
   * pace target — easy and long runs are better steered by heart rate.
   */
  hrZone?: number;
  /** Explicit heart-rate band in bpm, instead of a zone. */
  hrLowBpm?: number;
  hrHighBpm?: number;
  notes?: string;
};

/**
 * One element of a structured workout: a single step, OR a repeat block when
 * `repeat`/`steps` are set (e.g. 5x [run 1000m, recovery 2min]). The two forms
 * are mutually exclusive — a repeat element ignores the top-level step fields.
 */
export type WorkoutElement = Partial<StepSpec> & {
  repeat?: number;
  steps?: StepSpec[];
};

export type StructuredWorkout = {
  name: string;
  description?: string;
  elements: WorkoutElement[];
};
