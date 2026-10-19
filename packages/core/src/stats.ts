import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, tableName } from "./db.ts";
import { userPk, USER_ID } from "./user.ts";
import type { StatsScope } from "./statsScope.ts";

export { isoWeek, scopesForDate, type StatsScope } from "./statsScope.ts";

export type Stats = {
  scope: StatsScope;
  count: number;
  distance: number;
  movingTime: number;
  elapsedTime: number;
  elevationGain: number;
};

const sk = (scope: StatsScope) => `STATS#${scope}`;

export async function getStats(
  scope: StatsScope,
  userId: string = USER_ID,
): Promise<Stats | undefined> {
  const res = await ddb.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: sk(scope) },
    }),
  );
  return res.Item as Stats | undefined;
}

export async function getStatsMany(
  scopes: StatsScope[],
  userId: string = USER_ID,
): Promise<Record<string, Stats>> {
  const results = await Promise.all(scopes.map((s) => getStats(s, userId)));
  const out: Record<string, Stats> = {};
  for (let i = 0; i < scopes.length; i++) {
    const r = results[i];
    if (r) out[scopes[i]!] = r;
  }
  return out;
}

export const statsKey = (scope: StatsScope, userId: string = USER_ID) => ({
  pk: userPk(userId),
  sk: sk(scope),
});

export async function listStatsByPrefix(
  prefix: "YEAR" | "MONTH" | "WEEK",
  userId: string = USER_ID,
): Promise<Stats[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": userPk(userId),
        ":prefix": `STATS#${prefix}#`,
      },
      ScanIndexForward: false,
    }),
  );
  return (res.Items ?? []) as Stats[];
}
