import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { Resource } from "sst";
import { json, text } from "../lib/response.ts";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const qs = event.queryStringParameters ?? {};
  const mode = qs["hub.mode"];
  const token = qs["hub.verify_token"];
  const challenge = qs["hub.challenge"];
  if (mode !== "subscribe" || token !== Resource.StravaVerifyToken.value) {
    return text(403, "forbidden");
  }
  return json(200, { "hub.challenge": challenge });
};
