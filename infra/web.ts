/// <reference path="../.sst/platform/config.d.ts" />

import { router } from "./router";

export const web = new sst.aws.StaticSite("Web", {
  path: "packages/web",
  build: {
    command: "pnpm build",
    output: "dist",
  },
  environment: {
    VITE_API_URL: "/api",
  },
  router: {
    instance: router,
  },
});
