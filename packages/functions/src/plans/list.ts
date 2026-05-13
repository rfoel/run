import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { listPlans } from "@run/core/plan";
import { json } from "../lib/response.ts";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const from = event.queryStringParameters?.from;
  const to = event.queryStringParameters?.to;
  const items = await listPlans({ from, to });
  return json(200, { items });
};
