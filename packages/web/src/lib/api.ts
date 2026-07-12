const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

const TOKEN_KEY = "run.writeToken";

export function getWriteToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setWriteToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearWriteToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

function authHeaders(): Record<string, string> {
  const t = getWriteToken();
  return t ? { "x-write-token": t } : {};
}

export type Activity = {
  source: "strava" | "garmin" | "apple" | "manual";
  externalId: string;
  startDate: string;
  name: string;
  sportType: string;
  distance: number;
  movingTime: number;
  elapsedTime: number;
  elevationGain: number;
  avgHr?: number;
  maxHr?: number;
  avgCadence?: number;
  polyline?: string;
  indoor?: boolean;
};

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Stat = {
  scope: string;
  count: number;
  distance: number;
  movingTime: number;
  elapsedTime: number;
  elevationGain: number;
};

export type StatsResponse = {
  total?: Stat;
  year?: Stat;
  month?: Stat;
  week?: Stat;
};

export async function getStats(): Promise<StatsResponse> {
  const res = await fetch(`${BASE}/stats`);
  if (!res.ok) throw new Error(`stats ${res.status}`);
  return (await res.json()) as StatsResponse;
}

export type PlannedRun = {
  id: string;
  date: string;
  type: "easy" | "long" | "tempo" | "interval" | "race" | "recovery";
  distance?: number;
  durationSec?: number;
  paceTargetSec?: number;
  notes?: string;
  status: "planned" | "done" | "skipped";
  garminWorkoutId?: number;
  actualSource?: string;
  actualExternalId?: string;
  actualStartDate?: string;
  actualDistance?: number;
  actualMovingTime?: number;
  actualAvgHr?: number;
  actualName?: string;
};

export async function listPlans(opts: { from?: string; to?: string } = {}) {
  const qs = new URLSearchParams();
  if (opts.from) qs.set("from", opts.from);
  if (opts.to) qs.set("to", opts.to);
  const res = await fetch(`${BASE}/plans?${qs}`);
  if (!res.ok) throw new Error(`plans ${res.status}`);
  const data = (await res.json()) as { items: PlannedRun[] };
  return data.items;
}

export async function deletePlan(date: string, id: string) {
  const res = await fetch(`${BASE}/plans/${date}/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`delete plan ${res.status}`);
}

export type SyncResult = {
  fetched: number;
  imported: number;
  skipped: number;
  linked: number;
  errors: string[];
};

export async function syncStrava(days = 30): Promise<SyncResult> {
  const res = await fetch(`${BASE}/strava/sync?days=${days}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`sync ${res.status}`);
  return (await res.json()) as SyncResult;
}

export async function syncGarmin(days = 30): Promise<SyncResult> {
  const res = await fetch(`${BASE}/garmin/sync?days=${days}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `garmin sync ${res.status}`);
  }
  return (await res.json()) as SyncResult;
}

export type GarminPushResult = {
  created: number;
  updated: number;
  errors: string[];
};

export async function pushGarmin(
  opts: { from?: string; to?: string } = {},
): Promise<GarminPushResult> {
  const qs = new URLSearchParams();
  if (opts.from) qs.set("from", opts.from);
  if (opts.to) qs.set("to", opts.to);
  const res = await fetch(`${BASE}/garmin/push?${qs}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `garmin push ${res.status}`);
  }
  return (await res.json()) as GarminPushResult;
}

export type CreatedCourse = {
  courseId: number;
  courseName: string;
  url: string;
};

