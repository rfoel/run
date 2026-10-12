import { mondayOf } from "@run/core/weeks";
import type { BlockPhase, BlockWeek, TrainingBlock } from "./api.ts";

// Local copies of @run/core/block's pure lookups: that module also carries the
// DynamoDB client, which must stay out of the web bundle.

/** The block covering `date`, preferring an active one. */
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
  const week = block.weeks[i];
  return week ? { number: i + 1, week } : undefined;
}

export const PHASE_LABEL: Record<BlockPhase, string> = {
  base: "Base",
  build: "Construção",
  peak: "Pico",
  taper: "Polimento",
  race: "Prova",
  recovery: "Recuperação",
};

/** For labels on a phone-wide strip. */
export const PHASE_SHORT: Record<BlockPhase, string> = {
  base: "Base",
  build: "Constr.",
  peak: "Pico",
  taper: "Polim.",
  race: "Prova",
  recovery: "Recup.",
};
