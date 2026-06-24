import { createHash } from "node:crypto";
import {
  planToWorkout,
  type StructuredWorkout,
  type WorkoutInput,
} from "@run/core/garmin";
import { planTitle, updatePlan, type PlannedRun } from "@run/core/plan";
import { interpretWorkout } from "./interpret.ts";

/**
 * Fingerprint of the fields a structured workout is derived from. When any of
 * them change, the cached `plan.workout` is stale and we re-interpret.
 */
export function workoutHash(plan: PlannedRun): string {
  const key = JSON.stringify([
    plan.type,
    plan.distance ?? null,
    plan.durationSec ?? null,
    plan.paceTargetSec ?? null,
    plan.notes ?? "",
  ]);
  return createHash("sha1").update(key).digest("hex").slice(0, 16);
}

// Keep the watch-facing name/description consistent with the rest of the app,
// regardless of what the interpreter named it.
function titled(plan: PlannedRun, sw: StructuredWorkout): StructuredWorkout {
  return {
    ...sw,
    name: planTitle(plan),
    description: plan.notes ?? sw.description,
  };
}

/**
 * Resolve the Garmin workout payload for a plan: reuse the cached structured
 * workout when its fingerprint still matches, otherwise interpret the
 * prescription into structured steps and cache the result. Falls back to the
 * flat single-step workout if interpretation is unavailable.
 */
export async function resolvePlanWorkout(
  plan: PlannedRun,
): Promise<WorkoutInput | StructuredWorkout> {
  const hash = workoutHash(plan);
  if (plan.workout && plan.workoutHash === hash) {
    return titled(plan, plan.workout);
  }
  const sw = await interpretWorkout(plan);
  if (sw) {
    const out = titled(plan, sw);
    // Cache the interpretation; best-effort so a DDB hiccup never fails a push.
    try {
      await updatePlan(
        plan.date,
        plan.id,
        { workout: out, workoutHash: hash },
        plan.userId,
      );
    } catch {
      /* ignore — we still return the resolved workout */
    }
    return out;
  }
  return planToWorkout(plan);
}

/**
 * Resolve many plans' workouts with bounded concurrency. The interpreter is the
 * slow part (one LLM call per cold plan), so running a handful in parallel keeps
 * a batch push well under the API's timeout; the Garmin writes themselves stay
 * sequential at the call site. resolvePlanWorkout never throws, so each slot is
 * always filled.
 */
export async function resolvePlanWorkouts(
  plans: PlannedRun[],
  concurrency = 6,
): Promise<Array<WorkoutInput | StructuredWorkout>> {
  const out = new Array<WorkoutInput | StructuredWorkout>(plans.length);
  let next = 0;
  async function worker() {
    while (next < plans.length) {
      const i = next++;
      out[i] = await resolvePlanWorkout(plans[i]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, plans.length) }, worker),
  );
  return out;
}
