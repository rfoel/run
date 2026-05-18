import {
  CaretLeftIcon,
  CaretRightIcon,
  HeartbeatIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import {
  listActivities,
  listPlans,
  type Activity,
  type PlannedRun,
} from "../lib/api.ts";
import { duration, km, pace } from "../lib/format.ts";
import StravaLink from "./StravaLink.tsx";

const TYPE_SHORT: Record<PlannedRun["type"], string> = {
  easy: "Leve",
  long: "Longão",
  tempo: "Tempo",
  interval: "Tiro",
  race: "Prova",
  recovery: "Regen",
};

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

type DaySlot = { plans: PlannedRun[]; runs: Activity[] };

export default function Calendar() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [plans, setPlans] = useState<PlannedRun[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const from = localIso(new Date(month.y, month.m - 1, 1));
        const to = localIso(new Date(month.y, month.m + 2, 0));
        const [p, a] = await Promise.all([
          listPlans({ from, to }),
          listActivities(1000),
        ]);
        if (cancelled) return;
        setPlans(p);
        setActivities(a);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [month.y, month.m]);

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
            className="px-3 py-1 border-2 border-ink hover:bg-ink hover:text-paper flex items-center"
          >
            <CaretLeftIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={jumpToday}
            className="px-3 py-1 border-2 border-ink hover:bg-ink hover:text-paper"
          >
            hoje
          </button>
          <button
            onClick={() => shift(1)}
            aria-label="Próximo mês"
            className="px-3 py-1 border-2 border-ink hover:bg-ink hover:text-paper flex items-center"
          >
            <CaretRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-ink/60 font-mono text-xs mb-3">Carregando…</p>
      )}
      {error && (
        <p className="border-2 border-ink p-3 bg-paper-2 font-mono text-xs mb-3">
          {error}
        </p>
      )}

      <div className="border-2 border-ink">
        <div className="grid grid-cols-7 gap-px bg-ink">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="bg-paper px-2 py-2 text-[10px] uppercase tracking-[0.2em] text-ink/60 font-medium"
            >
              {d}
            </div>
          ))}
          {grid.map((day) => {
            const iso = localIso(day);
            const inMonth = day.getMonth() === month.m;
            const isToday = iso === today;
            const isSelected = iso === selected;
            const slot = byDate.get(iso);

            const bg = isSelected
              ? "bg-ink text-paper"
              : !inMonth
                ? "bg-paper-2 text-ink/45"
                : "bg-paper";

            return (
              <button
                key={iso}
                onClick={() => setSelected(isSelected ? null : iso)}
                className={`min-h-[92px] p-1.5 flex flex-col gap-1 text-left ${bg}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  {isToday && !isSelected ? (
                    <span className="font-mono text-xs bg-ink text-paper px-1.5 py-0.5 font-bold">
                      {day.getDate()}
                    </span>
                  ) : (
                    <span className="font-mono text-xs">{day.getDate()}</span>
                  )}
                  {slot && slot.runs.length > 0 && (
                    <span className="font-mono text-[10px] opacity-60">
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
        <DayDetail iso={selected} slot={selectedSlot ?? { plans: [], runs: [] }} />
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
      className={
        "font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 truncate " +
        (inverted ? "bg-paper text-ink" : "bg-ink text-paper")
      }
    >
      {TYPE_SHORT[plan.type]}
      {plan.distance ? ` ${km(plan.distance)}k` : ""}
      {suffix}
    </span>
  );
}

function RunPill({ run, inverted }: { run: Activity; inverted: boolean }) {
  return (
    <span
      title={run.name}
      className={
        "font-mono text-[10px] px-1.5 py-0.5 truncate border " +
        (inverted
          ? "border-paper/40 text-paper"
          : "border-ink/30 text-ink/80 bg-paper")
      }
    >
      {km(run.distance)}k · {pace(run.distance, run.movingTime)}
    </span>
  );
}

function DayDetail({ iso, slot }: { iso: string; slot: DaySlot }) {
  const d = new Date(`${iso}T00:00:00`);
  const label = d.toLocaleDateString("pt-BR", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const empty = slot.plans.length === 0 && slot.runs.length === 0;
  return (
    <div className="mt-6 border-2 border-ink p-5">
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
          <ul className="border-2 border-ink divide-y-2 divide-ink">
            {slot.plans.map((p) => (
              <li
                key={p.id}
                className="px-4 py-3 flex items-start justify-between gap-4"
              >
                <div>
                  <span className="font-mono text-xs uppercase tracking-wider bg-ink text-paper px-2 py-0.5 mr-2">
                    {TYPE_SHORT[p.type]}
                  </span>
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
          <ul className="border-2 border-ink divide-y-2 divide-ink">
            {slot.runs.map((a) => (
              <li
                key={`${a.source}:${a.externalId}`}
                className="px-4 py-3 flex items-start justify-between gap-4"
              >
                <div className="font-semibold truncate flex items-center gap-2 min-w-0">
                  <span className="truncate">{a.name}</span>
                  <StravaLink source={a.source} externalId={a.externalId} />
                </div>
                <div className="text-right font-mono text-sm shrink-0">
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
                </div>
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
  const offset = (first.getDay() + 6) % 7;
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
  const parts: string[] = [TYPE_SHORT[p.type]];
  if (p.distance) parts.push(`${km(p.distance)} km`);
  if (p.paceTargetSec) parts.push(paceLabel(p.paceTargetSec));
  if (p.notes) parts.push(p.notes);
  return parts.join(" · ");
}
