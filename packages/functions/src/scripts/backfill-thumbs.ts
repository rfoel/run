import {
  listActivities,
  setActivityThumb,
  type ActivitySource,
} from "@run/core/activity";
import { routeThumb } from "@run/core/routeThumb";

/**
 * Compute and store the route thumbnail for every run already in the table.
 * New runs get theirs at ingest; this is the one-off for the history. Indoor
 * runs have no route and are skipped.
 *
 * Dry run (reports the tally and sizes, writes nothing):
 *   sst shell --stage production -- node packages/functions/src/scripts/backfill-thumbs.ts
 *
 * Write:
 *   sst shell --stage production -- node packages/functions/src/scripts/backfill-thumbs.ts --yes
 */
async function main() {
  const apply = process.argv.includes("--yes");

  // full: the route polyline is projected out of the summary view.
  const activities = await listActivities({ limit: 100_000, full: true });
  console.log(`${activities.length} activities`);

  const tally = { thumbed: 0, noRoute: 0, written: 0, bytes: 0 };
  for (const a of activities) {
    const thumb = routeThumb(a.polyline);
    if (!thumb) {
      tally.noRoute++;
      continue;
    }
    tally.thumbed++;
    tally.bytes += thumb.length;
    if (apply) {
      await setActivityThumb(a.source as ActivitySource, a.externalId, thumb);
      tally.written++;
      if (tally.written % 100 === 0) console.log(`  written ${tally.written}`);
    }
  }

  console.log(
    `\nwith a route: ${tally.thumbed}` +
      `\nno route:     ${tally.noRoute}` +
      `\navg size:     ${Math.round(tally.bytes / Math.max(tally.thumbed, 1))} bytes`,
  );
  if (apply) console.log(`written: ${tally.written}`);
  else console.log("\ndry run — pass --yes to write.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
