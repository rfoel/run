import type Anthropic from "@anthropic-ai/sdk";
import { Resource } from "sst";
import {
  getActivity,
  listActivities,
  renameActivity,
  type Activity,
  type ActivitySource,
} from "@run/core/activity";
import { updatePlan } from "@run/core/plan";
import { describeWorkout } from "@run/core/workoutText";
import type { StepSpec } from "@run/core/workoutTypes";
import {
  getChartSeries,
  getExtras,
  putAnalysis,
  type ActivityExtras,
  type WorkoutAnalysis,
  type WorkoutSection,
} from "@run/core/workout";
import { listPlans, type PlannedRun } from "@run/core/plan";
import type { ChartSeries } from "@run/core/track";
import {
  ANALYSIS_SCHEMA,
  ANALYSIS_SYSTEM,
  type ModelAnalysis,
} from "./analyze-prompt.ts";
import {
  kmSplits,
  lapSection,
  lapStarts,
  paceFromText,
  sectionStats,
  type PaceBand,
} from "./sections.ts";

const MODEL = "claude-sonnet-5";

type AnalyzeRequest = { source: string; externalId: string };

function paceStr(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Compact CSV of the trace for the model to segment. Re-downsampled to keep
 * tokens sane, but pace spikes (fast local minima — strides, rep starts) are
 * always preserved with their bracketing samples so short bursts don't get
 * smoothed away between two uniform samples.
 */
function traceCsv(series: ChartSeries, maxRows = 360): string {
  const n = series.km.length;
  const stride = Math.max(1, Math.ceil(n / maxRows));
  const keep = new Set<number>();
  // Uniform baseline.
  for (let i = 0; i < n; i += stride) keep.add(i);
  keep.add(n - 1);

  // Preserve fast spikes: a local pace minimum (lower = faster) over a window,
  // clearly faster than the run's median pace. Bracket it so the band's edges
  // are visible to the model, not just its peak.
  const valid = series.pace.filter((p): p is number => p != null);
  if (valid.length) {
    const sorted = [...valid].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const w = Math.max(2, Math.ceil(stride / 2));
    for (let i = 1; i < n - 1; i++) {
      const p = series.pace[i];
      if (p == null || p >= median * 0.9) continue;
      let isMin = true;
      for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) {
        const q = series.pace[j];
        if (q != null && q < p) {
          isMin = false;
          break;
        }
      }
      if (isMin) {
        keep.add(Math.max(0, i - w));
        keep.add(i);
        keep.add(Math.min(n - 1, i + w));
      }
    }
  }

  const rows: string[] = ["elapsed_s,cum_km,pace_s_per_km,hr"];
  for (const i of [...keep].sort((a, b) => a - b)) {
    const pace = series.pace[i];
    const hr = series.hr[i];
    rows.push(`${series.elapsed[i]},${series.km[i]},${pace ?? ""},${hr ?? ""}`);
  }
  return rows.join("\n");
}

function prescriptionBlock(plan: PlannedRun | undefined, a: Activity): string {
  if (!plan) {
    return `No linked plan. Infer the workout type and structure from the trace and the activity name "${a.name}".`;
  }
  const lines = [`type: ${plan.type}`];
  // A structured workout spells out every step's target — grade each rep
  // against it rather than re-deriving the prescription from the notes.
  if (plan.workout) {
    lines.push(`structured_workout: ${describeWorkout(plan.workout)}`);
    lines.push(`structured_workout_json: ${JSON.stringify(plan.workout.elements)}`);
  }
  if (plan.notes) lines.push(`notes: ${plan.notes}`);
  if (plan.distance) lines.push(`planned_distance_m: ${plan.distance}`);
  if (plan.paceTargetSec)
    lines.push(`target_pace: ${paceStr(plan.paceTargetSec)}/km`);
  if (plan.durationSec) lines.push(`planned_duration_s: ${plan.durationSec}`);
  return lines.join("\n");
}

