import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  findActivitiesOnDate,
  listActivities,
  type Activity,
} from "@run/core/activity";
import { aggregateRecords } from "@run/core/bestEfforts";
import {
  blockOn,
  blockWeekOn,
  createBlock,
  deleteBlock,
  findBlock,
  listBlocks,
  updateBlock,
  type TrainingBlock,
} from "@run/core/block";
import { fitnessTrend } from "@run/core/fitness";
import {
  fetchTrainingSnapshot,
  getValidAccessToken,
  type StepSpec,
  type StructuredWorkout,
  type WorkoutElement,
} from "@run/core/garmin";
import {
  createPlan,
  deletePlan,
  linkActivityToPlan,
  listPlans,
  planTitle,
  updatePlan,
  type PlannedRun,
} from "@run/core/plan";
import {
  bestVdot,
  hrZonesFromFloors,
  trainingPaces,
  vdotFromRace,
  weeklySummaries,
  type PaceRange,
} from "@run/core/training";
import { addDays, daysBetween, mondayOf } from "@run/core/weeks";
import { getManyAnalyses, getManyExtras } from "@run/core/workout";
import { describeWorkout, workoutDistance } from "@run/core/workoutText";
import { pushPlansToGarmin, removePlansFromGarmin } from "../garmin/push.ts";

// --- formatting --------------------------------------------------------------

const today = () => new Date().toISOString().slice(0, 10);

const pace = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

const clock = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
};

const paceRange = (r: PaceRange) => ({
  text: `${pace(r.fast)}–${pace(r.slow)}/km`,
  fast_sec_per_km: r.fast,
  slow_sec_per_km: r.slow,
});

const runKey = (a: { source: string; externalId: string }) =>
  `${a.source}#${a.externalId}`;

/** A plan as the coach should see it: no caches or Garmin internals. */
function planView(p: PlannedRun) {
  return {
    id: p.id,
    date: p.date,
    type: p.type,
    title: planTitle(p),
    status: p.status,
    block_id: p.blockId,
    distance_meters: p.distance,
    duration_seconds: p.durationSec,
    pace_target_sec_per_km: p.paceTargetSec,
    notes: p.notes,
    workout: p.workout ? describeWorkout(p.workout) : undefined,
    workout_source: p.workout
      ? p.workoutAuthored
        ? "authored"
        : "interpreted_from_notes"
      : undefined,
    on_garmin: !!p.garminWorkoutId,
    actual: p.actualExternalId
      ? {
          name: p.actualName,
          km: p.actualDistance ? Math.round(p.actualDistance / 10) / 100 : undefined,
          pace:
            p.actualDistance && p.actualMovingTime
              ? `${pace(p.actualMovingTime / (p.actualDistance / 1000))}/km`
              : undefined,
          avg_hr: p.actualAvgHr ? Math.round(p.actualAvgHr) : undefined,
        }
      : undefined,
    compliance: p.compliance,
  };
}

function blockView(b: TrainingBlock, on: string) {
  const current = blockWeekOn(b, on);
  return {
    id: b.id,
    name: b.name,
    goal: b.goal,
    status: b.status,
    race_date: b.raceDate,
    race_distance_meters: b.raceDistanceM,
    target_time: b.targetTimeSec ? clock(b.targetTimeSec) : undefined,
    start_date: b.startDate,
    end_date: b.endDate,
    days_to_race: b.raceDate ? daysBetween(on, b.raceDate) : undefined,
    current_week: current
      ? { number: current.number, of: b.weeks.length, ...current.week }
      : undefined,
    weeks: b.weeks.map((w, i) => ({ number: i + 1, ...w })),
    notes: b.notes,
  };
}

// --- structured workout input ------------------------------------------------

const durationInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("distance"), meters: z.number().positive() }),
  z.object({ kind: z.literal("time"), seconds: z.number().positive() }),
  z.object({ kind: z.literal("lap") }),
]);

const stepInput = z.object({
  kind: z.enum(["warmup", "run", "recovery", "cooldown", "rest"]),
  duration: durationInput,
  pace_fast_sec_per_km: z
    .number()
    .optional()
    .describe("Faster bound of a pace band (the smaller number)"),
  pace_slow_sec_per_km: z
    .number()
    .optional()
    .describe("Slower bound of a pace band (the larger number)"),
  pace_target_sec_per_km: z
    .number()
    .optional()
    .describe("Single target pace; the watch widens it by ±8 s/km"),
  hr_zone: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe("Heart-rate zone target from the watch's zones, when no pace target"),
  hr_low_bpm: z.number().optional(),
  hr_high_bpm: z.number().optional(),
  notes: z.string().optional().describe('Very short cue in pt-BR, e.g. "forte"'),
});

