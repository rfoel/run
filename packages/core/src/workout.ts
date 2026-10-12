import {
  BatchGetCommand,
  type BatchGetCommandOutput,
  DeleteCommand,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, tableName } from "./db.ts";
import { MIN_HUMAN_PACE_SEC_PER_KM } from "./limits.ts";
import { userPk, USER_ID } from "./user.ts";
import type { ChartSeries } from "./track.ts";

/**
 * Per-workout chart series, stored as its own item so the activity list stays
 * small. One row per (source, externalId).
 */
const streamSk = (source: string, externalId: string) =>
  `STREAM#${source}#${externalId}`;

const analysisSk = (source: string, externalId: string) =>
  `ANALYSIS#${source}#${externalId}`;

const extrasSk = (source: string, externalId: string) =>
  `EXTRAS#${source}#${externalId}`;

export async function putChartSeries(
  source: string,
  externalId: string,
  series: ChartSeries,
  userId: string = USER_ID,
) {
  await ddb.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        pk: userPk(userId),
        sk: streamSk(source, externalId),
        ...series,
      },
    }),
  );
}

/**
 * Blank out pace samples no human produced.
 *
 * buildChartSeries now refuses to write these, but series already in the table
 * were built before that and can't be rebuilt — the runs affected came from
 * Strava, which is no longer an ingestion source, so there are no samples to
 * re-fetch. Sanitising on the way out fixes every existing reader at once
 * instead of migrating rows that would still hold a broken distance stream.
 *
 * Only `pace` is repaired. `km` keeps its jump, which is why the best-effort
 * search judges the whole stream untrustworthy rather than trusting it here.
 */
function sanitizePace(series: ChartSeries): ChartSeries {
  let bad = 0;
  for (const p of series.pace) {
    if (p != null && p < MIN_HUMAN_PACE_SEC_PER_KM) bad++;
  }
  if (bad === 0) return series;
  return {
    ...series,
    pace: series.pace.map((p) =>
      p != null && p < MIN_HUMAN_PACE_SEC_PER_KM ? null : p,
    ),
  };
}

export async function getChartSeries(
  source: string,
  externalId: string,
  userId: string = USER_ID,
): Promise<ChartSeries | undefined> {
  const res = await ddb.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: streamSk(source, externalId) },
    }),
  );
  if (!res.Item) return undefined;
  const { pk: _pk, sk: _sk, ...series } = res.Item;
  return sanitizePace(series as ChartSeries);
}

// --- Device extras (laps, zones, weather, physio) ---------------------------
// Everything the device/platform computed beyond the sample streams, stored as
// its own item per (source, externalId). Normalized/source-agnostic so the web
// and the analysis never see Garmin field names.

export type DeviceLap = {
  index: number; // 1-based
  intensity?: string; // warmup | interval | recovery | rest | cooldown | active
  wktStepIndex?: number; // structured-workout step this lap executed
  distance: number; // meters
  duration: number; // seconds
  paceSecPerKm?: number;
  avgHr?: number;
  maxHr?: number;
  avgPower?: number;
  avgCadence?: number;
  elevGain?: number;
  compliance?: number; // 0-100 vs the structured step
};

export type ZoneTime = { zone: number; secs: number; low: number };

export type ActivityExtras = {
  /** Watch laps — authoritative rep/recovery boundaries when the run followed a structured workout. */
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
  /** Athlete-entered on the watch after the run. rpe on the 1-10 scale. */
  feedback?: { rpe?: number; feel?: number; compliance?: number };
};

export async function putExtras(
  source: string,
  externalId: string,
  extras: ActivityExtras,
  userId: string = USER_ID,
) {
  await ddb.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        pk: userPk(userId),
        sk: extrasSk(source, externalId),
        ...extras,
      },
    }),
  );
}

export async function getExtras(
  source: string,
  externalId: string,
  userId: string = USER_ID,
): Promise<ActivityExtras | undefined> {
  const res = await ddb.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: extrasSk(source, externalId) },
    }),
  );
  if (!res.Item) return undefined;
  const { pk: _pk, sk: _sk, ...extras } = res.Item;
  return extras as ActivityExtras;
}

