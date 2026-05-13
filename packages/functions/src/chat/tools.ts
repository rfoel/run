import { findActivitiesOnDate } from "@run/core/activity";
import {
  createPlan,
  deletePlan,
  listPlans,
  updatePlan,
  type PlannedRunType,
} from "@run/core/plan";

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

export const tools = [
  {
    name: "create_planned_run",
    description:
      "Add a future planned run to the athlete's calendar. Use this whenever you commit to a workout the athlete should do.",
    input_schema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "ISO date YYYY-MM-DD when the run should happen",
        },
        type: {
          type: "string",
          enum: ["easy", "long", "tempo", "interval", "race", "recovery"],
        },
        distance_meters: { type: "number" },
        duration_seconds: { type: "number" },
        pace_target_sec_per_km: { type: "number" },
        notes: {
          type: "string",
          description:
            "Coaching notes — workout structure, rep details, RPE targets, etc.",
        },
      },
      required: ["date", "type"],
    },
  },
  {
    name: "list_planned_runs",
    description: "List the athlete's planned runs in a date range.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "YYYY-MM-DD inclusive" },
        to: { type: "string", description: "YYYY-MM-DD inclusive" },
      },
    },
  },
  {
    name: "update_planned_run",
    description: "Update an existing planned run.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Current date of the plan (YYYY-MM-DD)" },
        id: { type: "string" },
        type: {
          type: "string",
          enum: ["easy", "long", "tempo", "interval", "race", "recovery"],
        },
        distance_meters: { type: "number" },
        duration_seconds: { type: "number" },
        pace_target_sec_per_km: { type: "number" },
        notes: { type: "string" },
        status: {
          type: "string",
          enum: ["planned", "done", "skipped"],
        },
      },
      required: ["date", "id"],
    },
  },
  {
    name: "delete_planned_run",
    description: "Delete a planned run.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string" },
        id: { type: "string" },
      },
      required: ["date", "id"],
    },
  },
  {
    name: "clear_all_planned_runs",
    description:
      "Delete every planned run from today onwards. Use this when the athlete wants to restart their training plan from scratch.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "link_past_activities",
    description:
      "For every planned run still marked 'planned' with date <= today, look for a matching Strava activity on that date and snapshot it onto the plan (mark as done). Use this after creating plans for dates the athlete has already run.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "move_planned_run",
    description:
      "Move an existing planned run to a different date. Preserves all other attributes.",
    input_schema: {
      type: "object",
      properties: {
        current_date: {
          type: "string",
          description: "Current YYYY-MM-DD of the plan",
        },
        id: { type: "string" },
        new_date: {
          type: "string",
          description: "New YYYY-MM-DD for the plan",
        },
      },
      required: ["current_date", "id", "new_date"],
    },
  },
] as const;

type Input = Record<string, unknown>;

export async function runTool(name: string, input: Input): Promise<unknown> {
  switch (name) {
    case "create_planned_run":
      return await createPlan({
        date: input.date as string,
        type: input.type as PlannedRunType,
        distance: input.distance_meters as number | undefined,
        durationSec: input.duration_seconds as number | undefined,
        paceTargetSec: input.pace_target_sec_per_km as number | undefined,
        notes: input.notes as string | undefined,
      });
    case "list_planned_runs":
      return await listPlans({
        from: input.from as string | undefined,
        to: input.to as string | undefined,
      });
    case "update_planned_run":
      await updatePlan(input.date as string, input.id as string, {
        type: input.type as PlannedRunType | undefined,
        distance: input.distance_meters as number | undefined,
        durationSec: input.duration_seconds as number | undefined,
        paceTargetSec: input.pace_target_sec_per_km as number | undefined,
        notes: input.notes as string | undefined,
        status: input.status as "planned" | "done" | "skipped" | undefined,
      });
      return { ok: true };
    case "delete_planned_run":
      await deletePlan(input.date as string, input.id as string);
      return { ok: true };
    case "clear_all_planned_runs":
      return await clearAllFutureRuns();
    case "link_past_activities":
      return await linkPastActivities();
    case "move_planned_run":
      return await movePlannedRun(
        input.current_date as string,
        input.id as string,
        input.new_date as string,
      );
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