/**
 * Compact one-line-per-run history so the model can judge this workout against
 * the athlete's recent load (volume jumps, hard session the day before, how a
 * similar recent workout went) instead of reading it in a vacuum.
 */
function recentRunsBlock(runs: Activity[], current: Activity): string {
  const lines = runs
    .filter(
      (r) => !(r.source === current.source && r.externalId === current.externalId),
    )
    .map((r) => {
      const km = (r.distance / 1000).toFixed(1);
      const pace =
        r.distance > 0 ? paceStr(r.movingTime / (r.distance / 1000)) : "-";
      const hr = r.avgHr ? ` hr=${Math.round(r.avgHr)}` : "";
      return `${r.startDate.slice(0, 10)} "${r.name}" ${km}km @${pace}/km${hr}`;
    });
  return lines.length ? lines.join("\n") : "none";
}

/** Still-planned runs in the week after this workout, for grounded next-workout advice. */
function upcomingPlanBlock(plans: PlannedRun[]): string {
  const lines = plans.map((p) => {
    const parts = [`${p.date} ${p.type}`];
    if (p.distance) parts.push(`${(p.distance / 1000).toFixed(1)}km`);
    if (p.paceTargetSec) parts.push(`@${paceStr(p.paceTargetSec)}/km`);
    if (p.notes) parts.push(`— ${p.notes}`);
    return parts.join(" ");
  });
  return lines.length ? lines.join("\n") : "none";
}

/**
 * Watch laps, one per line with a running cumulative km so the model can place
 * section boundaries without re-deriving them from the trace. When the run
 * followed a structured workout each lap carries the step it executed.
 */
function deviceLapsBlock(extras: ActivityExtras | undefined): string {
  const laps = extras?.laps;
  if (!laps || laps.length === 0) return "";
  let cumM = 0;
  const lines = laps.map((l) => {
    const startKm = (cumM / 1000).toFixed(2);
    cumM += l.distance;
    const parts = [
      `#${l.index}`,
      `${startKm}-${(cumM / 1000).toFixed(2)}km`,
      `${l.duration}s`,
    ];
    if (l.intensity) parts.push(l.intensity);
    if (l.wktStepIndex != null) parts.push(`step=${l.wktStepIndex}`);
    if (l.paceSecPerKm) parts.push(`@${paceStr(l.paceSecPerKm)}/km`);
    if (l.avgHr) parts.push(`hr=${l.avgHr}`);
    if (l.maxHr) parts.push(`maxhr=${l.maxHr}`);
    if (l.avgPower) parts.push(`pwr=${l.avgPower}w`);
    if (l.compliance != null) parts.push(`compliance=${l.compliance}%`);
    return parts.join(" ");
  });
  return lines.join("\n");
}

function contextBlock(extras: ActivityExtras | undefined): string {
  if (!extras) return "";
  const lines: string[] = [];
  const f = extras.feedback;
  if (f && (f.rpe != null || f.feel != null)) {
    const parts: string[] = [];
    if (f.rpe != null) parts.push(`rpe=${f.rpe}/10`);
    if (f.feel != null) parts.push(`feel=${f.feel}/100`);
    if (f.compliance != null) parts.push(`workout_compliance=${f.compliance}%`);
    lines.push(`athlete_feedback (entered on the watch): ${parts.join(" ")}`);
  }
  const w = extras.weather;
  if (w && w.tempC != null) {
    const parts = [`temp=${w.tempC}C`];
    if (w.feelsC != null) parts.push(`feels=${w.feelsC}C`);
    if (w.humidity != null) parts.push(`humidity=${w.humidity}%`);
    if (w.windKph != null) parts.push(`wind=${w.windKph}kph ${w.windDir ?? ""}`);
    if (w.desc) parts.push(w.desc);
    lines.push(`weather: ${parts.join(" ")}`);
  }
  const p = extras.physio;
  if (p) {
    const parts: string[] = [];
    if (p.aerobicTE != null) parts.push(`aerobic_te=${p.aerobicTE}`);
    if (p.anaerobicTE != null) parts.push(`anaerobic_te=${p.anaerobicTE}`);
    if (p.teLabel) parts.push(`te_label=${p.teLabel}`);
    if (p.trainingLoad != null) parts.push(`load=${p.trainingLoad}`);
    if (p.normPower != null) parts.push(`norm_power=${p.normPower}w`);
    if (p.avgCadence != null) parts.push(`avg_cadence=${p.avgCadence}spm`);
    if (p.gradeAdjustedPaceSecPerKm != null)
      parts.push(`grade_adjusted_pace=${paceStr(p.gradeAdjustedPaceSecPerKm)}/km`);
    if (parts.length) lines.push(`device_physio: ${parts.join(" ")}`);
  }
  if (extras.hrZones?.length) {
    const z = extras.hrZones
      .map((zz) => `z${zz.zone}=${Math.round(zz.secs / 60)}min`)
      .join(" ");
    lines.push(`hr_time_in_zones: ${z}`);
  }
  return lines.join("\n");
}