const elementInput = z.union([
  stepInput,
  z.object({
    repeat: z.number().int().min(2),
    steps: z
      .array(stepInput)
      .min(1)
      .describe("One rep; a trailing recovery is skipped after the last rep"),
  }),
]);

const workoutInput = z
  .object({
    elements: z.array(elementInput).min(1),
  })
  .describe(
    "The exact session as watch steps: warmup, repeat blocks of [run, recovery], cooldown. Continuous runs are a single run step.",
  );

function toStep(s: z.infer<typeof stepInput>): StepSpec {
  return {
    kind: s.kind,
    duration: s.duration,
    paceFastSec: s.pace_fast_sec_per_km,
    paceSlowSec: s.pace_slow_sec_per_km,
    paceTargetSec: s.pace_target_sec_per_km,
    hrZone: s.hr_zone,
    hrLowBpm: s.hr_low_bpm,
    hrHighBpm: s.hr_high_bpm,
    notes: s.notes,
  };
}

function toWorkout(
  w: z.infer<typeof workoutInput>,
  name: string,
  description?: string,
): StructuredWorkout {
  const elements: WorkoutElement[] = w.elements.map((el) =>
    "repeat" in el
      ? { repeat: el.repeat, steps: el.steps.map(toStep) }
      : toStep(el),
  );
  return { name, description, elements };
}

// --- context -----------------------------------------------------------------

async function garminSnapshot(date: string) {
  try {
    return await fetchTrainingSnapshot(date, await getValidAccessToken());
  } catch (e) {
    return { error: `garmin: ${(e as Error).message}` } as const;
  }
}

type ExtrasMap = Awaited<ReturnType<typeof getManyExtras>>;
type AnalysesMap = Awaited<ReturnType<typeof getManyAnalyses>>;

