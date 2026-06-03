import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getActivity, type ActivitySource } from "@run/core/activity";
import { getChartSeries, getAnalysis } from "@run/core/workout";
import { listPlans, type PlannedRun } from "@run/core/plan";
import { json } from "../lib/response.ts";

const SOURCES = new Set(["strava", "garmin", "apple", "manual"]);

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const source = event.pathParameters?.source;
  const externalId = event.pathParameters?.externalId
    ? decodeURIComponent(event.pathParameters.externalId)
    : undefined;
  if (!source || !SOURCES.has(source) || !externalId) {
    return json(400, { error: "bad source/externalId" });
  }

  const activity = await getActivity(source as ActivitySource, externalId);
  if (!activity) return json(404, { error: "not found" });

  const [series, analysis] = await Promise.all([
    getChartSeries(source, externalId),
    getAnalysis(source, externalId),
  ]);

  // The linked plan carries the prescription (notes / target pace / type).
  const date = activity.startDate.slice(0, 10);
  const plans = await listPlans({ from: date, to: date });
  const plan: PlannedRun | undefined = plans.find(
    (p) => p.actualSource === source && p.actualExternalId === externalId,
  );

  return json(200, {
    activity,
    series: series ?? null,
    analysis: analysis ?? null,
    plan: plan ?? null,
  });
};
