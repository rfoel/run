import {
  ArrowSquareOutIcon,
  CloudArrowUpIcon,
  EyeIcon,
  EyeSlashIcon,
  TrashIcon,
  WarningIcon,
  WatchIcon,
} from "@phosphor-icons/react";
import { addDays, daysBetween, mondayOf } from "@run/core/weeks";
import { workoutDistance } from "@run/core/workoutText";
import { cn } from "cn";
import { useState } from "react";
import { Link } from "react-router-dom";
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
import {
  type BlockPhase,
  type PlannedRun,
  type TrainingBlock,
} from "../lib/api.ts";
import {
  blockOn,
  blockWeekOn,
  PHASE_LABEL,
  PHASE_SHORT,
} from "../lib/blocks.ts";
import { useBlocks, useDeletePlan, useGarminPush, usePlans } from "../lib/queries.ts";
import { ListSkeleton, Skeleton } from "./Skeleton.tsx";
import { TypeBadge } from "./TypeBadge.tsx";
import {
  ComplianceMeta,
  isRun,
  PlanStatusTag,
  WorkoutSteps,
} from "./PlanStatus.tsx";
import {
  duration,
  isoDateDaysFromNow,
  km,
  localIso,
} from "../lib/format.ts";

export default function Plan({ unlocked }: { unlocked: boolean }) {
  const from = isoDateDaysFromNow(-14);
  const plansQ = usePlans({ from });
  const blocksQ = useBlocks();
  const items = plansQ.data ?? [];
  const blocks = blocksQ.data ?? [];
  const loading = plansQ.isLoading;
  const error = plansQ.error ? String(plansQ.error) : null;
  const [hideDone, setHideDone] = useState(true);

  const garminPush = useGarminPush();
  const pushResult = garminPush.data ?? null;
  const pushing = garminPush.isPending;
  const today = localIso(new Date());
  const toPush = items.filter(
    (p) => p.status === "planned" && p.date >= today,
  ).length;

  // The block on today, else the one the upcoming plans point at.
  const block =
    blockOn(blocks, today) ??
    blocks.find((b) =>
      items.some((p) => p.blockId === b.id && p.date >= today),
    );

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
      <section className="flex flex-col gap-10">
        {block && <BlockHeader block={block} today={today} />}
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
      </section>
    );
  }

  const visible = hideDone ? items.filter((p) => p.status !== "done") : items;
  const byWeek = groupByWeek(visible, today);
  const volume = weeklyVolume(items);
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
      {block && <BlockHeader block={block} today={today} />}
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
      {byWeek.map((week) => {
        const weekBlock =
          blockOn(blocks, week.monday) ??
          blocks.find((b) => week.runs.some((p) => p.blockId === b.id));
        const info = weekBlock && blockWeekOn(weekBlock, week.monday);
        const vol = volume.get(week.monday) ?? { done: 0, planned: 0 };
        return (
          <div key={week.monday}>
            <div className="mb-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-display text-2xl md:text-3xl">
                  {week.title}
                </h2>
                <span className="text-sm font-semibold text-muted-foreground">
                  {week.range}
                </span>
              </div>
              {weekBlock && info && (
                <p className="text-sm">
                  <span className="font-semibold">
                    Semana {info.number} de {weekBlock.weeks.length} ·{" "}
                    {PHASE_LABEL[info.week.phase]}
                  </span>
                  {info.week.focus && (
                    <span className="text-muted-foreground">
                      {" "}
                      — {info.week.focus}
                    </span>
                  )}
                </p>
              )}
              <WeekVolume
                doneM={vol.done}
                plannedM={vol.planned}
                targetKm={info?.week.targetKm}
                future={week.monday > today}
              />
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
        );
      })}
    </section>
  );
}

// Phases as a monochrome ramp, quiet to loud: the strip stays in the NRC
// black/white language while the build-up to the peak still reads at a glance.
const PHASE_SHADE: Record<BlockPhase, string> = {
  recovery: "bg-foreground/12",
  base: "bg-foreground/20",
  build: "bg-foreground/32",
  peak: "bg-foreground/48",
  taper: "bg-foreground/24",
  race: "bg-foreground/48",
};

