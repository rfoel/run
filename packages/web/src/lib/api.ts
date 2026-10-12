import type { AllTimeRecord, StoredBest } from "@run/core/bestEfforts";

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
  /** Computed at ingest — see @run/core/bestEfforts. */
  bestEfforts?: StoredBest[];
};

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

/**
 * One run's geometry for the heatmap. `polyline` is encoded at precision 4
 * (~11 m) rather than the stored 5 — see @run/core/heatmap.
 */
export type HeatmapTrack = {
  source: string;
  externalId: string;
  startDate: string;
  distance: number;
  polyline: string;
};

export const HEATMAP_PRECISION = 4;

export async function listTracks(): Promise<HeatmapTrack[]> {
  const res = await fetch(`${BASE}/tracks`);
  if (!res.ok) throw new Error(`tracks ${res.status}`);
  return ((await res.json()) as { items: HeatmapTrack[] }).items;
}

export type { AllTimeRecord } from "@run/core/bestEfforts";

export async function listRecords(): Promise<AllTimeRecord[]> {
  const res = await fetch(`${BASE}/records`);
  if (!res.ok) throw new Error(`records ${res.status}`);
  return ((await res.json()) as { items: AllTimeRecord[] }).items;
}

export type LatLng = [number, number];

export type CitySummary = {
  city: string;
  state?: string;
  country?: string;
  runs: number;
  distance: number;
  /** [SW, NE] — every run started in this city. */
  bounds: [LatLng, LatLng];
};

export async function listCities(): Promise<CitySummary[]> {
  const res = await fetch(`${BASE}/cities`);
  if (!res.ok) throw new Error(`cities ${res.status}`);
  return ((await res.json()) as { items: CitySummary[] }).items;
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

export type ChartSeries = {
  km: number[];
  pace: (number | null)[];
  hr: (number | null)[];
  elapsed: number[];
  // Optional — absent on series stored before these were ingested.
  ele?: (number | null)[];
  cadence?: (number | null)[];
  power?: (number | null)[];
};

// Device extras — mirrors @run/core/workout ActivityExtras.
export type DeviceLap = {
  index: number;
  intensity?: string;
  wktStepIndex?: number;
  distance: number;
  duration: number;
  paceSecPerKm?: number;
  avgHr?: number;
  maxHr?: number;
  avgPower?: number;
  avgCadence?: number;
  elevGain?: number;
  compliance?: number;
};

export type ZoneTime = { zone: number; secs: number; low: number };

export type ActivityExtras = {
  laps?: DeviceLap[];
  hrZones?: ZoneTime[];
  powerZones?: ZoneTime[];
  weather?: {
    tempC?: number;
    feelsC?: number;
    humidity?: number;
    windKph?: number;
    windDir?: string;
    desc?: string;
  };
  physio?: {
    aerobicTE?: number;
    anaerobicTE?: number;
    teLabel?: string;
    trainingLoad?: number;
    avgPower?: number;
    maxPower?: number;
    normPower?: number;
    avgCadence?: number;
    maxCadence?: number;
    gctMs?: number;
    strideLenCm?: number;
    vertOscCm?: number;
    vertRatio?: number;
    calories?: number;
    modIntensityMin?: number;
    vigIntensityMin?: number;
    bodyBatteryDiff?: number;
    gradeAdjustedPaceSecPerKm?: number;
  };
  feedback?: { rpe?: number; feel?: number; compliance?: number };
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
  title?: string;
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
  extras: ActivityExtras | null;
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
