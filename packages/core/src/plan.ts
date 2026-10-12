import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb, tableName } from "./db.ts";
import { userPk, USER_ID } from "./user.ts";
import type { StructuredWorkout } from "./garmin.ts";

export type PlannedRunType =
  | "easy"
  | "long"
  | "tempo"
  | "interval"
  | "race"
  | "recovery";

// "partial": a run was linked but covered under 80% of the planned volume.
export type PlannedRunStatus = "planned" | "done" | "partial" | "skipped";

/** How the linked run measured up to the plan. */
export type PlanCompliance = {
  /** Done distance (or moving time, for time-based plans) over planned. */
  volumePct?: number;
  /** From the run's analysis: whether the prescribed target was hit. */
  targetHit?: boolean;
  /** From the run's analysis, e.g. "consistent", "fade", "positive_split". */
  pattern?: string;
  /** RPE 1–10, entered on the watch, else the analysis' estimate. */
  rpe?: number;
};

/** Below this share of the planned volume a linked run counts as partial. */
export const PARTIAL_VOLUME_PCT = 0.8;

export type PlannedRun = {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  type: PlannedRunType;
  distance?: number; // meters
  durationSec?: number;
  paceTargetSec?: number; // sec/km
  notes?: string;
  shortTitle?: string;
  status: PlannedRunStatus;
  /** The training block (cycle) this run belongs to. */
  blockId?: string;
  // Set once the plan has been pushed to Garmin Connect as a workout, so the
  // push is idempotent (re-pushing skips plans that already have an id).
  garminWorkoutId?: number;
  // Structured Garmin workout (warmup/repeats/recovery/cooldown) interpreted
  // from the free-text prescription by the LLM, cached so we don't re-interpret
  // on every push. `workoutHash` fingerprints the source fields it was built
  // from; when they change the cache is stale and we re-interpret.
  workout?: StructuredWorkout;
  workoutHash?: string;
  // True when `workout` was written directly by the coach (MCP) rather than
  // interpreted from the notes. An authored workout is the source of truth and
  // is never re-interpreted, even if the notes change.
  workoutAuthored?: boolean;
  compliance?: PlanCompliance;
  // Snapshot of the matching Activity, denormalized so the Plan page never
  // needs a second roundtrip. If the source activity is later updated, the
  // snapshot may drift — we accept that for personal-use simplicity.
  actualSource?: string;
  actualExternalId?: string;
  actualStartDate?: string;
  actualDistance?: number;
  actualMovingTime?: number;
  actualAvgHr?: number;
  actualName?: string;
  createdAt: string;
  updatedAt: string;
};

const sk = (date: string, id: string) => `PLAN#${date}#${id}`;

export async function createPlan(input: {
  date: string;
  type: PlannedRunType;
  distance?: number;
  durationSec?: number;
  paceTargetSec?: number;
  notes?: string;
  shortTitle?: string;
  blockId?: string;
  /** A coach-authored structured workout; stored as the source of truth. */
  workout?: StructuredWorkout;
  userId?: string;
}): Promise<PlannedRun> {
  const now = new Date().toISOString();
  const plan: PlannedRun = {
    id: randomUUID(),
    userId: input.userId ?? USER_ID,
    date: input.date,
    type: input.type,
    distance: input.distance,
    durationSec: input.durationSec,
    paceTargetSec: input.paceTargetSec,
    notes: input.notes,
    shortTitle: input.shortTitle,
    blockId: input.blockId,
    workout: input.workout,
    workoutAuthored: input.workout ? true : undefined,
    status: "planned",
    createdAt: now,
    updatedAt: now,
  };
  await ddb.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        pk: userPk(plan.userId),
        sk: sk(plan.date, plan.id),
        ...plan,
      },
    }),
  );
  return plan;
}

export async function getPlan(
  date: string,
  id: string,
  userId: string = USER_ID,
): Promise<PlannedRun | undefined> {
  const res = await ddb.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: sk(date, id) },
    }),
  );
  return res.Item as PlannedRun | undefined;
}

export async function listPlans(opts: {
  from?: string;
  to?: string;
  userId?: string;
} = {}): Promise<PlannedRun[]> {
  const userId = opts.userId ?? USER_ID;
  const lo = opts.from ? `PLAN#${opts.from}` : "PLAN#";
  const hi = opts.to ? `PLAN#${opts.to}~` : "PLAN$";
  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: "pk = :pk AND sk BETWEEN :lo AND :hi",
      ExpressionAttributeValues: {
        ":pk": userPk(userId),
        ":lo": lo,
        ":hi": hi,
      },
    }),
  );
  return (res.Items ?? []) as PlannedRun[];
}

export async function updatePlan(
  date: string,
  id: string,
  patch: Partial<
    Pick<
      PlannedRun,
      | "type"
      | "distance"
      | "durationSec"
      | "paceTargetSec"
      | "notes"
      | "shortTitle"
      | "status"
      | "garminWorkoutId"
      | "workout"
      | "workoutHash"
      | "workoutAuthored"
      | "blockId"
      | "compliance"
      | "actualSource"
      | "actualExternalId"
      | "actualStartDate"
      | "actualDistance"
      | "actualMovingTime"
      | "actualAvgHr"
      | "actualName"
    >
  >,
  userId: string = USER_ID,
) {
  const sets: string[] = ["updatedAt = :now"];
  const values: Record<string, unknown> = {
    ":now": new Date().toISOString(),
  };
  const names: Record<string, string> = {};
  let i = 0;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const name = `#k${i}`;
    const value = `:v${i}`;
    names[name] = k;
    values[value] = v;
    sets.push(`${name} = ${value}`);
    i++;
  }
  await ddb.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: sk(date, id) },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