/** Name, goal, race countdown and the block's weeks as a volume strip. */
function BlockHeader({
  block,
  today,
}: {
  block: TrainingBlock;
  today: string;
}) {
  const current = blockWeekOn(block, today);
  const daysToRace =
    block.raceDate != null ? daysBetween(today, block.raceDate) : null;
  const maxKm = Math.max(0, ...block.weeks.map((w) => w.targetKm ?? 0));

  const meta: string[] = [];
  if (block.raceDate) meta.push(`Prova ${formatRaceDate(block.raceDate)}`);
  if (block.raceDistanceM) meta.push(`${kmShort(block.raceDistanceM)} km`);
  if (block.targetTimeSec) meta.push(`alvo ${clock(block.targetTimeSec)}`);

  // Consecutive weeks of one phase, so the strip can gap and label them.
  const spans: { phase: BlockPhase; start: number; weeks: typeof block.weeks }[] =
    [];
  block.weeks.forEach((w, i) => {
    const last = spans[spans.length - 1];
    if (last && last.phase === w.phase) last.weeks.push(w);
    else spans.push({ phase: w.phase, start: i, weeks: [w] });
  });

  return (
    <div className="rounded-2xl bg-card p-5 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {current
              ? `Bloco · semana ${current.number} de ${block.weeks.length}`
              : "Bloco de treino"}
          </p>
          <h2 className="mt-1.5 font-display text-3xl md:text-4xl">
            {block.name}
          </h2>
          {block.goal && (
            <p className="mt-2 text-sm font-semibold">{block.goal}</p>
          )}
          {meta.length > 0 && (
            <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
              {meta.map((m, i) => (
                <span key={m} className="whitespace-nowrap">
                  {i > 0 && " · "}
                  {m}
                </span>
              ))}
            </p>
          )}
        </div>
        {daysToRace != null && daysToRace >= 0 && (
          <div className="flex shrink-0 flex-col items-end text-right">
            {daysToRace === 0 ? (
              <span className="font-display text-4xl md:text-5xl">Hoje</span>
            ) : (
              <>
                <span className="text-xs font-semibold text-muted-foreground">
                  {daysToRace === 1 ? "falta" : "faltam"}
                </span>
                <span className="font-display text-5xl md:text-6xl">
                  {daysToRace}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">
                  {daysToRace === 1 ? "dia" : "dias"}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <div
        className="mt-5 flex h-12 items-end gap-2 md:h-14"
        role="img"
        aria-label={stripLabel(block, current?.number)}
      >
        {spans.map((span) => (
          <div
            key={span.start}
            className="flex h-full items-end gap-1"
            style={{ flex: span.weeks.length }}
          >
            {span.weeks.map((w, k) => {
              const n = span.start + k + 1;
              const isCurrent = current?.number === n;
              const h =
                maxKm > 0 && w.targetKm
                  ? Math.max(18, (w.targetKm / maxKm) * 100)
                  : 18;
              return (
                <div
                  key={w.weekStart}
                  title={`Semana ${n} · ${PHASE_LABEL[w.phase]}${w.targetKm ? ` · ${w.targetKm} km` : ""}`}
                  className={cn(
                    "flex-1 rounded-[3px]",
                    isCurrent ? "bg-primary" : PHASE_SHADE[w.phase],
                  )}
                  style={{ height: `${h}%` }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2" aria-hidden>
        {spans.map((span) => {
          const hasCurrent =
            current != null &&
            current.number > span.start &&
            current.number <= span.start + span.weeks.length;
          return (
            <span
              key={span.start}
              style={{ flex: span.weeks.length }}
              className={cn(
                "min-w-0 truncate text-[11px] font-semibold",
                hasCurrent ? "text-foreground" : "text-muted-foreground",
                // One-week spans are too narrow for a label on a phone.
                span.weeks.length < 2 && "invisible sm:visible",
              )}
            >
              <span className="sm:hidden">{PHASE_SHORT[span.phase]}</span>
              <span className="hidden sm:inline">
                {PHASE_LABEL[span.phase]}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function stripLabel(block: TrainingBlock, current: number | undefined) {
  const weeks = block.weeks
    .map(
      (w, i) =>
        `semana ${i + 1} ${PHASE_LABEL[w.phase]}${w.targetKm ? ` ${w.targetKm} km` : ""}`,
    )
    .join(", ");
  return `${block.weeks.length} semanas${current ? `, semana atual ${current}` : ""}: ${weeks}`;
}

/** Done vs the week's target (or planned) volume, as a thin two-layer bar. */
function WeekVolume({
  doneM,
  plannedM,
  targetKm,
  future,
}: {
  doneM: number;
  plannedM: number;
  targetKm: number | undefined;
  future: boolean;
}) {
  const goalM = targetKm ? targetKm * 1000 : plannedM;
  if (goalM <= 0) return null;
  const width = (m: number) => `${Math.min(100, (m / goalM) * 100)}%`;
  return (
    <div className="flex items-center gap-3">
      {!future && (
        <div className="relative h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-secondary sm:w-48">
          {targetKm != null && plannedM > 0 && (
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-foreground/15"
              style={{ width: width(plannedM) }}
            />
          )}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: width(doneM) }}
          />
        </div>
      )}
      <p className="min-w-0 text-xs text-muted-foreground tabular-nums">
        {future ? (
          <>
            <span className="font-semibold text-foreground">
              {kmShort(plannedM)} km
            </span>{" "}
            planejados
          </>
        ) : (
          <>
            <span className="font-semibold text-foreground">
              {kmShort(doneM)}
            </span>{" "}
            de {kmShort(plannedM)} km
          </>
        )}
        {targetKm != null && ` · meta ${kmShort(targetKm * 1000)}`}
      </p>
    </div>
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
  const ran = isRun(plan);
  const skipped = plan.status === "skipped";
  const d = new Date(`${plan.date}T00:00:00`);
  const target = ran ? actualMain(plan) : plannedMain(plan);
  const secondary = ran
    ? actualExtras(plan)
    : plan.paceTargetSec
      ? [paceString(plan.paceTargetSec)]
      : [];

  return (
    <li
      className={cn(
        "relative flex gap-4 rounded-2xl bg-card p-4 transition-colors hover:bg-[color-mix(in_oklch,var(--card),var(--foreground)_4%)] md:gap-6 md:p-5",
        skipped && "*:opacity-50",
      )}
    >
      {/* Day; its link stretches over the whole card. */}
      <Link
        to={`/plano/${plan.date}/${encodeURIComponent(plan.id)}`}
        aria-label={`Ver treino de ${formatDate(plan.date)}`}
        className="flex w-10 shrink-0 flex-col items-center gap-1 pt-0.5 outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
      >
        <span className="text-xs font-semibold text-muted-foreground uppercase">
          {d
            .toLocaleDateString("pt-BR", { weekday: "short" })
            .replace(".", "")}
        </span>
        <span className="font-display text-3xl">{d.getDate()}</span>
      </Link>

      <div className="min-w-0 flex-1">
        {/* Type + status */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <TypeBadge type={plan.type} />
          {next && (
            <Badge
              variant="volt"
              className="text-[11px] font-bold tracking-wide uppercase"
            >
              {next}
            </Badge>
          )}
          <PlanStatusTag plan={plan} />
          <ComplianceMeta plan={plan} />
          {plan.garminWorkoutId && !ran && (
            <a
              href={`https://connect.garmin.com/app/workout/${plan.garminWorkoutId}?workoutType=running`}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
          {ran && (
            <span className="text-xs text-muted-foreground tabular-nums line-through">
              {plannedTarget(plan)}
            </span>
          )}
        </div>

        {/* Structure, then the coach's notes */}
        {plan.workout && <WorkoutSteps workout={plan.workout} className="mt-3" />}
        {plan.notes && (
          <p
            className={cn(
              "text-sm whitespace-pre-wrap text-muted-foreground",
              plan.workout ? "mt-1.5" : "mt-2",
            )}
          >
            {plan.notes}
          </p>
        )}
      </div>

      {/* Delete */}
      {!ran && unlocked && <DeletePlanButton plan={plan} />}
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
            className="relative z-10 -mt-1 -mr-1 shrink-0 text-muted-foreground"
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

/** Distance planned for a run: its own, else the structured workout's sum. */
function plannedMeters(p: PlannedRun) {
  return p.distance ?? (p.workout ? workoutDistance(p.workout) : undefined) ?? 0;
}

/** Per Monday: metres run (done + partial) and metres planned (every plan). */
function weeklyVolume(plans: PlannedRun[]) {
  const out = new Map<string, { done: number; planned: number }>();
  for (const p of plans) {
    const monday = mondayOf(p.date);
    const v = out.get(monday) ?? { done: 0, planned: 0 };
    v.planned += plannedMeters(p);
    if (isRun(p)) v.done += p.actualDistance ?? 0;
    out.set(monday, v);
  }
  return out;
}

/** 21100 → "21,1"; 34000 → "34". */
function kmShort(meters: number) {
  return (meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/** 6300 → "1:45:00". */
function clock(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

function formatRaceDate(yyyymmdd: string) {
  const d = new Date(`${yyyymmdd}T00:00:00`);
  const weekday = d
    .toLocaleDateString("pt-BR", { weekday: "short" })
    .replace(".", "");
  return `${weekday}, ${dayMonth(d)}`;
}

type Week = { monday: string; title: string; range: string; runs: PlannedRun[] };

/** Groups by Monday–Sunday week, in the order the plans come in. */
function groupByWeek(plans: PlannedRun[], today: string): Week[] {
  const thisMonday = mondayOf(today);
  const out = new Map<string, Week>();
  for (const p of plans) {
    const monday = mondayOf(p.date);
    let week = out.get(monday);
    if (!week) {
      const offset = Math.round(daysBetween(thisMonday, monday) / 7);
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
      const start = new Date(`${monday}T00:00:00`);
      const end = new Date(`${addDays(monday, 6)}T00:00:00`);
      const range =
        start.getMonth() === end.getMonth()
          ? `${start.getDate()}–${dayMonth(end)}`
          : `${dayMonth(start)} – ${dayMonth(end)}`;
      week = { monday, title, range, runs: [] };
      out.set(monday, week);
    }
    week.runs.push(p);
  }
  return [...out.values()];
}

function dayMonth(d: Date) {
  const month = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return `${d.getDate()} ${month}`;
}
