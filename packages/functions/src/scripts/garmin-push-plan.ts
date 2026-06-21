import {
  getValidAccessToken,
  createWorkout,
  scheduleWorkout,
  planToWorkout,
} from "@run/core/garmin";
import { listPlans } from "@run/core/plan";

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
      console.log(`  ${p.date}  ${JSON.stringify(planToWorkout(p))}`);
    }
    console.log("dry run — nothing sent.");
    return;
  }

  const token = await getValidAccessToken();
  console.log("authenticated with Garmin.");

  let created = 0;
  let scheduled = 0;
  const errors: string[] = [];
  for (const p of plans) {
    try {
      const w = await createWorkout(planToWorkout(p), token);
      created++;
      console.log(`  + ${p.date}  #${w.workoutId}  ${w.workoutName}`);
      if (!noSchedule) {
        await scheduleWorkout(w.workoutId, p.date, token);
        scheduled++;
      }
    } catch (e) {
      errors.push(`${p.date}: ${(e as Error).message}`);
    }
  }

  console.log(
    `\ndone. created=${created} scheduled=${scheduled} errors=${errors.length}`,
  );
  for (const e of errors) console.log(`  ${e}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
