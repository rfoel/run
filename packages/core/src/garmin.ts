import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { createHmac, randomBytes } from "node:crypto";
import { Resource } from "sst";
import { ddb, tableName } from "./db.ts";
import { userPk, USER_ID } from "./user.ts";
import type { PlannedRun } from "./plan.ts";
import { planTitle } from "./plan.ts";

/**
 * Garmin Connect client — login, token persistence and workout creation.
 *
 * Garmin has no official consumer API, so this drives the same unofficial flow
 * the mobile app uses (modelled on florianpasteur/garmin-connect and matin/garth):
 *
 *   1. SSO login (email+password) → a short-lived `ticket`
 *   2. ticket → OAuth1 token   (GET  oauth-service/oauth/preauthorized, OAuth1-signed)
 *   3. OAuth1 → OAuth2 bearer  (POST oauth-service/oauth/exchange/user/2.0)
 *   4. Bearer token authenticates connectapi.garmin.com calls.
 *
 * The email/password (from SST secrets) is only used for step 1 on first login
 * or when the stored OAuth1 token has expired. Day-to-day we refresh the OAuth2
 * bearer from the stored OAuth1 token — no password round-trip.
 *
 * Caveat: this does NOT support two-factor auth. If your account has 2FA the
 * login step fails with a clear error.
 */

const DOMAIN = "garmin.com";
const SSO_ORIGIN = `https://sso.${DOMAIN}`;
const SSO = `${SSO_ORIGIN}/sso`;
const SSO_EMBED = `${SSO_ORIGIN}/sso/embed`;
const SIGNIN_URL = `${SSO}/signin`;
const GC_API = `https://connectapi.${DOMAIN}`;
const OAUTH_URL = `${GC_API}/oauth-service/oauth`;
const GC_MODERN = `https://connect.${DOMAIN}/modern`;

const WORKOUT_URL = (id?: string | number) =>
  id ? `${GC_API}/workout-service/workout/${id}` : `${GC_API}/workout-service/workout`;
const SCHEDULE_WORKOUT_URL = (id: number) =>
  `${GC_API}/workout-service/schedule/${id}`;

// Public OAuth1 consumer credentials extracted from the Garmin Connect Mobile
// app. These are well-known (see matin/garth) and stable for years, so we embed
// them rather than fetch from a third-party S3 bucket at runtime.
const OAUTH_CONSUMER = {
  key: "fc3e99d2-118c-44b8-8ae3-03370dde24c0",
  secret: "E08WAR897WEy2knn7aFBrvegVAf0AFdWBBF",
} as const;

const UA_BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36";
const UA_MOBILE = "com.garmin.android.apps.connectmobile";

const CSRF_RE = /name="_csrf"\s+value="(.+?)"/;
const TICKET_RE = /ticket=([^"]+)"/;

/**
 * fetch with backoff on Garmin's rate limiting. Garmin throttles this
 * unofficial flow hard from datacenter IPs (429), and occasionally 503s.
 * Honours Retry-After when present, else exponential backoff. This smooths
 * transient bursts; it cannot defeat a sustained per-IP block (run the push
 * from a residential IP for that).
 */
async function fetchRetry(
  url: string,
  init: RequestInit = {},
  tries = 4,
): Promise<Response> {
  let res!: Response;
  for (let i = 0; i < tries; i++) {
    res = await fetch(url, init);
    if (res.status !== 429 && res.status < 500) return res;
    if (i === tries - 1) break;
    const ra = Number(res.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(8000, 500 * 2 ** i);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  return res;
}

// --- token types & persistence ---------------------------------------------

export type GarminOauth1 = {
  oauth_token: string;
  oauth_token_secret: string;
  [k: string]: string;
};

export type GarminOauth2 = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_token_expires_in: number;
  /** epoch seconds, computed on receipt */
  expires_at: number;
};

export type GarminTokens = {
  oauth1: GarminOauth1;
  oauth2: GarminOauth2;
};

const tokenSk = () => "GARMIN#TOKENS";

export async function saveTokens(
  tokens: GarminTokens,
  userId: string = USER_ID,
) {
  await ddb.send(
    new PutCommand({
      TableName: tableName(),
      Item: { pk: userPk(userId), sk: tokenSk(), ...tokens },
    }),
  );
}

export async function loadTokens(
  userId: string = USER_ID,
): Promise<GarminTokens | undefined> {
  const res = await ddb.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: tokenSk() },
    }),
  );
  if (!res.Item) return undefined;
  const { oauth1, oauth2 } = res.Item as GarminTokens;
  return oauth1 && oauth2 ? { oauth1, oauth2 } : undefined;
}

