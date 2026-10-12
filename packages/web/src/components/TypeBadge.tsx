import { type PlannedRun } from "../lib/api.ts";

export const PLAN_TYPE_LABELS: Record<PlannedRun["type"], string> = {
  easy: "Leve",
  long: "Longão",
  tempo: "Tempo",
  interval: "Tiro",
  race: "Prova",
  recovery: "Regen",
};

// Saturated enough to read on both the light and dark backgrounds, with white
// text on top.
export const PLAN_TYPE_COLORS: Record<PlannedRun["type"], string> = {
  easy: "#00a35a",
  long: "#0a7cff",
  tempo: "#e85d04",
  interval: "#e5262b",
  race: "#7b3fe4",
  recovery: "#707072",
};

export function TypeBadge({
  type,
  className = "",
}: {
  type: PlannedRun["type"];
  className?: string;
}) {
  return (
    <span
      style={{ backgroundColor: PLAN_TYPE_COLORS[type] }}
      className={
        "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-bold uppercase tracking-wide text-white " +
        className
      }
    >
      {PLAN_TYPE_LABELS[type]}
    </span>
  );
}
