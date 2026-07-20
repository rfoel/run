import { Hono } from "hono";
import { streamHandle } from "hono/aws-lambda";
import { stream } from "hono/streaming";
import { Resource } from "sst";

import {
  buildActivity,
  deleteActivity,
  getActivity,
  listActivities,
  putActivity,
  renameActivity,
  type Activity,
  type ActivitySource,
} from "@run/core/activity";
import {
  deletePlan,
  linkActivityToPlan,
  listPlans,
  planTitle,
  unlinkActivityFromPlan,
  updatePlan,
  type PlannedRun,
} from "@run/core/plan";
import { getStatsMany, isoWeek, type StatsScope } from "@run/core/stats";
import {
  getAnalysis,
  getChartSeries,
  getExtras,
  putChartSeries,
  putExtras,
} from "@run/core/workout";
import { buildChartSeries } from "@run/core/track";
import {
  courseWebUrl,
  createCourse,
  createWorkout,
  fetchActivities as fetchGarminActivities,
  fetchActivityDetails as fetchGarminActivityDetails,
  fetchActivityFull,
  fetchActivityLaps,
  fetchActivityWeather,
  fetchHrTimeInZones,
  fetchPowerTimeInZones,
  garminStartEpochSec,
  getValidAccessToken as getGarminAccessToken,
  isGarminRun,
  scheduleWorkout,
  updateWorkout,
  type CoursePoint,
} from "@run/core/garmin";
import {
  detailsToTrack,
  garminExtras,
  garminMetrics,
} from "@run/core/parsers/garmin";
import {
  createRoute,
  decodeRoute,
  deleteRoute,
  getRoute,
  listRoutes,
  setRouteGarminId,
  updateRoute,
  type RoutePoint,
} from "@run/core/route";
import { resolvePlanWorkouts } from "./garmin/resolve.ts";
import { isAuthorized } from "./lib/auth.ts";
import { enqueueAnalysis } from "./lib/analyze-queue.ts";

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

type SyncResult = {
  fetched: number;
  imported: number;
  skipped: number;
  linked: number;
  errors: string[];
};

// Pull everything Garmin computed for one run beyond the sample streams —
// watch laps (with structured-workout step + intensity), HR/power zone times,
// weather, training effect/load, running dynamics and athlete-entered
// RPE/feel — and store it as the activity's EXTRAS item. Each endpoint is
// best-effort: the unofficial API throttles hard, and a missing section just
// means less context for the UI/analysis.
async function ingestGarminExtras(
  externalId: string,
  token: string,
): Promise<boolean> {
  const soft = <T>(p: Promise<T>): Promise<T | undefined> =>
    p.catch((e) => {
      console.log(`extras ${externalId}: ${(e as Error).message}`);
      return undefined;
    });
  const [full, laps, hrZones, powerZones, weather] = await Promise.all([
    soft(fetchActivityFull(externalId, token)),
    soft(fetchActivityLaps(externalId, token)),
    soft(fetchHrTimeInZones(externalId, token)),
    soft(fetchPowerTimeInZones(externalId, token)),
    soft(fetchActivityWeather(externalId, token)),
  ]);
  const extras = garminExtras({ full, laps, hrZones, powerZones, weather });
  if (Object.keys(extras).length === 0) return false;
  await putExtras("garmin", externalId, extras);
  return true;
}

