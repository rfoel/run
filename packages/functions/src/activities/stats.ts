import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getStatsMany, isoWeek, type StatsScope } from "@run/core/stats";
import { json } from "../lib/response.ts";

export const handler: APIGatewayProxyHandlerV2 = async () => {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const scopes: StatsScope[] = [
    "TOTAL",
    `YEAR#${yyyy}`,
    `MONTH#${yyyy}-${mm}`,
    `WEEK#${isoWeek(now)}`,
  ];
  const map = await getStatsMany(scopes);
  return json(200, {
    total: map["TOTAL"],
    year: map[`YEAR#${yyyy}`],
    month: map[`MONTH#${yyyy}-${mm}`],
    week: map[`WEEK#${isoWeek(now)}`],
  });
};
