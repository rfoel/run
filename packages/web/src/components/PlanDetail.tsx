import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowSquareOutIcon,
  CheckCircleIcon,
  WarningIcon,
  WatchIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { durationText, targetText, workoutDistance } from "@run/core/workoutText";
import type { StepSpec } from "@run/core/workoutTypes";
import { cn } from "cn";
import { Link } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import type { PlannedRun, StructuredWorkout } from "../lib/api.ts";
import { duration, paceFromSec } from "../lib/format.ts";
import { usePlan, usePrefetchActivityDetail } from "../lib/queries.ts";
import {
  isRun,
  PATTERN_LABEL,
  pct,
  PLAN_STATUS_LABEL,
  PlanStatusTag,
} from "./PlanStatus.tsx";
import { Skeleton } from "./Skeleton.tsx";
import { PLAN_TYPE_LABELS, TypeBadge } from "./TypeBadge.tsx";

/**
 * One planned session: the target, the structured steps, the coach's notes
 * and, once run, how it went with a link to the activity.
 */
export default function PlanDetail({
  date,
  id,
  onBack,
}: {
  date: string;
  id: string;
  onBack: () => void;
}) {
  const { plan, isLoading, error } = usePlan(date, id);

  return (
    <section className="flex flex-col gap-8 md:gap-10">
      <div className="-mb-4 md:-mb-6">
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={onBack}
          aria-label="voltar"
          title="voltar"
          className="-ml-2"
        >
          <ArrowLeftIcon className="size-5" />
        </Button>
      </div>

      {plan ? (
        <>
          <Hero plan={plan} />
          {isRun(plan) && <Actual plan={plan} />}
          {plan.workout && plan.workout.elements.length > 0 && (
            <Steps workout={plan.workout} />
          )}
          {plan.notes && (
            <div>
              <SectionTitle>Notas</SectionTitle>
              <p className="rounded-2xl bg-card p-5 leading-relaxed whitespace-pre-wrap sm:p-6">
                {plan.notes}
              </p>
            </div>
          )}
        </>
      ) : isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="mt-3 h-20 w-48 md:h-28 md:w-72" />
          <Skeleton className="mt-6 h-64 w-full rounded-2xl" />
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-2xl bg-card p-5 text-sm text-destructive">
          <WarningIcon className="size-4 shrink-0" />
          {error ? String(error) : "Treino não encontrado."}
        </p>
      )}
    </section>
  );
}

