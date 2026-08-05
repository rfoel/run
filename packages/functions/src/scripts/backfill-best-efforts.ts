import {
  listActivities,
  setActivityBestEfforts,
  type ActivitySource,
} from "@run/core/activity";
import { aggregateRecords, bestEffortsFor } from "@run/core/bestEfforts";
import { getChartSeries } from "@run/core/workout";

/**
 * Compute and store best efforts for every run already in the table. New runs
 * get theirs at ingest; this is the one-off for the history.
 *
 * Each run is scored from its sample stream when one was kept, and from its
 * per-kilometre splits otherwise — so most of the history lands on the splits
 * path, which can only start a window on a kilometre boundary. Runs with neither
 * are left alone.
 *
 * Dry run (reports the tally and the records it would produce, writes nothing):
 *   sst shell --stage production -- node packages/functions/src/scripts/backfill-best-efforts.ts
 *
 * Write:
 *   sst shell --stage production -- node packages/functions/src/scripts/backfill-best-efforts.ts --yes
 */
async function main() {
  const apply = process.argv.includes("--yes");

  // full: splits are needed for the fallback path and are projected out of the
  // summary view.
  const activities = await listActivities({ limit: 100_000, full: true });
  console.log(`${activities.length} activities`);

  const tally = { series: 0, splits: 0, neither: 0, written: 0 };
  const scored: Parameters<typeof aggregateRecords>[0] = [];

  for (const a of activities) {
    const series = await getChartSeries(a.source, a.externalId);
    const bests = bestEffortsFor({
      series,
      splits: a.splits,
      distance: a.distance,
    });
    if (bests.length === 0) {
      tally.neither++;
      continue;
    }
    if (bests[0]!.src === "series") tally.series++;
    else tally.splits++;
    scored.push({ ...a, bestEfforts: bests });

    if (apply) {
      await setActivityBestEfforts(
        a.source as ActivitySource,
        a.externalId,
        bests,
      );
      tally.written++;
      if (tally.written % 50 === 0) {
        console.log(`  written ${tally.written}`);
      }
    }
  }

  console.log(
    `\nexact (from samples): ${tally.series}` +
      `\napprox (from splits): ${tally.splits}` +
      `\nno data at all:      ${tally.neither}`,
  );
  if (apply) console.log(`written: ${tally.written}`);

  // The point of the dry run: see the records before committing to them.
  const clock = (s: number) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    if (s < 3600) return `${Math.floor(s / 60)}:${pad(s % 60)}`;
    return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  };
  console.log("\nall-time records these produce:");
  for (const r of aggregateRecords(scored)) {
    const pace = clock(r.paceSecPerKm);
    console.log(
      `  ${r.label.padEnd(14)} ${clock(r.timeSec).padStart(8)}  ${pace}/km  ` +
        `${r.startDate.slice(0, 10)}  ${r.src === "splits" ? "approx" : "exact "}  ${r.activityName}`,
    );
  }

  if (!apply) console.log("\ndry run — nothing written. Re-run with --yes.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