function buildUserMessage(
  a: Activity,
  series: ChartSeries,
  plan: PlannedRun | undefined,
  recentRuns: Activity[],
  upcoming: PlannedRun[],
  extras: ActivityExtras | undefined,
): string {
  const totals = [
    `distance_km: ${(a.distance / 1000).toFixed(2)}`,
    `moving_time_sec: ${a.movingTime}`,
    `elapsed_time_sec: ${a.elapsedTime}`,
    `avg_hr: ${a.avgHr ? Math.round(a.avgHr) : "n/a"}`,
    `max_hr: ${a.maxHr ? Math.round(a.maxHr) : "n/a"}`,
    `elevation_gain_m: ${Math.round(a.elevationGain)}`,
  ].join("\n");

  const laps = deviceLapsBlock(extras);
  const context = contextBlock(extras);

  return [
    `<prescription>\n${prescriptionBlock(plan, a)}\n</prescription>`,
    `<totals>\n${totals}\n</totals>`,
    ...(laps ? [`<device_laps>\n${laps}\n</device_laps>`] : []),
    ...(context ? [`<context>\n${context}\n</context>`] : []),
    `<recent_runs>\n${recentRunsBlock(recentRuns, a)}\n</recent_runs>`,
    `<upcoming_plan>\n${upcomingPlanBlock(upcoming)}\n</upcoming_plan>`,
    `<trace_csv>\n${traceCsv(series)}\n</trace_csv>`,
    `Analyze this workout.`,
  ].join("\n\n");
}

/** Everything analyzeActivity sends to the API, plus what it needs to finish
 * the result — exported so scripts can reproduce the exact request. */
export type AnalysisContext = {
  request: Anthropic.MessageCreateParamsNonStreaming;
  activity: Activity;
  plan: PlannedRun | undefined;
  series: ChartSeries;
  extras: ActivityExtras | undefined;
};

export async function buildAnalysisRequest(
  source: string,
  externalId: string,
): Promise<AnalysisContext> {
  const activity = await getActivity(source as ActivitySource, externalId);
  if (!activity) throw new Error("activity not found");
  const series = await getChartSeries(source, externalId);
  if (!series || series.km.length === 0)
    throw new Error("no chart series — re-sync this activity first");

  const date = activity.startDate.slice(0, 10);
  const dayMs = 86_400_000;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const startMs = new Date(`${date}T00:00:00Z`).getTime();
  // Context for the coach: the linked plan (prescription), the last 3 weeks of
  // runs (load/trend baseline) and the next week of still-planned runs (so the
  // suggestion adjusts the real plan instead of inventing one).
  const [plans, recentRuns, upcomingAll, extras] = await Promise.all([
    listPlans({ from: date, to: date }),
    listActivities({ from: iso(startMs - 21 * dayMs), to: date }),
    listPlans({ from: iso(startMs + dayMs), to: iso(startMs + 7 * dayMs) }),
    getExtras(source, externalId),
  ]);
  const plan = plans.find(
    (p) => p.actualSource === source && p.actualExternalId === externalId,
  );
  const upcoming = upcomingAll.filter((p) => p.status === "planned");

  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: MODEL,
    // A ceiling, not a cost: the response is boundaries plus a few sentences.
    max_tokens: 16000,
    // Sonnet 5 runs adaptive thinking by default; this is a single structured
    // response over pre-digested data, so skip the thinking spend.
    thinking: { type: "disabled" },
    system: ANALYSIS_SYSTEM,
    // Structured outputs guarantee the response matches the schema.
    output_config: {
      format: { type: "json_schema", schema: ANALYSIS_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: buildUserMessage(
          activity,
          series,
          plan,
          recentRuns,
          upcoming,
          extras,
        ),
      },
    ],
  };
  return { request, activity, plan, series, extras };
}