export async function createCourse(input: {
  name: string;
  description?: string;
  points: { lat: number; lon: number }[];
}): Promise<CreatedCourse> {
  const res = await fetch(`${BASE}/courses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `course ${res.status}`);
  }
  return (await res.json()) as CreatedCourse;
}

export async function resyncActivity(
  source: string,
  externalId: string,
): Promise<{ ok: boolean; points: number }> {
  const res = await fetch(
    `${BASE}/activities/${source}/${encodeURIComponent(externalId)}/resync`,
    {
      method: "POST",
      headers: authHeaders(),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `resync ${res.status}`);
  }
  return (await res.json()) as { ok: boolean; points: number };
}

export async function deleteActivity(source: string, externalId: string) {
  const res = await fetch(
    `${BASE}/activities/${source}/${encodeURIComponent(externalId)}`,
    {
      method: "DELETE",
      headers: authHeaders(),
    },
  );
  if (!res.ok) throw new Error(`delete activity ${res.status}`);
}

export async function listActivities(
  opts: { limit?: number; from?: string; to?: string } | number = 50,
): Promise<Activity[]> {
  const { limit = 50, from, to } =
    typeof opts === "number" ? { limit: opts } : opts;
  const qs = new URLSearchParams({ limit: String(limit) });
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const res = await fetch(`${BASE}/activities?${qs}`);
  if (!res.ok) throw new Error(`activities ${res.status}`);
  const data = (await res.json()) as { items: Activity[] };
  return data.items;
}

export async function chatStream(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal,
) {
  const res = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`chat ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) onChunk(decoder.decode(value, { stream: true }));
  }
}

export type ChartSeries = {
  km: number[];
  pace: (number | null)[];
  hr: (number | null)[];
  elapsed: number[];
};

export type WorkoutSection = {
  kind:
    | "warmup"
    | "rep"
    | "recovery"
    | "tempo"
    | "tempo_split"
    | "easy_split"
    | "cooldown";
  index?: number;
  start_km?: number;
  end_km?: number;
  distance_m: number;
  duration_sec: number;
  avg_pace_sec_per_km: number;
  avg_hr?: number;
  max_hr?: number;
  vs_target_sec_per_km?: number;
};

export type WorkoutAnalysis = {
  workout_id: string;
  date: string;
  type: "interval" | "tempo" | "long" | "easy" | "regen" | "race" | "fartlek";
  subtype?: string;
  prescription?: {
    reps?: number;
    rep_distance_m?: number;
    recovery_seconds?: number;
    target_pace_min_per_km?: { min?: string; max?: string };
    notes?: string;
  };
  totals: {
    distance_km: number;
    duration_sec: number;
    avg_pace_sec_per_km: number;
    avg_hr?: number;
    max_hr?: number;
    elevation_gain_m?: number;
  };
  sections: WorkoutSection[];
  analysis?: {
    pattern?: string;
    hr_drift_bpm?: number;
    target_hit?: boolean;
    rpe_estimate?: number;
    highlights?: string[];
    issues?: string[];
    next_workout_suggestion?: string;
  };
  comparisons?: { threshold_pace_estimate?: string };
};

export type StoredAnalysis = {
  analysis: WorkoutAnalysis;
  model: string;
  createdAt: string;
};

export type ActivityDetail = {
  activity: Activity & { splits?: unknown[]; maxHr?: number };
  series: ChartSeries | null;
  analysis: StoredAnalysis | null;
  plan: PlannedRun | null;
};

export async function getActivityDetail(
  source: string,
  externalId: string,
): Promise<ActivityDetail> {
  const res = await fetch(
    `${BASE}/activities/${source}/${encodeURIComponent(externalId)}`,
  );
  if (!res.ok) throw new Error(`detail ${res.status}`);
  return (await res.json()) as ActivityDetail;
}

/**
 * Trigger Claude analysis. The endpoint streams heartbeat whitespace then a
 * final JSON line; we strip the zero-width keep-alive chars and parse the rest.
 */
export async function analyzeWorkout(
  source: string,
  externalId: string,
  signal?: AbortSignal,
): Promise<WorkoutAnalysis> {
  const res = await fetch(`${BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ source, externalId }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`analyze ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) buf += decoder.decode(value, { stream: true });
  }
  const clean = buf.replace(/​/g, "").trim();
  const parsed = JSON.parse(clean) as
    | { ok: true; analysis: WorkoutAnalysis }
    | { ok: false; error: string };
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.analysis;
}

export async function verifyWriteToken(token: string): Promise<boolean> {
  const res = await fetch(`${BASE}/auth/verify`, {
    method: "POST",
    headers: { "x-write-token": token },
  });
  return res.ok;
}