function runLine(a: Activity, extras: ExtrasMap, analyses: AnalysesMap) {
  const x = extras.get(runKey(a));
  const an = analyses.get(runKey(a))?.analysis;
  const km = a.distance / 1000;
  const z45 = x?.hrZones?.length
    ? Math.round(
        x.hrZones.filter((z) => z.zone >= 4).reduce((s, z) => s + z.secs, 0) / 60,
      )
    : undefined;
  return [
    a.startDate.slice(0, 10),
    a.name,
    `${km.toFixed(2)}km`,
    `${Math.round(a.movingTime / 60)}min`,
    km > 0 ? `${pace(a.movingTime / km)}/km` : "",
    a.avgHr ? `${Math.round(a.avgHr)}bpm` : "",
    x?.physio?.trainingLoad != null ? `load ${Math.round(x.physio.trainingLoad)}` : "",
    x?.physio?.aerobicTE != null
      ? `TE ${x.physio.aerobicTE}/${x.physio.anaerobicTE ?? 0}`
      : "",
    x?.feedback?.rpe != null ? `RPE ${x.feedback.rpe}` : "",
    z45 != null ? `Z4-5 ${z45}min` : "",
    an?.analysis?.pattern ? `pattern ${an.analysis.pattern}` : "",
    an?.analysis?.target_hit != null
      ? `target ${an.analysis.target_hit ? "hit" : "missed"}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

async function getTrainingContext(weeks: number) {
  const now = today();
  const from = addDays(mondayOf(now), -7 * (weeks - 1));
  const [runs, plans, blocks, garmin] = await Promise.all([
    listActivities({ from }),
    listPlans({ from, to: addDays(now, 14) }),
    listBlocks(),
    garminSnapshot(now),
  ]);
  const recentFrom = addDays(now, -21);
  const recent = runs.filter((r) => r.startDate.slice(0, 10) >= recentFrom);
  const [extras, analyses] = await Promise.all([
    getManyExtras(runs),
    getManyAnalyses(recent),
  ]);

  const block = blockOn(blocks, now);
  const insights = recent
    .map((r) => ({ r, an: analyses.get(runKey(r))?.analysis }))
    .filter(({ an }) => an?.analysis)
    .slice(0, 6)
    .map(({ r, an }) => ({
      date: r.startDate.slice(0, 10),
      title: an!.title ?? r.name,
      issues: an!.analysis!.issues,
      next_workout_suggestion: an!.analysis!.next_workout_suggestion,
    }));

  const garminView =
    "error" in garmin
      ? garmin
      : {
          vo2max: garmin.vo2max,
          training_status: garmin.trainingStatus,
          load: garmin.load,
          load_balance: garmin.loadBalance,
          readiness_today: garmin.readiness,
          sleep_last_night: garmin.sleep,
          hrv: garmin.hrv,
          resting_hr: garmin.restingHr,
          unavailable: garmin.unavailable,
        };

  return {
    today: now,
    weekday: new Date(`${now}T00:00:00Z`).toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "UTC",
    }),
    this_week_monday: mondayOf(now),
    plan_week1_monday: mondayOf(now) === now ? now : addDays(mondayOf(now), 7),
    active_block: block ? blockView(block, now) : null,
    garmin: garminView,
    weeks: weeklySummaries({ today: now, weeks, runs, extras, plans, blocks }),
    recent_runs: recent.map((r) => runLine(r, extras, analyses)),
    recent_insights: insights,
    upcoming: plans
      .filter((p) => p.date >= now && p.status === "planned")
      .map(planView),
  };
}

async function getTrainingZones() {
  const now = today();
  const [all, garmin] = await Promise.all([
    listActivities({ limit: 5000 }),
    garminSnapshot(now),
  ]);
  const since = addDays(now, -120);
  const recent = all.filter((a) => a.startDate.slice(0, 10) >= since);

  const recentRecords = aggregateRecords(recent);
  const recentBest = bestVdot(
    recentRecords.map((r) => ({
      label: r.label,
      meters: r.meters,
      timeSec: r.timeSec,
      date: r.startDate.slice(0, 10),
      activityName: r.activityName,
    })),
  );

  const predictions = "error" in garmin ? undefined : garmin.racePredictions;
  const predictionVdot =
    predictions?.tenK != null ? vdotFromRace(10_000, predictions.tenK) : undefined;
  // Garmin's prediction tracks current fitness; a window inside a training run
  // only gives a floor. Prefer the prediction, fall back to recent efforts.
  const vdot = predictionVdot ?? recentBest?.vdot;
  const paces = vdot != null ? trainingPaces(vdot) : undefined;

  const zones = "error" in garmin ? undefined : garmin.hrZones;
  const trend = fitnessTrend(all, { monthsBack: 6 });
  const latest = trend?.points.filter((p) => p.paceSecPerKm != null).at(-1);

  const fmtRecord = (r: (typeof recentRecords)[number]) => ({
    distance: r.label,
    time: clock(r.timeSec),
    pace: `${pace(r.paceSecPerKm)}/km`,
    date: r.startDate.slice(0, 10),
  });

  return {
    paces: paces
      ? {
          vdot: paces.vdot,
          basis:
            predictionVdot != null
              ? "Garmin 10K race prediction"
              : `best recent effort: ${recentBest!.label} ${clock(recentBest!.timeSec)} on ${recentBest!.date}`,
          easy: paceRange(paces.easy),
          marathon: paceRange(paces.marathon),
          threshold: paceRange(paces.threshold),
          interval: paceRange(paces.interval),
          repetition: paceRange(paces.repetition),
        }
      : null,
    garmin_race_predictions: predictions
      ? {
          "5K": predictions.fiveK ? clock(predictions.fiveK) : undefined,
          "10K": predictions.tenK ? clock(predictions.tenK) : undefined,
          half: predictions.half ? clock(predictions.half) : undefined,
          marathon: predictions.marathon ? clock(predictions.marathon) : undefined,
        }
      : null,
    vdot_from_recent_efforts: recentBest ?? null,
    hr_zones: zones
      ? {
          method: zones.method,
          max_hr: zones.maxHr,
          lactate_threshold_hr: zones.lactateThresholdHr,
          resting_hr: zones.restingHr,
          zones: hrZonesFromFloors(zones.floors, zones.maxHr),
        }
      : null,
    aerobic_trend: trend
      ? {
          ref_hr: trend.refHr,
          latest_month: latest?.month,
          pace_at_ref_hr: latest?.paceSecPerKm
            ? `${pace(latest.paceSecPerKm)}/km`
            : undefined,
          change_last_6_months_sec_per_km: trend.deltaSecPerKm,
        }
      : null,
    records_last_120_days: recentRecords.map(fmtRecord),
    records_all_time: aggregateRecords(all).map(fmtRecord),
  };
}

async function getPlanCompliance(from: string, to: string) {
  const [plans, runs, blocks] = await Promise.all([
    listPlans({ from, to }),
    listActivities({ from, to }),
    listBlocks(),
  ]);
  const linked = new Set(
    plans
      .filter((p) => p.actualExternalId)
      .map((p) => `${p.actualSource}#${p.actualExternalId}`),
  );
  const now = today();
  const weeks: Array<Record<string, unknown>> = [];
  for (let w = mondayOf(from); w <= to; w = addDays(w, 7)) {
    const end = addDays(w, 6);
    const inWeek = (d: string) => d.slice(0, 10) >= w && d.slice(0, 10) <= end;
    const wp = plans.filter((p) => inWeek(p.date));
    const wr = runs.filter((r) => inWeek(r.startDate));
    const block = blockOn(blocks, w);
    const bw = block ? blockWeekOn(block, w) : undefined;
    weeks.push({
      week_start: w,
      block_phase: bw?.week.phase,
      target_km: bw?.week.targetKm,
      planned_km:
        Math.round(wp.reduce((s, p) => s + (p.distance ?? 0), 0) / 100) / 10,
      done_km: Math.round(wr.reduce((s, r) => s + r.distance, 0) / 100) / 10,
      planned: wp.length,
      done: wp.filter((p) => p.status === "done").length,
      partial: wp.filter((p) => p.status === "partial").length,
      skipped: wp.filter((p) => p.status === "skipped").length,
      missed: wp.filter((p) => p.status === "planned" && p.date < now).length,
    });
  }
  return {
    from,
    to,
    weeks,
    plans: plans.map(planView),
    unplanned_runs: runs
      .filter((r) => !linked.has(runKey(r)))
      .map((r) => ({
        date: r.startDate.slice(0, 10),
        name: r.name,
        km: Math.round(r.distance / 10) / 100,
      })),
  };
}

