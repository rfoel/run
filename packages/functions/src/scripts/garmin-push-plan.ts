import {
  getValidAccessToken,
  createWorkout,
  updateWorkout,
  scheduleWorkout,
} from "@run/core/garmin";
import { listPlans } from "@run/core/plan";
import { updatePlan } from "@run/core/plan";
import { resolvePlanWorkout } from "../garmin/resolve.ts";

/**
 * Push planned runs to Garmin Connect as scheduled workouts.
 *
 * First run performs the SSO login using the GarminEmail / GarminPassword
 * secrets and caches OAuth tokens in DynamoDB; later runs reuse/refresh them.
 *
 * Set the secrets once:
 *   sst secret set GarminEmail you@example.com
 *   sst secret set GarminPassword 'your-password'
 *
 * Run against a stage:
 *   sst shell --stage production -- node packages/functions/src/scripts/garmin-push-plan.ts --from 2026-06-20 --to 2026-07-20
 *
 * Flags:
 *   --from YYYY-MM-DD   start date (default: today)
 *   --to   YYYY-MM-DD   end date (default: +28 days)
 *   --no-schedule       create the workouts but don't put them on the calendar
 *   --dry               build payloads and log them, no API writes
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const dry = process.argv.includes("--dry");
  const noSchedule = process.argv.includes("--no-schedule");
  const today = new Date().toISOString().slice(0, 10);
  const from = arg("--from") ?? today;
  const to = arg("--to") ?? addDays(from, 28);

  const plans = (await listPlans({ from, to }))
    .filter((p) => p.status === "planned")
    .sort((a, b) => a.date.localeCompare(b.date));
  console.log(`${plans.length} planned run(s) in ${from}..${to}`);

  if (dry) {
    for (const p of plans) {
      const w = await resolvePlanWorkout(p);
      console.log(`  ${p.date}  ${JSON.stringify(w)}`);
    }
    console.log("dry run — interpreter ran (and cached); nothing sent to Garmin.");
    return;
  }

  const token = await getValidAccessToken();
  console.log("authenticated with Garmin.");

  let created = 0;
  let updated = 0;
  const errors: string[] = [];
  for (const p of plans) {
    try {
      const workout = await resolvePlanWorkout(p);
      if (p.garminWorkoutId) {
        // Already on Garmin — overwrite in place so title/step edits re-sync.
        const w = await updateWorkout(p.garminWorkoutId, workout, token);
        updated++;
        console.log(`  ~ ${p.date}  #${p.garminWorkoutId}  ${w.workoutName}`);
      } else {
        const w = await createWorkout(workout, token);
        // Stamp the id so future pushes update instead of duplicating.
        await updatePlan(p.date, p.id, { garminWorkoutId: w.workoutId });
        created++;
        console.log(`  + ${p.date}  #${w.workoutId}  ${w.workoutName}`);
        if (!noSchedule) await scheduleWorkout(w.workoutId, p.date, token);
      }
    } catch (e) {
      errors.push(`${p.date}: ${(e as Error).message}`);
    }
  }

  console.log(
    `\ndone. created=${created} updated=${updated} errors=${errors.length}`,
  );
  for (const e of errors) console.log(`  ${e}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
