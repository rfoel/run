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

/**
 * The write token from whichever header carries it: the web app sends
 * `x-write-token`; MCP clients that only offer standard header names send
 * `Authorization` (with or without a "Bearer " prefix) or `x-api-key`.
 */
export function writeTokenFrom(headers: HeadersLike): string | undefined {
  const direct = getHeader(headers, "x-write-token") ?? getHeader(headers, "x-api-key");
  if (direct) return direct.trim();
  const auth = getHeader(headers, "authorization")?.trim();
  return auth ? auth.replace(/^bearer\s+/i, "") : undefined;
}

export function isAuthorized(headers: HeadersLike): boolean {
  const expected = Resource.WritePassword.value;
  if (!expected) return false;
  const provided = writeTokenFrom(headers);
  return !!provided && provided === expected;
}

export function requireWriteAuth(event: {
  headers?: HeadersLike;
}): APIGatewayProxyResultV2 | null {
  if (isAuthorized(event.headers)) return null;
  return json(401, { error: "unauthorized" });
}
