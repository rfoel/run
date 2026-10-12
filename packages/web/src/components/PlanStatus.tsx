import {
  CheckCircleIcon,
  CircleHalfIcon,
  MinusCircleIcon,
} from "@phosphor-icons/react";
import { describeWorkout } from "@run/core/workoutText";
import { cn } from "cn";
import type { PlannedRun, StructuredWorkout } from "../lib/api.ts";

// Shared presentation of a plan's outcome — status, compliance and workout
// structure — so the Plano page, the calendar and the run detail agree.

export const PLAN_STATUS_LABEL: Record<PlannedRun["status"], string> = {
  planned: "planejado",
  done: "feito",
  partial: "parcial",
  skipped: "pulado",
};

/** A linked run exists: done, or partial (under 80% of the planned volume). */
export const isRun = (p: Pick<PlannedRun, "status">) =>
  p.status === "done" || p.status === "partial";

/** "62%" from a 0.62 ratio. */
export const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;

/**
 * Icon + label for a run's outcome. Partial is a half-filled circle in the
 * orange series colour (a graphic, so it only needs 3:1), with the label in
 * the foreground so it stays readable on both themes. Nothing for "planned".
 */
export function PlanStatusTag({
  plan,
  className,
}: {
  plan: Pick<PlannedRun, "status" | "compliance">;
  className?: string;
}) {
  const base = "flex items-center gap-1 text-xs font-semibold tabular-nums";
  switch (plan.status) {
    case "planned":
      return null;
    case "done":
      return (
        <span className={cn(base, "text-success", className)}>
          <CheckCircleIcon weight="fill" className="size-4" />
          feito
        </span>
      );
    case "partial": {
      const v = plan.compliance?.volumePct;
      return (
        <span
          className={cn(base, className)}
          title="Corrida abaixo de 80% do volume planejado"
        >
          <CircleHalfIcon weight="fill" className="size-4 text-chart-5" />
          parcial{v != null && ` · ${pct(v)}`}
        </span>
      );
    }
    case "skipped":
      return (
        <span className={cn(base, "text-muted-foreground", className)}>
          <MinusCircleIcon className="size-4" />
          pulado
        </span>
      );
  }
}

/**
 * "alvo ✓ · RPE 7": how the run measured up, from its analysis. Volume share
 * already rides on the partial tag, so it isn't repeated here.
 */
export function ComplianceMeta({
  plan,
  className,
}: {
  plan: Pick<PlannedRun, "status" | "compliance">;
  className?: string;
}) {
  const c = plan.compliance;
  if (!c || !isRun(plan)) return null;
  const hasTarget = c.targetHit != null;
  const hasRpe = c.rpe != null;
  if (!hasTarget && !hasRpe) return null;
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-xs font-semibold text-muted-foreground tabular-nums",
        className,
      )}
    >
      {hasTarget && (
        <span
          title={c.targetHit ? "Alvo do treino atingido" : "Alvo do treino não atingido"}
        >
          alvo{" "}
          <span className={c.targetHit ? "text-success" : "text-destructive"}>
            {c.targetHit ? "✓" : "✗"}
          </span>
        </span>
      )}
      {hasTarget && hasRpe && <span aria-hidden>·</span>}
      {hasRpe && <span title="Esforço percebido (1–10)">RPE {c.rpe}</span>}
    </span>
  );
}

/**
 * The structured workout, one element per line ("Aquec. 2 km" / "6× (1 km @
 * 4:17–4:26/km + 400 m trote)" / "Desaq. 1 km"), so a narrow tile wraps
 * between steps instead of mid-step.
 */
export function WorkoutSteps({
  workout,
  className,
}: {
  workout: StructuredWorkout;
  className?: string;
}) {
  const steps = describeWorkout(workout).split(" · ").filter(Boolean);
  if (steps.length === 0) return null;
  return (
    <ol
      className={cn(
        "flex flex-col gap-0.5 text-sm font-semibold tabular-nums",
        className,
      )}
      aria-label="Estrutura do treino"
    >
      {steps.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ol>
  );
}
