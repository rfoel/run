import type { APIGatewayProxyResultV2 } from "aws-lambda";

export const json = (
  status: number,
  body: unknown,
): APIGatewayProxyResultV2 => ({
  statusCode: status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const text = (
  status: number,
  body: string,
): APIGatewayProxyResultV2 => ({
  statusCode: status,
  headers: { "Content-Type": "text/plain" },
  body,
});
