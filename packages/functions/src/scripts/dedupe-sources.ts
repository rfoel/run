import {
  deleteActivity,
  listActivities,
  type Activity,
} from "@run/core/activity";
import { linkActivityToPlan, unlinkActivityFromPlan } from "@run/core/plan";
import { deleteWorkoutItems } from "@run/core/workout";

/**
 * Remove runs imported twice, once from Strava and once from Garmin.
 *
 * During the switch to Garmin-only ingestion both sources were live for a week,
 * and putActivity is idempotent per (source, externalId) — so the same physical
 * run landed as two rows, double-counting itself in every stats rollup. Garmin
 * wins: it is the source that stays.
 *
 * Matching is on the exact start timestamp. Checked against the real table, the
 * pair count is identical at every tolerance from 0 to 120 minutes, so there is
 * nothing to gain from a fuzzy window and plenty to lose. A distance guard backs
 * it up, so two genuinely different runs sharing a timestamp are reported and
 * skipped rather than deleted.
 *
 * Dry run (reports what it would do, changes nothing):
 *   sst shell --stage production -- node packages/functions/src/scripts/dedupe-sources.ts
 *
 * Apply:
 *   sst shell --stage production -- node packages/functions/src/scripts/dedupe-sources.ts --yes
 */

/** Distances must agree this closely for two rows to be the same run. */
const DISTANCE_TOLERANCE = 0.05;

const km = (m: number) => (m / 1000).toFixed(2);

async function main() {
  const apply = process.argv.includes("--yes");

  const activities = await listActivities({ limit: 100_000 });
  const byStart = new Map<string, Activity[]>();
  for (const a of activities) {
    const group = byStart.get(a.startDate);
    if (group) group.push(a);
    else byStart.set(a.startDate, [a]);
  }

  const pairs: { keep: Activity; drop: Activity }[] = [];
  const suspicious: Activity[][] = [];

  for (const group of byStart.values()) {
    if (group.length < 2) continue;
    const keep = group.find((a) => a.source === "garmin");
    const drops = group.filter((a) => a.source !== "garmin");
    // No Garmin row means there's no rule to apply here — report, don't guess.
    if (!keep || drops.length === 0) {
      suspicious.push(group);
      continue;
    }
    for (const drop of drops) {
      const rel = Math.abs(keep.distance - drop.distance) / keep.distance;
      if (rel > DISTANCE_TOLERANCE) {
        suspicious.push([keep, drop]);
        continue;
      }
      pairs.push({ keep, drop });
    }
  }

  console.log(`${activities.length} activities, ${pairs.length} duplicate pairs`);
  let doubleCounted = 0;
  for (const { keep, drop } of pairs) {
    doubleCounted += drop.distance;
    console.log(
      `  ${keep.startDate.slice(0, 16)}  keep garmin/${keep.externalId} ${km(keep.distance)}km` +
        `  drop ${drop.source}/${drop.externalId} ${km(drop.distance)}km`,
    );
  }
  console.log(`${km(doubleCounted)} km currently double-counted in stats`);

  if (suspicious.length > 0) {
    console.log(`\n${suspicious.length} group(s) skipped — check by hand:`);
    for (const group of suspicious) {
      console.log(
        "  " +
          group
            .map((a) => `${a.source}/${a.externalId} ${km(a.distance)}km`)
            .join("  |  "),
      );
    }
  }

  if (!apply) {
    console.log("\ndry run — nothing changed. Re-run with --yes.");
    return;
  }

  for (const { keep, drop } of pairs) {
    // Order matters. If the plan on that date snapshots the Strava row, clearing
    // it first returns the plan to "planned", which is the state
    // linkActivityToPlan looks for — so the Garmin row inherits the link instead
    // of the plan being left unlinked.
    const unlinked = await unlinkActivityFromPlan(
      drop.source,
      drop.externalId,
      drop.startDate,
    );
    const { deleted } = await deleteActivity(drop.source, drop.externalId);
    if (!deleted) {
      console.log(`  skipped ${drop.source}/${drop.externalId} — already gone`);
      continue;
    }
    await deleteWorkoutItems(drop.source, drop.externalId);
    const relinked = unlinked > 0 ? await linkActivityToPlan(keep) : null;
    console.log(
      `  deleted ${drop.source}/${drop.externalId}` +
        (unlinked > 0
          ? relinked
            ? ` — plan ${relinked.date} moved to garmin`
            : " — WARNING: plan was unlinked and could not be moved"
          : ""),
    );
  }

  console.log(
    `\ndone. ${pairs.length} removed, stats corrected by ${km(doubleCounted)} km.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
