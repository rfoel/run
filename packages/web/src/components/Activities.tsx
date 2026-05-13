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

export default function Activities() {
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
          <div className="flex gap-1 text-[10px] uppercase tracking-[0.2em] font-medium">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={
                  range === r
                    ? "px-2 py-1 bg-ink text-paper"
                    : "px-2 py-1 text-ink/60 hover:text-ink"
                }
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
          <button
            onClick={() => void sync()}
            disabled={syncing}
            className="text-[10px] uppercase tracking-[0.2em] font-medium border-2 border-ink px-3 py-1 hover:bg-ink hover:text-paper disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink"
          >
            {syncing ? "sincronizando…" : "sincronizar"}
          </button>
        </div>
      </div>

      {syncResult && (
        <div className="border-2 border-ink p-3 mb-4 bg-paper-2 font-mono text-xs flex gap-4">
          <span>buscadas {syncResult.fetched}</span>
          <span>importadas {syncResult.imported}</span>
          <span>ignoradas {syncResult.skipped}</span>
          <span>vinculadas {syncResult.linked}</span>
          {syncResult.errors.length > 0 && (
            <span className="text-red-700">erros {syncResult.errors.length}</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 border-2 border-ink mb-10">
        <StatBox label="Corridas" value={active ? String(active.count) : "0"} />
        <StatBox
          label="Km"
          value={active ? (active.distance / 1000).toFixed(1) : "0"}
          border
        />
        <StatBox
          label="Tempo"
          value={active ? duration(active.movingTime) : "0"}
          border
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
              <div className="text-ink/60 text-xs mt-1">
                {duration(a.movingTime)} · {pace(a.distance, a.movingTime)}
                {a.avgHr ? ` · ${Math.round(a.avgHr)} bpm` : ""}
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
  border,
}: {
  label: string;
  value: string;
  border?: boolean;
}) {
  return (
    <div className={`px-5 py-4 ${border ? "border-l-2 border-ink" : ""}`}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-ink/60">
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
