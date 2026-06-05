import type Anthropic from "@anthropic-ai/sdk";
import { Resource } from "sst";
import { getActivity, type Activity, type ActivitySource } from "@run/core/activity";
import {
  getChartSeries,
  putAnalysis,
  type WorkoutAnalysis,
} from "@run/core/workout";
import { listPlans, type PlannedRun } from "@run/core/plan";
import type { ChartSeries } from "@run/core/track";
import { ANALYSIS_SYSTEM, ANALYSIS_TOOL } from "./analyze-prompt.ts";

const MODEL = "claude-sonnet-4-6";

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

function buildUserMessage(
  a: Activity,
  series: ChartSeries,
  plan: PlannedRun | undefined,
): string {
  const totals = [
    `distance_km: ${(a.distance / 1000).toFixed(2)}`,
    `moving_time_sec: ${a.movingTime}`,
    `elapsed_time_sec: ${a.elapsedTime}`,
    `avg_hr: ${a.avgHr ? Math.round(a.avgHr) : "n/a"}`,
    `max_hr: ${a.maxHr ? Math.round(a.maxHr) : "n/a"}`,
    `elevation_gain_m: ${Math.round(a.elevationGain)}`,
  ].join("\n");

  return [
    `<prescription>\n${prescriptionBlock(plan, a)}\n</prescription>`,
    `<totals>\n${totals}\n</totals>`,
    `<trace_csv>\n${traceCsv(series)}\n</trace_csv>`,
    `workout_id: ${a.startDate.slice(0, 10)}-${a.source}-${a.externalId}`,
    `date: ${a.startDate.slice(0, 10)}`,
    `Analyze this workout. Call emit_analysis with the full structured result. Write the verbal analysis (highlights, issues, next_workout_suggestion) in Brazilian Portuguese (pt-BR).`,
  ].join("\n\n");
}

// Runs the analysis and writes the JSON result to `write`. Auth, the HTTP
// stream, and the keep-alive heartbeat live in the /analyze route in api.ts.
// Anthropic is imported lazily so it lands in its own esbuild chunk, off the
// cold-start path of the non-analyze routes.
export async function runAnalyze(
  body: string,
  write: (chunk: string) => Promise<unknown>,
): Promise<void> {
  const { source, externalId } = JSON.parse(body) as AnalyzeRequest;
  const { default: AnthropicClient } = await import("@anthropic-ai/sdk");

  try {
    const activity = await getActivity(source as ActivitySource, externalId);
    if (!activity) throw new Error("activity not found");
    const series = await getChartSeries(source, externalId);
    if (!series || series.km.length === 0)
      throw new Error("no chart series — re-sync this activity first");

    const date = activity.startDate.slice(0, 10);
    const plans = await listPlans({ from: date, to: date });
    const plan = plans.find(
      (p) => p.actualSource === source && p.actualExternalId === externalId,
    );

    const client = new AnthropicClient({
      apiKey: Resource.AnthropicApiKey.value,
    });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: ANALYSIS_SYSTEM,
      tools: [ANALYSIS_TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: "emit_analysis" },
      messages: [
        { role: "user", content: buildUserMessage(activity, series, plan) },
      ],
    });

    const toolUse = msg.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use")
      throw new Error("model did not return structured analysis");
    const analysis = toolUse.input as WorkoutAnalysis;

    await putAnalysis(source, externalId, {
      analysis,
      model: MODEL,
      createdAt: new Date().toISOString(),
    });

    await write(JSON.stringify({ ok: true, analysis }));
  } catch (err) {
    await write(JSON.stringify({ ok: false, error: (err as Error).message }));
  }
}
