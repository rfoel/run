import { getValidAccessToken } from "@run/core/garmin";

/**
 * Read-only probe: what does Garmin's activity-service expose for one
 * activity beyond the summary/details we already ingest? Prints each
 * endpoint's status and a compact view of its payload (keys + a few values)
 * so we can decide what's worth pulling into the app.
 *
 *   sst shell --stage production -- node packages/functions/src/scripts/garmin-activity-probe.ts <activityId>
 */

const GC_API = "https://connectapi.garmin.com";
const UA = "com.garmin.android.apps.connectmobile";

const id = process.argv[2] ?? "23618280127";

const ENDPOINTS = [
  `/activity-service/activity/${id}`,
  `/activity-service/activity/${id}/splits`,
  `/activity-service/activity/${id}/typedsplits`,
  `/activity-service/activity/${id}/split_summaries`,
  `/activity-service/activity/${id}/hrTimeInZones`,
  `/activity-service/activity/${id}/powerTimeInZones`,
  `/activity-service/activity/${id}/weather`,
  `/activity-service/activity/${id}/details?maxChartSize=2&maxPolylineSize=2`,
  `/activity-service/activity/${id}/exerciseSets`,
  `/metrics-service/metrics/maxmet/latest`,
];

function compact(v: unknown, depth = 0): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return `[${v.length}x ${compact(v[0], depth + 1)}]`;
  }
  const entries = Object.entries(v as Record<string, unknown>);
  if (depth >= 2) return `{${entries.map(([k]) => k).join(",")}}`;
  return `{${entries
    .map(([k, val]) => `${k}:${compact(val, depth + 1)}`)
    .join(", ")}}`;
}

async function main() {
  const token = await getValidAccessToken();
  for (const path of ENDPOINTS) {
    try {
      const res = await fetch(`${GC_API}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": UA,
          "Content-Type": "application/json",
        },
      });
      const text = await res.text();
      console.log(`\n=== ${res.status}  GET ${path}`);
      if (!res.ok) {
        console.log(`  ${text.slice(0, 200)}`);
        continue;
      }
      try {
        const j = JSON.parse(text) as {
          metricDescriptors?: { key: string; unit?: { key?: string } }[];
        };
        if (j.metricDescriptors) {
          console.log(
            j.metricDescriptors
              .map((d) => `  ${d.key}${d.unit?.key ? ` (${d.unit.key})` : ""}`)
              .join("\n"),
          );
        } else console.log(compact(j).slice(0, 4000));
      } catch {
        console.log(text.slice(0, 500));
      }
    } catch (e) {
      console.log(`\nERR   GET ${path}: ${(e as Error).message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
