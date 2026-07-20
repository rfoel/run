import { AlertDialog } from "@base-ui/react/alert-dialog";
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
import { useState } from "react";
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
  const toPush = items.filter(
    (p) => p.status === "planned" && p.date >= isoDateDaysFromNow(0),
  ).length;

  if (loading) {
    return (
      <section className="flex flex-col gap-8">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-4 w-32 mb-3" />
            <ListSkeleton rows={3} />
          </div>
        ))}
      </section>
    );
  }
  if (error) {
    return (
      <p className="border border-line rounded-lg p-5 bg-paper-2 font-mono text-sm">
        {error}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <div className="border border-line rounded-lg p-6 bg-paper-2">
        <div className="text-xs uppercase tracking-[0.2em] text-ink/60 mb-2">
          Nenhum treino planejado
        </div>
        {unlocked && (
          <p className="font-mono text-sm">
            Vá para a aba Treinador e peça: "Monta um plano de 5k abaixo de 20min em 12 semanas"
          </p>
        )}
      </div>
    );
  }

  const visible = hideDone ? items.filter((p) => p.status !== "done") : items;
  const byWeek = groupByWeek(visible);
  const doneCount = items.filter((p) => p.status === "done").length;

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => setHideDone((h) => !h)}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-medium text-ink/50 hover:text-ink"
          >
            {hideDone ? (
              <EyeIcon className="h-3.5 w-3.5" />
            ) : (
              <EyeSlashIcon className="h-3.5 w-3.5" />
            )}
            {hideDone
              ? `mostrar feitos${doneCount > 0 ? ` (${doneCount})` : ""}`
              : "ocultar feitos"}
          </button>
          {unlocked && (
            <button
              onClick={() => garminPush.mutate({ from: isoDateDaysFromNow(0) })}
              disabled={pushing || toPush === 0}
              title={
                toPush === 0
                  ? "Nada para enviar (sem treinos planejados futuros)"
                  : `Enviar ${toPush} treino(s) ao Garmin Connect`
              }
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-medium border border-line rounded-lg px-3 py-1 hover:bg-accent hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink"
            >
              <CloudArrowUpIcon
                className={"h-3.5 w-3.5 " + (pushing ? "animate-pulse" : "")}
              />
              <span>{pushing ? "enviando…" : "enviar ao garmin"}</span>
            </button>
          )}
        </div>
        {unlocked && garminPush.isError && (
          <div className="border border-line rounded-lg p-3 bg-paper-2 font-mono text-xs text-red-700 flex items-center gap-1">
            <WarningIcon className="h-3.5 w-3.5" />
            {String(garminPush.error)}
          </div>
        )}
        {unlocked && pushResult && (
          <div className="border border-line rounded-lg p-3 bg-paper-2 font-mono text-xs flex gap-4 flex-wrap">
            <span>criados {pushResult.created}</span>
            <span>atualizados {pushResult.updated}</span>
            {pushResult.errors.length > 0 && (
              <span className="text-red-700 flex items-center gap-1">
                <WarningIcon className="h-3.5 w-3.5" />
                erros {pushResult.errors.length}
              </span>
            )}
          </div>
        )}
      </div>
      {byWeek.size === 0 && (
        <p className="font-mono text-sm text-ink/60">
          Nenhum treino pendente.{" "}
          <button
            onClick={() => setHideDone(false)}
            className="underline underline-offset-2 hover:text-ink"
          >
            Mostrar feitos
          </button>
        </p>
      )}
      {[...byWeek.entries()].map(([weekLabel, runs]) => (
        <div key={weekLabel}>
          <h2 className="text-xs uppercase tracking-[0.2em] mb-3 text-ink/60">
            {weekLabel}
          </h2>
          <ul className="border border-line rounded-lg divide-y divide-line bg-card shadow-sm overflow-hidden">
            {runs.map((p) => (
              <PlanRow
                key={`${p.date}/${p.id}`}
                plan={p}
                unlocked={unlocked}
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
}: {
  plan: PlannedRun;
  unlocked: boolean;
}) {
  const done = plan.status === "done";
  const skipped = plan.status === "skipped";
  return (
    <li
      className={
        "px-4 py-3 hover:bg-paper-2 " + (skipped ? "opacity-50" : "")
      }
    >
      {/* Badge + date + status */}
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        <TypeBadge type={plan.type} />
        <span className="font-mono text-sm font-semibold">
          {formatDate(plan.date)}
        </span>
        {done && (
          <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-700 flex items-center gap-1">
            <CheckCircleIcon weight="fill" className="h-3.5 w-3.5" />
            feito
          </span>
        )}
        {skipped && (
          <span className="text-[10px] uppercase tracking-[0.2em] text-ink/50 flex items-center gap-1">
            <MinusCircleIcon className="h-3.5 w-3.5" />
            pulado
          </span>
        )}
        {plan.garminWorkoutId && !done && (
          <a
            href={`https://connect.garmin.com/app/workout/${plan.garminWorkoutId}?workoutType=running`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] uppercase tracking-[0.2em] text-ink/50 hover:text-ink flex items-center gap-1"
            title="Abrir este treino no Garmin Connect"
          >
            <WatchIcon className="h-3.5 w-3.5" />
            garmin
            <ArrowSquareOutIcon className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Stats */}
      <div className="font-mono text-sm mb-1 flex items-baseline gap-2 flex-wrap">
        {done ? (
          <>
            <span className="text-ink/40 line-through text-xs">
              {plannedTarget(plan)}
            </span>
            <span className="font-semibold">{actualSummary(plan)}</span>
          </>
        ) : (
          <>
            <span className="font-semibold">{plannedTarget(plan)}</span>
            {plan.paceTargetSec && (
              <span className="text-ink/60 text-xs">
                {paceString(plan.paceTargetSec)}
              </span>
            )}
          </>
        )}
      </div>

      {/* Notes */}
      {plan.notes && (
        <p className="text-sm text-ink/70 whitespace-pre-wrap">
          {plan.notes}
        </p>
      )}

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
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger
        className="text-[10px] uppercase tracking-[0.2em] text-ink/40 hover:text-ink mt-2 flex items-center gap-1 ml-auto"
        aria-label="Excluir treino"
      >
        <TrashIcon className="h-3.5 w-3.5" />
        excluir
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 bg-ink/40 z-40" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card border border-line rounded-lg shadow-lg w-[min(92vw,24rem)] p-6 flex flex-col gap-4 outline-none">
          <AlertDialog.Title className="text-xs uppercase tracking-[0.2em] text-ink/60 flex items-center gap-2">
            <TrashIcon className="h-4 w-4" />
            Excluir treino
          </AlertDialog.Title>
          <AlertDialog.Description className="font-mono text-sm">
            {formatDate(plan.date)} — {plannedTarget(plan)}
          </AlertDialog.Description>
          <div className="flex gap-2 justify-end">
            <AlertDialog.Close
              className="text-xs uppercase tracking-[0.2em] font-medium px-3 py-2 text-ink/60 hover:text-ink"
              disabled={busy}
            >
              cancelar
            </AlertDialog.Close>
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="text-xs uppercase tracking-[0.2em] font-medium bg-accent text-white px-4 py-2 disabled:opacity-40"
            >
              {busy ? "excluindo…" : "excluir"}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function plannedTarget(p: PlannedRun) {
  if (p.distance) return `${km(p.distance)} km`;
  if (p.durationSec) return duration(p.durationSec);
  return "—";
}

function actualSummary(p: PlannedRun) {
  const parts: string[] = [];
  if (p.actualDistance) parts.push(`${km(p.actualDistance)} km`);
  if (p.actualMovingTime && p.actualDistance) {
    parts.push(pace(p.actualDistance, p.actualMovingTime));
  } else if (p.actualMovingTime) {
    parts.push(duration(p.actualMovingTime));
  }
  if (p.actualAvgHr) parts.push(`${Math.round(p.actualAvgHr)} bpm`);
  return parts.join(" · ");
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

function groupByWeek(plans: PlannedRun[]) {
  const out = new Map<string, PlannedRun[]>();
  for (const p of plans) {
    const d = new Date(`${p.date}T00:00:00`);
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - d.getDay());
    const label = `Semana de ${sunday.toLocaleDateString("pt-BR", {
      month: "short",
      day: "numeric",
    })}`;
    const arr = out.get(label) ?? [];
    arr.push(p);
    out.set(label, arr);
  }
  return out;
}
