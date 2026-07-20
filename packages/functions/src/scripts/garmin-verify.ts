import { getValidAccessToken, getWorkout } from "@run/core/garmin";
import { listPlans } from "@run/core/plan";

/** Print the structure Garmin currently has for a plan's workout, by date. */
async function main() {
  const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  const plans = await listPlans({ from: date, to: date });
  const plan = plans.find((p) => p.garminWorkoutId);
  if (!plan?.garminWorkoutId) {
    console.log(`no pushed workout on ${date}`);
    return;
  }
  const token = await getValidAccessToken();
  const w = (await getWorkout(plan.garminWorkoutId, token)) as Record<
    string,
    unknown
  >;
  console.log(`#${plan.garminWorkoutId} "${w.workoutName}"`);
  const seg = (w.workoutSegments as Array<Record<string, unknown>>)[0];
  if (!seg) {
    console.log("workout has no segments");
    return;
  }
  const steps = seg.workoutSteps as Array<Record<string, unknown>>;
  const fmt = (s: Record<string, unknown>, indent = "  "): string => {
    const st = s.stepType as Record<string, unknown>;
    if (s.type === "RepeatGroupDTO") {
      const kids = (s.workoutSteps as Array<Record<string, unknown>>)
        .map((k) => fmt(k, indent + "    "))
        .join("\n");
      return `${indent}${s.numberOfIterations}x (skipLastRest=${s.skipLastRestStep}):\n${kids}`;
    }
    const cond = s.endCondition as Record<string, unknown>;
    const tt = s.targetType as Record<string, unknown>;
    const pace =
      tt?.workoutTargetTypeKey === "pace.zone"
        ? ` @ pace ${(s.targetValueOne as number).toFixed(2)}–${(s.targetValueTwo as number).toFixed(2)} m/s`
        : "";
    return `${indent}- ${st.stepTypeKey} ${cond.conditionTypeKey}=${s.endConditionValue}${pace}`;
  };
  console.log(steps.map((s) => fmt(s)).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
