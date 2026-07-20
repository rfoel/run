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
import {
  getChartSeries,
  getExtras,
  putAnalysis,
  type ActivityExtras,
  type WorkoutAnalysis,
} from "@run/core/workout";
import { listPlans, type PlannedRun } from "@run/core/plan";
import type { ChartSeries } from "@run/core/track";
import { ANALYSIS_SYSTEM, ANALYSIS_TOOL } from "./analyze-prompt.ts";

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
  if (plan.notes) lines.push(`notes: ${plan.notes}`);
  if (plan.distance) lines.push(`planned_distance_m: ${plan.distance}`);
  if (plan.paceTargetSec)
    lines.push(`target_pace: ${paceStr(plan.paceTargetSec)}/km`);
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
    `workout_id: ${a.startDate.slice(0, 10)}-${a.source}-${a.externalId}`,
    `date: ${a.startDate.slice(0, 10)}`,
    `Analyze this workout. Call emit_analysis with the full structured result. Write the verbal analysis (highlights, issues, next_workout_suggestion) in Brazilian Portuguese (pt-BR).`,
  ].join("\n\n");
}

// Runs the full analysis for one activity and persists the result. Shared by
// the streaming /analyze route (manual re-analyze) and the SQS worker that
// auto-analyzes freshly synced runs. Anthropic is imported lazily so it lands
// in its own esbuild chunk, off the cold-start path of the non-analyze routes.
/** Everything analyzeActivity sends to the API — exported so scripts can
 * reproduce the exact request when debugging response shapes. */
export async function buildAnalysisRequest(
  source: string,
  externalId: string,
): Promise<{
  request: Anthropic.MessageCreateParamsNonStreaming;
  activity: Activity;
  plan: PlannedRun | undefined;
}> {
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
    // Interval workouts emit one section per lap — a 22-lap session's JSON
    // alone runs several thousand tokens. 16k is the safe non-streaming ceiling.
    max_tokens: 16000,
    // Sonnet 5 runs adaptive thinking by default; this is a single forced
    // tool call over pre-digested data, so skip the thinking spend.
    thinking: { type: "disabled" },
    system: ANALYSIS_SYSTEM,
    tools: [ANALYSIS_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: "emit_analysis" },
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
  return { request, activity, plan };
}

export async function analyzeActivity(
  source: string,
  externalId: string,
): Promise<WorkoutAnalysis> {
  const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
  const { request, plan } = await buildAnalysisRequest(source, externalId);

  const client = new AnthropicClient({
    apiKey: Resource.AnthropicApiKey.value,
  });
  const msg = await client.messages.create(request);

  // A truncated response cuts the tool-call JSON mid-stream, which surfaces
  // as missing fields below — fail with the real cause instead.
  if (msg.stop_reason === "max_tokens")
    throw new Error("analysis truncated at max_tokens — workout too long");
  const toolUse = msg.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use")
    throw new Error("model did not return structured analysis");
  let analysis = toolUse.input as WorkoutAnalysis;
  // The schema has a field literally named "analysis", and the model
  // occasionally nests the whole payload under an outer key of that name —
  // sometimes as an object, sometimes double-encoded as a JSON string.
  // Unwrap when the real document is one level down.
  if (!analysis.sections) {
    let wrapped = (analysis as Record<string, unknown>).analysis;
    if (typeof wrapped === "string") {
      try {
        wrapped = JSON.parse(wrapped);
      } catch {
        wrapped = undefined;
      }
    }
    if (wrapped && Array.isArray((wrapped as WorkoutAnalysis).sections)) {
      analysis = wrapped as WorkoutAnalysis;
    }
  }
  // tool_choice forces the call but not schema completeness — never persist an
  // analysis the UI can't render.
  if (!Array.isArray(analysis.sections) || !analysis.totals) {
    // Dump the shape to CloudWatch so a recurrence is diagnosable.
    console.error(
      "malformed analysis:",
      JSON.stringify({
        stop_reason: msg.stop_reason,
        blocks: msg.content.map((b) => b.type),
        inputKeys: Object.keys(analysis as Record<string, unknown>),
        inputPreview: JSON.stringify(analysis).slice(0, 600),
      }),
    );
    throw new Error(
      `model returned analysis without sections/totals (stop_reason=${msg.stop_reason})`,
    );
  }

  await putAnalysis(source, externalId, {
    analysis,
    model: MODEL,
    createdAt: new Date().toISOString(),
  });

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
