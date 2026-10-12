import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  findActivitiesOnDate,
  listActivities,
  type Activity,
} from "@run/core/activity";
import { createPlan, deletePlan, listPlans, updatePlan } from "@run/core/plan";

function summarizeActivity(a: Activity) {
  const km = (a.distance / 1000).toFixed(2);
  const paceSecPerKm = a.movingTime / (a.distance / 1000);
  const min = Math.floor(paceSecPerKm / 60);
  const sec = Math.round(paceSecPerKm % 60).toString().padStart(2, "0");
  return [
    a.startDate.slice(0, 10),
    `${km}km`,
    `${Math.round(a.movingTime / 60)}min`,
    `${min}:${sec}/km`,
    a.avgHr ? `${Math.round(a.avgHr)}bpm` : "",
    `+${Math.round(a.elevationGain)}m`,
    a.name,
  ].filter(Boolean).join(" | ");
}

// Everything Claude needs before planning: today's date, the Monday a new
// plan's week 1 starts on, and one line per recent run.
async function getTrainingContext(limit: number) {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ...
  const daysToMonday = dayOfWeek === 1 ? 0 : (8 - dayOfWeek) % 7;
  const nextMonday = new Date(now);
  nextMonday.setUTCDate(now.getUTCDate() + daysToMonday);
  const activities = await listActivities({ limit });
  return {
    today: now.toISOString().slice(0, 10),
    weekday: now.toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "UTC",
    }),
    plan_week1_monday: nextMonday.toISOString().slice(0, 10),
    recent_runs: activities.map(summarizeActivity),
  };
}

async function linkPastActivities() {
  const today = new Date().toISOString().slice(0, 10);
  const plans = await listPlans({ to: today });
  const planned = plans.filter((p) => p.status === "planned");
  let linked = 0;
  for (const plan of planned) {
    const acts = await findActivitiesOnDate(plan.date, plan.userId);
    const match = acts[0];
    if (!match) continue;
    await updatePlan(
      plan.date,
      plan.id,
      {
        status: "done",
        actualSource: match.source,
        actualExternalId: match.externalId,
        actualStartDate: match.startDate,
        actualDistance: match.distance,
        actualMovingTime: match.movingTime,
        actualAvgHr: match.avgHr,
        actualName: match.name,
      },
      plan.userId,
    );
    linked++;
  }
  return { checked: planned.length, linked };
}

async function clearAllFutureRuns() {
  const today = new Date().toISOString().slice(0, 10);
  const all = await listPlans({ from: today });
  await Promise.all(all.map((p) => deletePlan(p.date, p.id)));
  return { deleted: all.length };
}

async function movePlannedRun(currentDate: string, id: string, newDate: string) {
  const existing = await listPlans({ from: currentDate, to: currentDate });
  const plan = existing.find((p) => p.id === id);
  if (!plan) throw new Error(`plan not found: ${currentDate}/${id}`);
  await deletePlan(currentDate, id);
  return await createPlan({
    date: newDate,
    type: plan.type,
    distance: plan.distance,
    durationSec: plan.durationSec,
    paceTargetSec: plan.paceTargetSec,
    notes: plan.notes,
  });
}

const runType = z.enum(["easy", "long", "tempo", "interval", "race", "recovery"]);

