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
import { useState } from "react";
import { type Activity, type Stat } from "../lib/api.ts";
import {
  useActivities,
  useDeleteActivity,
  usePrefetchActivityDetail,
  useStats,
  useSyncGarmin,
} from "../lib/queries.ts";
import { ActivitiesSkeleton } from "./Skeleton.tsx";
import { date, duration, km, pace } from "../lib/format.ts";
import StravaLink from "./StravaLink.tsx";
import { TreadmillIcon, isTreadmill } from "./TreadmillIcon.tsx";

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
  const [range, setRange] = useState<Range>("total");
  const activitiesQ = useActivities({ limit: 1000 });
  const statsQ = useStats();
  const sync = useSyncGarmin();
  const prefetch = usePrefetchActivityDetail();

  const items = activitiesQ.data ?? [];
  const stats = statsQ.data ?? null;
  const loading = activitiesQ.isLoading || statsQ.isLoading;
  // Only load failures take over the page; sync failures surface as a toast.
  const loadError = activitiesQ.error ?? statsQ.error;
  const syncResult = sync.data ?? null;
  const syncing = sync.isPending;

  if (loading) return <ActivitiesSkeleton />;
  if (loadError) return <Status tone="error">{String(loadError)}</Status>;
  if (items.length === 0) {
    return <Status>Nenhuma corrida ainda. Faça um sync ou aguarde o webhook.</Status>;
  }

  const active: Stat | undefined = stats?.[range];

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-[0.2em] text-ink/60">
          Totais
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <ToggleGroup
            value={[range]}
            onValueChange={(v) => {
              const next = v[0] as Range | undefined;
              if (next) setRange(next);
            }}
            className="flex gap-0.5 text-[10px] uppercase tracking-[0.2em] font-medium"
          >
            {RANGES.map((r) => (
              <Toggle
                key={r}
                value={r}
                aria-label={RANGE_LABELS[r]}
                className="px-2 py-1 rounded-md text-ink/60 hover:text-ink data-[pressed]:bg-accent data-[pressed]:text-white"
              >
                {RANGE_LABELS[r]}
              </Toggle>
            ))}
          </ToggleGroup>
          {unlocked && (
            <button
              onClick={() => sync.mutate(30)}
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
            onSelect={() => onOpenActivity(a.source, a.externalId)}
            onPrefetch={() => prefetch(a.source, a.externalId)}
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
  onSelect,
  onPrefetch,
}: {
  activity: Activity;
  unlocked: boolean;
  onSelect: () => void;
  onPrefetch: () => void;
}) {
  return (
    <li
      className="px-4 py-3 hover:bg-paper-2"
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      onTouchStart={onPrefetch}
    >
      {/* Name + icons */}
      <div className="flex items-start gap-2 mb-0.5">
        <button
          onClick={onSelect}
          className="font-semibold text-left hover:underline underline-offset-2 flex-1"
        >
          {a.name}
        </button>
        <div className="flex items-center gap-1 shrink-0 pt-0.5">
          {isTreadmill(a) && <TreadmillIcon />}
          <StravaLink source={a.source} externalId={a.externalId} />
        </div>
      </div>

      {/* Date + sport */}
      <div className="text-xs uppercase tracking-wider text-ink/50 mb-1">
        {date(a.startDate)} · {a.sportType}
      </div>

      {/* Stats */}
      <div className="font-mono text-sm flex items-center gap-x-2 flex-wrap">
        <button
          onClick={onSelect}
          className="font-semibold hover:underline underline-offset-2"
        >
          {km(a.distance)} <span className="text-ink/40">km</span>
        </button>
        <span className="text-ink/30">·</span>
        <span className="text-ink/60 text-xs">{duration(a.movingTime)}</span>
        <span className="text-ink/30">·</span>
        <span className="text-ink/60 text-xs">{pace(a.distance, a.movingTime)}</span>
        {a.avgHr && (
          <>
            <span className="text-ink/30">·</span>
            <span className="text-ink/60 text-xs flex items-center gap-0.5">
              <HeartbeatIcon className="h-3 w-3" />
              {Math.round(a.avgHr)} bpm
            </span>
          </>
        )}
      </div>

      {unlocked && <DeleteActivityButton activity={a} />}
    </li>
  );
}

function DeleteActivityButton({ activity }: { activity: Activity }) {
  const [open, setOpen] = useState(false);
  const del = useDeleteActivity();
  const busy = del.isPending;

  async function confirm() {
    try {
      await del.mutateAsync({
        source: activity.source,
        externalId: activity.externalId,
      });
      setOpen(false);
    } catch {
      // error surfaced as a toast (global mutation handler)
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
    <div className="bg-card px-3 py-3">
      <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.15em] sm:tracking-[0.2em] text-ink/60 flex items-center gap-1 leading-tight">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl sm:text-2xl font-bold font-mono mt-1 leading-none">{value}</div>
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
