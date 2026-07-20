/// <reference path="../.sst/platform/config.d.ts" />

import { table } from "./storage";
import { anthropicApiKey } from "./secrets";

// Auto-analysis pipeline: the API enqueues each freshly synced run here and a
// dedicated worker Lambda runs the Claude analysis off the request path. The
// queue decouples a 30-day bulk sync (dozens of runs) from the LLM calls and
// keeps the webhook fast.
export const analyzeQueue = new sst.aws.Queue("AnalyzeQueue", {
  // Must exceed the worker timeout so an in-flight analysis isn't redelivered.
  visibilityTimeout: "150 seconds",
});

analyzeQueue.subscribe(
  {
    handler: "packages/functions/src/activities/analyze-worker.handler",
    link: [table, anthropicApiKey],
    runtime: "nodejs24.x",
    architecture: "arm64",
    memory: "1024 MB",
    timeout: "120 seconds", // one Claude call + Dynamo reads/writes
  },
  // One run per invocation: a slow LLM call shouldn't hold up (or, on crash,
  // redeliver) a whole batch of other runs.
  { batch: { size: 1 } },
);
