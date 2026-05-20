import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, tableName } from "./db.ts";
import { userPk, USER_ID } from "./user.ts";
import type { Metrics, Split } from "./track.ts";
import { scopesForDate, statsKey } from "./stats.ts";

export type { Split } from "./track.ts";

export type ActivitySource = "strava" | "garmin" | "apple" | "manual";

export type Activity = {
  source: ActivitySource;
  externalId: string;
  userId: string;
  startDate: string;
  name: string;
  sportType: string;
  distance: number;
  movingTime: number;
  elapsedTime: number;
  elevationGain: number;
  avgSpeed: number;
  maxSpeed: number;
  avgHr?: number;
  maxHr?: number;
  avgCadence?: number;
  hasHr: boolean;
  splits: Split[];
  polyline?: string;
  createdAt: string;
  updatedAt: string;
};

const activitySk = (source: string, externalId: string) =>
  `ACTIVITY#${source}#${externalId}`;

const activityGsi1pk = (pk: string) => `${pk}#ACTIVITY`;

export function buildActivity(args: {
  source: ActivitySource;
  externalId: string;
  name: string;
  sportType: string;
  metrics: Metrics;
  userId?: string;
}): Activity {
  const now = new Date().toISOString();
  return {
    source: args.source,
    externalId: args.externalId,
    userId: args.userId ?? USER_ID,
    startDate: args.metrics.startTime,
    name: args.name,
    sportType: args.sportType,
    distance: args.metrics.distance,
    movingTime: args.metrics.movingTime,
    elapsedTime: args.metrics.elapsedTime,
    elevationGain: args.metrics.elevationGain,
    avgSpeed: args.metrics.avgSpeed,
    maxSpeed: args.metrics.maxSpeed,
    avgHr: args.metrics.avgHr,
    maxHr: args.metrics.maxHr,
    avgCadence: args.metrics.avgCadence,
    hasHr: args.metrics.hasHr,
    splits: args.metrics.splits,
    polyline: args.metrics.polyline,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Atomically write activity and increment rollup stats. If the activity already
 * exists (same source+externalId), the put is rejected and stats are NOT
 * incremented — making this idempotent under retries / re-runs.
 */
export async function putActivity(activity: Activity) {
  const pk = userPk(activity.userId);
  const sk = activitySk(activity.source, activity.externalId);
  const scopes = scopesForDate(activity.startDate);

  const updateStats = scopes.map((scope) => ({
    Update: {
      TableName: tableName(),
      Key: statsKey(scope, activity.userId),
      UpdateExpression:
        "ADD #c :one, distance :d, movingTime :m, elapsedTime :e, elevationGain :g " +
        "SET #s = if_not_exists(#s, :scope)",
      ExpressionAttributeNames: { "#c": "count", "#s": "scope" },
      ExpressionAttributeValues: {
        ":one": 1,
        ":d": activity.distance,
        ":m": activity.movingTime,
        ":e": activity.elapsedTime,
        ":g": activity.elevationGain,
        ":scope": scope,
      },
    },
  }));

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tableName(),
              Item: {
                pk,
                sk,
                gsi1pk: activityGsi1pk(pk),
                gsi1sk: activity.startDate,
                ...activity,
              },
              ConditionExpression: "attribute_not_exists(pk)",
            },
          },
          ...updateStats,
        ],
      }),
    );
    return { created: true };
  } catch (err) {
    if ((err as { name?: string }).name === "TransactionCanceledException") {
      // Likely the condition failed (activity already exists). Skip stats update.
      return { created: false };
    }
    throw err;
  }
}

/** Upsert without touching stats. Used for backfilling stats from existing data. */
export async function putActivityRaw(activity: Activity) {
  const pk = userPk(activity.userId);
  const sk = activitySk(activity.source, activity.externalId);
  await ddb.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        pk,
        sk,
        gsi1pk: activityGsi1pk(pk),
        gsi1sk: activity.startDate,
        ...activity,
      },
    }),
  );
}

export async function getActivity(
  source: ActivitySource,
  externalId: string,
  userId: string = USER_ID,
) {
  const res = await ddb.send(
    new GetCommand({
      TableName: tableName(),
      Key: {
        pk: userPk(userId),
        sk: activitySk(source, externalId),
      },
    }),
  );
  return res.Item as Activity | undefined;
}

export async function findActivitiesOnDate(
  date: string,
  userId: string = USER_ID,
): Promise<Activity[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName(),
      IndexName: "gsi1",
      KeyConditionExpression:
        "gsi1pk = :pk AND begins_with(gsi1sk, :date)",
      ExpressionAttributeValues: {
        ":pk": activityGsi1pk(userPk(userId)),
        ":date": date,
      },
    }),
  );
  return (res.Items ?? []) as Activity[];
}

/**
 * Atomically delete activity and decrement rollup stats. If the activity does
 * not exist, the delete is a no-op and stats are NOT decremented.
 */
export async function deleteActivity(
  source: ActivitySource,
  externalId: string,
  userId: string = USER_ID,
): Promise<{ deleted: boolean }> {
  const existing = await getActivity(source, externalId, userId);
  if (!existing) return { deleted: false };
  const pk = userPk(userId);
  const sk = activitySk(source, externalId);
  const scopes = scopesForDate(existing.startDate);

  const updateStats = scopes.map((scope) => ({
    Update: {
      TableName: tableName(),
      Key: statsKey(scope, userId),
      UpdateExpression:
        "ADD #c :negOne, distance :negD, movingTime :negM, elapsedTime :negE, elevationGain :negG",
      ExpressionAttributeNames: { "#c": "count" },
      ExpressionAttributeValues: {
        ":negOne": -1,
        ":negD": -existing.distance,
        ":negM": -existing.movingTime,
        ":negE": -existing.elapsedTime,
        ":negG": -existing.elevationGain,
      },
    },
  }));

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: tableName(),
              Key: { pk, sk },
              ConditionExpression: "attribute_exists(pk)",
            },
          },
          ...updateStats,
        ],
      }),
    );
    return { deleted: true };
  } catch (err) {
    if ((err as { name?: string }).name === "TransactionCanceledException") {
      return { deleted: false };
    }
    throw err;
  }
}

export async function listActivities(opts: {
  userId?: string;
  limit?: number;
} = {}) {
  const userId = opts.userId ?? USER_ID;
  const limit = opts.limit ?? 1000;
  const items: Activity[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: tableName(),
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: {
          ":pk": activityGsi1pk(userPk(userId)),
        },
        ScanIndexForward: false,
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...((res.Items ?? []) as Activity[]));
    lastKey = res.LastEvaluatedKey;
    if (items.length >= limit) break;
  } while (lastKey);
  return items.slice(0, limit);
}
