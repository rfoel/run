import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import { ddb, tableName } from "./db.ts";
import { userPk, USER_ID } from "./user.ts";
import type { StravaStreamSet } from "./parsers/streams.ts";

export type StravaTokens = {
  athleteId: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

const tokenSk = () => "STRAVA#TOKENS";

export async function saveTokens(tokens: StravaTokens, userId: string = USER_ID) {
  await ddb.send(
    new PutCommand({
      TableName: tableName(),
      Item: { pk: userPk(userId), sk: tokenSk(), ...tokens },
    }),
  );
}

export async function loadTokens(
  userId: string = USER_ID,
): Promise<StravaTokens | undefined> {
  const res = await ddb.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: tokenSk() },
    }),
  );
  return res.Item as StravaTokens | undefined;
}

export async function getValidAccessToken(userId: string = USER_ID) {
  const tokens = await loadTokens(userId);
  if (!tokens) throw new Error("No Strava tokens stored. Run OAuth flow.");
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expiresAt - 60 > now) return tokens.accessToken;
  const refreshed = await refreshTokens(tokens.refreshToken);
  await saveTokens({ ...refreshed, athleteId: tokens.athleteId }, userId);
  return refreshed.accessToken;
}

async function refreshTokens(refreshToken: string) {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: Resource.StravaClientId.value,
      client_secret: Resource.StravaClientSecret.value,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Strava refresh failed: ${res.status}`);
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_at,
  };
}

export type StravaActivityRaw = {
  id: number;
  athlete: { id: number };
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  has_heartrate: boolean;
};

export async function fetchActivity(stravaId: number, accessToken: string) {
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${stravaId}?include_all_efforts=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Strava activity fetch failed: ${res.status}`);
  return (await res.json()) as StravaActivityRaw;
}

export async function fetchActivities(
  accessToken: string,
  opts: { page?: number; perPage?: number; before?: number; after?: number } = {},
): Promise<StravaActivityRaw[]> {
  const params = new URLSearchParams();
  if (opts.page) params.set("page", String(opts.page));
  if (opts.perPage) params.set("per_page", String(opts.perPage));
  if (opts.before) params.set("before", String(opts.before));
  if (opts.after) params.set("after", String(opts.after));
  const res = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Strava list failed: ${res.status}`);
  return (await res.json()) as StravaActivityRaw[];
}

const STREAM_KEYS = "time,latlng,altitude,heartrate,cadence";

export async function fetchStreams(
  stravaId: number,
  accessToken: string,
): Promise<StravaStreamSet> {
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${stravaId}/streams?keys=${STREAM_KEYS}&key_by_type=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Strava streams fetch failed: ${res.status}`);
  return (await res.json()) as StravaStreamSet;
}