// --- plan mutations ----------------------------------------------------------

async function linkPastActivities() {
  const plans = await listPlans({ to: today() });
  const dates = [
    ...new Set(plans.filter((p) => p.status === "planned").map((p) => p.date)),
  ];
  let linked = 0;
  for (const date of dates) {
    for (const activity of await findActivitiesOnDate(date)) {
      if (await linkActivityToPlan(activity)) linked++;
    }
  }
  return { checked_days: dates.length, linked };
}

async function clearAllFutureRuns() {
  const all = await listPlans({ from: today() });
  const removedFromGarmin = await removePlansFromGarmin(all);
  await Promise.all(all.map((p) => deletePlan(p.date, p.id)));
  return { deleted: all.length, removed_from_garmin: removedFromGarmin };
}

async function findPlan(date: string, id: string) {
  const plan = (await listPlans({ from: date, to: date })).find(
    (p) => p.id === id,
  );
  if (!plan) throw new Error(`plan not found: ${date}/${id}`);
  return plan;
}

async function movePlannedRun(currentDate: string, id: string, newDate: string) {
  const plan = await findPlan(currentDate, id);
  // The plan's key embeds its date, so a move is a delete + create. The old
  // Garmin workout goes too; push_to_garmin schedules it on the new date.
  await removePlansFromGarmin([plan]);
  await deletePlan(currentDate, id);
  const moved = await createPlan({
    date: newDate,
    type: plan.type,
    distance: plan.distance,
    durationSec: plan.durationSec,
    paceTargetSec: plan.paceTargetSec,
    notes: plan.notes,
    shortTitle: plan.shortTitle,
    blockId: plan.blockId,
    workout: plan.workoutAuthored ? plan.workout : undefined,
  });
  return planView(moved);
}

// --- tool definitions --------------------------------------------------------

