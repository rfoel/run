import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb, tableName } from "./db.ts";
import { userPk, USER_ID } from "./user.ts";
import { addDays, mondayOf } from "./weeks.ts";

/**
 * A training block: the cycle a set of planned runs belongs to — a goal (often
 * a race), and a run of Monday-to-Sunday weeks, each with a phase and a volume
 * target. Planned runs point at it through `blockId`.
 */

export type BlockPhase =
  | "base"
  | "build"
  | "peak"
  | "taper"
  | "race"
  | "recovery";

export type BlockStatus = "active" | "completed" | "abandoned";

export type BlockWeek = {
  /** Monday, YYYY-MM-DD. Derived from the block's start; never stored out of step. */
  weekStart: string;
  phase: BlockPhase;
  /** Planned weekly volume, km. */
  targetKm?: number;
  /** One line on what the week is for, pt-BR. */
  focus?: string;
};

export type TrainingBlock = {
  id: string;
  userId: string;
  name: string;
  /** Free-text goal, e.g. "Meia maratona abaixo de 1h45". */
  goal?: string;
  raceDate?: string;
  raceDistanceM?: number;
  targetTimeSec?: number;
  /** Monday the first week starts. */
  startDate: string;
  /** Sunday the last week ends. */
  endDate: string;
  weeks: BlockWeek[];
  status: BlockStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type BlockInput = {
  name: string;
  goal?: string;
  raceDate?: string;
  raceDistanceM?: number;
  targetTimeSec?: number;
  /** Any date; the block starts on that week's Monday. */
  startDate: string;
  weeks: Array<Omit<BlockWeek, "weekStart">>;
  status?: BlockStatus;
  notes?: string;
};

const sk = (startDate: string, id: string) => `BLOCK#${startDate}#${id}`;

function layoutWeeks(
  startDate: string,
  weeks: Array<Omit<BlockWeek, "weekStart">>,
): { startDate: string; endDate: string; weeks: BlockWeek[] } {
  const monday = mondayOf(startDate);
  const laid = weeks.map((w, i) => ({ ...w, weekStart: addDays(monday, i * 7) }));
  return {
    startDate: monday,
    endDate: addDays(monday, Math.max(weeks.length, 1) * 7 - 1),
    weeks: laid,
  };
}

async function putBlock(block: TrainingBlock) {
  await ddb.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        pk: userPk(block.userId),
        sk: sk(block.startDate, block.id),
        ...block,
      },
    }),
  );
}

export async function createBlock(
  input: BlockInput,
  userId: string = USER_ID,
): Promise<TrainingBlock> {
  const now = new Date().toISOString();
  const block: TrainingBlock = {
    id: randomUUID(),
    userId,
    name: input.name,
    goal: input.goal,
    raceDate: input.raceDate,
    raceDistanceM: input.raceDistanceM,
    targetTimeSec: input.targetTimeSec,
    ...layoutWeeks(input.startDate, input.weeks),
    status: input.status ?? "active",
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };
  await putBlock(block);
  return block;
}

export async function listBlocks(
  userId: string = USER_ID,
): Promise<TrainingBlock[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": userPk(userId), ":prefix": "BLOCK#" },
    }),
  );
  return (res.Items ?? []).map((item) => {
    const { pk: _pk, sk: _sk, ...block } = item;
    return block as TrainingBlock;
  });
}

export async function findBlock(
  id: string,
  userId: string = USER_ID,
): Promise<TrainingBlock | undefined> {
  return (await listBlocks(userId)).find((b) => b.id === id);
}

/**
 * The block covering `date`, preferring an active one. Blocks are few (one per
 * cycle), so this filters the full list rather than indexing by date.
 */
export function blockOn(
  blocks: TrainingBlock[],
  date: string,
): TrainingBlock | undefined {
  const covering = blocks.filter(
    (b) => b.startDate <= date && date <= b.endDate && b.status !== "abandoned",
  );
  return covering.find((b) => b.status === "active") ?? covering[0];
}

/** The block's week containing `date`, with its 1-based number. */
export function blockWeekOn(
  block: TrainingBlock,
  date: string,
): { number: number; week: BlockWeek } | undefined {
  const monday = mondayOf(date);
  const i = block.weeks.findIndex((w) => w.weekStart === monday);
  return i < 0 ? undefined : { number: i + 1, week: block.weeks[i]! };
}

/**
 * Replace a block's fields. Changing `startDate` or `weeks` re-lays the weeks
 * from the (Monday of the) start date; the item moves since its key embeds it.
 */
export async function updateBlock(
  id: string,
  patch: Partial<BlockInput>,
  userId: string = USER_ID,
): Promise<TrainingBlock> {
  const current = await findBlock(id, userId);
  if (!current) throw new Error(`block not found: ${id}`);
  const weeks =
    patch.weeks ?? current.weeks.map(({ weekStart: _w, ...rest }) => rest);
  const next: TrainingBlock = {
    ...current,
    ...Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    ),
    ...layoutWeeks(patch.startDate ?? current.startDate, weeks),
    updatedAt: new Date().toISOString(),
  };
  await putBlock(next);
  if (next.startDate !== current.startDate) {
    await ddb.send(
      new DeleteCommand({
        TableName: tableName(),
        Key: { pk: userPk(userId), sk: sk(current.startDate, current.id) },
      }),
    );
  }
  return next;
}

export async function deleteBlock(
  id: string,
  userId: string = USER_ID,
): Promise<boolean> {
  const current = await findBlock(id, userId);
  if (!current) return false;
  await ddb.send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: sk(current.startDate, current.id) },
    }),
  );
  return true;
}
