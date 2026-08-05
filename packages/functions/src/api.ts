import { Hono } from "hono";
import { streamHandle } from "hono/aws-lambda";
import { stream } from "hono/streaming";

import {
  deleteActivity,
  getActivity,
  listActivities,
  setActivityBestEfforts,
  type Activity,
  type ActivitySource,
} from "@run/core/activity";
import { aggregateRecords, bestEffortsFor } from "@run/core/bestEfforts";
import {
  deletePlan,
  listPlans,
  unlinkActivityFromPlan,
  updatePlan,
  type PlannedRun,
} from "@run/core/plan";
import { listCities, listHeatmapTracks } from "@run/core/heatmap";
import { getStatsMany, isoWeek, type StatsScope } from "@run/core/stats";
import {
  deleteWorkoutItems,
  getAnalysis,
  getChartSeries,
  getExtras,
  putChartSeries,
} from "@run/core/workout";
import { buildChartSeries } from "@run/core/track";
import {
  createWorkout,
  fetchActivityDetails as fetchGarminActivityDetails,
  getValidAccessToken as getGarminAccessToken,
  scheduleWorkout,
  updateWorkout,
} from "@run/core/garmin";
import { detailsToTrack } from "@run/core/parsers/garmin";
import { resolvePlanWorkouts } from "./garmin/resolve.ts";
import { ingestGarminExtras, syncGarmin } from "./garmin/sync.ts";
import { isAuthorized } from "./lib/auth.ts";

// Read endpoints: let the browser (and any private cache) serve repeats for a
// short window. `private` keeps personal data out of shared/CDN caches; the
// front-end's TanStack Query is the primary cache, this just covers hard
// reloads and complements it. stale-while-revalidate serves stale instantly
// while refreshing in the background.
const READ_CACHE = "private, max-age=30, stale-while-revalidate=300";

// "strava" stays valid for READING: historical runs imported before the move
// to Garmin-only ingestion still live in the table under that source.
const SOURCES = new Set<ActivitySource>([
  "strava",
  "garmin",
  "apple",
  "manual",
]);

const app = new Hono();

// Every route runs in this single Lambda (one warm pool). Routes are mounted
// without the `/api` prefix — the SST Router strips it before forwarding.

// ---- Garmin sync ----------------------------------------------------------
// Manual trigger for the same ingestion the cron runs on a schedule (see
// packages/functions/src/garmin/sync.ts). Defaults to a much wider lookback
// than the cron, since this is what you press to backfill.
app.post("/garmin/sync", async (c) => {
  if (!isAuthorized(c.req.header())) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const days = Number(c.req.query("days") ?? 30);
  try {
    return c.json(await syncGarmin(days));
  } catch (e) {
    return c.json({ error: `garmin sync: ${(e as Error).message}` }, 502);
  }
});

// ---- Garmin push ----------------------------------------------------------
// Upsert each still-planned run into Garmin Connect: create + schedule the ones
// not yet pushed, and overwrite (PUT) the ones already pushed so title/step
// edits re-sync. Safe to press repeatedly. The first push triggers the SSO
// login (fails on 2FA accounts — surfaced per-plan in `errors`).
type GarminPushResult = { created: number; updated: number; errors: string[] };

app.post("/garmin/push", async (c) => {
  if (!isAuthorized(c.req.header())) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const from = c.req.query("from") || undefined;
  const to = c.req.query("to") || undefined;
  const plans = (await listPlans({ from, to })).filter(
    (p) => p.status === "planned",
  );

  const result: GarminPushResult = { created: 0, updated: 0, errors: [] };
  if (plans.length === 0) return c.json(result);

  let token: string;
  try {
    token = await getGarminAccessToken();
  } catch (e) {
    return c.json({ error: `garmin auth: ${(e as Error).message}` }, 502);
  }
  // Interpret all prescriptions up front (bounded concurrency), then write to
  // Garmin sequentially to avoid hammering the unofficial API.
  const workouts = await resolvePlanWorkouts(plans);
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i]!;
    try {
      if (p.garminWorkoutId) {
        await updateWorkout(p.garminWorkoutId, workouts[i]!, token);
        result.updated++;
      } else {
        const w = await createWorkout(workouts[i]!, token);
        await scheduleWorkout(w.workoutId, p.date, token);
        await updatePlan(p.date, p.id, { garminWorkoutId: w.workoutId });
        result.created++;
      }
    } catch (e) {
      result.errors.push(`${p.date}: ${(e as Error).message}`);
    }
  }

  return c.json(result);
});