// --- OAuth1 signing ----------------------------------------------------------

// RFC-3986 percent-encoding (stricter than encodeURIComponent).
function pct(s: string): string {
  return encodeURIComponent(s).replace(
    /[!*'()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/**
 * Produce the signed `oauth_*` parameters for a request. `query` holds any
 * request query params that must be folded into the signature base. `token`
 * is the OAuth1 token (omitted for the preauthorized step that mints one).
 */
function signOauth1(
  method: string,
  baseUrl: string,
  query: Record<string, string> = {},
  token?: { key: string; secret: string },
): Record<string, string> {
  const oauth: Record<string, string> = {
    oauth_consumer_key: OAUTH_CONSUMER.key,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
  };
  if (token) oauth.oauth_token = token.key;

  const all = { ...query, ...oauth };
  const paramString = Object.keys(all)
    .sort()
    .map((k) => `${pct(k)}=${pct(all[k] ?? "")}`)
    .join("&");
  const base = [method.toUpperCase(), pct(baseUrl), pct(paramString)].join("&");
  const signingKey = `${pct(OAUTH_CONSUMER.secret)}&${pct(token?.secret ?? "")}`;
  oauth.oauth_signature = createHmac("sha1", signingKey)
    .update(base)
    .digest("base64");
  return oauth;
}

function authHeader(oauth: Record<string, string>): string {
  return (
    "OAuth " +
    Object.keys(oauth)
      .map((k) => `${pct(k)}="${pct(oauth[k] ?? "")}"`)
      .join(", ")
  );
}

// --- cookie jar (native fetch has none) -------------------------------------

class CookieJar {
  private jar = new Map<string, string>();
  store(res: Response) {
    // getSetCookie is available on undici's Headers (Node 18.14+).
    const cookies = (res.headers as Headers & { getSetCookie?: () => string[] })
      .getSetCookie?.();
    for (const c of cookies ?? []) {
      const pair = c.split(";")[0] ?? "";
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  header(): string {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

// --- login flow --------------------------------------------------------------

async function getLoginTicket(
  jar: CookieJar,
  email: string,
  password: string,
): Promise<string> {
  // Step 1: hit the embed page to seed SSO cookies.
  const step1 = new URLSearchParams({
    clientId: "GarminConnect",
    locale: "en",
    service: GC_MODERN,
  });
  const r1 = await fetchRetry(`${SSO_EMBED}?${step1}`, {
    headers: { "User-Agent": UA_BROWSER },
  });
  jar.store(r1);

  // Step 2: fetch the signin widget to read the CSRF token.
  const step2 = new URLSearchParams({
    id: "gauth-widget",
    embedWidget: "true",
    locale: "en",
    gauthHost: SSO_EMBED,
  });
  const r2 = await fetchRetry(`${SIGNIN_URL}?${step2}`, {
    headers: { "User-Agent": UA_BROWSER, Cookie: jar.header() },
  });
  jar.store(r2);
  const html2 = await r2.text();
  const csrf = CSRF_RE.exec(html2)?.[1];
  if (!csrf) throw new Error("Garmin login: CSRF token not found");

  // Step 3: post credentials, parse the ticket out of the response HTML.
  const step3 = new URLSearchParams({
    id: "gauth-widget",
    embedWidget: "true",
    clientId: "GarminConnect",
    locale: "en",
    gauthHost: SSO_EMBED,
    service: SSO_EMBED,
    source: SSO_EMBED,
    redirectAfterAccountLoginUrl: SSO_EMBED,
    redirectAfterAccountCreationUrl: SSO_EMBED,
  });
  const form = new URLSearchParams({
    username: email,
    password,
    embed: "true",
    _csrf: csrf,
  });
  const r3 = await fetchRetry(`${SIGNIN_URL}?${step3}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: SSO_ORIGIN,
      Referer: `${SIGNIN_URL}?${step2}`,
      "User-Agent": UA_BROWSER,
      Cookie: jar.header(),
    },
    body: form,
  });
  jar.store(r3);
  const html3 = await r3.text();

  if (/account is locked/i.test(html3)) {
    throw new Error(
      "Garmin login failed: account locked — sign in on the website to unlock.",
    );
  }
  const ticket = TICKET_RE.exec(html3)?.[1];
  if (!ticket) {
    throw new Error(
      "Garmin login failed: no ticket (wrong email/password, or 2FA is enabled — 2FA is not supported).",
    );
  }
  return ticket;
}

async function getOauth1Token(ticket: string): Promise<GarminOauth1> {
  const base = `${OAUTH_URL}/preauthorized`;
  const query = {
    ticket,
    "login-url": SSO_EMBED,
    "accepts-mfa-tokens": "true",
  };
  const oauth = signOauth1("GET", base, query, undefined);
  const url = `${base}?${new URLSearchParams(query)}`;
  const res = await fetchRetry(url, {
    headers: { Authorization: authHeader(oauth), "User-Agent": UA_MOBILE },
  });
  if (!res.ok) {
    throw new Error(`Garmin OAuth1 request failed: ${res.status}`);
  }
  const parsed = Object.fromEntries(
    new URLSearchParams(await res.text()),
  ) as GarminOauth1;
  if (!parsed.oauth_token || !parsed.oauth_token_secret) {
    throw new Error("Garmin OAuth1 response missing token");
  }
  return parsed;
}

async function exchange(oauth1: GarminOauth1): Promise<GarminOauth2> {
  const base = `${OAUTH_URL}/exchange/user/2.0`;
  const oauth = signOauth1("POST", base, {}, {
    key: oauth1.oauth_token,
    secret: oauth1.oauth_token_secret,
  });
  const url = `${base}?${new URLSearchParams(oauth)}`;
  const res = await fetchRetry(url, {
    method: "POST",
    headers: {
      "User-Agent": UA_MOBILE,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  if (!res.ok) {
    throw new Error(`Garmin OAuth2 exchange failed: ${res.status}`);
  }
  const json = (await res.json()) as Omit<GarminOauth2, "expires_at">;
  return { ...json, expires_at: Math.floor(Date.now() / 1000) + json.expires_in };
}

/** Full login from credentials. Returns fresh tokens (does not persist). */
export async function login(
  email: string,
  password: string,
): Promise<GarminTokens> {
  const jar = new CookieJar();
  const ticket = await getLoginTicket(jar, email, password);
  const oauth1 = await getOauth1Token(ticket);
  const oauth2 = await exchange(oauth1);
  return { oauth1, oauth2 };
}

/**
 * Return a valid OAuth2 bearer token, refreshing or re-logging in as needed,
 * and persisting whatever changed. Credentials come from SST secrets.
 */
export async function getValidAccessToken(
  userId: string = USER_ID,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const tokens = await loadTokens(userId);

  if (tokens && tokens.oauth2.expires_at - 60 > now) {
    return tokens.oauth2.access_token;
  }

  // OAuth2 expired but OAuth1 still good → cheap refresh, no password.
  if (tokens) {
    try {
      const oauth2 = await exchange(tokens.oauth1);
      await saveTokens({ oauth1: tokens.oauth1, oauth2 }, userId);
      return oauth2.access_token;
    } catch {
      // OAuth1 likely expired too — fall through to full login.
    }
  }

  const fresh = await login(
    Resource.GarminEmail.value,
    Resource.GarminPassword.value,
  );
  await saveTokens(fresh, userId);
  return fresh.oauth2.access_token;
}

async function garminFetch<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetchRetry(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": UA_MOBILE,
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Garmin ${url} -> ${res.status} ${body}`);
  }
  // Some endpoints (DELETE, schedule) reply with an empty body — don't choke.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// --- workout building --------------------------------------------------------

type Json = Record<string, unknown>;

const RUNNING_SPORT = {
  sportTypeId: 1,
  sportTypeKey: "running",
  displayOrder: 1,
};

// Step types as Garmin keys/ids.
const STEP_TYPE = {
  warmup: { stepTypeId: 1, stepTypeKey: "warmup", displayOrder: 1 },
  cooldown: { stepTypeId: 2, stepTypeKey: "cooldown", displayOrder: 2 },
  run: { stepTypeId: 3, stepTypeKey: "interval", displayOrder: 3 },
  recovery: { stepTypeId: 4, stepTypeKey: "recovery", displayOrder: 4 },
  rest: { stepTypeId: 5, stepTypeKey: "rest", displayOrder: 5 },
} as const;

type StepKind = keyof typeof STEP_TYPE;

export type Duration =
  | { kind: "time"; seconds: number }
  | { kind: "distance"; meters: number }
  | { kind: "lap" };

function endCondition(d: Duration): Json {
  switch (d.kind) {
    case "time":
      return {
        endCondition: {
          conditionTypeId: 2,
          conditionTypeKey: "time",
          displayOrder: 1,
          displayable: true,
        },
        endConditionValue: d.seconds,
        preferredEndConditionUnit: null,
      };
    case "distance":
      return {
        endCondition: {
          conditionTypeId: 3,
          conditionTypeKey: "distance",
          displayOrder: 3,
          displayable: true,
        },
        endConditionValue: d.meters,
        preferredEndConditionUnit: { unitKey: "kilometer" },
      };
    case "lap":
      return {
        endCondition: {
          conditionTypeId: 1,
          conditionTypeKey: "lap.button",
          displayOrder: 1,
          displayable: true,
        },
        endConditionValue: null,
        preferredEndConditionUnit: null,
      };
  }
}

/**
 * Pace target from a sec/km pace plus a ± margin (also sec/km). Garmin stores
 * the target as a speed *range* in metres/second.
 */
function paceTarget(secPerKm: number, marginSecPerKm: number): Json {
  const slower = secPerKm + marginSecPerKm; // bigger pace = slower = lower m/s
  const faster = secPerKm - marginSecPerKm;
  return {
    targetType: {
      workoutTargetTypeId: 6,
      workoutTargetTypeKey: "pace.zone",
      displayOrder: 6,
    },
    targetValueOne: 1000 / slower, // slowest speed (m/s)
    targetValueTwo: 1000 / faster, // fastest speed (m/s)
    targetValueUnit: null,
  };
}

/**
 * Pace target from an explicit band (faster + slower bound, both sec/km). Used
 * when the prescription gives a range like "4:30–4:45/km" directly, so we don't
 * widen it with a margin the way {@link paceTarget} does for a single pace.
 */
function paceTargetRange(fasterSecPerKm: number, slowerSecPerKm: number): Json {
  // Guard against a swapped band: faster must be the smaller sec/km.
  const fast = Math.min(fasterSecPerKm, slowerSecPerKm);
  const slow = Math.max(fasterSecPerKm, slowerSecPerKm);
  return {
    targetType: {
      workoutTargetTypeId: 6,
      workoutTargetTypeKey: "pace.zone",
      displayOrder: 6,
    },
    targetValueOne: 1000 / slow, // slowest speed (m/s)
    targetValueTwo: 1000 / fast, // fastest speed (m/s)
    targetValueUnit: null,
  };
}

const NO_TARGET: Json = {
  targetType: {
    workoutTargetTypeId: 1,
    workoutTargetTypeKey: "no.target",
    displayOrder: 1,
  },
};

export type WorkoutStep = {
  kind: StepKind;
  duration: Duration;
  target?: Json;
  notes?: string;
};

function buildStep(step: WorkoutStep, order: number): Json {
  return {
    type: "ExecutableStepDTO",
    stepId: order,
    stepOrder: order,
    stepType: STEP_TYPE[step.kind],
    childStepId: null,
    description: step.notes ?? null,
    ...endCondition(step.duration),
    ...(step.target ?? NO_TARGET),
  };
}

export type WorkoutInput = {
  name: string;
  description?: string;
  steps: WorkoutStep[];
};

/** Build the IWorkoutDetail payload Garmin's workout-service expects. */
export function buildWorkout(input: WorkoutInput): Json {
  return {
    sportType: RUNNING_SPORT,
    subSportType: null,
    workoutName: input.name,
    description: input.description ?? null,
    estimatedDistanceUnit: { unitKey: null },
    avgTrainingSpeed: null,
    estimatedDurationInSecs: 0,
    estimatedDistanceInMeters: 0,
    estimateType: null,
    isWheelchair: false,
    workoutSegments: [
      {
        segmentOrder: 1,
        sportType: RUNNING_SPORT,
        workoutSteps: input.steps.map((s, i) => buildStep(s, i + 1)),
      },
    ],
  };
}

// --- structured workouts -----------------------------------------------------
//
// A richer model than WorkoutInput: a flat sequence of *elements*, where each
// element is either a single step or a repeat block (Garmin "5x …"). This is
// what the LLM interpreter emits from a plan's free-text prescription, and what
// gets cached on the PlannedRun. Pace can be given as an explicit band
// (paceFastSec/paceSlowSec, sec/km) or a single center pace (paceTargetSec).

export type StepSpec = {
  kind: StepKind;
  duration: Duration;
  /** Single center pace, sec/km. A ± margin is applied at build time. */
  paceTargetSec?: number;
  /** Explicit faster bound of a pace band, sec/km (the smaller number). */
  paceFastSec?: number;
  /** Explicit slower bound of a pace band, sec/km (the larger number). */
  paceSlowSec?: number;
  notes?: string;
};

/**
 * One element of a structured workout: a single step, OR a repeat block when
 * `repeat`/`steps` are set (e.g. 5x [run 1000m, recovery 2min]). The two forms
 * are mutually exclusive — a repeat element ignores the top-level step fields.
 */
export type WorkoutElement = Partial<StepSpec> & {
  repeat?: number;
  steps?: StepSpec[];
};

export type StructuredWorkout = {
  name: string;
  description?: string;
  elements: WorkoutElement[];
};

function specTarget(s: StepSpec, margin: number): Json {
  if (
    s.paceFastSec &&
    s.paceFastSec > 0 &&
    s.paceSlowSec &&
    s.paceSlowSec > 0
  ) {
    return paceTargetRange(s.paceFastSec, s.paceSlowSec);
  }
  if (s.paceTargetSec && s.paceTargetSec > 0) {
    return paceTarget(s.paceTargetSec, margin);
  }
  return NO_TARGET;
}

/**
 * Build the Garmin IWorkoutDetail payload from a structured workout, emitting
 * RepeatGroupDTO blocks so reps render as "5x …" on the watch. stepId/stepOrder
 * are a single running counter across the whole workout (the repeat group itself
 * consumes one); each repeat block gets a distinct childStepId that its nested
 * steps share. `paceMargin` widens a single center pace (sec/km).
 */
export function buildStructuredWorkout(
  w: StructuredWorkout,
  opts: { paceMargin?: number } = {},
): Json {
  const margin = opts.paceMargin ?? 8;
  let stepId = 0;
  let groupId = 0;

  const executable = (s: StepSpec, childStepId: number | null): Json => {
    stepId++;
    return {
      type: "ExecutableStepDTO",
      stepId,
      stepOrder: stepId,
      stepType: STEP_TYPE[s.kind],
      childStepId,
      description: s.notes ?? null,
      ...endCondition(s.duration),
      ...specTarget(s, margin),
    };
  };

  const steps: Json[] = [];
  for (const el of w.elements) {
    if (el.repeat && el.repeat > 1 && el.steps && el.steps.length > 0) {
      stepId++;
      const repeatStepId = stepId;
      groupId++;
      const childStepId = groupId;
      const children = el.steps.map((s) => executable(s, childStepId));
      // "5x1000m com 2min de trote" means rest *between* reps, so drop the
      // trailing recovery/rest after the final rep when the block ends on one.
      const last = el.steps[el.steps.length - 1];
      const skipLastRestStep =
        last?.kind === "recovery" || last?.kind === "rest";
      steps.push({
        type: "RepeatGroupDTO",
        stepId: repeatStepId,
        stepOrder: repeatStepId,
        stepType: { stepTypeId: 6, stepTypeKey: "repeat", displayOrder: 6 },
        childStepId,
        numberOfIterations: el.repeat,
        smartRepeat: false,
        skipLastRestStep,
        endCondition: {
          conditionTypeId: 7,
          conditionTypeKey: "iterations",
          displayOrder: 7,
          displayable: false,
        },
        endConditionValue: el.repeat,
        preferredEndConditionUnit: null,
        workoutSteps: children,
      });
    } else if (el.kind && el.duration) {
      steps.push(executable(el as StepSpec, null));
    }
    // Elements that are neither a valid repeat nor a valid step are skipped.
  }

  return {
    sportType: RUNNING_SPORT,
    subSportType: null,
    workoutName: w.name,
    description: w.description ?? null,
    estimatedDistanceUnit: { unitKey: null },
    avgTrainingSpeed: null,
    estimatedDurationInSecs: 0,
    estimatedDistanceInMeters: 0,
    estimateType: null,
    isWheelchair: false,
    workoutSegments: [
      {
        segmentOrder: 1,
        sportType: RUNNING_SPORT,
        workoutSteps: steps,
      },
    ],
  };
}

/**
 * Map one of this app's PlannedRun rows to a Garmin running workout.
 *
 * The base plan model is a single prescribed run (no structured reps), so we
 * emit a single run step: ended by distance if set, else by time, else
 * lap-button. A pace target is attached when the plan carries one. `paceMargin`
 * widens the pace band (sec/km) so the watch alert isn't impossibly tight.
 *
 * This is the fallback path; structured interval workouts are built from a
 * {@link StructuredWorkout} via {@link buildStructuredWorkout} instead.
 */
export function planToWorkout(
  plan: PlannedRun,
  opts: { paceMargin?: number } = {},
): WorkoutInput {
  const margin = opts.paceMargin ?? 8;
  let duration: Duration;
  if (plan.distance && plan.distance > 0) {
    duration = { kind: "distance", meters: plan.distance };
  } else if (plan.durationSec && plan.durationSec > 0) {
    duration = { kind: "time", seconds: plan.durationSec };
  } else {
    duration = { kind: "lap" };
  }
  const target =
    plan.paceTargetSec && plan.paceTargetSec > 0
      ? paceTarget(plan.paceTargetSec, margin)
      : undefined;
  return {
    name: planTitle(plan),
    description: plan.notes,
    steps: [{ kind: "run", duration, target, notes: plan.notes }],
  };
}

// --- workout API -------------------------------------------------------------

export type CreatedWorkout = { workoutId: number; workoutName: string };

/**
 * Normalise the three accepted forms into the raw Garmin payload:
 *   - StructuredWorkout (has `elements`) -> buildStructuredWorkout
 *   - WorkoutInput (has `steps`)         -> buildWorkout
 *   - already-built Json                 -> passed through
 */
function toWorkoutPayload(
  workout: WorkoutInput | StructuredWorkout | Json,
): Json {
  if ("elements" in workout)
    return buildStructuredWorkout(workout as StructuredWorkout);
  if ("steps" in workout) return buildWorkout(workout as WorkoutInput);
  return workout as Json;
}

export async function createWorkout(
  workout: WorkoutInput | StructuredWorkout | Json,
  accessToken: string,
): Promise<CreatedWorkout> {
  return garminFetch<CreatedWorkout>(WORKOUT_URL(), accessToken, {
    method: "POST",
    body: JSON.stringify(toWorkoutPayload(workout)),
  });
}

/**
 * Overwrite an existing workout in place (PUT), keeping its id and any calendar
 * schedule. Used to re-sync the name/steps after the plan's title changes.
 */
export async function updateWorkout(
  workoutId: number,
  workout: WorkoutInput | StructuredWorkout | Json,
  accessToken: string,
): Promise<CreatedWorkout> {
  const payload = toWorkoutPayload(workout);
  const res = await garminFetch<CreatedWorkout | undefined>(
    WORKOUT_URL(workoutId),
    accessToken,
    {
      method: "PUT",
      body: JSON.stringify({ ...payload, workoutId }),
    },
  );
  // A successful PUT replies 204 with no body — synthesise a result from what
  // we sent so callers always get a usable { workoutId, workoutName }.
  return res ?? { workoutId, workoutName: String(payload.workoutName ?? "") };
}

/** Fetch a workout's full detail payload (used to inspect what Garmin stored). */
export async function getWorkout(
  workoutId: number,
  accessToken: string,
): Promise<Json> {
  return garminFetch<Json>(WORKOUT_URL(workoutId), accessToken, {
    method: "GET",
  });
}

/** Delete a workout (and any calendar schedule for it). */
export async function deleteWorkout(
  workoutId: number,
  accessToken: string,
): Promise<unknown> {
  return garminFetch(WORKOUT_URL(workoutId), accessToken, {
    method: "DELETE",
  });
}

/** Schedule an existing workout onto a calendar date (YYYY-MM-DD). */
export async function scheduleWorkout(
  workoutId: number,
  date: string,
  accessToken: string,
): Promise<unknown> {
  return garminFetch(SCHEDULE_WORKOUT_URL(workoutId), accessToken, {
    method: "POST",
    body: JSON.stringify({ date }),
  });
}
