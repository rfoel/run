/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "run",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: {
          region: 'sa-east-1'
        }
      }
    };
  },
  async run() {
    const infra = await import("./infra");
    return {
      Url: infra.router.url,
      ApiUrl: infra.api.url,
    };
  },
});
