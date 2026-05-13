import { ToggleGroup } from "@base-ui-components/react/toggle-group";
import { Toggle } from "@base-ui-components/react/toggle";
import {
  ArrowsClockwiseIcon,
  GaugeIcon,
  HeartbeatIcon,
  HourglassIcon,
  PathIcon,
  PersonSimpleRunIcon,
  RulerIcon,
  TimerIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import {
  getStats,
  listActivities,
  syncStrava,
  type Activity,
  type Stat,
  type StatsResponse,
  type SyncResult,
} from "../lib/api.ts";
import { date, duration, km, pace } from "../lib/format.ts";

type Range = "week" | "month" | "year" | "total";
const RANGES: Range[] = ["week", "month", "year", "total"];
const RANGE_LABELS: Record<Range, string> = {
  week: "semana",
  month: "mês",
  year: "ano",
  total: "total",
};

export default function Activities({ unlocked }: { unlocked: boolean }) {
  const [items, setItems] = useState<Activity[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [range, setRange] = useState<Range>("total");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  async function refresh() {
    try {
      const [list, s] = await Promise.all([listActivities(1000), getStats()]);
      setItems(list);
      setStats(s);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await syncStrava(30);
      setSyncResult(res);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (loading) return <Status>Carregando…</Status>;
  if (error) return <Status tone="error">{error}</Status>;
  if (items.length === 0) {
    return <Status>Nenhuma corrida ainda. Faça um sync ou aguarde o webhook.</Status>;
  }

  const active: Stat | undefined = stats?.[range];

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-4">
        <h2 className="text-xs uppercase tracking-[0.2em] text-ink/60">
          Totais
        </h2>
        <div className="flex items-center gap-3">
          <ToggleGroup
            value={[range]}
            onValueChange={(v) => {
              const next = v[0] as Range | undefined;
              if (next) setRange(next);
            }}
            className="flex gap-1 text-[10px] uppercase tracking-[0.2em] font-medium"
          >
            {RANGES.map((r) => (
              <Toggle
                key={r}
                value={r}
                aria-label={RANGE_LABELS[r]}
                className="px-2 py-1 text-ink/60 hover:text-ink data-[pressed]:bg-ink data-[pressed]:text-paper"
              >
                {RANGE_LABELS[r]}
              </Toggle>
            ))}
          </ToggleGroup>
          {unlocked && (
            <button
              onClick={() => void sync()}
              disabled={syncing}
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-medium border-2 border-ink px-3 py-1 hover:bg-ink hover:text-paper disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink"
            >
              <ArrowsClockwiseIcon
                className={"h-3.5 w-3.5 " + (syncing ? "animate-spin" : "")}
              />
              <span>{syncing ? "sincronizando…" : "sincronizar"}</span>
            </button>
          )}
        </div>
      </div>

      {syncResult && (
        <div className="border-2 border-ink p-3 mb-4 bg-paper-2 font-mono text-xs flex gap-4 flex-wrap">
          <span>buscadas {syncResult.fetched}</span>
          <span>importadas {syncResult.imported}</span>
          <span>ignoradas {syncResult.skipped}</span>
          <span>vinculadas {syncResult.linked}</span>
          {syncResult.errors.length > 0 && (
            <span className="text-red-700 flex items-center gap-1">
              <WarningIcon className="h-3.5 w-3.5" />
              erros {syncResult.errors.length}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-px bg-ink border-2 border-ink mb-10">
        <StatBox
          label="Corridas"
          icon={<PersonSimpleRunIcon className="h-4 w-4" />}
          value={active ? String(active.count) : "0"}
        />
        <StatBox
          label="Km"
          icon={<PathIcon className="h-4 w-4" />}
          value={active ? (active.distance / 1000).toFixed(1) : "0"}
        />
        <StatBox
          label="Tempo"
          icon={<TimerIcon className="h-4 w-4" />}
          value={active ? duration(active.movingTime) : "0"}
        />
        <StatBox
          label="Média km"
          icon={<RulerIcon className="h-4 w-4" />}
          value={
            active && active.count > 0
              ? (active.distance / active.count / 1000).toFixed(2)
              : "—"
          }
        />
        <StatBox
          label="Média tempo"
          icon={<HourglassIcon className="h-4 w-4" />}
          value={
            active && active.count > 0
              ? duration(active.movingTime / active.count)
              : "—"
          }
        />
        <StatBox
          label="Pace médio"
          icon={<GaugeIcon className="h-4 w-4" />}
          value={
            active && active.distance > 0
              ? pace(active.distance, active.movingTime)
              : "—"
          }
        />
      </div>

      <h2 className="text-xs uppercase tracking-[0.2em] mb-3 text-ink/60">
        Recentes
      </h2>
      <ul className="border-2 border-ink divide-y-2 divide-ink">
        {items.slice(0, 100).map((a) => (
          <li
            key={`${a.source}:${a.externalId}`}
            className="px-5 py-4 flex items-baseline justify-between gap-6 hover:bg-paper-2"
          >
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{a.name}</div>
              <div className="text-xs uppercase tracking-wider text-ink/50 mt-1">
                {date(a.startDate)} · {a.sportType}
              </div>
            </div>
            <div className="text-right shrink-0 font-mono text-sm">
              <div className="font-semibold">
                {km(a.distance)} <span className="text-ink/40">km</span>
              </div>
              <div className="text-ink/60 text-xs mt-1 flex items-center justify-end gap-2">
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
            </div>
          </li>
        ))}
      </ul>
      {items.length > 100 && (
        <p className="text-xs uppercase tracking-[0.2em] text-ink/50 mt-4">
          Mostrando 100 de {items.length}
        </p>
      )}
    </section>
  );
}

function StatBox({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-paper px-5 py-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-ink/60 flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold font-mono mt-1">{value}</div>
    </div>
  );
}

function Status({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "error";
}) {
  return (
    <p
      className={
        tone === "error"
          ? "border-2 border-ink p-5 bg-paper-2 font-mono text-sm"
          : "text-ink/60 font-mono text-sm"
      }
    >
      {children}
    </p>
  );
}
