# run

Personal running log and coach. Pulls runs from Garmin Connect, analyses each one
with Claude, and exposes an MCP server so Claude can build/edit training plans,
which are pushed to Garmin as structured workouts.

## Stack

- **SST v3** on AWS (Lambda function URLs, DynamoDB single-table, CloudFront router, S3 static site)
- **TypeScript** monorepo, **pnpm** workspaces
- **React + Vite** web (`packages/web`), Tailwind, Leaflet, Recharts
- **Hono** single-Lambda API ("lambdalith"), response streaming for the LLM routes
- **Anthropic SDK** — `claude-sonnet-5` for workout analysis, `claude-sonnet-4-6`
  for plan interpretation
- **MCP SDK** — planning tools served over stateless Streamable HTTP at `/api/mcp`
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
    plan.ts               planned runs, plan<->activity linking, compliance
    block.ts              training blocks: goal + Monday–Sunday weeks with phase/target km
    training.ts           VDOT paces, HR zones, weekly summaries
    fitness.ts            aerobic trend (pace at a fixed heart rate)
    weeks.ts              Monday-start week arithmetic
    workoutText.ts        structured workout -> pt-BR text, total distance
    stats.ts              week/month/year/total scopes
    track.ts              samples -> metrics, splits, polyline, chart series
    workout.ts            per-activity chart series, analysis, device extras
    garmin.ts             Garmin Connect client (auth, activities, workouts, training metrics)
    geo.ts                grid-cell reverse geocoding, cached in Dynamo
    heatmap.ts            thinned run geometry + cities aggregation
    parsers/              garmin, gpx
  functions/
    api.ts                every HTTP route (Hono)
    garmin/               sync, scheduled sync, plan interpretation, resolve, push
    activities/           analysis prompt, analysis, queue worker
    mcp/                  MCP server: planning tools (instructions.md as text)
    lib/                  auth, queue, response helpers
    scripts/              backfills, migrations, API probes, one-offs
  web/
    components/           Calendar, Activities, Plan, Heatmap, Trend, WorkoutDetail
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
| `PLAN#<date>#<id>` | a planned run, its structured workout and compliance |
| `BLOCK#<monday>#<id>` | a training block (cycle) and its weeks |
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
| GET | `/blocks` | list training blocks |
| DELETE | `/plans/:date/:id` | delete a planned run |
| POST | `/auth/verify` | check a write token |
| POST | `/mcp` | MCP server (creates/edits plans via tools) |
| POST | `/analyze` | streaming analysis of one run |

Plans are created only through the MCP tools — there is no `POST /plans`.

## MCP server

`/api/mcp` serves the coaching tools over stateless Streamable HTTP. It takes the
same `x-write-token` header as the other write routes. To add it to Claude Code:

```sh
claude mcp add --transport http run https://run.rfoel.dev/api/mcp \
  --header "x-write-token: <WritePassword>"
```

- **Context**: `get_training_context` (weekly summaries, Garmin training status,
  load, readiness, recent runs and analysis insights), `get_training_zones`
  (Daniels paces from Garmin's race predictions, the watch's HR zones, records),
  `get_plan_compliance` (planned vs done, per week and per run).
- **Blocks**: `create_training_block`, `update_training_block`,
  `list_training_blocks`, `delete_training_block`.
- **Plans**: `create_planned_run` / `update_planned_run` take the exact session as
  structured `workout` steps (pace bands or HR-zone targets), which go to the
  watch as is — the notes are only interpreted by an LLM when a plan has no
  authored workout. Plus `list_planned_runs`, `move_planned_run`,
  `delete_planned_run`, `clear_all_planned_runs`, `link_past_activities`.
- **Watch**: `push_to_garmin` schedules planned runs as Garmin workouts; deleting
  or moving a plan removes its workout from the watch.

A synced run links to the same day's plan whose volume it best matches, and the
plan becomes `partial` when the run covered under 80% of it. The run's analysis
then writes back whether the target was hit, the pacing pattern and RPE.

## Scheduled jobs

| Schedule | Handler | What |
|---|---|---|
| `rate(6 hours)` | `garmin/sync-cron.handler` | polls Garmin for new runs (2-day lookback); new runs go to the analyze queue |

## Web

Tabs: **Calendário**, **Corridas**, **Plano**, **Mapa** (heatmap of every run +
cities), and **Evolução** (pace at a fixed heart rate over time). All are open;
write actions are behind the write password.

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
