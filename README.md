# run

Personal Strava-driven running coach. Pulls activities from Strava, builds/edits training plans via Claude with tool use, streams chat back to a small web UI.

## Stack

- **SST v3** on AWS (API Gateway v2, Lambda, DynamoDB single-table, CloudFront router, S3 static site)
- **TypeScript** monorepo, **pnpm** workspaces
- **React + Vite** web (`packages/web`)
- **Anthropic SDK** (`claude-sonnet-4-6`) with streaming + tool use for the coach
- **Strava** OAuth + webhook for activity ingest

## Layout

```
infra/                  SST resources (api, chat fn, router, dynamo, secrets, web)
packages/
  core/                 domain: activities, plans, stats, strava client, dynamo helpers
  functions/            Lambda handlers
    strava/             oauth, webhook, verify, sync
    activities/         list, stats
    plans/              list, delete
    chat/               streaming chat + planning tools
    scripts/            one-off migrations
  web/                  React app (Activities + chat)
```

Single DynamoDB table (`Main`) with `pk`/`sk` + `gsi1`.

## Routes

API behind `/api` on the router:

| Method | Path | Handler |
|---|---|---|
| GET | `/strava/webhook` | strava/verify |
| POST | `/strava/webhook` | strava/webhook |
| GET | `/strava/oauth/callback` | strava/oauth |
| POST | `/strava/sync` | strava/sync |
| GET | `/activities` | activities/list |
| GET | `/stats` | activities/stats |
| GET | `/plans` | plans/list |
| DELETE | `/plans/{date}/{id}` | plans/delete |
| POST | `/chat` | chat (streaming Lambda function URL) |

## Setup

```sh
pnpm install
```

Set secrets per stage:

```sh
sst secret set StravaClientId ...
sst secret set StravaClientSecret ...
sst secret set StravaVerifyToken ...
sst secret set AnthropicApiKey ...
```

Strava webhook subscription must point at `https://<router-domain>/api/strava/webhook` with the same verify token.

## Dev

```sh
pnpm dev          # sst dev
pnpm typecheck    # all packages
```

## Deploy

```sh
pnpm deploy --stage production
```

Production stage is `protect`ed and uses `retain` removal policy.

## Chat tools

Coach can call: `list_planned_runs`, `create_planned_run`, `update_planned_run`, `move_planned_run`, `delete_planned_run`, `clear_all_planned_runs`, `link_past_activities`. Max 12 tool rounds per turn. Week = Mon–Sun in athlete's calendar.