const runType = z.enum(["easy", "long", "tempo", "interval", "race", "recovery"]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const phase = z.enum(["base", "build", "peak", "taper", "race", "recovery"]);
const blockWeekInput = z.object({
  phase,
  target_km: z.number().optional(),
  focus: z.string().optional().describe("One line in pt-BR on what the week is for"),
});
const toBlockWeeks = (weeks: Array<z.infer<typeof blockWeekInput>>) =>
  weeks.map((w) => ({ phase: w.phase, targetKm: w.target_km, focus: w.focus }));

// One zod schema per tool — the single source of truth. The JSON Schema
// advertised over MCP and the parsed, typed input in runTool both derive
// from these, so the wire contract can't drift from the handler.
const inputs = {
  get_training_context: z.object({
    weeks: z
      .number()
      .int()
      .min(1)
      .max(26)
      .optional()
      .describe("How many Monday–Sunday weeks of history to summarize (default 8)"),
  }),
  get_training_zones: z.object({}),
  get_plan_compliance: z.object({
    from: isoDate.optional().describe("Default: Monday four weeks ago"),
    to: isoDate.optional().describe("Default: today"),
  }),
  list_planned_runs: z.object({
    from: isoDate.optional().describe("YYYY-MM-DD inclusive"),
    to: isoDate.optional().describe("YYYY-MM-DD inclusive"),
  }),
  create_planned_run: z.object({
    date: isoDate.describe("ISO date YYYY-MM-DD when the run should happen"),
    type: runType,
    workout: workoutInput.optional(),
    distance_meters: z
      .number()
      .optional()
      .describe("Total distance; derived from the workout when every step is distance-based"),
    duration_seconds: z.number().optional(),
    pace_target_sec_per_km: z.number().optional(),
    short_title: z
      .string()
      .optional()
      .describe('Short pt-BR title for the calendar and watch, e.g. "Tiros 6x1000m"'),
    notes: z
      .string()
      .optional()
      .describe("Coaching notes in pt-BR — intent, cues, RPE. The structure goes in `workout`."),
    block_id: z.string().optional(),
  }),
  update_planned_run: z.object({
    date: isoDate.describe("Current date of the plan (YYYY-MM-DD)"),
    id: z.string(),
    type: runType.optional(),
    workout: workoutInput.optional(),
    distance_meters: z.number().optional(),
    duration_seconds: z.number().optional(),
    pace_target_sec_per_km: z.number().optional(),
    short_title: z.string().optional(),
    notes: z.string().optional(),
    status: z.enum(["planned", "done", "partial", "skipped"]).optional(),
    block_id: z.string().optional(),
  }),
  delete_planned_run: z.object({
    date: isoDate,
    id: z.string(),
  }),
  clear_all_planned_runs: z.object({}),
  link_past_activities: z.object({}),
  move_planned_run: z.object({
    current_date: isoDate.describe("Current YYYY-MM-DD of the plan"),
    id: z.string(),
    new_date: isoDate.describe("New YYYY-MM-DD for the plan"),
  }),
  push_to_garmin: z.object({
    from: isoDate.optional().describe("Default: today"),
    to: isoDate.optional().describe("Default: 14 days from today"),
  }),
  list_training_blocks: z.object({}),
  create_training_block: z.object({
    name: z.string().describe('pt-BR, e.g. "Meia de SP 2027"'),
    goal: z.string().optional(),
    race_date: isoDate.optional(),
    race_distance_meters: z.number().optional(),
    target_time_seconds: z.number().optional(),
    start_date: isoDate.describe("Any date; the block starts on that week's Monday"),
    weeks: z
      .array(blockWeekInput)
      .min(1)
      .describe("One entry per Monday–Sunday week, in order"),
    notes: z.string().optional(),
  }),
  update_training_block: z.object({
    id: z.string(),
    name: z.string().optional(),
    goal: z.string().optional(),
    race_date: isoDate.optional(),
    race_distance_meters: z.number().optional(),
    target_time_seconds: z.number().optional(),
    start_date: isoDate.optional(),
    weeks: z
      .array(blockWeekInput)
      .min(1)
      .optional()
      .describe("Replaces every week; weeks are re-laid from the start date"),
    status: z.enum(["active", "completed", "abandoned"]).optional(),
    notes: z.string().optional(),
  }),
  delete_training_block: z.object({ id: z.string() }),
} satisfies Record<string, z.ZodObject<z.ZodRawShape>>;

const descriptions: Record<keyof typeof inputs, string> = {
  get_training_context:
    "Start here before any planning. Today's date and the Monday a new plan starts on; the active training block and its current week; Garmin's own view (training status, acute/chronic load and ratio, load balance by type, today's readiness and recovery time, sleep, HRV, resting HR, VO2max); Monday–Sunday weekly summaries (km, longest run, Garmin load, minutes in Z4–5, RPE, planned vs done); the last 3 weeks of runs with load, training effect, RPE and analysis verdict; insights from recent run analyses; and the upcoming planned runs.",
  get_training_zones:
    "Pace and heart-rate targets derived from the athlete's own data: Daniels training paces (easy/marathon/threshold/interval/repetition) from Garmin's race predictions (or recent best efforts), the HR zones configured on the watch with LTHR and max HR, the aerobic trend (pace at a fixed HR), and recent vs all-time records. Use these numbers for every target instead of guessing.",
  get_plan_compliance:
    "How the plan went: per Monday–Sunday week, block phase and target km vs planned and done km and counts of done/partial/skipped/missed runs; every plan with its actual run and compliance (volume %, target hit, pacing pattern, RPE); and runs done without a plan. Use this to adapt the next weeks.",
  list_planned_runs:
    "List planned runs in a date range, with their workout steps, status, actual run and compliance.",
  create_planned_run:
    "Add a planned run. Give the exact session in `workout` (watch steps with pace or HR-zone targets) — it is pushed to the watch as is. Put intent and cues in `notes`, and link it to the active block with `block_id`.",
  update_planned_run:
    "Update a planned run. Sending `workout` replaces its steps. Call push_to_garmin afterwards if it was already on the watch.",
  delete_planned_run: "Delete a planned run (and its workout on the watch).",
  clear_all_planned_runs:
    "Delete every planned run from today onwards (and their workouts on the watch). Use when the athlete wants to restart their plan from scratch.",
  link_past_activities:
    "For every past day with a plan still marked 'planned', link that day's runs to the best-matching plan (by volume) and mark it done, or partial when under 80% of the planned volume.",
  move_planned_run:
    "Move a planned run to a different date, keeping everything else. Its watch workout is removed; call push_to_garmin to reschedule it.",
  push_to_garmin:
    "Send still-planned runs in a date range to Garmin Connect as structured workouts on their dates (creates new ones, updates ones already sent). Call this after creating or changing plans.",
  list_training_blocks:
    "All training blocks (cycles) with their goal, weeks, phases and weekly km targets, and the current week of each.",
  create_training_block:
    "Create a training block: a goal (often a race) and its Monday–Sunday weeks, each with a phase and a km target. Create it before planning a multi-week cycle, then pass its id as block_id on each planned run.",
  update_training_block:
    "Update a training block. Sending `weeks` replaces them all; use status to mark it completed or abandoned.",
  delete_training_block:
    "Delete a training block. Its planned runs stay; they just lose the link.",
};

const annotations: Record<keyof typeof inputs, ToolAnnotations> = {
  get_training_context: { readOnlyHint: true },
  get_training_zones: { readOnlyHint: true },
  get_plan_compliance: { readOnlyHint: true },
  list_planned_runs: { readOnlyHint: true },
  create_planned_run: { readOnlyHint: false, destructiveHint: false },
  update_planned_run: { readOnlyHint: false, destructiveHint: false },
  delete_planned_run: { readOnlyHint: false, destructiveHint: true },
  clear_all_planned_runs: { readOnlyHint: false, destructiveHint: true },
  link_past_activities: { readOnlyHint: false, destructiveHint: false },
  move_planned_run: { readOnlyHint: false, destructiveHint: false },
  push_to_garmin: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  list_training_blocks: { readOnlyHint: true },
  create_training_block: { readOnlyHint: false, destructiveHint: false },
  update_training_block: { readOnlyHint: false, destructiveHint: false },
  delete_training_block: { readOnlyHint: false, destructiveHint: true },
};

export function registerTools(server: McpServer) {
  for (const name of Object.keys(inputs) as Array<keyof typeof inputs>) {
    server.registerTool(
      name,
      {
        description: descriptions[name],
        inputSchema: inputs[name],
        annotations: annotations[name],
      },
      async (args: Record<string, unknown>) => {
        const result = await runTool(name, args);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      },
    );
  }
}

async function runTool(
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "get_training_context": {
      const i = inputs.get_training_context.parse(input);
      return await getTrainingContext(i.weeks ?? 8);
    }
    case "get_training_zones":
      return await getTrainingZones();
    case "get_plan_compliance": {
      const i = inputs.get_plan_compliance.parse(input);
      return await getPlanCompliance(
        i.from ?? addDays(mondayOf(today()), -28),
        i.to ?? today(),
      );
    }
    case "list_planned_runs": {
      const i = inputs.list_planned_runs.parse(input);
      return (await listPlans({ from: i.from, to: i.to })).map(planView);
    }
    case "create_planned_run": {
      const i = inputs.create_planned_run.parse(input);
      if (i.block_id && !(await findBlock(i.block_id)))
        throw new Error(`block not found: ${i.block_id}`);
      const title = planTitle({
        type: i.type,
        notes: i.notes,
        shortTitle: i.short_title,
        distance: i.distance_meters,
        durationSec: i.duration_seconds,
      } as PlannedRun);
      const workout = i.workout ? toWorkout(i.workout, title, i.notes) : undefined;
      const plan = await createPlan({
        date: i.date,
        type: i.type,
        distance:
          i.distance_meters ?? (workout ? workoutDistance(workout) : undefined),
        durationSec: i.duration_seconds,
        paceTargetSec: i.pace_target_sec_per_km,
        notes: i.notes,
        shortTitle: i.short_title,
        blockId: i.block_id,
        workout,
      });
      return planView(plan);
    }
    case "update_planned_run": {
      const i = inputs.update_planned_run.parse(input);
      const current = await findPlan(i.date, i.id);
      if (i.block_id && !(await findBlock(i.block_id)))
        throw new Error(`block not found: ${i.block_id}`);
      const workout = i.workout
        ? toWorkout(
            i.workout,
            planTitle({ ...current, shortTitle: i.short_title ?? current.shortTitle }),
            i.notes ?? current.notes,
          )
        : undefined;
      await updatePlan(i.date, i.id, {
        type: i.type,
        distance:
          i.distance_meters ?? (workout ? workoutDistance(workout) : undefined),
        durationSec: i.duration_seconds,
        paceTargetSec: i.pace_target_sec_per_km,
        shortTitle: i.short_title,
        notes: i.notes,
        status: i.status,
        blockId: i.block_id,
        workout,
        workoutAuthored: workout ? true : undefined,
      });
      return planView(await findPlan(i.date, i.id));
    }
    case "delete_planned_run": {
      const i = inputs.delete_planned_run.parse(input);
      const plan = await findPlan(i.date, i.id);
      const removed = await removePlansFromGarmin([plan]);
      await deletePlan(i.date, i.id);
      return { ok: true, removed_from_garmin: removed > 0 };
    }
    case "clear_all_planned_runs":
      return await clearAllFutureRuns();
    case "link_past_activities":
      return await linkPastActivities();
    case "move_planned_run": {
      const i = inputs.move_planned_run.parse(input);
      return await movePlannedRun(i.current_date, i.id, i.new_date);
    }
    case "push_to_garmin": {
      const i = inputs.push_to_garmin.parse(input);
      const plans = (
        await listPlans({
          from: i.from ?? today(),
          to: i.to ?? addDays(today(), 14),
        })
      ).filter((p) => p.status === "planned");
      return { plans: plans.length, ...(await pushPlansToGarmin(plans)) };
    }
    case "list_training_blocks": {
      const now = today();
      return (await listBlocks())
        .sort((a, b) => b.startDate.localeCompare(a.startDate))
        .map((b) => blockView(b, now));
    }
    case "create_training_block": {
      const i = inputs.create_training_block.parse(input);
      const block = await createBlock({
        name: i.name,
        goal: i.goal,
        raceDate: i.race_date,
        raceDistanceM: i.race_distance_meters,
        targetTimeSec: i.target_time_seconds,
        startDate: i.start_date,
        weeks: toBlockWeeks(i.weeks),
        notes: i.notes,
      });
      return blockView(block, today());
    }
    case "update_training_block": {
      const i = inputs.update_training_block.parse(input);
      const block = await updateBlock(i.id, {
        name: i.name,
        goal: i.goal,
        raceDate: i.race_date,
        raceDistanceM: i.race_distance_meters,
        targetTimeSec: i.target_time_seconds,
        startDate: i.start_date,
        weeks: i.weeks ? toBlockWeeks(i.weeks) : undefined,
        status: i.status,
        notes: i.notes,
      });
      return blockView(block, today());
    }
    case "delete_training_block": {
      const i = inputs.delete_training_block.parse(input);
      return { ok: await deleteBlock(i.id) };
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
