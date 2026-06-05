/// <reference path="../.sst/platform/config.d.ts" />

import { router } from "./router";
import { table } from "./storage";
import { allSecrets } from "./secrets";

export const chat = new sst.aws.Function("Chat", {
  handler: "packages/functions/src/chat/chat.handler",
  link: [table, ...allSecrets],
  runtime: "nodejs24.x",
  architecture: "arm64",
  timeout: "120 seconds",
  streaming: true,
  url: {
    router: {
      instance: router,
      path: "/api/chat",
    },
  },
});
