import { garminGet, getValidAccessToken } from "@run/core/garmin";

/**
 * Probe the read-only wellness/metrics endpoints the training tools use, and
 * print a trimmed view of each response so their shapes can be checked.
 *
 *   sst shell --stage production -- node packages/functions/src/scripts/garmin-wellness-probe.ts [YYYY-MM-DD]
 */

const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const token = await getValidAccessToken();
const profile = await garminGet<{ displayName: string }>(
  "/userprofile-service/socialProfile",
  token,
);
const name = profile.displayName;

const paths = [
  `/usersummary-service/usersummary/daily/${name}?calendarDate=${date}`,
  `/hrv-service/hrv/${date}`,
  `/wellness-service/wellness/dailySleepData/${name}?date=${date}&nonSleepBufferMinutes=60`,
  `/metrics-service/metrics/trainingreadiness/${date}`,
  `/metrics-service/metrics/trainingstatus/aggregated/${date}`,
  `/metrics-service/metrics/racepredictions/latest/${name}`,
  `/biometric-service/heartRateZones`,
];

for (const path of paths) {
  try {
    const body = await garminGet<unknown>(path, token);
    const text = JSON.stringify(body);
    console.log(`\n=== ${path.replace(name, "<name>")}\n${text.slice(0, 2500)}`);
  } catch (e) {
    console.log(`\n=== ${path.replace(name, "<name>")}\nERROR ${(e as Error).message.slice(0, 300)}`);
  }
}
