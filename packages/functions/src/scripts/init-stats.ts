import {
  BatchWriteCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, tableName } from "@run/core/db";
import { listActivities, type Activity } from "@run/core/activity";
import { scopesForDate, statsKey, type StatsScope } from "@run/core/stats";
import { userPk, USER_ID } from "@run/core/user";

type Accumulator = {
  scope: StatsScope;
  count: number;
  distance: number;
  movingTime: number;
  elapsedTime: number;
  elevationGain: number;
};

async function deleteExistingStats(userId: string) {
  let lastKey: Record<string, unknown> | undefined;
  const keys: { pk: string; sk: string }[] = [];
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": userPk(userId),
          ":prefix": "STATS#",
        },
        ExclusiveStartKey: lastKey,
      }),
    );
    for (const item of res.Items ?? []) {
      keys.push({ pk: item.pk as string, sk: item.sk as string });
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  for (let i = 0; i < keys.length; i += 25) {
    const batch = keys.slice(i, i + 25);
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName()]: batch.map((k) => ({ DeleteRequest: { Key: k } })),
        },
      }),
    );
  }
  console.log(`deleted ${keys.length} existing STATS items`);
}

function accumulate(activities: Activity[]): Map<string, Accumulator> {
  const acc = new Map<string, Accumulator>();
  for (const a of activities) {
    for (const scope of scopesForDate(a.startDate)) {
      const cur = acc.get(scope) ?? {
        scope,
        count: 0,
        distance: 0,
        movingTime: 0,
        elapsedTime: 0,
        elevationGain: 0,
      };
      cur.count++;
      cur.distance += a.distance;
      cur.movingTime += a.movingTime;
      cur.elapsedTime += a.elapsedTime;
      cur.elevationGain += a.elevationGain;
      acc.set(scope, cur);
    }
  }
  return acc;
}

async function main() {
  const userId = USER_ID;
  console.log(`recomputing stats for user=${userId}`);

  await deleteExistingStats(userId);

  console.log("fetching all activities...");
  const activities = await listActivities({ limit: 100000 });
  console.log(`got ${activities.length} activities`);

  const acc = accumulate(activities);
  console.log(`computed ${acc.size} STATS scopes`);

  for (const stat of acc.values()) {
    await ddb.send(
      new PutCommand({
        TableName: tableName(),
        Item: { ...statsKey(stat.scope, userId), ...stat },
      }),
    );
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
