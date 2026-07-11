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
  putChartSeries,
} from "@run/core/workout";
import { buildChartSeries, computeMetrics } from "@run/core/track";
import { streamsToTrack } from "@run/core/parsers/streams";
import {
  fetchActivities,
  fetchActivity,
  fetchStreams,
  getValidAccessToken,
  saveTokens,
  updateActivityName,
} from "@run/core/strava";
import {
  createWorkout,
  fetchActivities as fetchGarminActivities,
  fetchActivityDetails as fetchGarminActivityDetails,
  garminStartEpochSec,
  getValidAccessToken as getGarminAccessToken,
  isGarminRun,
  scheduleWorkout,
  updateWorkout,
} from "@run/core/garmin";
import { detailsToTrack, garminMetrics } from "@run/core/parsers/garmin";
import { resolvePlanWorkouts } from "./garmin/resolve.ts";
import { isAuthorized } from "./lib/auth.ts";

// Read endpoints: let the browser (and any private cache) serve repeats for a
// short window. `private` keeps personal data out of shared/CDN caches; the
// front-end's TanStack Query is the primary cache, this just covers hard
// reloads and complements it. stale-while-revalidate serves stale instantly
// while refreshing in the background.
const READ_CACHE = "private, max-age=30, stale-while-revalidate=300";

const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);
const SOURCES = new Set<ActivitySource>([
  "strava",
  "garmin",
  "apple",
  "manual",
]);

const app = new Hono();

// Every route runs in this single Lambda (one warm pool). Routes are mounted
// without the `/api` prefix — the SST Router strips it before forwarding.

// ---- Strava webhook subscription verification -----------------------------
app.get("/strava/webhook", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  if (mode !== "subscribe" || token !== Resource.StravaVerifyToken.value) {
    return c.text("forbidden", 403);
  }
  return c.json({ "hub.challenge": challenge });
});

// ---- Strava webhook event -------------------------------------------------
type StravaEvent = {
  object_type: "activity" | "athlete";
  object_id: number;
  aspect_type: "create" | "update" | "delete";
  owner_id: number;
  subscription_id: number;
  event_time: number;
  updates?: Record<string, string>;
};

app.post("/strava/webhook", async (c) => {
  const raw = await c.req.text();
  if (!raw) {
    console.log("webhook: missing body");
    return c.json({ error: "missing body" }, 400);
  }
  const payload = JSON.parse(raw) as StravaEvent;
  console.log("webhook payload", JSON.stringify(payload));

  if (payload.object_type !== "activity") {
    console.log(`skip: object_type=${payload.object_type}`);
    return c.json({ skipped: true });
  }
  if (payload.aspect_type === "delete") {
    console.log(`skip: delete event for ${payload.object_id}`);
    return c.json({ ok: true });
  }

  const accessToken = await getValidAccessToken();
  const act = await fetchActivity(payload.object_id, accessToken);
  console.log(`fetched ${act.id} sport=${act.sport_type} type=${act.type}`);
  if (!RUN_TYPES.has(act.sport_type) && !RUN_TYPES.has(act.type)) {
    return c.json({ skipped: "not a run" });
  }

  const startEpochSec = Math.floor(new Date(act.start_date).getTime() / 1000);
  const streams = await fetchStreams(payload.object_id, accessToken);
  const track = streamsToTrack(streams, startEpochSec);
  console.log(`track points=${track.points.length}`);
  if (track.points.length < 2) {
    return c.json({ skipped: "track too short" });
  }

  const metrics = computeMetrics(track);
  const activity = buildActivity({
    source: "strava",
    externalId: String(act.id),
    name: act.name,
    sportType: act.sport_type,
    metrics,
  });
  await putChartSeries("strava", String(act.id), buildChartSeries(track));
  const { created } = await putActivity(activity);
  console.log(`put activity ${activity.externalId} created=${created}`);
  let linkedPlanId: string | null = null;
  if (created) {
    const linkedPlan = await linkActivityToPlan(activity);
    linkedPlanId = linkedPlan?.id ?? null;
    console.log(`linked plan=${linkedPlanId}`);
    if (linkedPlan) {
      const title = planTitle(linkedPlan);
      // Keep our copy and the plan snapshot on the workout title too, so the
      // app shows "4km tempo…" rather than Strava's "Corrida matinal".
      await renameActivity("strava", String(act.id), title);
      await updatePlan(linkedPlan.date, linkedPlan.id, { actualName: title });
      try {
        await updateActivityName(act.id, title, accessToken);
        console.log(`renamed strava ${act.id} -> ${title}`);
      } catch (e) {
        console.log(`rename failed: ${(e as Error).message}`);
      }
    }
  }
  return c.json({ ok: true, externalId: activity.externalId, linkedPlanId });
});

