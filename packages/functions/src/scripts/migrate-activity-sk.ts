import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, tableName } from "@run/core/db";
import { userPk, USER_ID } from "@run/core/user";

/**
 * Migrate ACTIVITY items from old SK (`ACTIVITY#<date>#<source>#<id>`) to
 * new SK (`ACTIVITY#<source>#<id>`). Also dedupes — when both old and new
 * formats exist for the same Strava ID, keeps the richest record (most
 * splits) and deletes the rest. Old gsi1pk (`...#SPORT#<type>`) is rewritten
 * to the new `...#ACTIVITY` form.
 *
 * After running this, run init-stats to recompute STATS rollups.
 */
async function main() {
  const userId = USER_ID;
  const pk = userPk(userId);

  let lastKey: Record<string, unknown> | undefined;
  const all: Record<string, unknown>[] = [];
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": pk,
          ":prefix": "ACTIVITY#",
        },
        ExclusiveStartKey: lastKey,
      }),
    );
    all.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  console.log(`scanned ${all.length} ACTIVITY items`);

  const groups = new Map<string, Record<string, unknown>[]>();
  for (const item of all) {
    const key = `${item.source}:${item.externalId}`;
    const arr = groups.get(key) ?? [];
    arr.push(item);
    groups.set(key, arr);
  }

  console.log(`${groups.size} unique (source, externalId) groups`);

  let written = 0;
  let deletedOld = 0;

  for (const [, items] of groups) {
    items.sort((a, b) => {
      const sa = Array.isArray(a.splits) ? a.splits.length : 0;
      const sb = Array.isArray(b.splits) ? b.splits.length : 0;
      return sb - sa;
    });
    const best = items[0]!;
    const newSk = `ACTIVITY#${best.source}#${best.externalId}`;
    const newGsi1pk = `${pk}#ACTIVITY`;

    // Delete every item in the group first (including any that already has the
    // target sk — we'll write the canonical one fresh below).
    for (const item of items) {
      await ddb.send(
        new DeleteCommand({
          TableName: tableName(),
          Key: { pk: item.pk, sk: item.sk },
        }),
      );
      deletedOld++;
    }

    await ddb.send(
      new PutCommand({
        TableName: tableName(),
        Item: {
          ...best,
          pk,
          sk: newSk,
          gsi1pk: newGsi1pk,
          gsi1sk: best.startDate,
        },
      }),
    );
    written++;

    if (written % 50 === 0) console.log(`  ${written}/${groups.size}`);
  }

  console.log(
    `done. groups=${groups.size} written=${written} deleted=${deletedOld}`,
  );
  console.log(`\nNext: re-run init-stats to recompute STATS rollups.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