// ---- Activities -----------------------------------------------------------
type ActivitySummary = Omit<Activity, "polyline" | "splits">;
const strip = (a: Activity): ActivitySummary => {
  const { polyline: _p, splits: _s, ...rest } = a;
  return rest;
};

app.get("/activities", async (c) => {
  const limit = Number(c.req.query("limit") ?? 1000);
  const from = c.req.query("from") || undefined;
  const to = c.req.query("to") || undefined;
  const items = await listActivities({ limit, from, to });
  c.header("Cache-Control", READ_CACHE);
  return c.json({ items: items.map(strip) });
});

// Every outdoor run's geometry in one response, thinned for drawing (see
// @run/core/heatmap). Cached longer than the other reads: the history only
// changes when a sync imports a new run.
app.get("/tracks", async (c) => {
  const items = await listHeatmapTracks();
  c.header("Cache-Control", "private, max-age=300, stale-while-revalidate=3600");
  return c.json({ items });
});

// All-time best effort at each standard distance, with the run that holds it.
// One query: every activity carries its own bests (see @run/core/bestEfforts),
// so this is a min-reduce over the list rather than a read per run.
app.get("/records", async (c) => {
  const activities = await listActivities({ limit: 100_000 });
  c.header("Cache-Control", READ_CACHE);
  return c.json({ items: aggregateRecords(activities) });
});

// Cities the user has started a run in, busiest first. Separate from /tracks so
// the map paints immediately: this one can block on geocoding the first time a
// run appears in a new area.
app.get("/cities", async (c) => {
  const items = await listCities();
  c.header("Cache-Control", "private, max-age=300, stale-while-revalidate=3600");
  return c.json({ items });
});

app.get("/activities/:source/:externalId", async (c) => {
  const source = c.req.param("source");
  const externalId = c.req.param("externalId");
  if (!source || !SOURCES.has(source as ActivitySource) || !externalId) {
    return c.json({ error: "bad source/externalId" }, 400);
  }

  const activity = await getActivity(source as ActivitySource, externalId);
  if (!activity) return c.json({ error: "not found" }, 404);

  const [series, analysis, extras] = await Promise.all([
    getChartSeries(source, externalId),
    getAnalysis(source, externalId),
    getExtras(source, externalId),
  ]);

  // The linked plan carries the prescription (notes / target pace / type).
  const date = activity.startDate.slice(0, 10);
  const plans = await listPlans({ from: date, to: date });
  const plan: PlannedRun | undefined = plans.find(
    (p) => p.actualSource === source && p.actualExternalId === externalId,
  );

  return c.json({
    activity,
    series: series ?? null,
    analysis: analysis ?? null,
    plan: plan ?? null,
    extras: extras ?? null,
  });
});

// Re-fetch one activity's detail samples from Garmin and (re)store its chart
// series. Older runs imported without samples show a map but no pace chart —
// this backfills the series for that single activity. Stats are untouched.
app.post("/activities/:source/:externalId/resync", async (c) => {
  if (!isAuthorized(c.req.header())) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const source = c.req.param("source") as ActivitySource;
  const externalId = c.req.param("externalId");
  if (source !== "garmin") {
    return c.json({ error: "resync only supported for garmin" }, 400);
  }
  const existing = await getActivity(source, externalId);
  if (!existing) return c.json({ error: "not found" }, 404);

  const token = await getGarminAccessToken();
  const startEpochSec = Math.floor(
    new Date(existing.startDate).getTime() / 1000,
  );
  const details = await fetchGarminActivityDetails(externalId, token);
  const track = detailsToTrack(details, startEpochSec);
  if (track.points.length < 2) {
    return c.json({ error: "no sample stream for this activity" }, 422);
  }
  const series = buildChartSeries(track);
  await putChartSeries(source, externalId, series);
  // Now that the samples exist, the run's records can be exact rather than
  // snapped to kilometre boundaries.
  await setActivityBestEfforts(
    source,
    externalId,
    bestEffortsFor({
      series,
      splits: existing.splits,
      distance: existing.distance,
    }),
  );
  // Backfill/refresh the extras too — this is how pre-existing runs get laps,
  // zones, weather and RPE without waiting for a new sync.
  const extras = await ingestGarminExtras(externalId, token);
  return c.json({ ok: true, points: track.points.length, extras });
});