/** The plan's target pace band for the work, if it states one. */
function targetBand(
  plan: PlannedRun | undefined,
  model: ModelAnalysis,
): PaceBand | undefined {
  const run = plan?.workout?.elements
    .flatMap((el): Array<Partial<StepSpec>> =>
      el.repeat && el.steps ? el.steps : [el],
    )
    .find((st) => st.kind === "run" && (st.paceFastSec || st.paceTargetSec));
  if (run?.paceFastSec && run.paceSlowSec)
    return {
      fast: Math.min(run.paceFastSec, run.paceSlowSec),
      slow: Math.max(run.paceFastSec, run.paceSlowSec),
    };
  if (run?.paceTargetSec) return { fast: run.paceTargetSec, slow: run.paceTargetSec };
  const tp = model.prescription?.target_pace_min_per_km;
  const lo = paceFromText(tp?.min);
  const hi = paceFromText(tp?.max) ?? lo;
  if (lo && hi) return { fast: Math.min(lo, hi), slow: Math.max(lo, hi) };
  if (plan?.paceTargetSec) return { fast: plan.paceTargetSec, slow: plan.paceTargetSec };
  return undefined;
}

/** Within this many s/km of the band still counts as on target. */
const TARGET_TOLERANCE = 5;

/**
 * Turn the model's response into the stored analysis: section numbers from the
 * full series, generated 1 km splits for easy runs and tempo blocks, totals
 * from the activity, and target_hit decided from the computed paces whenever
 * there is a target to compare against.
 */
export function parseAnalysis(
  msg: Anthropic.Message,
  ctx: Omit<AnalysisContext, "request">,
): WorkoutAnalysis {
  if (msg.stop_reason === "max_tokens")
    throw new Error("analysis truncated at max_tokens — workout too long");
  const text = msg.content.find((b) => b.type === "text");
  if (!text || text.type !== "text")
    throw new Error(`model returned no analysis (stop_reason=${msg.stop_reason})`);
  const model = JSON.parse(text.text) as ModelAnalysis;

  const { activity: a, plan, series, extras } = ctx;
  const band = targetBand(plan, model);
  const laps = extras?.laps ?? [];
  const starts = lapStarts(laps);
  const sections: WorkoutSection[] = [];
  if (model.type === "easy" || model.type === "long" || model.type === "regen") {
    sections.push(...kmSplits(series, "easy_split", 0, a.distance / 1000));
  }
  const marked = [...model.sections].sort((x, y) => x.start_km - y.start_km);
  for (const m of marked) {
    const lap = m.lap != null ? laps[m.lap - 1] : undefined;
    sections.push(
      lap
        ? lapSection(lap, m.kind, m.index, starts[m.lap! - 1]!, band)
        : sectionStats(series, m.kind, m.index, m.start_km, m.end_km, band),
    );
    if (m.kind === "tempo") {
      sections.push(...kmSplits(series, "tempo_split", m.start_km, m.end_km, band));
    }
  }

  // The work the target applies to: reps, else the tempo's kilometres.
  const work = sections.filter((s) => s.kind === "rep" || s.kind === "tempo_split");
  const scored = work.filter((s) => s.vs_target_sec_per_km != null);
  const targetHit =
    band && scored.length > 0 && model.type !== "easy" && model.type !== "long"
      ? scored.every((s) => Math.abs(s.vs_target_sec_per_km!) <= TARGET_TOLERANCE)
      : model.analysis.target_hit;

  return {
    workout_id: `${a.startDate.slice(0, 10)}-${a.source}-${a.externalId}`,
    date: a.startDate.slice(0, 10),
    title: model.title,
    type: model.type,
    prescription: model.prescription,
    totals: {
      distance_km: Math.round(a.distance / 10) / 100,
      duration_sec: a.movingTime,
      avg_pace_sec_per_km:
        a.distance > 0 ? Math.round(a.movingTime / (a.distance / 1000)) : 0,
      avg_hr: a.avgHr ? Math.round(a.avgHr) : undefined,
      max_hr: a.maxHr ? Math.round(a.maxHr) : undefined,
      elevation_gain_m: Math.round(a.elevationGain),
    },
    sections,
    analysis: { ...model.analysis, target_hit: targetHit },
  };
}

