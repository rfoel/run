import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { buildActivity, putActivity } from "@run/core/activity";
import { linkActivityToPlan } from "@run/core/plan";
import { computeMetrics } from "@run/core/track";
import { streamsToTrack } from "@run/core/parsers/streams";
import {
  fetchActivity,
  fetchStreams,
  getValidAccessToken,
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
  const { created } = await putActivity(activity);
  console.log(`put activity ${activity.externalId} created=${created}`);
  let linkedPlanId: string | null = null;
  if (created) {
    linkedPlanId = await linkActivityToPlan(activity);
    console.log(`linked plan=${linkedPlanId}`);
  }
  return json(200, {
    ok: true,
    externalId: activity.externalId,
    linkedPlanId,
  });
};