app.delete("/activities/:source/:externalId", async (c) => {
  if (!isAuthorized(c.req.header())) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const source = c.req.param("source") as ActivitySource;
  const externalId = c.req.param("externalId");
  if (!source || !externalId) {
    return c.json({ error: "missing source or externalId" }, 400);
  }
  if (!SOURCES.has(source)) {
    return c.json({ error: "invalid source" }, 400);
  }
  const existing = await getActivity(source, externalId);
  if (!existing) return c.json({ error: "not found" }, 404);
  const { deleted } = await deleteActivity(source, externalId);
  let unlinked = 0;
  if (deleted) {
    unlinked = await unlinkActivityFromPlan(source, externalId, existing.startDate);
    // The series, extras and analysis live in their own items and were being
    // left behind — deleteActivity only handles the row and the stats.
    await deleteWorkoutItems(source, externalId);
  }
  return c.json({ ok: true, deleted, unlinked });
});

// ---- Stats ----------------------------------------------------------------
app.get("/stats", async (c) => {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const scopes: StatsScope[] = [
    "TOTAL",
    `YEAR#${yyyy}`,
    `MONTH#${yyyy}-${mm}`,
    `WEEK#${isoWeek(now)}`,
  ];
  const map = await getStatsMany(scopes);
  c.header("Cache-Control", READ_CACHE);
  return c.json({
    total: map["TOTAL"],
    year: map[`YEAR#${yyyy}`],
    month: map[`MONTH#${yyyy}-${mm}`],
    week: map[`WEEK#${isoWeek(now)}`],
  });
});

// ---- Plans ----------------------------------------------------------------
app.get("/plans", async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");
  const items = await listPlans({ from, to });
  c.header("Cache-Control", READ_CACHE);
  return c.json({ items });
});

app.delete("/plans/:date/:id", async (c) => {
  if (!isAuthorized(c.req.header())) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const date = c.req.param("date");
  const id = c.req.param("id");
  if (!date || !id) return c.json({ error: "missing date or id" }, 400);
  await deletePlan(date, id);
  return c.json({ ok: true });
});

// ---- Auth -----------------------------------------------------------------
app.post("/auth/verify", (c) => {
  if (!isAuthorized(c.req.header())) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return c.json({ ok: true });
});

// ---- Streaming LLM routes -------------------------------------------------
// The function URL runs in RESPONSE_STREAM mode (see infra). Buffered routes
// above return normal responses fine under streamHandle. The Anthropic SDK is
// pulled in lazily inside runChat/runAnalyze (own esbuild chunk via
// nodejs.splitting), so it stays off the cold-start path of every other route.

// CloudFront drops an idle origin connection after ~55s. Emit a zero-width
// space every 8s so the stream never goes silent that long.
function startHeartbeat(s: { write: (c: string) => Promise<unknown> }) {
  return setInterval(() => {
    void s.write("​").catch(() => {});
  }, 8000);
}

app.post("/chat", (c) => {
  if (!isAuthorized(c.req.header())) return c.text("unauthorized", 401);
  c.header("Content-Type", "text/plain; charset=utf-8");
  c.header("Cache-Control", "no-cache");
  return stream(c, async (s) => {
    const hb = startHeartbeat(s);
    try {
      const body = await c.req.text();
      const { runChat } = await import("./chat/chat.ts");
      await runChat(body, (chunk) => s.write(chunk));
    } catch (err) {
      await s.write(`\n\n[erro: ${(err as Error).message}]`);
    } finally {
      clearInterval(hb);
    }
  });
});

app.post("/analyze", (c) => {
  if (!isAuthorized(c.req.header())) return c.text("unauthorized", 401);
  c.header("Content-Type", "text/plain; charset=utf-8");
  c.header("Cache-Control", "no-cache");
  return stream(c, async (s) => {
    const hb = startHeartbeat(s);
    try {
      const body = await c.req.text();
      const { runAnalyze } = await import("./activities/analyze.ts");
      await runAnalyze(body, (chunk) => s.write(chunk));
    } catch (err) {
      await s.write(
        JSON.stringify({ ok: false, error: (err as Error).message }),
      );
    } finally {
      clearInterval(hb);
    }
  });
});

export const handler = streamHandle(app);
