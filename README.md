# run

Personal running log and coach. Pulls runs from Garmin Connect, analyses each one
with Claude, and builds/edits training plans through a chat that writes back to
Garmin as structured workouts.

## Stack

- **SST v3** on AWS (Lambda function URLs, DynamoDB single-table, CloudFront router, S3 static site)
- **TypeScript** monorepo, **pnpm** workspaces
- **React + Vite** web (`packages/web`), Tailwind, Leaflet, Recharts
- **Hono** single-Lambda API ("lambdalith"), response streaming for the LLM routes
- **Anthropic SDK** — `claude-sonnet-5` for workout analysis, `claude-sonnet-4-6`
  for the coach chat and plan interpretation
- **Garmin Connect** as the only ingestion source, via its unofficial mobile API
  (no webhook exists, so runs are polled — see Scheduled jobs)

Strava is read-only legacy: runs imported before the move to Garmin still live in
the table under `source: "strava"` and deep-link back to Strava in the UI, but
nothing is ingested from it any more.

## Layout

```
infra/                    SST resources
  storage.ts              DynamoDB table
  secrets.ts              Anthropic key, write password, Garmin credentials
  analyze.ts              analysis queue + worker
  cron.ts                 scheduled Garmin sync
  api.ts                  the single API Lambda
  router.ts / web.ts      CloudFront router + static site

packages/
  core/                   domain, no Lambda glue
    activity.ts           activities + transactional stats rollups
    plan.ts               planned runs, plan<->activity linking
    stats.ts              week/month/year/total scopes
    track.ts              samples -> metrics, splits, polyline, chart series
    workout.ts            per-activity chart series, analysis, device extras
    garmin.ts             Garmin Connect client (auth, activities, workouts)
    geo.ts                grid-cell reverse geocoding, cached in Dynamo
    heatmap.ts            thinned run geometry + cities aggregation
    parsers/              garmin, gpx
  functions/
    api.ts                every HTTP route (Hono)
    garmin/               sync, scheduled sync, plan interpretation, resolve
    activities/           analysis prompt, analysis, queue worker
    chat/                 streaming coach + planning tools (prompt.md as text)
    lib/                  auth, queue, response helpers
    scripts/              backfills, migrations, API probes, one-offs
  web/
    components/           Calendar, Activities, Plan, Heatmap, Trend, Chat, WorkoutDetail
    lib/                  api client, query hooks, fitness trend, polyline, formatting
```

Single DynamoDB table (`Main`) with `pk`/`sk` + a `gsi1` index. Most items sit in
a `USER#<id>` partition, keyed by prefix:

| `sk` prefix | Holds |
|---|---|
| `ACTIVITY#<source>#<id>` | the run itself, including its polyline, splits and best efforts |
| `STREAM#<source>#<id>` | that run's chart series (kept out of the list payload) |
| `EXTRAS#<source>#<id>` | device extras: laps, HR/power zones, weather, RPE |
| `ANALYSIS#<source>#<id>` | the stored Claude analysis |
| `PLAN#<date>#<id>` | a planned run |
| `STATS#<scope>` | week / month / year / total rollups |

Geocoded grid cells live outside the user partition, under `pk: "GEO"` with
`sk: CELL#<lat>,<lon>`.

## Routes

API behind `/api` on the router. Writes require the `x-write-token` header; reads
are open.

| Method | Path | What |
|---|---|---|
| POST | `/garmin/sync` | pull recent runs (`?days=`, default 30) |
| POST | `/garmin/push` | upsert planned runs to Garmin as workouts |
| GET | `/activities` | list summaries (`?limit=&from=&to=`) |
| GET | `/activities/:source/:externalId` | one run: activity, series, analysis, plan, extras |
| POST | `/activities/:source/:externalId/resync` | refetch samples + extras for one run |
| DELETE | `/activities/:source/:externalId` | delete, unlink its plan |
| GET | `/tracks` | thinned geometry of every run, for the heatmap |
| GET | `/cities` | cities run in, with counts and bounds |
| GET | `/records` | all-time best effort per distance, with the run holding it |
| GET | `/stats` | week / month / year / total rollups |
| GET | `/plans` | list planned runs (`?from=&to=`) |
| DELETE | `/plans/:date/:id` | delete a planned run |
| POST | `/auth/verify` | check a write token |
| POST | `/chat` | streaming coach (creates/edits plans via tools) |
| POST | `/analyze` | streaming analysis of one run |

Plans are created only through the chat's tools — there is no `POST /plans`.

## Scheduled jobs

| Schedule | Handler | What |
|---|---|---|
| `rate(6 hours)` | `garmin/sync-cron.handler` | polls Garmin for new runs (2-day lookback); new runs go to the analyze queue |

## Web

Tabs: **Calendário**, **Corridas**, **Plano**, **Mapa** (heatmap of every run +
cities), **Evolução** (pace at a fixed heart rate over time), and **Treinador**
(the chat). Treinador is behind the write password; the rest are open.

## Setup

```sh
pnpm install
```

Set secrets per stage:

```sh
sst secret set AnthropicApiKey ...
sst secret set WritePassword ...
sst secret set GarminEmail ...
sst secret set GarminPassword ...
```

Garmin has no API application to register — the client logs in with those
credentials against the mobile API and caches the tokens in DynamoDB, refreshing
without the password until both tokens expire. Accounts with 2FA will not log in.

```sh
pnpm dev          # sst dev
pnpm deploy       # sst deploy
pnpm typecheck    # every package
```

One-off scripts run under `sst shell`, e.g.:

```sh
sst shell --stage production -- node packages/functions/src/scripts/init-stats.ts
```
