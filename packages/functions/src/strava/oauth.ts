import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { Resource } from "sst";
import { saveTokens } from "@run/core/strava";
import { text } from "../lib/response.ts";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const code = event.queryStringParameters?.code;
  if (!code) return text(400, "missing code");

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: Resource.StravaClientId.value,
      client_secret: Resource.StravaClientSecret.value,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return text(500, `strava token exchange failed: ${res.status}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    athlete: { id: number };
  };
  await saveTokens({
    athleteId: data.athlete.id,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  });
  return text(200, `Linked Strava athlete ${data.athlete.id}. You can close this tab.`);
};
