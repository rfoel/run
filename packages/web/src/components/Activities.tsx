import { AlertDialog } from "@base-ui-components/react/alert-dialog";
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
  TrashIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import {
  deleteActivity as apiDeleteActivity,
  getStats,
  listActivities,
  syncStrava,
  type Activity,
  type Stat,
  type StatsResponse,
  type SyncResult,
} from "../lib/api.ts";
import { date, duration, km, pace } from "../lib/format.ts";
import StravaLink from "./StravaLink.tsx";

type Range = "week" | "month" | "year" | "total";
const RANGES: Range[] = ["week", "month", "year", "total"];
const RANGE_LABELS: Record<Range, string> = {
  week: "semana",
  month: "mês",
  year: "ano",
  total: "total",
};

export default function Activities({
  unlocked,
  onOpenActivity,
}: {
  unlocked: boolean;
  onOpenActivity: (source: string, externalId: string) => void;
}) {
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
                className="px-2.5 py-1 rounded-md text-ink/60 hover:text-ink data-[pressed]:bg-accent data-[pressed]:text-white"
              >
                {RANGE_LABELS[r]}
              </Toggle>
            ))}
          </ToggleGroup>
          {unlocked && (
            <button
              onClick={() => void sync()}
              disabled={syncing}
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-medium border border-line rounded-lg px-3 py-1 hover:bg-accent hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink"
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
        <div className="border border-line rounded-lg p-3 mb-4 bg-paper-2 font-mono text-xs flex gap-4 flex-wrap">
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

      <div className="grid grid-cols-3 gap-px bg-line border border-line rounded-lg shadow-sm overflow-hidden mb-10">
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
      <ul className="border border-line rounded-lg divide-y divide-line bg-card shadow-sm overflow-hidden">
        {items.slice(0, 100).map((a) => (
          <ActivityRow
            key={`${a.source}:${a.externalId}`}
            activity={a}
            unlocked={unlocked}
            onDeleted={refresh}
            onSelect={() => onOpenActivity(a.source, a.externalId)}
          />
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

function ActivityRow({
  activity: a,
  unlocked,
  onDeleted,
  onSelect,
}: {
  activity: Activity;
  unlocked: boolean;
  onDeleted: () => void | Promise<void>;
  onSelect: () => void;
}) {
  return (
    <li className="px-5 py-4 flex items-baseline justify-between gap-6 hover:bg-paper-2">
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate flex items-center gap-2">
          <button
            onClick={onSelect}
            className="truncate text-left hover:underline underline-offset-2"
          >
            {a.name}
          </button>
          <StravaLink source={a.source} externalId={a.externalId} />
        </div>
        <div className="text-xs uppercase tracking-wider text-ink/50 mt-1">
          {date(a.startDate)} · {a.sportType}
        </div>
      </div>
      <div className="text-right shrink-0 font-mono text-sm">
        <button onClick={onSelect} className="font-semibold hover:underline underline-offset-2">
          {km(a.distance)} <span className="text-ink/40">km</span>
        </button>
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
        {unlocked && (
          <DeleteActivityButton activity={a} onDeleted={onDeleted} />
        )}
      </div>
    </li>
  );
}

function DeleteActivityButton({
  activity,
  onDeleted,
}: {
  activity: Activity;
  onDeleted: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await apiDeleteActivity(activity.source, activity.externalId);
      await onDeleted();
      setOpen(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger
        className="text-[10px] uppercase tracking-[0.2em] text-ink/40 hover:text-ink mt-2 flex items-center gap-1 ml-auto"
        aria-label="Excluir corrida"
      >
        <TrashIcon className="h-3.5 w-3.5" />
        excluir
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 bg-ink/40 z-40" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card border border-line rounded-lg shadow-lg w-[min(92vw,24rem)] p-6 flex flex-col gap-4 outline-none">
          <AlertDialog.Title className="text-xs uppercase tracking-[0.2em] text-ink/60 flex items-center gap-2">
            <TrashIcon className="h-4 w-4" />
            Excluir corrida
          </AlertDialog.Title>
          <AlertDialog.Description className="font-mono text-sm">
            {activity.name} — {date(activity.startDate)}
          </AlertDialog.Description>
          <p className="font-mono text-xs text-ink/60">
            Stats serão recalculados. Treino vinculado volta para "planejado". Re-sync vai trazer a corrida de novo.
          </p>
          {error && (
            <p className="font-mono text-xs text-red-700">{error}</p>
          )}
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
    <div className="bg-card px-5 py-4">
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
          ? "border border-line rounded-lg p-5 bg-paper-2 font-mono text-sm"
          : "text-ink/60 font-mono text-sm"
      }
    >
      {children}
    </p>
  );
}