function Hero({ plan }: { plan: PlannedRun }) {
  const title = plan.shortTitle ?? PLAN_TYPE_LABELS[plan.type];
  const day = new Date(`${plan.date}T00:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const meters =
    plan.distance ?? (plan.workout ? workoutDistance(plan.workout) : undefined);
  const ran = isRun(plan);

  return (
    <header className="flex flex-col gap-6">
      {/* React hoists this into <head>. */}
      <title>{`${title} · ${day} · run`}</title>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {day}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <TypeBadge type={plan.type} />
          {plan.status === "planned" ? (
            <span className="text-xs font-semibold text-muted-foreground">
              {PLAN_STATUS_LABEL.planned}
            </span>
          ) : (
            <PlanStatusTag plan={plan} />
          )}
          {plan.garminWorkoutId && !ran && (
            <a
              href={`https://connect.garmin.com/app/workout/${plan.garminWorkoutId}?workoutType=running`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Abrir este treino no Garmin Connect"
            >
              <WatchIcon className="size-4" />
              Garmin
              <ArrowSquareOutIcon className="size-3" />
            </a>
          )}
        </div>
      </div>
      {(meters || plan.durationSec || plan.paceTargetSec) && (
        <div className="flex flex-wrap items-baseline gap-x-10 gap-y-4 md:gap-x-14">
          {meters ? (
            <div className="flex items-baseline gap-2">
              <span className="font-display text-8xl md:text-[10rem]">
                {kmShort(meters)}
              </span>
              <span className="font-display text-3xl text-muted-foreground md:text-4xl">
                km
              </span>
            </div>
          ) : plan.durationSec ? (
            <span className="font-display text-8xl md:text-[10rem]">
              {duration(plan.durationSec)}
            </span>
          ) : null}
          {plan.paceTargetSec && (
            <div className="flex flex-col-reverse gap-1.5">
              <span className="text-xs text-muted-foreground">Pace alvo</span>
              <span className="font-display text-3xl sm:text-4xl md:text-5xl">
                {paceFromSec(plan.paceTargetSec)}
                <Unit>/km</Unit>
              </span>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

/** What was actually run against the plan, and the way into the activity. */
function Actual({ plan }: { plan: PlannedRun }) {
  const prefetch = usePrefetchActivityDetail();
  const c = plan.compliance;
  const tiles: { label: string; value: string; unit?: string }[] = [];
  if (plan.actualDistance != null) {
    tiles.push({ label: "Distância", value: kmShort(plan.actualDistance, 2), unit: "km" });
  }
  if (plan.actualMovingTime != null) {
    tiles.push({ label: "Tempo", value: duration(plan.actualMovingTime) });
    if (plan.actualDistance) {
      tiles.push({
        label: "Pace",
        value: paceFromSec(plan.actualMovingTime / (plan.actualDistance / 1000)),
        unit: "/km",
      });
    }
  }
  if (plan.actualAvgHr != null) {
    tiles.push({ label: "FC média", value: `${Math.round(plan.actualAvgHr)}`, unit: "bpm" });
  }
  if (c?.volumePct != null) {
    tiles.push({ label: "Do volume", value: pct(c.volumePct) });
  }
  if (c?.rpe != null) tiles.push({ label: "RPE", value: `${c.rpe}` });

  const source = plan.actualSource;
  const externalId = plan.actualExternalId;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <SectionTitle className="mb-0">Realizado</SectionTitle>
        {c?.targetHit != null && (
          <span
            className={cn(
              "flex items-center gap-1 text-sm font-semibold",
              c.targetHit ? "text-success" : "text-destructive",
            )}
          >
            {c.targetHit ? (
              <CheckCircleIcon weight="fill" className="size-4" />
            ) : (
              <XCircleIcon weight="fill" className="size-4" />
            )}
            {c.targetHit ? "alvo atingido" : "fora do alvo"}
          </span>
        )}
      </div>
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tiles.map((t) => (
            <div key={t.label} className="flex flex-col rounded-2xl bg-card p-4 sm:p-5">
              <span className="text-xs text-muted-foreground">{t.label}</span>
              <span className="mt-3 font-display text-3xl normal-case sm:text-4xl">
                {t.value}
                {t.unit && <Unit>{t.unit}</Unit>}
              </span>
            </div>
          ))}
        </div>
      )}
      {(c?.pattern || (source && externalId)) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {c?.pattern ? (
            <p className="text-sm text-muted-foreground">
              Ritmo:{" "}
              <span className="font-semibold text-foreground">
                {PATTERN_LABEL[c.pattern] ?? c.pattern}
              </span>
            </p>
          ) : (
            <span />
          )}
          {source && externalId && (
            <Link
              to={`/corridas/${source}/${encodeURIComponent(externalId)}`}
              onMouseEnter={() => prefetch(source, externalId)}
              onFocus={() => prefetch(source, externalId)}
              onTouchStart={() => prefetch(source, externalId)}
              className={buttonVariants({ variant: "secondary", size: "lg", className: "px-3.5" })}
            >
              Ver corrida
              <ArrowRightIcon />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/** The structured workout, one row per step and repeats grouped. */
function Steps({ workout }: { workout: StructuredWorkout }) {
  const meters = workoutDistance(workout);
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <SectionTitle className="mb-0">Estrutura</SectionTitle>
        {meters && (
          <span className="text-sm font-semibold text-muted-foreground tabular-nums">
            {kmShort(meters)} km
          </span>
        )}
      </div>
      <ol className="flex flex-col gap-3 rounded-2xl bg-card p-5 sm:p-6">
        {workout.elements.map((el, i) =>
          el.repeat && el.steps?.length ? (
            <li key={i} className="rounded-xl bg-foreground/5 p-4">
              <span className="font-display text-3xl">{el.repeat}×</span>
              <ol className="mt-3 flex flex-col gap-3">
                {el.steps.map((s, j) => (
                  <StepRow key={j} step={s} />
                ))}
              </ol>
            </li>
          ) : el.kind && el.duration ? (
            <StepRow key={i} step={el as StepSpec} />
          ) : null,
        )}
      </ol>
    </div>
  );
}

const STEP_LABEL: Record<StepSpec["kind"], string> = {
  warmup: "Aquecimento",
  run: "Corrida",
  recovery: "Trote",
  rest: "Parado",
  cooldown: "Desaquecimento",
};

// Monochrome, loud to quiet: the work stands out, the filler recedes.
const STEP_BAR: Record<StepSpec["kind"], string> = {
  run: "bg-foreground",
  warmup: "bg-foreground/40",
  cooldown: "bg-foreground/40",
  recovery: "bg-foreground/15",
  rest: "bg-foreground/15",
};

function StepRow({ step }: { step: StepSpec }) {
  const target = targetText(step);
  return (
    <li className="flex items-stretch gap-3">
      <span className={cn("w-1 shrink-0 rounded-full", STEP_BAR[step.kind])} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <span className="block text-xs text-muted-foreground">
              {STEP_LABEL[step.kind]}
            </span>
            <span className="font-semibold tabular-nums">
              {durationText(step.duration)}
            </span>
          </div>
          {target && (
            <span className="shrink-0 font-semibold tabular-nums">{target}</span>
          )}
        </div>
        {step.notes &&
          step.notes.toLowerCase() !== STEP_LABEL[step.kind].toLowerCase() && (
          <p className="mt-1 text-sm text-muted-foreground">{step.notes}</p>
        )}
      </div>
    </li>
  );
}

/** Section title in the display face. */
function SectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2 className={cn("mb-4 font-display text-2xl md:text-3xl", className)}>
      {children}
    </h2>
  );
}

/** Small unit next to a big display number ("5:40 /km"). */
function Unit({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1 font-sans text-sm font-medium normal-case tracking-normal text-muted-foreground">
      {children}
    </span>
  );
}

/** 21100 → "21,1"; 34000 → "34". */
function kmShort(meters: number, digits = 1) {
  return (meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: digits });
}
