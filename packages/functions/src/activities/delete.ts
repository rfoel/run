import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  deleteActivity,
  getActivity,
  type ActivitySource,
} from "@run/core/activity";
import { unlinkActivityFromPlan } from "@run/core/plan";
import { requireWriteAuth } from "../lib/auth.ts";
import { json } from "../lib/response.ts";

const SOURCES = new Set<ActivitySource>(["strava", "garmin", "apple", "manual"]);

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const unauthorized = requireWriteAuth(event);
  if (unauthorized) return unauthorized;
  const source = event.pathParameters?.source as ActivitySource | undefined;
  const externalId = event.pathParameters?.externalId;
  if (!source || !externalId) {
    return json(400, { error: "missing source or externalId" });
  }
  if (!SOURCES.has(source)) {
    return json(400, { error: "invalid source" });
  }
  const existing = await getActivity(source, externalId);
  if (!existing) return json(404, { error: "not found" });
  const { deleted } = await deleteActivity(source, externalId);
  const unlinked = deleted
    ? await unlinkActivityFromPlan(source, externalId, existing.startDate)
    : 0;
  return json(200, { ok: true, deleted, unlinked });
};
