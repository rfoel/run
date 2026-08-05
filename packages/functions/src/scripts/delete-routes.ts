import { DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, tableName } from "@run/core/db";
import { userPk, USER_ID } from "@run/core/user";

/**
 * Delete the ROUTE# items left behind by the removed course-builder feature.
 * Nothing reads them any more, so this is pure cleanup.
 *
 * Dry run (lists what it would delete, changes nothing):
 *   sst shell --stage production -- node packages/functions/src/scripts/delete-routes.ts
 *
 * Actually delete:
 *   sst shell --stage production -- node packages/functions/src/scripts/delete-routes.ts --yes
 */
async function main() {
  const apply = process.argv.includes("--yes");
  const pk = userPk(USER_ID);

  const items: { pk: string; sk: string; name?: string; createdAt?: string }[] =
    [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: { ":pk": pk, ":prefix": "ROUTE#" },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...((res.Items ?? []) as typeof items));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  console.log(`found ${items.length} ROUTE# items`);
  for (const item of items) {
    console.log(`  ${item.sk}  ${item.name ?? "(sem nome)"}  ${item.createdAt ?? ""}`);
  }
  if (items.length === 0) return;

  if (!apply) {
    console.log("\ndry run — nothing deleted. Re-run with --yes to delete.");
    return;
  }

  let deleted = 0;
  for (const item of items) {
    await ddb.send(
      new DeleteCommand({
        TableName: tableName(),
        Key: { pk: item.pk, sk: item.sk },
      }),
    );
    deleted++;
  }
  console.log(`\ndeleted ${deleted} items`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
