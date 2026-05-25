import { listPlans, planTitle, updatePlan } from "@run/core/plan";
import { getValidAccessToken, updateActivityName } from "@run/core/strava";
import { generateStravaTitle } from "../strava/title.ts";

/**
 * For every PlannedRun with notes, generate a short title via Claude and
 * store it on the plan. For plans already linked to a Strava activity,
 * also rename the activity on Strava to match.
 *
 * Flags: --dry (skip writes), --force (regenerate even if shortTitle set),
 *        --limit N, --skip-strava (only update plans, don't touch Strava).
 */
async function main() {
  const args = new Set(process.argv.slice(2));
  const dry = args.has("--dry");
  const force = args.has("--force");
  const skipStrava = args.has("--skip-strava");
  const limitIdx = process.argv.indexOf("--limit");
  const limit =
    limitIdx > 0 ? Number(process.argv[limitIdx + 1] ?? Infinity) : Infinity;

  const plans = await listPlans({});
  console.log(`scanned ${plans.length} plans`);

  const targets = plans
    .filter((p) => p.notes && p.notes.trim())
    .filter((p) => force || !p.shortTitle || !p.shortTitle.trim())
    .slice(0, limit);
  console.log(`generating titles for ${targets.length} plans`);

  let accessToken: string | null = null;
  let renamed = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const plan of targets) {
    const fallback = planTitle(plan);
    const short = await generateStravaTitle(plan, fallback);
    console.log(`${plan.date} ${plan.id.slice(0, 8)} -> ${short}`);

    if (dry) continue;

    try {
      await updatePlan(plan.date, plan.id, { shortTitle: short }, plan.userId);
      updated++;
    } catch (e) {
      errors.push(`update ${plan.id}: ${(e as Error).message}`);
      continue;
    }

    if (
      !skipStrava &&
      plan.actualSource === "strava" &&
      plan.actualExternalId
    ) {
      if (!accessToken) accessToken = await getValidAccessToken();
      try {
        await updateActivityName(
          Number(plan.actualExternalId),
          short,
          accessToken,
        );
        renamed++;
      } catch (e) {
        errors.push(
          `rename strava ${plan.actualExternalId}: ${(e as Error).message}`,
        );
      }
    }
  }

  console.log(
    `done. updated=${updated} renamed=${renamed} errors=${errors.length}`,
  );
  for (const e of errors) console.log(`  ${e}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
