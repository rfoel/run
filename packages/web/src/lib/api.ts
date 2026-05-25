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

export async function verifyWriteToken(token: string): Promise<boolean> {
  const res = await fetch(`${BASE}/auth/verify`, {
    method: "POST",
    headers: { "x-write-token": token },
  });
  return res.ok;
}
