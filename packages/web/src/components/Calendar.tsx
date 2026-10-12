import {
  CaretLeftIcon,
  CaretRightIcon,
  HeartbeatIcon,
} from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import { type Activity, type PlannedRun } from "../lib/api.ts";
import {
  useActivities,
  usePlans,
  usePrefetchActivityDetail,
} from "../lib/queries.ts";
import { duration, km, localIso, pace } from "../lib/format.ts";
import { PLAN_TYPE_COLORS, PLAN_TYPE_LABELS, TypeBadge } from "./TypeBadge.tsx";
import { TreadmillIcon, isTreadmill } from "./TreadmillIcon.tsx";
import StravaLink from "./StravaLink.tsx";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type DaySlot = { plans: PlannedRun[]; runs: Activity[] };

export default function Calendar({
  onOpenActivity,
}: {
  onOpenActivity: (source: string, externalId: string) => void;
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState<string | null>(null);
  const prefetch = usePrefetchActivityDetail();

  // Fetch a 3-month window around the current month; keyed by the range so each
  // month is cached separately and revisiting one is instant.
  const from = localIso(new Date(month.y, month.m - 1, 1));
  const to = localIso(new Date(month.y, month.m + 2, 0));
  const plansQ = usePlans({ from, to });
  const activitiesQ = useActivities({ from, to, limit: 1000 });
  const plans: PlannedRun[] = plansQ.data ?? [];
  const activities: Activity[] = activitiesQ.data ?? [];
  const loading = plansQ.isLoading || activitiesQ.isLoading;
  const queryError = plansQ.error ?? activitiesQ.error;
  const error = queryError ? String(queryError) : null;

  const grid = useMemo(
    () => buildMonthGrid(month.y, month.m),
    [month.y, month.m],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, DaySlot>();
    const get = (k: string): DaySlot => {
      const existing = map.get(k);
      if (existing) return existing;
      const created: DaySlot = { plans: [], runs: [] };
      map.set(k, created);
      return created;
    };
    for (const p of plans) get(p.date).plans.push(p);
    for (const a of activities) get(a.startDate.slice(0, 10)).runs.push(a);
    return map;
  }, [plans, activities]);

  const monthLabel = new Date(month.y, month.m, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const today = localIso(new Date());

  function shift(delta: number) {
    setMonth(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  function jumpToday() {
    const d = new Date();
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
  }

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    touchStart.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    shift(dx < 0 ? 1 : -1);
  }

  const selectedSlot = selected ? byDate.get(selected) : null;

  return (
    <section>
      <div className="mb-5 flex items-center justify-between gap-4 md:mb-6">
        <h2 className="font-display text-2xl md:text-3xl">{monthLabel}</h2>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="icon-lg"
            onClick={() => shift(-1)}
            aria-label="Mês anterior"
          >
            <CaretLeftIcon weight="bold" />
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="px-4"
            onClick={jumpToday}
          >
            Hoje
          </Button>
          <Button
            variant="secondary"
            size="icon-lg"
            onClick={() => shift(1)}
            aria-label="Próximo mês"
          >
            <CaretRightIcon weight="bold" />
          </Button>
        </div>
      </div>

      {loading && (
        <p className="mb-3 text-sm text-muted-foreground">Carregando…</p>
      )}
      {error && (
        <p className="mb-3 rounded-2xl bg-card p-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <div
        className="touch-pan-y"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-2">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="text-center text-xs font-medium text-muted-foreground sm:px-2 sm:text-left"
            >
              <span className="sm:hidden">{d.slice(0, 1)}</span>
              <span className="hidden sm:inline">{d}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {grid.map((day) => {
            const iso = localIso(day);
            const inMonth = day.getMonth() === month.m;
            const isToday = iso === today;
            const isSelected = iso === selected;
            const slot = byDate.get(iso);
            const tone: Tone = isSelected
              ? "selected"
              : inMonth
                ? "default"
                : "outside";

            return (
              <button
                key={iso}
                onClick={() => setSelected(isSelected ? null : iso)}
                aria-pressed={isSelected}
                className={cn(
                  "flex min-h-[68px] min-w-0 flex-col items-center gap-1 rounded-sm p-1 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-[112px] sm:items-stretch sm:gap-1.5 sm:rounded-xl sm:p-2",
                  tone === "selected" && "bg-primary text-primary-foreground",
                  tone === "default" && "bg-card hover:bg-accent",
                  tone === "outside" &&
                    "bg-card/40 text-muted-foreground hover:bg-card",
                )}
              >
                <div className="flex min-w-0 items-center justify-between gap-1">
                  <span
                    className={cn(
                      "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums sm:size-7 sm:text-sm",
                      isToday && "bg-volt font-bold text-volt-foreground",
                    )}
                  >
                    {day.getDate()}
                  </span>
                  {slot && slot.runs.length > 1 && (
                    <span
                      className={cn(
                        "hidden truncate text-xs font-semibold tabular-nums sm:inline",
                        tone === "selected"
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground",
                      )}
                    >
                      {km(totalDistance(slot.runs))} km
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    "flex w-full min-w-0 flex-col gap-1",
                    tone === "outside" && "opacity-60",
                  )}
                >
                  {slot?.plans.map((p) => (
                    <PlanPill key={p.id} plan={p} />
                  ))}
                  {slot?.runs.map((a) => (
                    <RunPill
                      key={`${a.source}:${a.externalId}`}
                      run={a}
                      tone={tone}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <DayDetail
          iso={selected}
          slot={selectedSlot ?? { plans: [], runs: [] }}
          onOpenActivity={onOpenActivity}
          onPrefetch={prefetch}
        />
      )}
    </section>
  );
}

type Tone = "default" | "outside" | "selected";

function PlanPill({ plan }: { plan: PlannedRun }) {
  const suffix =
    plan.status === "done" ? " ✓" : plan.status === "skipped" ? " ✗" : "";
  return (
    <span
      title={planTooltip(plan)}
      style={{ backgroundColor: PLAN_TYPE_COLORS[plan.type] }}
      className="block h-1.5 truncate rounded-full sm:h-auto sm:px-2 sm:py-0.5 sm:text-[10px] sm:leading-tight sm:font-bold sm:tracking-wide sm:text-white sm:uppercase"
    >
      {/* Mobile columns are too narrow for the label, so it's just a type-
          colored bar there; the day detail spells it out. */}
      <span className="sr-only sm:not-sr-only">
        {PLAN_TYPE_LABELS[plan.type]}
        {plan.distance ? (
          <span className="tabular-nums"> {km(plan.distance)}k</span>
        ) : null}
        {suffix}
      </span>
    </span>
  );
}

function RunPill({ run, tone }: { run: Activity; tone: Tone }) {
  const sub =
    tone === "selected" ? "text-primary-foreground/70" : "text-muted-foreground";
  return (
    <span
      title={run.name}
      className={cn(
        "flex min-w-0 flex-col items-center rounded-sm px-0.5 py-1 sm:items-start sm:rounded-md sm:px-2 sm:py-1.5",
        tone === "selected" && "bg-primary-foreground/15",
        tone === "default" && "bg-background",
        tone === "outside" && "bg-card",
      )}
    >
      <span className="flex min-w-0 max-w-full items-baseline gap-0.5">
        {isTreadmill(run) && (
          <TreadmillIcon
            className={cn("hidden h-3 w-3 shrink-0 self-center sm:inline", sub)}
          />
        )}
        <span className="truncate font-display text-[15px] leading-none sm:text-xl">
          {km(run.distance)}
        </span>
        <span className={cn("hidden text-[10px] font-semibold sm:inline", sub)}>
          km
        </span>
      </span>
      <span
        className={cn(
          "hidden max-w-full truncate text-[11px] tabular-nums sm:block",
          sub,
        )}
      >
        {pace(run.distance, run.movingTime)}
      </span>
    </span>
  );
}

function DayDetail({
  iso,
  slot,
  onOpenActivity,
  onPrefetch,
}: {
  iso: string;
  slot: DaySlot;
  onOpenActivity: (source: string, externalId: string) => void;
  onPrefetch: (source: string, externalId: string) => void;
}) {
  const d = new Date(`${iso}T00:00:00`);
  const label = d.toLocaleDateString("pt-BR", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const empty = slot.plans.length === 0 && slot.runs.length === 0;
  return (
    <div className="mt-8 rounded-2xl bg-card p-5 sm:p-6">
      <div className="mb-5 font-display text-2xl md:text-3xl">{label}</div>
      {empty && (
        <p className="text-sm text-muted-foreground">
          Nada planejado e nenhuma corrida.
        </p>
      )}
      {slot.plans.length > 0 && (
        <div className="mb-6 last:mb-0">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            Planejado
          </h3>
          <ul className="flex flex-col gap-2">
            {slot.plans.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-2 rounded-xl bg-background px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <TypeBadge type={p.type} className="mr-2" />
                  {p.notes && <span className="text-sm">{p.notes}</span>}
                </div>
                <div className="shrink-0 sm:text-right">
                  <div className="font-display text-2xl">
                    {p.distance ? (
                      <>
                        {km(p.distance)}
                        <span className="ml-0.5 font-sans text-xs font-semibold text-muted-foreground normal-case">
                          km
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                  {p.paceTargetSec && (
                    <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {paceLabel(p.paceTargetSec)}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {slot.runs.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            Corrida
          </h3>
          <ul className="flex flex-col gap-2">
            {slot.runs.map((a) => (
              <li
                key={`${a.source}:${a.externalId}`}
                className="flex flex-col gap-1 rounded-xl bg-background px-4 py-3 transition-colors hover:bg-accent sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                onMouseEnter={() => onPrefetch(a.source, a.externalId)}
                onFocus={() => onPrefetch(a.source, a.externalId)}
                onTouchStart={() => onPrefetch(a.source, a.externalId)}
              >
                <div className="flex min-w-0 items-center gap-2 font-semibold">
                  <button
                    onClick={() => onOpenActivity(a.source, a.externalId)}
                    className="truncate text-left underline-offset-2 hover:underline"
                  >
                    {a.name}
                  </button>
                  {isTreadmill(a) && (
                    <TreadmillIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <StravaLink
                    source={a.source}
                    externalId={a.externalId}
                    className="text-muted-foreground hover:text-foreground"
                  />
                </div>
                <button
                  onClick={() => onOpenActivity(a.source, a.externalId)}
                  className="shrink-0 text-left sm:text-right"
                >
                  <div className="font-display text-3xl">
                    {km(a.distance)}
                    <span className="ml-0.5 font-sans text-xs font-semibold text-muted-foreground normal-case">
                      km
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 sm:justify-end text-xs text-muted-foreground tabular-nums">
                    <span>{duration(a.movingTime)}</span>
                    <span>·</span>
                    <span>{pace(a.distance, a.movingTime)}</span>
                    {a.avgHr && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-0.5">
                          <HeartbeatIcon className="h-3 w-3" />
                          {Math.round(a.avgHr)} bpm
                        </span>
                      </>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function buildMonthGrid(y: number, m: number) {
  const first = new Date(y, m, 1);
  const offset = first.getDay();
  const start = new Date(y, m, 1 - offset);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  while (days.length > 7) {
    const lastWeek = days.slice(-7);
    if (lastWeek.every((d) => d.getMonth() !== m)) days.length -= 7;
    else break;
  }
  return days;
}

function totalDistance(runs: Activity[]) {
  return runs.reduce((sum, a) => sum + a.distance, 0);
}

function paceLabel(secPerKm: number) {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

function planTooltip(p: PlannedRun) {
  const parts: string[] = [PLAN_TYPE_LABELS[p.type]];
  if (p.distance) parts.push(`${km(p.distance)} km`);
  if (p.paceTargetSec) parts.push(paceLabel(p.paceTargetSec));
  if (p.notes) parts.push(p.notes);
  return parts.join(" · ");
}
