import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  CloudArrowUpIcon,
  EyeIcon,
  EyeSlashIcon,
  MinusCircleIcon,
  TrashIcon,
  WarningIcon,
  WatchIcon,
} from "@phosphor-icons/react";
import { cn } from "cn";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type PlannedRun } from "../lib/api.ts";
import { useDeletePlan, useGarminPush, usePlans } from "../lib/queries.ts";
import { ListSkeleton, Skeleton } from "./Skeleton.tsx";
import { TypeBadge } from "./TypeBadge.tsx";
import { duration, isoDateDaysFromNow, km } from "../lib/format.ts";

export default function Plan({ unlocked }: { unlocked: boolean }) {
  const from = isoDateDaysFromNow(-14);
  const plansQ = usePlans({ from });
  const items = plansQ.data ?? [];
  const loading = plansQ.isLoading;
  const error = plansQ.error ? String(plansQ.error) : null;
  const [hideDone, setHideDone] = useState(true);

  const garminPush = useGarminPush();
  const pushResult = garminPush.data ?? null;
  const pushing = garminPush.isPending;
  const today = isoDateDaysFromNow(0);
  const toPush = items.filter(
    (p) => p.status === "planned" && p.date >= today,
  ).length;

  if (loading) {
    return (
      <section className="flex flex-col gap-10">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="mb-4 h-7 w-48" />
            <ListSkeleton rows={3} />
          </div>
        ))}
      </section>
    );
  }
  if (error) {
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-card p-5 text-sm text-destructive">
        <WarningIcon className="size-4 shrink-0" />
        {error}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-card p-6 md:p-8">
        <h2 className="font-display text-3xl md:text-4xl">
          Nenhum treino planejado
        </h2>
        {unlocked && (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              Peça ao Claude (via MCP):
            </p>
            <p className="rounded-xl bg-background px-4 py-3 text-sm font-medium">
              "Monta um plano de 5k abaixo de 20min em 12 semanas"
            </p>
          </div>
        )}
      </div>
    );
  }

  const visible = hideDone ? items.filter((p) => p.status !== "done") : items;
  const byWeek = groupByWeek(visible);
  const doneCount = items.filter((p) => p.status === "done").length;
  // The one volt highlight on the page: the next workout still to run.
  const next = items
    .filter((p) => p.status === "planned" && p.date >= today)
    .reduce<PlannedRun | null>(
      (best, p) => (best === null || p.date < best.date ? p : best),
      null,
    );

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setHideDone((h) => !h)}
          >
            {hideDone ? <EyeIcon /> : <EyeSlashIcon />}
            {hideDone
              ? `Mostrar feitos${doneCount > 0 ? ` (${doneCount})` : ""}`
              : "Ocultar feitos"}
          </Button>
          {unlocked && (
            <Button
              size="sm"
              onClick={() => garminPush.mutate({ from: today })}
              disabled={pushing || toPush === 0}
              title={
                toPush === 0
                  ? "Nada para enviar (sem treinos planejados futuros)"
                  : `Enviar ${toPush} treino(s) ao Garmin Connect`
              }
            >
              <CloudArrowUpIcon className={pushing ? "animate-pulse" : ""} />
              {pushing ? "Enviando…" : "Enviar ao Garmin"}
            </Button>
          )}
        </div>
        {unlocked && garminPush.isError && (
          <div className="flex items-center gap-2 rounded-2xl bg-card px-4 py-3 text-sm text-destructive">
            <WarningIcon className="size-4 shrink-0" />
            {String(garminPush.error)}
          </div>
        )}
        {unlocked && pushResult && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-2xl bg-card px-4 py-3 text-sm tabular-nums">
            <span>
              <span className="text-muted-foreground">criados</span>{" "}
              <span className="font-semibold">{pushResult.created}</span>
            </span>
            <span>
              <span className="text-muted-foreground">atualizados</span>{" "}
              <span className="font-semibold">{pushResult.updated}</span>
            </span>
            {pushResult.errors.length > 0 && (
              <span className="flex items-center gap-1 font-semibold text-destructive">
                <WarningIcon className="size-4" />
                erros {pushResult.errors.length}
              </span>
            )}
          </div>
        )}
      </div>
      {byWeek.length === 0 && (
        <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">
          Nenhum treino pendente.{" "}
          <button
            onClick={() => setHideDone(false)}
            className="font-semibold text-foreground underline underline-offset-4 hover:no-underline"
          >
            Mostrar feitos
          </button>
        </p>
      )}
      {byWeek.map((week) => (
        <div key={week.key}>
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-2xl md:text-3xl">{week.title}</h2>
            <span className="text-sm font-semibold text-muted-foreground">
              {week.range}
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {week.runs.map((p) => (
              <PlanRow
                key={`${p.date}/${p.id}`}
                plan={p}
                unlocked={unlocked}
                next={
                  next !== null && p.id === next.id && p.date === next.date
                    ? p.date === today
                      ? "hoje"
                      : "próximo"
                    : null
                }
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function PlanRow({
  plan,
  unlocked,
  next,
}: {
  plan: PlannedRun;
  unlocked: boolean;
  next: string | null;
}) {
  const done = plan.status === "done";
  const skipped = plan.status === "skipped";
  const d = new Date(`${plan.date}T00:00:00`);
  const target = done ? actualMain(plan) : plannedMain(plan);
  const secondary = done
    ? actualExtras(plan)
    : plan.paceTargetSec
      ? [paceString(plan.paceTargetSec)]
      : [];

  return (
    <li
      className={cn(
        "flex gap-4 rounded-2xl bg-card p-4 md:gap-6 md:p-5",
        skipped && "*:opacity-50",
      )}
    >
      {/* Day */}
      <div className="flex w-10 shrink-0 flex-col items-center gap-1 pt-0.5">
        <span className="text-xs font-semibold text-muted-foreground uppercase">
          {d
            .toLocaleDateString("pt-BR", { weekday: "short" })
            .replace(".", "")}
        </span>
        <span className="font-display text-3xl">{d.getDate()}</span>
      </div>

      <div className="min-w-0 flex-1">
        {/* Type + status */}
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={plan.type} />
          {next && (
            <Badge
              variant="volt"
              className="text-[11px] font-bold tracking-wide uppercase"
            >
              {next}
            </Badge>
          )}
          {done && (
            <span className="flex items-center gap-1 text-xs font-semibold text-success">
              <CheckCircleIcon weight="fill" className="size-4" />
              feito
            </span>
          )}
          {skipped && (
            <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <MinusCircleIcon className="size-4" />
              pulado
            </span>
          )}
          {plan.garminWorkoutId && !done && (
            <a
              href={`https://connect.garmin.com/app/workout/${plan.garminWorkoutId}?workoutType=running`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Abrir este treino no Garmin Connect"
            >
              <WatchIcon className="size-4" />
              Garmin
              <ArrowSquareOutIcon className="size-3" />
            </a>
          )}
        </div>

        {/* Stats */}
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="flex items-baseline gap-1">
            <span className="font-display text-4xl">{target.value}</span>
            {target.unit && (
              <span className="text-sm font-semibold text-muted-foreground">
                {target.unit}
              </span>
            )}
          </span>
          {secondary.length > 0 && (
            <span className="text-sm font-semibold tabular-nums">
              {secondary.join(" · ")}
            </span>
          )}
          {done && (
            <span className="text-xs text-muted-foreground tabular-nums line-through">
              {plannedTarget(plan)}
            </span>
          )}
        </div>

        {/* Notes */}
        {plan.notes && (
          <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">
            {plan.notes}
          </p>
        )}
      </div>

      {/* Delete */}
      {!done && unlocked && <DeletePlanButton plan={plan} />}
    </li>
  );
}

function DeletePlanButton({ plan }: { plan: PlannedRun }) {
  const [open, setOpen] = useState(false);
  const del = useDeletePlan();
  const busy = del.isPending;

  async function confirm() {
    try {
      await del.mutateAsync({ date: plan.date, id: plan.id });
      setOpen(false);
    } catch {
      // error surfaced via del.error
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mt-1 -mr-1 shrink-0 text-muted-foreground"
          />
        }
        aria-label="Excluir treino"
        title="Excluir treino"
      >
        <TrashIcon />
      </AlertDialogTrigger>
      <AlertDialogContent className="gap-5 rounded-2xl p-6 ring-0">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-3xl">
            Excluir treino
          </AlertDialogTitle>
          <AlertDialogDescription className="tabular-nums">
            {formatDate(plan.date)} — {plannedTarget(plan)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mx-0 mb-0 rounded-none border-t-0 bg-transparent p-0">
          <AlertDialogCancel variant="secondary" size="lg" disabled={busy}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            size="lg"
            onClick={confirm}
            disabled={busy}
          >
            {busy ? "Excluindo…" : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function plannedTarget(p: PlannedRun) {
  if (p.distance) return `${km(p.distance)} km`;
  if (p.durationSec) return duration(p.durationSec);
  return "—";
}

/** The planned target split into a big number and its unit. */
function plannedMain(p: PlannedRun) {
  if (p.distance) return { value: km(p.distance), unit: "km" };
  if (p.durationSec) return { value: duration(p.durationSec), unit: "" };
  return { value: "—", unit: "" };
}

/** What was actually run: distance (or time) big, the rest next to it. */
function actualMain(p: PlannedRun) {
  if (p.actualDistance) return { value: km(p.actualDistance), unit: "km" };
  if (p.actualMovingTime)
    return { value: duration(p.actualMovingTime), unit: "" };
  return { value: "—", unit: "" };
}

function actualExtras(p: PlannedRun) {
  const parts: string[] = [];
  if (p.actualMovingTime && p.actualDistance) {
    parts.push(pace(p.actualDistance, p.actualMovingTime));
  }
  if (p.actualAvgHr) parts.push(`${Math.round(p.actualAvgHr)} bpm`);
  return parts;
}

function pace(meters: number, sec: number) {
  if (meters === 0) return "—";
  const sPerKm = sec / (meters / 1000);
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

function paceString(secPerKm: number) {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

function formatDate(yyyymmdd: string) {
  const d = new Date(`${yyyymmdd}T00:00:00`);
  return d.toLocaleDateString("pt-BR", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

type Week = { key: string; title: string; range: string; runs: PlannedRun[] };

/** Groups by Sunday-started week, in the order the plans come in. */
function groupByWeek(plans: PlannedRun[]): Week[] {
  const thisSunday = startOfWeek(new Date());
  const out = new Map<string, Week>();
  for (const p of plans) {
    const sunday = startOfWeek(new Date(`${p.date}T00:00:00`));
    const key = sunday.toDateString();
    let week = out.get(key);
    if (!week) {
      const offset = Math.round(
        (sunday.getTime() - thisSunday.getTime()) / (7 * 86_400_000),
      );
      const title =
        offset === 0
          ? "Esta semana"
          : offset === 1
            ? "Próxima semana"
            : offset === -1
              ? "Semana passada"
              : offset > 0
                ? `Em ${offset} semanas`
                : `Há ${-offset} semanas`;
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);
      const range =
        sunday.getMonth() === saturday.getMonth()
          ? `${sunday.getDate()}–${dayMonth(saturday)}`
          : `${dayMonth(sunday)} – ${dayMonth(saturday)}`;
      week = { key, title, range, runs: [] };
      out.set(key, week);
    }
    week.runs.push(p);
  }
  return [...out.values()];
}

function startOfWeek(d: Date) {
  const sunday = new Date(d);
  sunday.setHours(0, 0, 0, 0);
  sunday.setDate(d.getDate() - d.getDay());
  return sunday;
}

function dayMonth(d: Date) {
  const month = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return `${d.getDate()} ${month}`;
}
