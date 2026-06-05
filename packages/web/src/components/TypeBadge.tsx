import { type PlannedRun } from "../lib/api.ts";

export const PLAN_TYPE_LABELS: Record<PlannedRun["type"], string> = {
  easy: "Leve",
  long: "Longão",
  tempo: "Tempo",
  interval: "Tiro",
  race: "Prova",
  recovery: "Regen",
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
      className={
        "font-mono text-xs uppercase tracking-wider bg-accent text-white px-2 py-0.5 rounded " +
        className
      }
    >
      {PLAN_TYPE_LABELS[type]}
    </span>
  );
}
