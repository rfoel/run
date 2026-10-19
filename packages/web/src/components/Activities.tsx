import {
  ArrowsClockwiseIcon,
  HeartbeatIcon,
  TrashIcon,
  TrophyIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { aggregateRecords } from "@run/core/bestEfforts";
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
import { Badge } from "@/components/ui/badge";
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
import { date, duration, km, pace, runWhen } from "../lib/format.ts";
import RouteThumb from "./RouteThumb.tsx";
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

      <RunFeed
        items={items}
        unlocked={unlocked}
        onOpenActivity={onOpenActivity}
        onPrefetch={prefetch}
      />
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

/** Runs shown at first, and added per "Mostrar mais". */
const PAGE = 60;

/** Feed orders, as they appear in the URL (`?ordem=`). */
type Sort = "recentes" | "antigas" | "distancia" | "pace" | "tempo";
const SORTS: Sort[] = ["recentes", "antigas", "distancia", "pace", "tempo"];
const SORT_LABELS: Record<Sort, string> = {
  recentes: "Recentes",
  antigas: "Antigas",
  distancia: "Distância",
  pace: "Pace",
  tempo: "Tempo",
};

/** Seconds per meter; runs with no distance sort last. */
const paceKey = (a: Activity) =>
  a.distance > 0 ? a.movingTime / a.distance : Infinity;

/**
 * The runs in the given order. The list comes newest first and the sort is
 * stable, so ties keep the newest run on top.
 */
function sortRuns(items: Activity[], sort: Sort): Activity[] {
  switch (sort) {
    case "recentes":
      return items;
    case "antigas":
      return [...items].reverse();
    case "distancia":
      return [...items].sort((a, b) => b.distance - a.distance);
    case "pace":
      return [...items].sort((a, b) => paceKey(a) - paceKey(b));
    case "tempo":
      return [...items].sort((a, b) => b.movingTime - a.movingTime);
  }
}

const SPORT_LABELS: Record<string, string> = {
  treadmill_running: "Esteira",
  indoor_running: "Esteira",
  trail_running: "Trilha",
  track_running: "Pista",
};

/** Local "YYYY-MM" of a run, so a late-evening run stays in its own month. */
const monthKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (key: string) =>
  new Date(`${key}-01T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

/**
 * The run list as a feed grouped by month, NRC-style: each month opens with
 * its totals (over every run that month, not just the ones shown). Runs that
 * hold an all-time record get a volt trophy. Sorted by anything but date, the
 * months make no sense, so it becomes a flat ranking.
 */
function RunFeed({
  items,
  unlocked,
  onOpenActivity,
  onPrefetch,
}: {
  items: Activity[];
  unlocked: boolean;
  onOpenActivity: (source: string, externalId: string) => void;
  onPrefetch: (source: string, externalId: string) => void;
}) {
  const [shown, setShown] = useState(PAGE);
  const [params, setParams] = useSearchParams();
  const param = params.get("ordem") as Sort | null;
  const sort: Sort = param && SORTS.includes(param) ? param : "recentes";
  const byDate = sort === "recentes" || sort === "antigas";

  const sorted = useMemo(() => sortRuns(items, sort), [items, sort]);

  function changeSort(next: Sort) {
    setShown(PAGE);
    setParams(
      (p) => {
        if (next === "recentes") p.delete("ordem");
        else p.set("ordem", next);
        return p;
      },
      { replace: true },
    );
  }

  const { months, records } = useMemo(() => {
    const totals = new Map<string, { km: number; runs: number }>();
    for (const a of items) {
      const key = monthKey(a.startDate);
      const t = totals.get(key) ?? { km: 0, runs: 0 };
      t.km += a.distance / 1000;
      t.runs++;
      totals.set(key, t);
    }
    // The list carries every run's best efforts, so the record holders come
    // for free; only distances from 1K up, where a "record" means something.
    const records = new Map<string, string[]>();
    for (const r of aggregateRecords(items)) {
      if (r.meters < 1000) continue;
      const key = `${r.source}#${r.externalId}`;
      records.set(key, [...(records.get(key) ?? []), r.label]);
    }
    return { months: totals, records };
  }, [items]);

  const visible = sorted.slice(0, shown);
  const groups: Array<{ key: string; runs: Activity[] }> = [];
  if (byDate) {
    for (const a of visible) {
      const key = monthKey(a.startDate);
      const last = groups[groups.length - 1];
      if (last?.key === key) last.runs.push(a);
      else groups.push({ key, runs: [a] });
    }
  }

  const runList = (runs: Activity[]) => (
    <ul className="flex flex-col gap-2">
      {runs.map((a) => (
        <ActivityRow
          key={`${a.source}:${a.externalId}`}
          activity={a}
          records={records.get(`${a.source}#${a.externalId}`)}
          unlocked={unlocked}
          onSelect={() => onOpenActivity(a.source, a.externalId)}
          onPrefetch={() => onPrefetch(a.source, a.externalId)}
        />
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-display text-2xl md:text-3xl">Corridas</h2>
        <ToggleGroup
          value={[sort]}
          onValueChange={(v) => {
            const next = v[0] as Sort | undefined;
            if (next) changeSort(next);
          }}
          className="w-full sm:w-fit"
        >
          {SORTS.map((s) => (
            <ToggleGroupItem
              key={s}
              value={s}
              aria-label={`Ordenar por ${SORT_LABELS[s].toLowerCase()}`}
              className="flex-1 px-2 sm:flex-none sm:px-4"
            >
              {SORT_LABELS[s]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {byDate
        ? groups.map((g) => {
            const t = months.get(g.key)!;
            return (
              <section key={g.key} className="flex flex-col gap-3">
                <header className="flex items-baseline justify-between gap-4">
                  <h2 className="font-display text-2xl md:text-3xl">
                    {monthLabel(g.key)}
                  </h2>
                  <p className="text-sm tabular-nums text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {t.km.toFixed(1).replace(".", ",")} km
                    </span>{" "}
                    · {t.runs} {t.runs === 1 ? "corrida" : "corridas"}
                  </p>
                </header>
                {runList(g.runs)}
              </section>
            );
          })
        : runList(visible)}
      {items.length > shown && (
        <Button
          variant="secondary"
          className="self-center"
          onClick={() => setShown((n) => n + PAGE)}
        >
          Mostrar mais
          <span className="font-normal text-muted-foreground">
            {shown} de {items.length}
          </span>
        </Button>
      )}
    </div>
  );
}

function ActivityRow({
  activity: a,
  records,
  unlocked,
  onSelect,
  onPrefetch,
}: {
  activity: Activity;
  records?: string[];
  unlocked: boolean;
  onSelect: () => void;
  onPrefetch: () => void;
}) {
  const sport = SPORT_LABELS[a.sportType] ?? (isTreadmill(a) ? "Esteira" : undefined);
  return (
    <li
      className="relative flex items-center gap-4 rounded-2xl bg-card p-3 pr-4 transition-colors hover:bg-accent md:gap-5 md:p-4 md:pr-6"
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      onTouchStart={onPrefetch}
    >
      {/* The route, framed like a map tile. Treadmill runs keep the frame. */}
      <div className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-background p-2.5 md:size-24 md:p-3">
        {a.thumb ? (
          <RouteThumb
            thumb={a.thumb}
            strokeWidth={1.75}
            className="size-full text-foreground dark:text-volt"
          />
        ) : (
          isTreadmill(a) && (
            <TreadmillIcon className="size-8 text-muted-foreground md:size-9" />
          )
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium text-muted-foreground first-letter:uppercase">
            {runWhen(a.startDate)}
          </span>
          {sport && (
            <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px]">
              {sport}
            </Badge>
          )}
          <div className="relative z-10 ml-auto flex shrink-0 items-center gap-2 text-muted-foreground">
            <StravaLink source={a.source} externalId={a.externalId} />
            {unlocked && <DeleteActivityButton activity={a} />}
          </div>
        </div>

        {/* The name's button stretches over the whole tile (after:inset-0). */}
        <button
          onClick={onSelect}
          className="truncate text-left font-semibold leading-snug outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50 md:text-lg"
        >
          {a.name}
        </button>

        <div className="mt-1 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-8">
          <div className="flex items-baseline gap-1">
            <span className="font-display text-4xl leading-none md:text-5xl">
              {km(a.distance)}
            </span>
            <span className="text-sm font-semibold text-muted-foreground">km</span>
          </div>
          <dl className="flex items-baseline gap-x-3.5 text-sm tabular-nums sm:gap-x-6 md:text-base">
            <RowStat
              label="Pace"
              value={paceValue(a.distance, a.movingTime)}
              unit={a.distance > 0 ? "/km" : undefined}
            />
            <RowStat label="Tempo" value={duration(a.movingTime)} />
            {a.avgHr && (
              <RowStat
                label="FC média"
                icon={<HeartbeatIcon className="size-3.5" weight="bold" />}
                value={String(Math.round(a.avgHr))}
                unit="bpm"
              />
            )}
          </dl>
        </div>

        {records && records.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {records.map((label) => (
              <Badge key={label} variant="volt" className="gap-1">
                <TrophyIcon weight="fill" />
                Recorde {label}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * A stat with its label under it on wider screens. On phones only the values
 * fit on one line, so the label hides and an icon, if any, leads the value.
 */
function RowStat({
  label,
  icon,
  value,
  unit,
}: {
  label: string;
  icon?: React.ReactNode;
  value: string;
  unit?: string;
}) {
  return (
    <div className="flex flex-col-reverse gap-0.5">
      <dt className="hidden items-center gap-1 text-xs font-medium text-muted-foreground sm:flex">
        {icon}
        {label}
      </dt>
      <dd className="flex items-baseline gap-0.5 font-semibold">
        {icon && (
          <span className="self-center text-muted-foreground sm:hidden">{icon}</span>
        )}
        {value}
        {unit && (
          <span className="text-xs font-medium text-muted-foreground">{unit}</span>
        )}
      </dd>
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