// ---- Strava OAuth callback ------------------------------------------------
app.get("/strava/oauth/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.text("missing code", 400);

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: Resource.StravaClientId.value,
      client_secret: Resource.StravaClientSecret.value,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return c.text(`strava token exchange failed: ${res.status}`, 500);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    athlete: { id: number };
  };
  await saveTokens({
    athleteId: data.athlete.id,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  });
  return c.text(
    `Linked Strava athlete ${data.athlete.id}. You can close this tab.`,
  );
});

// ---- Strava sync ----------------------------------------------------------
type SyncResult = {
  fetched: number;
  imported: number;
  skipped: number;
  linked: number;
  errors: string[];
};

app.post("/strava/sync", async (c) => {
  if (!isAuthorized(c.req.header())) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const days = Number(c.req.query("days") ?? 30);
  const accessToken = await getValidAccessToken();
  const afterEpoch = Math.floor(Date.now() / 1000) - days * 86400;

  const result: SyncResult = {
    fetched: 0,
    imported: 0,
    skipped: 0,
    linked: 0,
    errors: [],
  };

  let page = 1;
  while (true) {
    const batch = await fetchActivities(accessToken, {
      page,
      perPage: 100,
      after: afterEpoch,
    });
    if (batch.length === 0) break;
    result.fetched += batch.length;

    for (const summary of batch) {
      if (!RUN_TYPES.has(summary.sport_type) && !RUN_TYPES.has(summary.type)) {
        result.skipped++;
        continue;
      }
      try {
        const streams = await fetchStreams(summary.id, accessToken);
        const startEpochSec = Math.floor(
          new Date(summary.start_date).getTime() / 1000,
        );
        const track = streamsToTrack(streams, startEpochSec);
        if (track.points.length < 2) {
          result.skipped++;
          continue;
        }
        const metrics = computeMetrics(track);
        const activity = buildActivity({
          source: "strava",
          externalId: String(summary.id),
          name: summary.name,
          sportType: summary.sport_type,
          metrics,
        });
        // Store the chart series unconditionally so already-imported
        // activities get backfilled on a re-sync.
        await putChartSeries(
          "strava",
          String(summary.id),
          buildChartSeries(track),
        );
        const { created } = await putActivity(activity);
        if (created) result.imported++;
        else result.skipped++;

        // Reconcile the workout title on EVERY sync, so already-imported runs
        // that kept Strava's original name get the plan title here too.
        const linkedPlan = await linkActivityToPlan(activity);
        if (linkedPlan) {
          result.linked++;
          const title = planTitle(linkedPlan);
          await renameActivity("strava", String(summary.id), title);
          await updatePlan(linkedPlan.date, linkedPlan.id, {
            actualName: title,
          });
          if (summary.name !== title) {
            try {
              await updateActivityName(summary.id, title, accessToken);
            } catch (e) {
              result.errors.push(
                `rename ${summary.id}: ${(e as Error).message}`,
              );
            }
          }
        }
      } catch (e) {
        result.errors.push(`${summary.id}: ${(e as Error).message}`);
      }
    }
    page++;
  }

  return c.json(result);
});

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

  const [series, analysis] = await Promise.all([
    getChartSeries(source, externalId),
    getAnalysis(source, externalId),
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
  });
});

// Re-fetch one activity's streams from Strava and (re)store its chart series.
// Older runs imported without streams show a map but no pace chart — this
// backfills the series for that single activity. Stats are untouched.
app.post("/activities/:source/:externalId/resync", async (c) => {
  if (!isAuthorized(c.req.header())) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const source = c.req.param("source") as ActivitySource;
  const externalId = c.req.param("externalId");
  if (source !== "strava" && source !== "garmin") {
    return c.json({ error: "resync only supported for strava/garmin" }, 400);
  }
  const existing = await getActivity(source, externalId);
  if (!existing) return c.json({ error: "not found" }, 404);

  let track;
  if (source === "strava") {
    const accessToken = await getValidAccessToken();
    const startEpochSec = Math.floor(
      new Date(existing.startDate).getTime() / 1000,
    );
    const streams = await fetchStreams(Number(externalId), accessToken);
    track = streamsToTrack(streams, startEpochSec);
  } else {
    const token = await getGarminAccessToken();
    const startEpochSec = Math.floor(
      new Date(existing.startDate).getTime() / 1000,
    );
    const details = await fetchGarminActivityDetails(externalId, token);
    track = detailsToTrack(details, startEpochSec);
  }
  if (track.points.length < 2) {
    return c.json({ error: "no sample stream for this activity" }, 422);
  }
  await putChartSeries(source, externalId, buildChartSeries(track));
  return c.json({ ok: true, points: track.points.length });
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
