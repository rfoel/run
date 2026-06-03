import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { buildActivity, putActivity, renameActivity } from "@run/core/activity";
import { linkActivityToPlan, planTitle, updatePlan } from "@run/core/plan";
import { buildChartSeries, computeMetrics } from "@run/core/track";
import { streamsToTrack } from "@run/core/parsers/streams";
import { putChartSeries } from "@run/core/workout";
import {
  fetchActivity,
  fetchStreams,
  getValidAccessToken,
  updateActivityName,
} from "@run/core/strava";
import { json } from "../lib/response.ts";

type StravaEvent = {
  object_type: "activity" | "athlete";
  object_id: number;
  aspect_type: "create" | "update" | "delete";
  owner_id: number;
  subscription_id: number;
  event_time: number;
  updates?: Record<string, string>;
};

const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (!event.body) {
    console.log("webhook: missing body");
    return json(400, { error: "missing body" });
  }
  const payload = JSON.parse(event.body) as StravaEvent;
  console.log("webhook payload", JSON.stringify(payload));

  if (payload.object_type !== "activity") {
    console.log(`skip: object_type=${payload.object_type}`);
    return json(200, { skipped: true });
  }
  if (payload.aspect_type === "delete") {
    console.log(`skip: delete event for ${payload.object_id}`);
    return json(200, { ok: true });
  }

  const accessToken = await getValidAccessToken();
  const raw = await fetchActivity(payload.object_id, accessToken);
  console.log(`fetched ${raw.id} sport=${raw.sport_type} type=${raw.type}`);
  if (!RUN_TYPES.has(raw.sport_type) && !RUN_TYPES.has(raw.type)) {
    return json(200, { skipped: "not a run" });
  }

  const startEpochSec = Math.floor(new Date(raw.start_date).getTime() / 1000);
  const streams = await fetchStreams(payload.object_id, accessToken);
  const track = streamsToTrack(streams, startEpochSec);
  console.log(`track points=${track.points.length}`);
  if (track.points.length < 2) {
    return json(200, { skipped: "track too short" });
  }

  const metrics = computeMetrics(track);
  const activity = buildActivity({
    source: "strava",
    externalId: String(raw.id),
    name: raw.name,
    sportType: raw.sport_type,
    metrics,
  });
  await putChartSeries("strava", String(raw.id), buildChartSeries(track));
  const { created } = await putActivity(activity);
  console.log(`put activity ${activity.externalId} created=${created}`);
  let linkedPlanId: string | null = null;
  if (created) {
    const linkedPlan = await linkActivityToPlan(activity);
    linkedPlanId = linkedPlan?.id ?? null;
    console.log(`linked plan=${linkedPlanId}`);
    if (linkedPlan) {
      const title = planTitle(linkedPlan);
      // Keep our copy and the plan snapshot on the workout title too, so the
      // app shows "4km tempo…" rather than Strava's original "Corrida matinal".
      await renameActivity("strava", String(raw.id), title);
      await updatePlan(linkedPlan.date, linkedPlan.id, { actualName: title });
      try {
        await updateActivityName(raw.id, title, accessToken);
        console.log(`renamed strava ${raw.id} -> ${title}`);
      } catch (e) {
        console.log(`rename failed: ${(e as Error).message}`);
      }
    }
  }
  return json(200, {
    ok: true,
    externalId: activity.externalId,
    linkedPlanId,
  });
};
