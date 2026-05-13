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

export type PlannedRunType =
  | "easy"
  | "long"
  | "tempo"
  | "interval"
  | "race"
  | "recovery";

export type PlannedRunStatus = "planned" | "done" | "skipped";

export type PlannedRun = {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  type: PlannedRunType;
  distance?: number; // meters
  durationSec?: number;
  paceTargetSec?: number; // sec/km
  notes?: string;
  status: PlannedRunStatus;
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
      | "status"
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

/**
 * Match an incoming Activity to the first still-planned PlannedRun on the same
 * date and snapshot the actual metrics onto it. Returns the linked plan id
 * (or null if no plan exists for that day).
 */
export async function linkActivityToPlan(
  activity: ActivityLike,
): Promise<string | null> {
  const date = activity.startDate.slice(0, 10);
  const plans = await listPlans({ from: date, to: date, userId: activity.userId });
  const plan = plans.find((p) => p.status === "planned");
  if (!plan) return null;
  await updatePlan(
    plan.date,
    plan.id,
    {
      status: "done",
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
  return plan.id;
}
