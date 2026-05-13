import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { deletePlan } from "@run/core/plan";
import { json } from "../lib/response.ts";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const date = event.pathParameters?.date;
  const id = event.pathParameters?.id;
  if (!date || !id) return json(400, { error: "missing date or id" });
  await deletePlan(date, id);
  return json(200, { ok: true });
};
