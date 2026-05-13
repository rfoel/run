import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { requireWriteAuth } from "../lib/auth.ts";
import { json } from "../lib/response.ts";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const unauthorized = requireWriteAuth(event);
  if (unauthorized) return unauthorized;
  return json(200, { ok: true });
};
