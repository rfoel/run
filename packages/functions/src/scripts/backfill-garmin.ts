import {
  fetchActivities,
  fetchActivityDetails,
  getValidAccessToken,
  isGarminRun,
} from "@run/core/garmin";
import { buildActivity, listActivities, putActivity } from "@run/core/activity";
import { buildChartSeries } from "@run/core/track";
import { garminMetrics } from "@run/core/parsers/garmin";
import { putChartSeries } from "@run/core/workout";

/**
 * Pull EVERY run from Garmin Connect (full history) and import the ones missing
 * from DynamoDB. The `/garmin/sync` endpoint only looks back N days; this closes
 * the gap for older runs.
 *
 * Already-stored runs are skipped BEFORE fetching their detail samples, so we
 * only spend (heavily throttled) Garmin calls on genuinely new activities.
 * Treadmill / indoor runs import too, from summary metrics when no GPS track.
 *
 * Run against production:
 *   sst shell --stage production -- node packages/functions/src/scripts/backfill-garmin.ts
 *
 * Flags: --dry (no writes), --limit N (cap new imports), --quiet
 *
 * After a large import, recompute rollups:
 *   sst shell --stage production -- node packages/functions/src/scripts/init-stats.ts
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const quiet = args.includes("--quiet");
  const limitIdx = args.indexOf("--limit");
  const limit =
    limitIdx >= 0 ? Number(args[limitIdx + 1] ?? Infinity) : Infinity;

  const accessToken = await getValidAccessToken();

  const existing = await listActivities({ limit: 100_000 });
  const have = new Set(
    existing.filter((a) => a.source === "garmin").map((a) => a.externalId),
  );
  console.log(`${have.size} garmin runs already in DB`);

  let fetched = 0;
  let imported = 0;
  let importedNoGps = 0;
  let skippedExisting = 0;
  let skippedType = 0;
  const errors: string[] = [];

  const perPage = 50;
  let start = 0;
  outer: while (true) {
    const batch = await fetchActivities(accessToken, { start, limit: perPage });
    if (batch.length === 0) break;
    fetched += batch.length;

    for (const summary of batch) {
      if (!isGarminRun(summary.activityType.typeKey)) {
        skippedType++;
        continue;
      }
      const id = String(summary.activityId);
      if (have.has(id)) {
        skippedExisting++;
        continue;
      }
      if (imported >= limit) break outer;

      try {
        let details;
        try {
          details = await fetchActivityDetails(summary.activityId, accessToken);
        } catch {
          details = undefined;
        }
        const { metrics, track } = garminMetrics(summary, details);
        const activity = buildActivity({
          source: "garmin",
          externalId: id,
          name: summary.activityName ?? "Corrida",
          sportType: summary.activityType.typeKey,
          metrics,
        });
        if (!dry) {
          if (track) {
            await putChartSeries("garmin", id, buildChartSeries(track));
          }
          await putActivity(activity);
        }
        imported++;
        if (!track) importedNoGps++;
        if (!quiet) {
          const tag = track ? "+" : "+ (no-gps)";
          console.log(
            `  ${tag} ${id} ${summary.startTimeGMT} ${summary.activityName ?? ""}`,
          );
        }
        // Gentle on Garmin's unofficial API (throttles hard from datacenters).
        await sleep(400);
      } catch (e) {
        errors.push(`${id}: ${(e as Error).message}`);
      }
    }
    start += perPage;
  }

  console.log(
    `\ndone${dry ? " (dry)" : ""}. fetched=${fetched} imported=${imported} ` +
      `(${importedNoGps} without GPS) skippedExisting=${skippedExisting} ` +
      `skippedNonRun=${skippedType} errors=${errors.length}`,
  );
  if (errors.length) {
    console.log(`\nerrors:`);
    for (const e of errors) console.log(`  ${e}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
