import {
  createWorkout,
  deleteWorkout,
  getValidAccessToken,
  scheduleWorkout,
  updateWorkout,
} from "@run/core/garmin";
import { updatePlan, type PlannedRun } from "@run/core/plan";
import { resolvePlanWorkouts } from "./resolve.ts";

export type GarminPushResult = {
  created: number;
  updated: number;
  errors: string[];
};

/**
 * Upsert each plan into Garmin Connect: create + schedule the ones not yet
 * pushed, and overwrite (PUT) the ones already pushed so title/step edits
 * re-sync. Safe to repeat. Used by the /garmin/push route and the MCP tool.
 * Throws only when Garmin auth itself fails; per-plan failures land in `errors`.
 */
export async function pushPlansToGarmin(
  plans: PlannedRun[],
): Promise<GarminPushResult> {
  const result: GarminPushResult = { created: 0, updated: 0, errors: [] };
  if (plans.length === 0) return result;

  let token: string;
  try {
    token = await getValidAccessToken();
  } catch (e) {
    throw new Error(`garmin auth: ${(e as Error).message}`);
  }
  // Interpret all prescriptions up front (bounded concurrency), then write to
  // Garmin sequentially to avoid hammering the unofficial API.
  const workouts = await resolvePlanWorkouts(plans);
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i]!;
    try {
      if (p.garminWorkoutId) {
        await updateWorkout(p.garminWorkoutId, workouts[i]!, token);
        result.updated++;
      } else {
        const w = await createWorkout(workouts[i]!, token);
        await scheduleWorkout(w.workoutId, p.date, token);
        await updatePlan(p.date, p.id, { garminWorkoutId: w.workoutId });
        result.created++;
      }
    } catch (e) {
      result.errors.push(`${p.date}: ${(e as Error).message}`);
    }
  }
  return result;
}

/**
 * Delete the Garmin workouts behind plans that are going away (deleted or
 * moved), so the watch doesn't keep a workout scheduled for a plan that no
 * longer exists. Best-effort: returns the number removed, never throws.
 */
export async function removePlansFromGarmin(
  plans: PlannedRun[],
): Promise<number> {
  const pushed = plans.filter((p) => p.garminWorkoutId);
  if (pushed.length === 0) return 0;
  let token: string;
  try {
    token = await getValidAccessToken();
  } catch {
    return 0;
  }
  let removed = 0;
  for (const p of pushed) {
    try {
      await deleteWorkout(p.garminWorkoutId!, token);
      removed++;
    } catch {
      /* already gone on Garmin's side, or a transient error — move on */
    }
  }
  return removed;
}
