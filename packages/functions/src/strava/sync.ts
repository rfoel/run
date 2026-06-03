import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { buildActivity, putActivity, renameActivity } from "@run/core/activity";
import { linkActivityToPlan, planTitle, updatePlan } from "@run/core/plan";
import { streamsToTrack } from "@run/core/parsers/streams";
import { buildChartSeries, computeMetrics } from "@run/core/track";
import { putChartSeries } from "@run/core/workout";
import {
  fetchActivities,
  fetchStreams,
  getValidAccessToken,
  updateActivityName,
} from "@run/core/strava";
import { requireWriteAuth } from "../lib/auth.ts";
import { json } from "../lib/response.ts";

const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);

type Result = {
  fetched: number;
  imported: number;
  skipped: number;
  linked: number;
  errors: string[];
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const unauthorized = requireWriteAuth(event);
  if (unauthorized) return unauthorized;
  const days = Number(event.queryStringParameters?.days ?? 30);
  const accessToken = await getValidAccessToken();
  const afterEpoch = Math.floor(Date.now() / 1000) - days * 86400;

  const result: Result = {
    fetched: 0,
    imported: 0,
    skipped: 0,
    linked: 0,
    errors: [],
  };

  let page = 1;
  while (true) {
    const batch = await fetchActivities(accessToken, {
      page,
      perPage: 100,
      after: afterEpoch,
    });
    if (batch.length === 0) break;
    result.fetched += batch.length;

    for (const summary of batch) {
      if (
        !RUN_TYPES.has(summary.sport_type) &&
        !RUN_TYPES.has(summary.type)
      ) {
        result.skipped++;
        continue;
      }
      try {
        const streams = await fetchStreams(summary.id, accessToken);
        const startEpochSec = Math.floor(
          new Date(summary.start_date).getTime() / 1000,
        );
        const track = streamsToTrack(streams, startEpochSec);
        if (track.points.length < 2) {
          result.skipped++;
          continue;
        }
        const metrics = computeMetrics(track);
        const activity = buildActivity({
          source: "strava",
          externalId: String(summary.id),
          name: summary.name,
          sportType: summary.sport_type,
          metrics,
        });
        // Store the chart series unconditionally so already-imported activities
        // get backfilled on a re-sync.
        await putChartSeries(
          "strava",
          String(summary.id),
          buildChartSeries(track),
        );
        const { created } = await putActivity(activity);
        if (created) result.imported++;
        else result.skipped++;

        // Reconcile the workout title on EVERY sync (not just first import), so
        // already-imported runs that kept Strava's original name ("Corrida
        // matinal") get the plan title here too.
        const linkedPlan = await linkActivityToPlan(activity);
        if (linkedPlan) {
          result.linked++;
          const title = planTitle(linkedPlan);
          await renameActivity("strava", String(summary.id), title);
          await updatePlan(linkedPlan.date, linkedPlan.id, {
            actualName: title,
          });
          // Only push to Strava when its name is actually stale.
          if (summary.name !== title) {
            try {
              await updateActivityName(summary.id, title, accessToken);
            } catch (e) {
              result.errors.push(
                `rename ${summary.id}: ${(e as Error).message}`,
              );
            }
          }
        }
      } catch (e) {
        result.errors.push(`${summary.id}: ${(e as Error).message}`);
      }
    }
    page++;
  }

  return json(200, result);
};