export async function deletePlan(
  date: string,
  id: string,
  userId: string = USER_ID,
) {
  await ddb.send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: sk(date, id) },
    }),
  );
}

type ActivityLike = {
  source: string;
  externalId: string;
  userId: string;
  startDate: string;
  name: string;
  distance: number;
  movingTime: number;
  avgHr?: number;
};

/** Done volume over planned: distance when planned, else moving time. */
export function volumePct(
  plan: Pick<PlannedRun, "distance" | "durationSec">,
  activity: Pick<ActivityLike, "distance" | "movingTime">,
): number | undefined {
  if (plan.distance && plan.distance > 0) return activity.distance / plan.distance;
  if (plan.durationSec && plan.durationSec > 0)
    return activity.movingTime / plan.durationSec;
  return undefined;
}

/**
 * Pick the plan an activity most plausibly executed among one day's plans:
 * the one already linked to it, else the still-planned one whose volume is
 * closest to what was run. Two-a-days and a separate warm-up recording no
 * longer grab whichever plan happens to sort first.
 */
export function bestPlanFor(
  plans: PlannedRun[],
  activity: Pick<ActivityLike, "source" | "externalId" | "distance" | "movingTime">,
): PlannedRun | undefined {
  const linked = plans.find(
    (p) =>
      p.actualSource === activity.source &&
      p.actualExternalId === activity.externalId,
  );
  if (linked) return linked;
  const open = plans.filter((p) => p.status === "planned");
  const distanceTo = (p: PlannedRun) => {
    const pct = volumePct(p, activity);
    return pct == null ? 1 : Math.abs(Math.log(Math.max(pct, 0.01)));
  };
  return open.sort((a, b) => distanceTo(a) - distanceTo(b))[0];
}

/**
 * Match an incoming Activity to the best-fitting plan on the same date (see
 * {@link bestPlanFor}) and snapshot the actual metrics onto it. A run that
 * covered under {@link PARTIAL_VOLUME_PCT} of the planned volume marks the plan
 * partial. Returns the matched plan (or null if no plan exists for that day).
 */
export async function linkActivityToPlan(
  activity: ActivityLike,
): Promise<PlannedRun | null> {
  const date = activity.startDate.slice(0, 10);
  const plans = await listPlans({ from: date, to: date, userId: activity.userId });
  const plan = bestPlanFor(plans, activity);
  if (!plan) return null;
  const pct = volumePct(plan, activity);
  await updatePlan(
    plan.date,
    plan.id,
    {
      status: pct != null && pct < PARTIAL_VOLUME_PCT ? "partial" : "done",
      compliance: {
        ...plan.compliance,
        volumePct: pct != null ? Math.round(pct * 100) / 100 : undefined,
      },
      actualSource: activity.source,
      actualExternalId: activity.externalId,
      actualStartDate: activity.startDate,
      actualDistance: activity.distance,
      actualMovingTime: activity.movingTime,
      actualAvgHr: activity.avgHr,
      actualName: activity.name,
    },
    activity.userId,
  );
  return plan;
}

/**
 * Reverse of linkActivityToPlan: find plans where actual* fields snapshot the
 * given activity and reset them to "planned" with the actual* fields cleared.
 */
export async function unlinkActivityFromPlan(
  source: string,
  externalId: string,
  startDate: string,
  userId: string = USER_ID,
): Promise<number> {
  const date = startDate.slice(0, 10);
  const plans = await listPlans({ from: date, to: date, userId });
  const matches = plans.filter(
    (p) => p.actualSource === source && p.actualExternalId === externalId,
  );
  for (const plan of matches) {
    await ddb.send(
      new UpdateCommand({
        TableName: tableName(),
        Key: { pk: userPk(userId), sk: sk(plan.date, plan.id) },
        UpdateExpression:
          "SET #status = :planned, updatedAt = :now " +
          "REMOVE actualSource, actualExternalId, actualStartDate, " +
          "actualDistance, actualMovingTime, actualAvgHr, actualName, compliance",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":planned": "planned",
          ":now": new Date().toISOString(),
        },
      }),
    );
  }
  return matches.length;
}

const TYPE_LABEL: Record<PlannedRunType, string> = {
  easy: "Easy",
  long: "Long",
  tempo: "Tempo",
  interval: "Intervals",
  race: "Race",
  recovery: "Recovery",
};

function shortenNotes(notes: string): string {
  let s = notes.trim();
  // Drop a leading "Semana N — " / "Semana N (taper): " week/phase prefix that
  // otherwise becomes the whole title (e.g. notes starting "Semana 11 (taper) —
  // Tiros…" would truncate to just "Semana 11").
  s = s.replace(/^semana\s+\d+\s*(\([^)]*\))?\s*[—\-:.]?\s*/iu, "");
  const cut = s.search(/[:(]/u);
  if (cut > 0) s = s.slice(0, cut);
  return s.replace(/[\s.…\-—]+$/u, "").trim();
}

export function planTitle(plan: PlannedRun): string {
  if (plan.shortTitle && plan.shortTitle.trim()) return plan.shortTitle.trim();
  if (plan.notes && plan.notes.trim()) {
    const short = shortenNotes(plan.notes);
    if (short) return short;
  }
  const label = TYPE_LABEL[plan.type];
  if (plan.distance && plan.distance > 0) {
    const km = plan.distance / 1000;
    const formatted = km % 1 === 0 ? km.toFixed(0) : km.toFixed(1);
    return `${label} ${formatted} km`;
  }
  if (plan.durationSec && plan.durationSec > 0) {
    const min = Math.round(plan.durationSec / 60);
    return `${label} ${min} min`;
  }
  return label;
}
