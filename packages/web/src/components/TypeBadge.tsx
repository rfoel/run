import { type PlannedRun } from "../lib/api.ts";

export const PLAN_TYPE_LABELS: Record<PlannedRun["type"], string> = {
  easy: "Leve",
  long: "Longão",
  tempo: "Tempo",
  interval: "Tiro",
  race: "Prova",
  recovery: "Regen",
};

export const PLAN_TYPE_COLORS: Record<PlannedRun["type"], string> = {
  easy: "#6b8f6b",
  long: "#4a7a9b",
  tempo: "#b5722a",
  interval: "#b04040",
  race: "#7c5fa0",
  recovery: "#7a8a7a",
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
        "font-mono text-xs uppercase tracking-wider text-white px-2 py-0.5 rounded " +
        className
      }
    >
      {PLAN_TYPE_LABELS[type]}
    </span>
  );
}