// Runs the full analysis for one activity and persists the result. Shared by
// the streaming /analyze route (manual re-analyze) and the SQS worker that
// auto-analyzes freshly synced runs. Anthropic is imported lazily so it lands
// in its own esbuild chunk, off the cold-start path of the non-analyze routes.
export async function analyzeActivity(
  source: string,
  externalId: string,
): Promise<WorkoutAnalysis> {
  const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
  const { request, ...ctx } = await buildAnalysisRequest(source, externalId);

  const client = new AnthropicClient({
    apiKey: Resource.AnthropicApiKey.value,
  });
  const msg = await client.messages.create(request);
  // Token accounting per analysis, so prompt changes can be measured.
  console.log(
    "analysis usage",
    JSON.stringify({ run: `${source}/${externalId}`, model: MODEL, ...msg.usage }),
  );
  const analysis = parseAnalysis(msg, ctx);
  const { plan } = ctx;

  await putAnalysis(source, externalId, {
    analysis,
    model: MODEL,
    createdAt: new Date().toISOString(),
  });

  // Feed the result back onto the plan, so planning sees how each prescribed
  // session actually went. RPE entered on the watch beats the model's estimate.
  if (plan) {
    try {
      const extras = await getExtras(source, externalId);
      await updatePlan(plan.date, plan.id, {
        compliance: {
          ...plan.compliance,
          targetHit: analysis.analysis?.target_hit,
          pattern: analysis.analysis?.pattern,
          rpe: extras?.feedback?.rpe ?? analysis.analysis?.rpe_estimate,
        },
      });
    } catch (e) {
      console.error(`compliance ${source}/${externalId}: ${(e as Error).message}`);
    }
  }

  // Rename the run to the execution-based title ("10x400m @4:26" beats the
  // plan's "Tiros específicos"). Keep the linked plan's snapshot in sync so
  // the calendar shows the same name. Best-effort — a rename failure must not
  // fail the analysis.
  const title = analysis.title?.trim();
  if (title) {
    try {
      await renameActivity(source as ActivitySource, externalId, title);
      if (plan) await updatePlan(plan.date, plan.id, { actualName: title });
    } catch (e) {
      console.error(`rename ${source}/${externalId}: ${(e as Error).message}`);
    }
  }

  return analysis;
}

// Streaming envelope for the /analyze route in api.ts (manual re-analyze from
// the web). Auth, the HTTP stream, and the keep-alive heartbeat live there.
export async function runAnalyze(
  body: string,
  write: (chunk: string) => Promise<unknown>,
): Promise<void> {
  try {
    const { source, externalId } = JSON.parse(body) as AnalyzeRequest;
    const analysis = await analyzeActivity(source, externalId);
    await write(JSON.stringify({ ok: true, analysis }));
  } catch (err) {
    await write(JSON.stringify({ ok: false, error: (err as Error).message }));
  }
}
