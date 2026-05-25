import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { listActivities, type Activity } from "@run/core/activity";
import { json } from "../lib/response.ts";

type ActivitySummary = Omit<Activity, "polyline" | "splits">;

const strip = (a: Activity): ActivitySummary => {
  const { polyline: _p, splits: _s, ...rest } = a;
  return rest;
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const qs = event.queryStringParameters ?? {};
  const limit = Number(qs.limit ?? 1000);
  const from = qs.from || undefined;
  const to = qs.to || undefined;
  const items = await listActivities({ limit, from, to });
  return json(200, { items: items.map(strip) });
};
