import { getValidAccessToken } from "@run/core/garmin";

/**
 * Read-only probe: which Garmin course-service endpoints answer with our
 * bearer? Prints status + a short body snippet for each candidate so we know
 * the real list/get URLs before building a course-creation feature.
 *
 *   sst shell --stage production -- node packages/functions/src/scripts/garmin-course-probe.ts
 */

const GC_API = "https://connectapi.garmin.com";
const UA = "com.garmin.android.apps.connectmobile";

const CANDIDATES = [
  "/course-service/course",
  "/course-service/course/all",
  "/course-service/courses",
  "/web-gateway/course/details", // sometimes used by web
];

async function main() {
  const token = await getValidAccessToken();
  for (const path of CANDIDATES) {
    try {
      const res = await fetch(`${GC_API}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": UA,
          "Content-Type": "application/json",
        },
      });
      const body = (await res.text()).slice(0, 300);
      console.log(`\n${res.status}  GET ${path}`);
      console.log(`  ${body.replace(/\n/g, " ")}`);
    } catch (e) {
      console.log(`\nERR   GET ${path}: ${(e as Error).message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
