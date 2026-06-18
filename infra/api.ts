/// <reference path="../.sst/platform/config.d.ts" />

import { router } from "./router";
import { table } from "./storage";
import { allSecrets } from "./secrets";

// Single "lambdalith": one Lambda serves EVERY HTTP route — including the
// streaming /chat and /analyze — via a Hono router (packages/functions/src/api.ts).
// All API traffic hits this one function, so it stays warm far more of the time
// than 13 separate per-route functions would. That's the cold-start win.
//
// - streaming: RESPONSE_STREAM invoke mode; Hono's streamHandle serves both the
//   buffered routes (plain JSON) and the streamed ones (chat/analyze).
// - splitting: dynamically-imported modules (the Anthropic SDK, pulled in lazily
//   by runChat/runAnalyze) land in their own esbuild chunk, so they never load
//   on the cold-start path of the fast routes.
export const api = new sst.aws.Function("Api", {
  handler: "packages/functions/src/api.handler",
  link: [table, ...allSecrets],
  runtime: "nodejs24.x",
  architecture: "arm64",
  memory: "2048 MB",
  timeout: "120 seconds", // accommodates /strava/sync and the LLM routes
  streaming: true,
  // splitting: lazily-imported heavy modules (Anthropic SDK) get their own chunk.
  // loader: the coach's system prompt lives in chat/prompt.md and is imported as text.
  nodejs: { splitting: true, loader: { ".md": "text" } },
  url: true,
});

// Router strips the `/api` prefix; Hono mounts routes without it.
router.route("/api", api.url, {
  rewrite: { regex: "^/api/(.*)$", to: "/$1" },
});
