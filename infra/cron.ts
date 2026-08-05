/// <reference path="../.sst/platform/config.d.ts" />

import { table } from "./storage";
import { allSecrets } from "./secrets";
import { analyzeQueue } from "./analyze";

// Garmin's unofficial API has no webhook, so ingestion has to be polled. Before
// this, a run only appeared once someone opened the app, unlocked it and pressed
// "sincronizar". On a schedule the run is imported — and, via the analyze queue,
// already analysed — by the time the app is next opened.
//
// Every 6 hours rather than hourly: the watch usually uploads within minutes of
// a run, but the sync re-fetches detail samples for everything inside its
// lookback window and that endpoint throttles hard. The handler's own lookback
// is short for the same reason (see garmin/sync-cron.ts).
export const garminSyncCron = new sst.aws.CronV2("GarminSync", {
  schedule: "rate(6 hours)",
  function: {
    handler: "packages/functions/src/garmin/sync-cron.handler",
    // Same links as the API: Dynamo for activities/plans/tokens, the queue to
    // hand new runs to the analysis worker, and the Garmin credentials.
    link: [table, analyzeQueue, ...allSecrets],
    runtime: "nodejs24.x",
    architecture: "arm64",
    memory: "1024 MB",
    // A run's import does a handful of throttled Garmin calls plus the extras
    // fan-out; generous, since nothing is waiting on this.
    timeout: "300 seconds",
  },
});
