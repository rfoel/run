import { Resource } from "sst";
import type { APIGatewayProxyResultV2 } from "aws-lambda";
import { json } from "./response.ts";

type HeadersLike = Record<string, string | undefined> | undefined;

function getHeader(headers: HeadersLike, name: string): string | undefined {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) return v;
  }
  return undefined;
}

export function isAuthorized(headers: HeadersLike): boolean {
  const expected = Resource.WritePassword.value;
  if (!expected) return false;
  const provided = getHeader(headers, "x-write-token");
  return !!provided && provided === expected;
}

export function requireWriteAuth(event: {
  headers?: HeadersLike;
}): APIGatewayProxyResultV2 | null {
  if (isAuthorized(event.headers)) return null;
  return json(401, { error: "unauthorized" });
}