// --- Coach analysis (Claude structured output, matches workout_schema.json) ---

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
  /** Short pt-BR title reflecting actual execution — used to rename the activity. */
  title?: string;
  type:
    | "interval"
    | "tempo"
    | "long"
    | "easy"
    | "regen"
    | "race"
    | "fartlek";
  subtype?: string;
  prescription?: Record<string, unknown>;
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
    pattern?:
      | "consistent"
      | "positive_split"
      | "negative_split"
      | "fade"
      | "fast_start_stabilize"
      | "irregular";
    hr_drift_bpm?: number;
    target_hit?: boolean;
    rpe_estimate?: number;
    highlights?: string[];
    issues?: string[];
    next_workout_suggestion?: string;
  };
  comparisons?: Record<string, unknown>;
};

export type StoredAnalysis = {
  analysis: WorkoutAnalysis;
  model: string;
  createdAt: string;
};

export async function putAnalysis(
  source: string,
  externalId: string,
  stored: StoredAnalysis,
  userId: string = USER_ID,
) {
  await ddb.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        pk: userPk(userId),
        sk: analysisSk(source, externalId),
        ...stored,
      },
    }),
  );
}

export async function getAnalysis(
  source: string,
  externalId: string,
  userId: string = USER_ID,
): Promise<StoredAnalysis | undefined> {
  const res = await ddb.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: analysisSk(source, externalId) },
    }),
  );
  if (!res.Item) return undefined;
  const { pk: _pk, sk: _sk, ...rest } = res.Item;
  return rest as StoredAnalysis;
}

type RunKey = { source: string; externalId: string };

/**
 * Batch-read one kind of satellite item for many runs, keyed by
 * `${source}#${externalId}`. Missing items are simply absent from the map.
 * BatchGet takes 100 keys per call and may return some as unprocessed, which
 * are retried until drained.
 */
async function getMany(
  runs: RunKey[],
  skFor: (source: string, externalId: string) => string,
  userId: string,
): Promise<Map<string, Record<string, unknown>>> {
  const pk = userPk(userId);
  const prefix = skFor("", "").length;
  const out = new Map<string, Record<string, unknown>>();
  const unique = [...new Set(runs.map((r) => skFor(r.source, r.externalId)))];
  for (let i = 0; i < unique.length; i += 100) {
    let keys: Record<string, unknown>[] | undefined = unique
      .slice(i, i + 100)
      .map((sk) => ({ pk, sk }));
    for (let attempt = 0; keys && keys.length > 0 && attempt < 5; attempt++) {
      const res: BatchGetCommandOutput = await ddb.send(
        new BatchGetCommand({
          RequestItems: { [tableName()]: { Keys: keys } },
        }),
      );
      for (const item of res.Responses?.[tableName()] ?? []) {
        const { pk: _pk, sk, ...rest } = item;
        // sk is "<KIND>#<source>#<externalId>"; the map key drops the kind.
        out.set((sk as string).slice(prefix - 1).replace(/^#/, ""), rest);
      }
      keys = res.UnprocessedKeys?.[tableName()]?.Keys;
    }
  }
  return out;
}

/** Device extras for many runs, keyed by `${source}#${externalId}`. */
export async function getManyExtras(
  runs: RunKey[],
  userId: string = USER_ID,
): Promise<Map<string, ActivityExtras>> {
  return (await getMany(runs, extrasSk, userId)) as Map<string, ActivityExtras>;
}

/** Stored analyses for many runs, keyed by `${source}#${externalId}`. */
export async function getManyAnalyses(
  runs: RunKey[],
  userId: string = USER_ID,
): Promise<Map<string, StoredAnalysis>> {
  return (await getMany(runs, analysisSk, userId)) as Map<
    string,
    StoredAnalysis
  >;
}

/**
 * Drop the three satellite items a run accumulates. deleteActivity only removes
 * the ACTIVITY row and fixes the stats, so without this the chart series,
 * device extras and stored analysis outlive the run they belong to.
 *
 * Deletes are unconditional: a run that never had a series or an analysis simply
 * has nothing to remove there.
 */
export async function deleteWorkoutItems(
  source: string,
  externalId: string,
  userId: string = USER_ID,
): Promise<void> {
  const pk = userPk(userId);
  await Promise.all(
    [
      streamSk(source, externalId),
      extrasSk(source, externalId),
      analysisSk(source, externalId),
    ].map((sk) =>
      ddb.send(
        new DeleteCommand({ TableName: tableName(), Key: { pk, sk } }),
      ),
    ),
  );
}
