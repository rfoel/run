import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, tableName } from "./db.ts";
import { userPk, USER_ID } from "./user.ts";

export type StatsScope =
  | "TOTAL"
  | `YEAR#${string}`
  | `MONTH#${string}`
  | `WEEK#${string}`;

export type Stats = {
  scope: StatsScope;
  count: number;
  distance: number;
  movingTime: number;
  elapsedTime: number;
  elevationGain: number;
};

const sk = (scope: StatsScope) => `STATS#${scope}`;

export function scopesForDate(startDate: string): StatsScope[] {
  const d = new Date(startDate);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return [
    "TOTAL",
    `YEAR#${yyyy}`,
    `MONTH#${yyyy}-${mm}`,
    `WEEK#${isoWeek(d)}`,
  ];
}

/** ISO 8601 week: "2026-W19". Thursday rule. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

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
