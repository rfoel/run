import {
  fetchActivities,
  fetchStreams,
  getValidAccessToken,
} from "@run/core/strava";
import { buildActivity, listActivities, putActivity } from "@run/core/activity";
import {
  computeMetrics,
  buildChartSeries,
  type Metrics,
} from "@run/core/track";
import { streamsToTrack } from "@run/core/parsers/streams";
import { putChartSeries } from "@run/core/workout";

// Strava summary fields not declared on StravaActivityRaw but present in the
// list payload — used to reconstruct metrics for runs that have no GPS stream.
type SummaryExtras = {
  average_speed?: number;
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
};

/** Build metrics straight from the Strava summary (treadmill/manual runs). */
function metricsFromSummary(s: {
  start_date: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  has_heartrate: boolean;
} & SummaryExtras): Metrics {
  return {
    distance: s.distance,
    movingTime: s.moving_time,
    elapsedTime: s.elapsed_time,
    elevationGain: s.total_elevation_gain,
    avgSpeed: s.average_speed ?? (s.moving_time ? s.distance / s.moving_time : 0),
    maxSpeed: s.max_speed ?? 0,
    avgHr: s.average_heartrate,
    maxHr: s.max_heartrate,
    avgCadence: s.average_cadence,
    hasHr: s.has_heartrate,
    splits: [],
    startTime: s.start_date,
  };
}

/**
 * Pull EVERY run from Strava (full history, no time window) and import the
 * ones missing from DynamoDB. The regular `/strava/sync` endpoint only looks
 * back 30 days, so older runs never get backfilled — this closes that gap.
 *
 * Already-stored runs are skipped BEFORE fetching their streams, so we only
 * spend Strava API calls on genuinely new activities (rate-limit friendly).
 * Treadmill / manual runs (no GPS stream) are imported too, with metrics taken
 * from the Strava summary instead of computed from a track.
 *
 * Run against production:
 *   sst shell --stage production -- node packages/functions/src/scripts/backfill-strava.ts
 *
 * Flags: --dry (no writes), --limit N (cap new imports), --quiet
 *
 * After a large import, recompute rollups:
 *   sst shell --stage production -- node packages/functions/src/scripts/init-stats.ts
 */

const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const quiet = args.includes("--quiet");
  const limitIdx = args.indexOf("--limit");
  const limit =
    limitIdx >= 0 ? Number(args[limitIdx + 1] ?? Infinity) : Infinity;

  const accessToken = await getValidAccessToken();

  // Which Strava activities do we already have? Skip them up front.
  const existing = await listActivities({ limit: 100_000 });
  const have = new Set(
    existing
      .filter((a) => a.source === "strava")
      .map((a) => a.externalId),
  );
  console.log(`${have.size} strava runs already in DB`);

  let fetched = 0;
  let imported = 0;
  let importedNoGps = 0;
  let skippedExisting = 0;
  let skippedType = 0;
  const errors: string[] = [];

  let page = 1;
  outer: while (true) {
    const batch = await fetchActivities(accessToken, { page, perPage: 100 });
    if (batch.length === 0) break;
    fetched += batch.length;

    for (const summary of batch) {
      if (!RUN_TYPES.has(summary.sport_type) && !RUN_TYPES.has(summary.type)) {
        skippedType++;
        continue;
      }
      const id = String(summary.id);
      if (have.has(id)) {
        skippedExisting++;
        continue;
      }
      if (imported >= limit) break outer;

      try {
        const streams = await fetchStreams(summary.id, accessToken);
        const startEpochSec = Math.floor(
          new Date(summary.start_date).getTime() / 1000,
        );
        const track = streamsToTrack(streams, startEpochSec);
        const hasGps = track.points.length >= 2;

        // Treadmill / manual runs have no GPS stream — reconstruct metrics
        // from the Strava summary so they still get imported.
        const metrics = hasGps
          ? computeMetrics(track)
          : metricsFromSummary(summary as typeof summary & SummaryExtras);
        const activity = buildActivity({
          source: "strava",
          externalId: id,
          name: summary.name,
          sportType: summary.sport_type,
          metrics,
        });
        if (!dry) {
          if (hasGps) {
            await putChartSeries("strava", id, buildChartSeries(track));
          }
          await putActivity(activity);
        }
        imported++;
        if (!hasGps) importedNoGps++;
        if (!quiet) {
          const tag = hasGps ? "+" : "+ (no-gps)";
          console.log(`  ${tag} ${id} ${summary.start_date} ${summary.name}`);
        }
        // Gentle on Strava's rate limit (200 req / 15 min).
        await sleep(200);
      } catch (e) {
        errors.push(`${id}: ${(e as Error).message}`);
      }
    }
    page++;
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