// ---- Garmin sync ----------------------------------------------------------
// Pull recent runs from Garmin Connect (no webhook on the unofficial API, so
// this is polled). Newest-first paging stops once we pass the lookback window.
// Treadmill/indoor runs import too: their detail samples have no GPS but carry
// a distance stream, and buildActivity flags a missing polyline as indoor.
app.post("/garmin/sync", async (c) => {
  if (!isAuthorized(c.req.header())) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const days = Number(c.req.query("days") ?? 30);
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;

  let token: string;
  try {
    token = await getGarminAccessToken();
  } catch (e) {
    return c.json({ error: `garmin auth: ${(e as Error).message}` }, 502);
  }

  const result: SyncResult = {
    fetched: 0,
    imported: 0,
    skipped: 0,
    linked: 0,
    errors: [],
  };

  const perPage = 20;
  let start = 0;
  outer: while (true) {
    const batch = await fetchGarminActivities(token, { start, limit: perPage });
    if (batch.length === 0) break;
    result.fetched += batch.length;

    for (const summary of batch) {
      const startEpochSec = garminStartEpochSec(summary.startTimeGMT);
      // List is newest-first, so once we cross the window we're done.
      if (startEpochSec < cutoff) break outer;
      if (!isGarminRun(summary.activityType.typeKey)) {
        result.skipped++;
        continue;
      }
      const externalId = String(summary.activityId);
      try {
        // Detail samples power the pace chart + splits; best-effort, since the
        // endpoint is heavily throttled. Fall back to summary-only metrics.
        let details;
        try {
          details = await fetchGarminActivityDetails(summary.activityId, token);
        } catch {
          details = undefined;
        }
        const { metrics, track } = garminMetrics(summary, details);
        const activity = buildActivity({
          source: "garmin",
          externalId,
          name: summary.activityName ?? "Corrida",
          sportType: summary.activityType.typeKey,
          metrics,
        });
        if (track) {
          await putChartSeries("garmin", externalId, buildChartSeries(track));
        }
        const { created } = await putActivity(activity);
        if (created) result.imported++;
        else result.skipped++;

        const linkedPlan = await linkActivityToPlan(activity);
        if (linkedPlan) {
          result.linked++;
          const title = planTitle(linkedPlan);
          await renameActivity("garmin", externalId, title);
          await updatePlan(linkedPlan.date, linkedPlan.id, { actualName: title });
        }
        if (created) {
          // Laps/zones/weather/RPE — before enqueueing so the analysis sees
          // them. Auto-analyze only runs with a chart series (the analysis
          // needs the trace; summary-only imports can't be analyzed).
          await ingestGarminExtras(externalId, token);
          if (track) await enqueueAnalysis("garmin", externalId);
        }
      } catch (e) {
        result.errors.push(`${externalId}: ${(e as Error).message}`);
      }
    }
    start += perPage;
  }

  return c.json(result);
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

// ---- Garmin courses -------------------------------------------------------
// Create a navigable route on Garmin Connect from a drawn/snapped point list.
// The web builds points with OSRM (road-snapping); elevation is filled server
// -side. Returns the new course id + its Garmin Connect URL.
app.post("/courses", async (c) => {
  if (!isAuthorized(c.req.header())) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    points?: CoursePoint[];
  };
  const name = body.name?.trim();
  const points = body.points ?? [];
  if (!name) return c.json({ error: "missing name" }, 400);
  if (points.length < 2) return c.json({ error: "need at least 2 points" }, 400);
  if (points.length > 5000) return c.json({ error: "too many points" }, 400);

  let token: string;
  try {
    token = await getGarminAccessToken();
  } catch (e) {
    return c.json({ error: `garmin auth: ${(e as Error).message}` }, 502);
  }
  try {
    const created = await createCourse(
      { name, description: body.description, points },
      token,
    );
    return c.json({
      courseId: created.courseId,
      courseName: created.courseName,
      url: courseWebUrl(created.courseId),
    });
  } catch (e) {
    return c.json({ error: `course create: ${(e as Error).message}` }, 502);
  }
});

// ---- Saved routes ---------------------------------------------------------
// Persist drawn routes in the app so they can be kept without pushing to
// Garmin, and pushed later. Points come pre-snapped from the web (OSRM).
app.get("/routes", async (c) => {
  const routes = await listRoutes();
  c.header("Cache-Control", READ_CACHE);
  return c.json({ items: routes });
});

app.post("/routes", async (c) => {
  if (!isAuthorized(c.req.header())) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    points?: RoutePoint[];
    waypoints?: RoutePoint[];
    distance?: number;
  };
  const name = body.name?.trim();
  const points = body.points ?? [];
  if (!name) return c.json({ error: "missing name" }, 400);
  if (points.length < 2) return c.json({ error: "need at least 2 points" }, 400);
  const route = await createRoute({
    name,
    points,
    waypoints: body.waypoints,
    distance: body.distance ?? 0,
  });
  return c.json(route);
});

app.put("/routes/:id", async (c) => {
  if (!isAuthorized(c.req.header())) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    points?: RoutePoint[];
    waypoints?: RoutePoint[];
    distance?: number;
  };
  const name = body.name?.trim();
  const points = body.points ?? [];
  if (!name) return c.json({ error: "missing name" }, 400);
  if (points.length < 2) return c.json({ error: "need at least 2 points" }, 400);
  const route = await updateRoute(c.req.param("id"), {
    name,
    points,
    waypoints: body.waypoints,
    distance: body.distance ?? 0,
  });
  if (!route) return c.json({ error: "not found" }, 404);
  return c.json(route);
});

app.delete("/routes/:id", async (c) => {
  if (!isAuthorized(c.req.header())) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await deleteRoute(c.req.param("id"));
  return c.json({ ok: true });
});

// Push a saved route to Garmin as a course, recording the course id back on
// the saved route so the list can link to it (and re-push is obvious).
app.post("/routes/:id/garmin", async (c) => {
  if (!isAuthorized(c.req.header())) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const route = await getRoute(c.req.param("id"));
  if (!route) return c.json({ error: "not found" }, 404);

  let token: string;
  try {
    token = await getGarminAccessToken();
  } catch (e) {
    return c.json({ error: `garmin auth: ${(e as Error).message}` }, 502);
  }
  try {
    const points = decodeRoute(route.polyline);
    const created = await createCourse({ name: route.name, points }, token);
    await setRouteGarminId(route.id, created.courseId);
    return c.json({
      courseId: created.courseId,
      courseName: created.courseName,
      url: courseWebUrl(created.courseId),
    });
  } catch (e) {
    return c.json({ error: `course create: ${(e as Error).message}` }, 502);
  }
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
  await putChartSeries(source, externalId, buildChartSeries(track));
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
  const unlinked = deleted
    ? await unlinkActivityFromPlan(source, externalId, existing.startDate)
    : 0;
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
