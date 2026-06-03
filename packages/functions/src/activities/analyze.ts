import Anthropic from "@anthropic-ai/sdk";
import { Resource } from "sst";
import { getActivity, type Activity, type ActivitySource } from "@run/core/activity";
import {
  getChartSeries,
  putAnalysis,
  type WorkoutAnalysis,
} from "@run/core/workout";
import { listPlans, type PlannedRun } from "@run/core/plan";
import type { ChartSeries } from "@run/core/track";
import { isAuthorized } from "../lib/auth.ts";
import { ANALYSIS_SYSTEM, ANALYSIS_TOOL } from "./analyze-prompt.ts";

const MODEL = "claude-sonnet-4-6";

type AnalyzeRequest = { source: string; externalId: string };

function paceStr(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Compact CSV of the trace for the model to segment. Re-downsampled to keep tokens sane. */
function traceCsv(series: ChartSeries, maxRows = 280): string {
  const n = series.km.length;
  const stride = Math.max(1, Math.ceil(n / maxRows));
  const rows: string[] = ["elapsed_s,cum_km,pace_s_per_km,hr"];
  for (let i = 0; i < n; i += stride) {
    const pace = series.pace[i];
    const hr = series.hr[i];
    rows.push(
      `${series.elapsed[i]},${series.km[i]},${pace ?? ""},${hr ?? ""}`,
    );
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

export const handler = awslambda.streamifyResponse(async (event, stream) => {
  const headers = (event as { headers?: Record<string, string | undefined> })
    .headers;
  const respond = (statusCode: number) =>
    awslambda.HttpResponseStream.from(stream, {
      statusCode,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });

  if (!isAuthorized(headers)) {
    const s = respond(401);
    s.write("unauthorized");
    s.end();
    return;
  }

  const body = (event as { body?: string }).body;
  if (!body) {
    const s = respond(400);
    s.write("missing body");
    s.end();
    return;
  }
  const { source, externalId } = JSON.parse(body) as AnalyzeRequest;

  const out = respond(200);
  const heartbeat = setInterval(() => {
    try {
      out.write("​");
    } catch {
      /* stream closed */
    }
  }, 8000);

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

    const client = new Anthropic({ apiKey: Resource.AnthropicApiKey.value });
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

    out.write(JSON.stringify({ ok: true, analysis }));
  } catch (err) {
    out.write(JSON.stringify({ ok: false, error: (err as Error).message }));
  } finally {
    clearInterval(heartbeat);
    out.end();
  }
});
