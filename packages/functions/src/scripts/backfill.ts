import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { buildActivity, putActivity, type Activity } from "@run/core/activity";
import { computeMetrics, type Track } from "@run/core/track";
import { parseGpx } from "@run/core/parsers/gpx";
import { parseFit } from "./lib/fit.ts";

const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);

type CsvRow = {
  id: string;
  date: string;
  name: string;
  sportType: string;
  filename: string;
};

function parseCsv(zip: AdmZip): CsvRow[] {
  const entry = zip.getEntry("activities.csv");
  if (!entry) throw new Error("activities.csv not found in zip");
  const csv = entry.getData().toString("utf8");
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
  return rows
    .filter((r) => RUN_TYPES.has(r["Activity Type"] ?? ""))
    .map((r) => ({
      id: r["Activity ID"] ?? "",
      date: r["Activity Date"] ?? "",
      name: r["Activity Name"] ?? "Run",
      sportType: r["Activity Type"] ?? "Run",
      filename: r["Filename"] ?? "",
    }))
    .filter((r) => r.id && r.filename);
}

async function trackFromZip(
  zip: AdmZip,
  filename: string,
): Promise<Track | null> {
  const entry = zip.getEntry(filename);
  if (!entry) return null;
  if (filename.endsWith(".gpx")) {
    return parseGpx(entry.getData().toString("utf8"));
  }
  if (filename.endsWith(".fit.gz")) {
    const res = await parseFit(entry.getData());
    return res.track;
  }
  return null;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: backfill <path-to-zip> [--dry] [--limit N]");
    process.exit(1);
  }
  const dry = process.argv.includes("--dry");
  const limitIdx = process.argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : undefined;

  const zip = new AdmZip(arg);
  const rows = parseCsv(zip);
  console.log(`${rows.length} run rows in CSV`);

  const targets = limit ? rows.slice(0, limit) : rows;
  const activities: Activity[] = [];
  let skipped = 0;
  let failed = 0;

  for (const row of targets) {
    try {
      const track = await trackFromZip(zip, row.filename);
      if (!track || track.points.length < 2) {
        skipped++;
        continue;
      }
      const metrics = computeMetrics(track);
      const activity = buildActivity({
        source: "strava",
        externalId: row.id,
        name: row.name,
        sportType: row.sportType,
        metrics,
      });
      activities.push(activity);
      if (!dry) {
        await putActivity(activity);
      }
      if (activities.length % 20 === 0) {
        console.log(`  ${activities.length}/${targets.length}`);
      }
    } catch (e) {
      failed++;
      console.error(`  fail ${row.id} (${row.filename}): ${(e as Error).message}`);
    }
  }

  console.log(
    `done. saved=${activities.length} skipped=${skipped} failed=${failed}`,
  );
  if (dry && activities.length > 0) {
    console.log("\nfirst activity:");
    console.log(JSON.stringify(activities[0], null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
