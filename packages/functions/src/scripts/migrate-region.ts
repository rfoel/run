import {
  DynamoDBClient,
  ScanCommand,
  BatchWriteItemCommand,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";

/**
 * One-off cross-region copy of a DynamoDB table, item-for-item.
 *
 * Used for the us-east-1 → sa-east-1 migration of the `run` production table.
 * Items are copied as raw AttributeValues, so every type (and the gsi1 keys)
 * is preserved exactly. Idempotent: re-running overwrites by primary key, so
 * it's safe to run again if interrupted.
 *
 * This script talks to two regions by explicit table name and does NOT use SST
 * resource linking, so run it with plain node + AWS creds (no `sst shell`):
 *
 *   node packages/functions/src/scripts/migrate-region.ts \
 *     --source-table run-production-MainTable-dbourrhw --source-region us-east-1 \
 *     --target-table <new-sa-east-1-table-name>        --target-region sa-east-1
 *
 * Flags: --dry (count only, no writes)
 */

function arg(name: string, required = true): string {
  const i = process.argv.indexOf(name);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v && required) throw new Error(`missing ${name}`);
  return v ?? "";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const sourceTable = arg("--source-table");
  const sourceRegion = arg("--source-region");
  const targetTable = arg("--target-table");
  const targetRegion = arg("--target-region");
  const dry = process.argv.includes("--dry");

  const src = new DynamoDBClient({ region: sourceRegion });
  const dst = new DynamoDBClient({ region: targetRegion });

  console.log(
    `copy ${sourceTable}@${sourceRegion} -> ${targetTable}@${targetRegion}${
      dry ? " (dry)" : ""
    }`,
  );

  let scanned = 0;
  let written = 0;
  let startKey: Record<string, AttributeValue> | undefined;

  do {
    const page = await src.send(
      new ScanCommand({ TableName: sourceTable, ExclusiveStartKey: startKey }),
    );
    const items = page.Items ?? [];
    scanned += items.length;
    startKey = page.LastEvaluatedKey;

    if (!dry) {
      // BatchWriteItem caps at 25 items per call.
      for (let i = 0; i < items.length; i += 25) {
        let batch = items.slice(i, i + 25);
        let attempt = 0;
        while (batch.length) {
          const res = await dst.send(
            new BatchWriteItemCommand({
              RequestItems: {
                [targetTable]: batch.map((Item) => ({ PutRequest: { Item } })),
              },
            }),
          );
          const unprocessed = res.UnprocessedItems?.[targetTable] ?? [];
          written += batch.length - unprocessed.length;
          batch = unprocessed
            .map((r) => r.PutRequest?.Item)
            .filter((x): x is Record<string, AttributeValue> => !!x);
          if (batch.length) {
            attempt++;
            await sleep(Math.min(1000, 50 * 2 ** attempt)); // backoff
          }
        }
      }
    }
    process.stdout.write(`\r  scanned=${scanned} written=${written}`);
  } while (startKey);

  console.log(`\ndone. scanned=${scanned} written=${written}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
