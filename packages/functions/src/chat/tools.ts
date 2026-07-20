import { z } from "zod";
import { findActivitiesOnDate } from "@run/core/activity";
import { createPlan, deletePlan, listPlans, updatePlan } from "@run/core/plan";

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
// advertised to Claude and the parsed, typed input in runTool both derive
// from these, so the wire contract can't drift from the handler.
const inputs = {
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

// Strip the `$schema` key at the root; Anthropic's tool input_schema wants a
// bare JSON Schema object. `reused: "inline"` inlines shared definitions so
// each schema is self-contained (zod 4's native converter).
function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema, ...rest } = z.toJSONSchema(schema, {
    reused: "inline",
  }) as Record<string, unknown>;
  return rest;
}

export const tools = (Object.keys(inputs) as Array<keyof typeof inputs>).map(
  (name) => ({
    name,
    description: descriptions[name],
    input_schema: jsonSchema(inputs[name]),
  }),
);

export async function runTool(
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
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