// One zod schema per tool — the single source of truth. The JSON Schema
// advertised over MCP and the parsed, typed input in runTool both derive
// from these, so the wire contract can't drift from the handler.
const inputs = {
  get_training_context: z.object({
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("How many recent runs to include (default 200)"),
  }),
  create_planned_run: z.object({
    date: z.string().describe("ISO date YYYY-MM-DD when the run should happen"),
    type: runType,
    distance_meters: z.number().optional(),
    duration_seconds: z.number().optional(),
    pace_target_sec_per_km: z.number().optional(),
    notes: z
      .string()
      .optional()
      .describe(
        "Coaching notes — workout structure, rep details, RPE targets, etc.",
      ),
  }),
  list_planned_runs: z.object({
    from: z.string().optional().describe("YYYY-MM-DD inclusive"),
    to: z.string().optional().describe("YYYY-MM-DD inclusive"),
  }),
  update_planned_run: z.object({
    date: z.string().describe("Current date of the plan (YYYY-MM-DD)"),
    id: z.string(),
    type: runType.optional(),
    distance_meters: z.number().optional(),
    duration_seconds: z.number().optional(),
    pace_target_sec_per_km: z.number().optional(),
    notes: z.string().optional(),
    status: z.enum(["planned", "done", "skipped"]).optional(),
  }),
  delete_planned_run: z.object({
    date: z.string(),
    id: z.string(),
  }),
  clear_all_planned_runs: z.object({}),
  link_past_activities: z.object({}),
  move_planned_run: z.object({
    current_date: z.string().describe("Current YYYY-MM-DD of the plan"),
    id: z.string(),
    new_date: z.string().describe("New YYYY-MM-DD for the plan"),
  }),
} satisfies Record<string, z.ZodObject<z.ZodRawShape>>;

const descriptions: Record<keyof typeof inputs, string> = {
  get_training_context:
    "Today's date, the Monday a new plan's week 1 starts on, and the athlete's recent runs (date | km | min | pace | avg HR | elevation | name). Call this before planning.",
  create_planned_run:
    "Add a future planned run to the athlete's calendar. Use this whenever you commit to a workout the athlete should do.",
  list_planned_runs: "List the athlete's planned runs in a date range.",
  update_planned_run: "Update an existing planned run.",
  delete_planned_run: "Delete a planned run.",
  clear_all_planned_runs:
    "Delete every planned run from today onwards. Use this when the athlete wants to restart their training plan from scratch.",
  link_past_activities:
    "For every planned run still marked 'planned' with date <= today, look for a matching synced activity on that date and snapshot it onto the plan (mark as done). Use this after creating plans for dates the athlete has already run.",
  move_planned_run:
    "Move an existing planned run to a different date. Preserves all other attributes.",
};

const annotations: Record<keyof typeof inputs, ToolAnnotations> = {
  get_training_context: { readOnlyHint: true },
  create_planned_run: { readOnlyHint: false, destructiveHint: false },
  list_planned_runs: { readOnlyHint: true },
  update_planned_run: { readOnlyHint: false, destructiveHint: false },
  delete_planned_run: { readOnlyHint: false, destructiveHint: true },
  clear_all_planned_runs: { readOnlyHint: false, destructiveHint: true },
  link_past_activities: { readOnlyHint: false, destructiveHint: false },
  move_planned_run: { readOnlyHint: false, destructiveHint: false },
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
      return await getTrainingContext(i.limit ?? 200);
    }
    case "create_planned_run": {
      const i = inputs.create_planned_run.parse(input);
      return await createPlan({
        date: i.date,
        type: i.type,
        distance: i.distance_meters,
        durationSec: i.duration_seconds,
        paceTargetSec: i.pace_target_sec_per_km,
        notes: i.notes,
      });
    }
    case "list_planned_runs": {
      const i = inputs.list_planned_runs.parse(input);
      return await listPlans({ from: i.from, to: i.to });
    }
    case "update_planned_run": {
      const i = inputs.update_planned_run.parse(input);
      await updatePlan(i.date, i.id, {
        type: i.type,
        distance: i.distance_meters,
        durationSec: i.duration_seconds,
        paceTargetSec: i.pace_target_sec_per_km,
        notes: i.notes,
        status: i.status,
      });
      return { ok: true };
    }
    case "delete_planned_run": {
      const i = inputs.delete_planned_run.parse(input);
      await deletePlan(i.date, i.id);
      return { ok: true };
    }
    case "clear_all_planned_runs":
      return await clearAllFutureRuns();
    case "link_past_activities":
      return await linkPastActivities();
    case "move_planned_run": {
      const i = inputs.move_planned_run.parse(input);
      return await movePlannedRun(i.current_date, i.id, i.new_date);
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
