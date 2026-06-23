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
import { duration, km, pace } from "../lib/format.ts";
import { PLAN_TYPE_COLORS, PLAN_TYPE_LABELS, TypeBadge } from "./TypeBadge.tsx";
import { TreadmillIcon, isTreadmill } from "./TreadmillIcon.tsx";
import StravaLink from "./StravaLink.tsx";


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
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="font-mono text-base font-semibold uppercase tracking-wider">
          {monthLabel}
        </h2>
        <div className="flex gap-1 text-[10px] uppercase tracking-[0.2em] font-medium">
          <button
            onClick={() => shift(-1)}
            aria-label="Mês anterior"
            className="px-3 py-1 border border-line rounded-lg hover:bg-accent hover:text-white flex items-center"
          >
            <CaretLeftIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={jumpToday}
            className="px-3 py-1 border border-line rounded-lg hover:bg-accent hover:text-white"
          >
            hoje
          </button>
          <button
            onClick={() => shift(1)}
            aria-label="Próximo mês"
            className="px-3 py-1 border border-line rounded-lg hover:bg-accent hover:text-white flex items-center"
          >
            <CaretRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-ink/60 font-mono text-xs mb-3">Carregando…</p>
      )}
      {error && (
        <p className="border border-line rounded-lg p-3 bg-paper-2 font-mono text-xs mb-3">
          {error}
        </p>
      )}

      <div
        className="border border-line rounded-lg touch-pan-y bg-card shadow-sm overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="grid grid-cols-7 gap-px bg-line">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="bg-card px-1 sm:px-2 py-1.5 sm:py-2 text-[9px] sm:text-[10px] uppercase tracking-[0.15em] sm:tracking-[0.2em] text-ink/60 font-medium text-center sm:text-left"
            >
              <span className="sm:hidden">{d.slice(0, 1)}</span>
              <span className="hidden sm:inline">{d}</span>
            </div>
          ))}
          {grid.map((day) => {
            const iso = localIso(day);
            const inMonth = day.getMonth() === month.m;
            const isToday = iso === today;
            const isSelected = iso === selected;
            const slot = byDate.get(iso);

            const bg = isSelected
              ? "bg-accent text-white"
              : !inMonth
                ? "bg-paper-2 text-ink/45"
                : "bg-card";

            return (
              <button
                key={iso}
                onClick={() => setSelected(isSelected ? null : iso)}
                className={`min-h-[64px] sm:min-h-[92px] p-1 sm:p-1.5 flex flex-col gap-0.5 sm:gap-1 text-left min-w-0 ${bg}`}
              >
                <div className="flex items-baseline justify-between gap-1 min-w-0">
                  {isToday && !isSelected ? (
                    <span className="font-mono text-[11px] sm:text-xs bg-accent text-white px-1 sm:px-1.5 py-0.5 font-bold rounded-md">
                      {day.getDate()}
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] sm:text-xs">{day.getDate()}</span>
                  )}
                  {slot && slot.runs.length > 0 && (
                    <span className="hidden sm:inline font-mono text-[10px] opacity-60 truncate">
                      {km(totalDistance(slot.runs))}k
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  {slot?.plans.map((p) => (
                    <PlanPill
                      key={p.id}
                      plan={p}
                      inverted={isSelected}
                    />
                  ))}
                  {slot?.runs.map((a) => (
                    <RunPill key={`${a.source}:${a.externalId}`} run={a} inverted={isSelected} />
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

function PlanPill({ plan, inverted }: { plan: PlannedRun; inverted: boolean }) {
  const suffix =
    plan.status === "done" ? " ✓" : plan.status === "skipped" ? " ✗" : "";
  return (
    <span
      title={planTooltip(plan)}
      style={inverted ? undefined : { backgroundColor: PLAN_TYPE_COLORS[plan.type] }}
      className={
        "font-mono text-[9px] sm:text-[10px] uppercase tracking-wider px-1 sm:px-1.5 py-0.5 truncate rounded-md " +
        (inverted ? "bg-white/20 text-white" : "text-white")
      }
    >
      {PLAN_TYPE_LABELS[plan.type]}
      {plan.distance ? (
        <span className="hidden sm:inline"> {km(plan.distance)}k</span>
      ) : null}
      {suffix}
    </span>
  );
}

function RunPill({ run, inverted }: { run: Activity; inverted: boolean }) {
  return (
    <span
      title={run.name}
      className={
        "font-mono text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 truncate border rounded-md " +
        (inverted
          ? "border-white/40 text-white"
          : "border-line text-ink/80 bg-card")
      }
    >
      {isTreadmill(run) && (
        <TreadmillIcon className="inline h-2.5 w-2.5 mr-0.5 align-text-bottom" />
      )}
      <span className="sm:hidden">{km(run.distance)}k</span>
      <span className="hidden sm:inline">
        {km(run.distance)}k · {pace(run.distance, run.movingTime)}
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
    <div className="mt-6 border border-line rounded-lg p-5 bg-card shadow-sm">
      <div className="text-xs uppercase tracking-[0.2em] text-ink/60 mb-3">
        {label}
      </div>
      {empty && (
        <p className="font-mono text-sm text-ink/60">
          Nada planejado e nenhuma corrida.
        </p>
      )}
      {slot.plans.length > 0 && (
        <div className="mb-4">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-ink/60 mb-2">
            Planejado
          </h3>
          <ul className="border border-line rounded-lg divide-y divide-line bg-card shadow-sm overflow-hidden">
            {slot.plans.map((p) => (
              <li
                key={p.id}
                className="px-4 py-3 flex items-start justify-between gap-4"
              >
                <div>
                  <TypeBadge type={p.type} className="mr-2" />
                  {p.notes && <span className="text-sm">{p.notes}</span>}
                </div>
                <div className="text-right font-mono text-sm">
                  <div>{p.distance ? `${km(p.distance)} km` : "—"}</div>
                  {p.paceTargetSec && (
                    <div className="text-ink/60 text-xs">
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
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-ink/60 mb-2">
            Corrida
          </h3>
          <ul className="border border-line rounded-lg divide-y divide-line bg-card shadow-sm overflow-hidden">
            {slot.runs.map((a) => (
              <li
                key={`${a.source}:${a.externalId}`}
                className="px-4 py-3 flex items-start justify-between gap-4 hover:bg-paper-2"
                onMouseEnter={() => onPrefetch(a.source, a.externalId)}
                onFocus={() => onPrefetch(a.source, a.externalId)}
                onTouchStart={() => onPrefetch(a.source, a.externalId)}
              >
                <div className="font-semibold truncate flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => onOpenActivity(a.source, a.externalId)}
                    className="truncate text-left hover:underline underline-offset-2"
                  >
                    {a.name}
                  </button>
                  {isTreadmill(a) && <TreadmillIcon />}
                  <StravaLink source={a.source} externalId={a.externalId} />
                </div>
                <button
                  onClick={() => onOpenActivity(a.source, a.externalId)}
                  className="text-right font-mono text-sm shrink-0"
                >
                  <div>
                    {km(a.distance)} km · {duration(a.movingTime)}
                  </div>
                  <div className="text-ink/60 text-xs flex items-center justify-end gap-2">
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

function localIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
