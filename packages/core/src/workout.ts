import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, tableName } from "./db.ts";
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
  return series as ChartSeries;
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
