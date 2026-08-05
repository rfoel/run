import {
  buildActivity,
  putActivity,
  renameActivity,
} from "@run/core/activity";
import { linkActivityToPlan, planTitle, updatePlan } from "@run/core/plan";
import { putChartSeries, putExtras } from "@run/core/workout";
import { buildChartSeries } from "@run/core/track";
import {
  fetchActivities as fetchGarminActivities,
  fetchActivityDetails as fetchGarminActivityDetails,
  fetchActivityFull,
  fetchActivityLaps,
  fetchActivityWeather,
  fetchHrTimeInZones,
  fetchPowerTimeInZones,
  garminStartEpochSec,
  getValidAccessToken,
  isGarminRun,
} from "@run/core/garmin";
import { garminExtras, garminMetrics } from "@run/core/parsers/garmin";
import { enqueueAnalysis } from "../lib/analyze-queue.ts";

export type SyncResult = {
  fetched: number;
  imported: number;
  skipped: number;
  linked: number;
  errors: string[];
};

/**
 * Pull everything Garmin computed for one run beyond the sample streams —
 * watch laps (with structured-workout step + intensity), HR/power zone times,
 * weather, training effect/load, running dynamics and athlete-entered
 * RPE/feel — and store it as the activity's EXTRAS item. Each endpoint is
 * best-effort: the unofficial API throttles hard, and a missing section just
 * means less context for the UI/analysis.
 */
export async function ingestGarminExtras(
  externalId: string,
  token: string,
): Promise<boolean> {
  const soft = <T>(p: Promise<T>): Promise<T | undefined> =>
    p.catch((e) => {
      console.log(`extras ${externalId}: ${(e as Error).message}`);
      return undefined;
    });
  const [full, laps, hrZones, powerZones, weather] = await Promise.all([
    soft(fetchActivityFull(externalId, token)),
    soft(fetchActivityLaps(externalId, token)),
    soft(fetchHrTimeInZones(externalId, token)),
    soft(fetchPowerTimeInZones(externalId, token)),
    soft(fetchActivityWeather(externalId, token)),
  ]);
  const extras = garminExtras({ full, laps, hrZones, powerZones, weather });
  if (Object.keys(extras).length === 0) return false;
  await putExtras("garmin", externalId, extras);
  return true;
}

/**
 * Pull recent runs from Garmin Connect. The unofficial API has no webhook, so
 * ingestion is polled — from the app's sync button and from the scheduled cron
 * (see infra/cron.ts). Newest-first paging stops once we pass the lookback
 * window.
 *
 * Treadmill/indoor runs import too: their detail samples have no GPS but carry
 * a distance stream, and buildActivity flags a missing polyline as indoor.
 *
 * Safe to run repeatedly: putActivity is idempotent on (source, externalId), so
 * runs already imported come back as `skipped`.
 */
export async function syncGarmin(days = 30): Promise<SyncResult> {
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const token = await getValidAccessToken();

  const result: SyncResult = {
    fetched: 0,
    imported: 0,
    skipped: 0,
    linked: 0,
    errors: [],
  };

  const perPage = 20;
  let start = 0;
  outer: while (true) {
    const batch = await fetchGarminActivities(token, { start, limit: perPage });
    if (batch.length === 0) break;
    result.fetched += batch.length;

    for (const summary of batch) {
      const startEpochSec = garminStartEpochSec(summary.startTimeGMT);
      // List is newest-first, so once we cross the window we're done.
      if (startEpochSec < cutoff) break outer;
      if (!isGarminRun(summary.activityType.typeKey)) {
        result.skipped++;
        continue;
      }
      const externalId = String(summary.activityId);
      try {
        // Detail samples power the pace chart + splits; best-effort, since the
        // endpoint is heavily throttled. Fall back to summary-only metrics.
        let details;
        try {
          details = await fetchGarminActivityDetails(summary.activityId, token);
        } catch {
          details = undefined;
        }
        const { metrics, track } = garminMetrics(summary, details);
        const activity = buildActivity({
          source: "garmin",
          externalId,
          name: summary.activityName ?? "Corrida",
          sportType: summary.activityType.typeKey,
          metrics,
        });
        if (track) {
          await putChartSeries("garmin", externalId, buildChartSeries(track));
        }
        const { created } = await putActivity(activity);
        if (created) result.imported++;
        else result.skipped++;

        const linkedPlan = await linkActivityToPlan(activity);
        if (linkedPlan) {
          result.linked++;
          const title = planTitle(linkedPlan);
          await renameActivity("garmin", externalId, title);
          await updatePlan(linkedPlan.date, linkedPlan.id, {
            actualName: title,
          });
        }
        if (created) {
          // Laps/zones/weather/RPE — before enqueueing so the analysis sees
          // them. Auto-analyze only runs with a chart series (the analysis
          // needs the trace; summary-only imports can't be analyzed).
          await ingestGarminExtras(externalId, token);
          if (track) await enqueueAnalysis("garmin", externalId);
        }
      } catch (e) {
        result.errors.push(`${externalId}: ${(e as Error).message}`);
      }
    }
    start += perPage;
  }

  return result;
}
