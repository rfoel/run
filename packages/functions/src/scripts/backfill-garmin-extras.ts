import {
  fetchActivityDetails,
  fetchActivityFull,
  fetchActivityLaps,
  fetchActivityWeather,
  fetchHrTimeInZones,
  fetchPowerTimeInZones,
  getValidAccessToken,
} from "@run/core/garmin";
import { listActivities } from "@run/core/activity";
import { buildChartSeries } from "@run/core/track";
import { detailsToTrack, garminExtras } from "@run/core/parsers/garmin";
import { getExtras, putChartSeries, putExtras } from "@run/core/workout";

/**
 * Backfill device extras (watch laps, HR/power zones, weather, physio, RPE)
 * AND refresh the chart series (now carrying elevation/cadence/power) for
 * every Garmin run already imported. New syncs ingest all of this
 * automatically; this closes the gap for pre-existing activities.
 *
 * Idempotent: activities that already have an EXTRAS item are skipped unless
 * --force. Analyses are NOT re-run — use the app's "re-analisar" per run.
 *
 * Run against production:
 *   sst shell --stage production -- node packages/functions/src/scripts/backfill-garmin-extras.ts
 *
 * Flags: --dry (no writes), --limit N (cap processed runs), --force
 *        (re-fetch even when extras exist), --skip-series (extras only,
 *        skips the heavily-throttled details endpoint)
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const force = args.includes("--force");
  const skipSeries = args.includes("--skip-series");
  const limitIdx = args.indexOf("--limit");
  const limit =
    limitIdx >= 0 ? Number(args[limitIdx + 1] ?? Infinity) : Infinity;

  const token = await getValidAccessToken();
  const activities = (await listActivities({ limit: 10000 })).filter(
    (a) => a.source === "garmin",
  );
  console.log(`${activities.length} garmin activities in the table`);

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const a of activities) {
    if (processed >= limit) break;
    const id = a.externalId;
    try {
      if (!force && (await getExtras("garmin", id))) {
        skipped++;
        continue;
      }

      const soft = <T>(p: Promise<T>): Promise<T | undefined> =>
        p.catch((e) => {
          console.log(`  ${id}: ${(e as Error).message}`);
          return undefined;
        });
      const [full, laps, hrZones, powerZones, weather] = await Promise.all([
        soft(fetchActivityFull(id, token)),
        soft(fetchActivityLaps(id, token)),
        soft(fetchHrTimeInZones(id, token)),
        soft(fetchPowerTimeInZones(id, token)),
        soft(fetchActivityWeather(id, token)),
      ]);
      const extras = garminExtras({ full, laps, hrZones, powerZones, weather });
      const sections = Object.keys(extras).join(",") || "nothing";

      let seriesNote = "series skipped";
      if (!skipSeries) {
        const details = await soft(fetchActivityDetails(id, token));
        if (details) {
          const startEpochSec = Math.floor(
            new Date(a.startDate).getTime() / 1000,
          );
          const track = detailsToTrack(details, startEpochSec);
          if (track.points.length >= 2) {
            if (!dry)
              await putChartSeries("garmin", id, buildChartSeries(track));
            seriesNote = `series ${track.points.length} pts`;
          } else {
            seriesNote = "no samples";
          }
        } else {
          seriesNote = "details failed";
        }
      }

      if (!dry && Object.keys(extras).length > 0) {
        await putExtras("garmin", id, extras);
      }
      processed++;
      console.log(
        `${dry ? "[dry] " : ""}${a.startDate.slice(0, 10)} ${id} "${a.name}": extras=${sections}; ${seriesNote}`,
      );
      // Be gentle with the unofficial API — it throttles datacenter-ish
      // traffic hard and fetchRetry only softens the blow.
      await sleep(800);
    } catch (e) {
      failed++;
      console.log(`FAIL ${id}: ${(e as Error).message}`);
      await sleep(2000);
    }
  }

  console.log(
    `\ndone: ${processed} backfilled, ${skipped} already had extras, ${failed} failed`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
