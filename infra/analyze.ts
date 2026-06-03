/// <reference path="../.sst/platform/config.d.ts" />

import { router } from "./router";
import { table } from "./storage";
import { allSecrets } from "./secrets";

export const analyze = new sst.aws.Function("Analyze", {
  handler: "packages/functions/src/activities/analyze.handler",
  link: [table, ...allSecrets],
  timeout: "120 seconds",
  streaming: true,
  url: {
    router: {
      instance: router,
      path: "/api/analyze",
    },
  },
});
