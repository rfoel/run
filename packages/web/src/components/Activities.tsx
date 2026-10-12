import {
  ArrowsClockwiseIcon,
  HeartbeatIcon,
  TrashIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { cn } from "cn";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

/** "5:27/km" -> "5:27", so the unit can be typeset separately. */
const paceValue = (meters: number, sec: number) =>
  pace(meters, sec).replace("/km", "");

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
  const hasRuns = !!active && active.count > 0;

  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <section className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto font-display text-2xl md:text-3xl">Totais</h2>
          <ToggleGroup
            value={[range]}
            onValueChange={(v) => {
              const next = v[0] as Range | undefined;
              if (next) setRange(next);
            }}
            className="order-last w-full sm:order-none sm:w-fit"
          >
            {RANGES.map((r) => (
              <ToggleGroupItem
                key={r}
                value={r}
                aria-label={RANGE_LABELS[r]}
                className="flex-1 px-4 capitalize sm:flex-none"
              >
                {RANGE_LABELS[r]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {unlocked && (
            <Button
              variant="secondary"
              size="lg"
              onClick={() => sync.mutate(30)}
              disabled={syncing}
              className="px-4"
            >
              <ArrowsClockwiseIcon
                data-icon="inline-start"
                className={cn(syncing && "animate-spin")}
              />
              {syncing ? "Sincronizando…" : "Sincronizar"}
            </Button>
          )}
        </div>

        {syncResult && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-2xl bg-card px-5 py-4 text-sm tabular-nums">
            <SyncCount label="buscadas" value={syncResult.fetched} />
            <SyncCount label="importadas" value={syncResult.imported} />
            <SyncCount label="ignoradas" value={syncResult.skipped} />
            <SyncCount label="vinculadas" value={syncResult.linked} />
            {syncResult.errors.length > 0 && (
              <span className="flex items-center gap-1.5 font-semibold text-destructive">
                <WarningIcon className="size-4" weight="bold" />
                erros {syncResult.errors.length}
              </span>
            )}
          </div>
        )}

        {/* NRC-style summary: one huge distance, the rest as a stat grid. */}
        <div>
          <div className="font-display text-[6.5rem] leading-[0.85] sm:text-[9rem] md:text-[11rem]">
            {active ? (active.distance / 1000).toFixed(1) : "0"}
          </div>
          <div className="mt-2 text-sm font-semibold text-muted-foreground">
            Km
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-x-4 gap-y-6 md:grid-cols-5">
          <SummaryStat label="Corridas" value={active ? String(active.count) : "0"} />
          <SummaryStat
            label="Tempo"
            value={active ? duration(active.movingTime) : "0"}
          />
          <SummaryStat
            label="Pace médio"
            value={
              active && active.distance > 0
                ? paceValue(active.distance, active.movingTime)
                : "—"
            }
            unit={active && active.distance > 0 ? "/km" : undefined}
          />
          <SummaryStat
            label="Média km"
            value={
              hasRuns ? (active.distance / active.count / 1000).toFixed(2) : "—"
            }
            unit={hasRuns ? "km" : undefined}
          />
          <SummaryStat
            label="Média tempo"
            value={hasRuns ? duration(active.movingTime / active.count) : "—"}
          />
        </dl>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl md:text-3xl">Recentes</h2>
        <ul className="flex flex-col gap-2">
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
          <p className="text-center text-xs font-medium text-muted-foreground">
            Mostrando 100 de {items.length}
          </p>
        )}
      </section>
    </div>
  );
}

function SyncCount({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-muted-foreground">
      {label} <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}

function SummaryStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col-reverse gap-1.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="flex items-baseline gap-1">
        <span className="font-display text-4xl normal-case md:text-5xl">{value}</span>
        {unit && (
          <span className="text-sm font-semibold text-muted-foreground">
            {unit}
          </span>
        )}
      </dd>
    </div>
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
      className="relative rounded-2xl bg-card p-4 transition-colors hover:bg-accent md:px-6 md:py-5"
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      onTouchStart={onPrefetch}
    >
      {/* Date + sport, with the per-run actions on the right */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground first-letter:uppercase">
          {date(a.startDate)} · {a.sportType}
        </div>
        <div className="relative z-10 flex shrink-0 items-center gap-2 text-muted-foreground">
          {isTreadmill(a) && <TreadmillIcon />}
          <StravaLink source={a.source} externalId={a.externalId} />
          {unlocked && <DeleteActivityButton activity={a} />}
        </div>
      </div>

      {/* The name's button stretches over the whole tile (after:inset-0). */}
      <button
        onClick={onSelect}
        className="mt-1 block text-left font-semibold leading-snug md:text-lg outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
      >
        {a.name}
      </button>

      {/* Stats: big distance, then time / pace / HR */}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 sm:justify-start sm:gap-x-6 md:gap-x-10">
        <div className="flex items-baseline gap-1">
          <span className="font-display text-[2.75rem] md:text-6xl">
            {km(a.distance)}
          </span>
          <span className="text-sm font-semibold text-muted-foreground">km</span>
        </div>
        <div className="flex gap-x-4 sm:gap-x-5 md:gap-x-8">
          <RowStat label="Tempo" value={duration(a.movingTime)} />
          <RowStat
            label="Pace"
            value={paceValue(a.distance, a.movingTime)}
            unit={a.distance > 0 ? "/km" : undefined}
          />
          {a.avgHr && (
            <RowStat
              label={
                <>
                  <HeartbeatIcon className="size-3.5" weight="bold" />
                  bpm
                </>
              }
              value={String(Math.round(a.avgHr))}
            />
          )}
        </div>
      </div>
    </li>
  );
}

function RowStat({
  label,
  value,
  unit,
}: {
  label: React.ReactNode;
  value: string;
  unit?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-base font-semibold tabular-nums md:text-lg">
        {value}
        {unit && (
          <span className="ml-0.5 text-xs font-medium text-muted-foreground">
            {unit}
          </span>
        )}
      </span>
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {label}
      </span>
    </div>
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
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground hover:bg-background hover:text-foreground"
          />
        }
        aria-label="Excluir corrida"
      >
        <TrashIcon data-icon="inline-start" />
        Excluir
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 font-display text-2xl">
            <TrashIcon className="size-5" weight="bold" />
            Excluir corrida
          </AlertDialogTitle>
          <AlertDialogDescription className="font-semibold text-foreground">
            {activity.name} — {date(activity.startDate)}
          </AlertDialogDescription>
          <p className="mt-1 text-sm text-muted-foreground">
            Stats serão recalculados. Treino vinculado volta para "planejado". Re-sync vai trazer a corrida de novo.
          </p>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            {busy ? "Excluindo…" : "Excluir"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
          ? "rounded-2xl bg-card p-5 text-sm text-destructive"
          : "text-sm text-muted-foreground"
      }
    >
      {children}
    </p>
  );
}
