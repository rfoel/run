/// <reference path="../.sst/platform/config.d.ts" />

import { router } from "./router";
import { table } from "./storage";
import { allSecrets } from "./secrets";

export const api = new sst.aws.ApiGatewayV2("Api", {});

const linked = [table, ...allSecrets];

api.route("GET /strava/webhook", {
  handler: "packages/functions/src/strava/verify.handler",
  link: linked,
});

api.route("POST /strava/webhook", {
  handler: "packages/functions/src/strava/webhook.handler",
  link: linked,
});

api.route("GET /strava/oauth/callback", {
  handler: "packages/functions/src/strava/oauth.handler",
  link: linked,
});

api.route("POST /strava/sync", {
  handler: "packages/functions/src/strava/sync.handler",
  link: linked,
  timeout: "60 seconds",
});

api.route("GET /activities", {
  handler: "packages/functions/src/activities/list.handler",
  link: linked,
});

api.route("DELETE /activities/{source}/{externalId}", {
  handler: "packages/functions/src/activities/delete.handler",
  link: linked,
});

api.route("GET /stats", {
  handler: "packages/functions/src/activities/stats.handler",
  link: linked,
});

api.route("GET /plans", {
  handler: "packages/functions/src/plans/list.handler",
  link: linked,
});

api.route("DELETE /plans/{date}/{id}", {
  handler: "packages/functions/src/plans/delete.handler",
  link: linked,
});

api.route("POST /auth/verify", {
  handler: "packages/functions/src/auth/verify.handler",
  link: linked,
});

router.route("/api", api.url, {
  rewrite: { regex: "^/api/(.*)$", to: "/$1" },
});
