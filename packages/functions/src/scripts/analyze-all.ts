import { listActivities } from "@run/core/activity";
import { analyzeActivity } from "../activities/analyze.ts";

/**
 * Re-analyze every Garmin run (regenerates the analysis with device laps,
 * RPE, weather — and renames the activity to the execution-based title).
 *   sst shell --stage production -- node packages/functions/src/scripts/analyze-all.ts [--limit N]
 */
const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

const runs = (await listActivities({ limit: 10000 })).filter(
  (a) => a.source === "garmin",
);
console.log(`${runs.length} garmin runs`);

let n = 0;
for (const a of runs) {
  if (n >= limit) break;
  try {
    const res = await analyzeActivity("garmin", a.externalId);
    n++;
    console.log(`${a.startDate.slice(0, 10)} "${a.name}" -> "${res.title}"`);
  } catch (e) {
    console.log(`FAIL ${a.externalId} "${a.name}": ${(e as Error).message}`);
  }
}
console.log(`done: ${n} re-analyzed`);
