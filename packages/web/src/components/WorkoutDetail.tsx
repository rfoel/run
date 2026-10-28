import {
  ArrowLeftIcon,
  ArrowsClockwiseIcon,
  GaugeIcon,
  HeartbeatIcon,
  LightningIcon,
  SparkleIcon,
  TrophyIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { useDarkMode, useThemeColors } from "../lib/theme.ts";
import { Fragment, useMemo, useState } from "react";
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  type Activity,
  type ActivityExtras,
  type ChartSeries,
  type PlannedRun,
  type WorkoutAnalysis,
  type WorkoutSection,
  type ZoneTime,
} from "../lib/api.ts";
import {
  useActivityDetail,
  useAnalyzeWorkout,
  useResyncActivity,
} from "../lib/queries.ts";
import { Skeleton } from "./Skeleton.tsx";
import { date, duration, km as kmFmt, paceFromSec } from "../lib/format.ts";
import { distanceLabel, type StoredBest } from "@run/core/bestEfforts";
import {
  decodePolyline,
  routeGeometry,
  segmentBetween,
} from "../lib/polyline.ts";
import RouteMap from "./RouteMap.tsx";
import StravaLink from "./StravaLink.tsx";
import { PLAN_TYPE_LABELS } from "./TypeBadge.tsx";
import {
  ComplianceMeta,
  PATTERN_LABEL,
  PLAN_STATUS_LABEL,
  PlanStatusTag,
  WorkoutSteps,
} from "./PlanStatus.tsx";
import { TreadmillIcon, isTreadmill } from "./TreadmillIcon.tsx";

// Granular work segments we chart/table. The parent `tempo` block is a
// container around its tempo_splits — including it would double-count (one
// extra row + an overlapping band), so we only fall back to it when no splits
// were produced.
const GRANULAR_KINDS = new Set(["rep", "tempo_split", "easy_split"]);

function workSections(
  sections: WorkoutSection[] | undefined,
): WorkoutSection[] {
  // Old/degenerate stored analyses can miss `sections` entirely — never crash.
  if (!sections) return [];
  const granular = sections.filter((s) => GRANULAR_KINDS.has(s.kind));
  if (granular.length) return granular;
  return sections.filter((s) => s.kind === "tempo");
}

/** Legend label for the shaded work bands, per workout shape. */
function workBandLabel(
  kind: WorkoutSection["kind"] | undefined,
  repDistanceM?: number,
): string {
  switch (kind) {
    case "rep":
      return `Tiros${repDistanceM ? ` ${repDistanceM}m` : ""}`;
    case "tempo_split":
    case "tempo":
      return "Tempo";
    case "easy_split":
      return "Parciais (km)";
    default:
      return "Trechos";
  }
}

function parsePace(str?: string): number | null {
  if (!str) return null;
  const m = str.match(/(\d+):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

type TargetPace = { min?: string; max?: string } | undefined;

/**
 * Seconds/km vs the prescribed target band, computed from data (the model's own
 * vs_target is unreliable). Positive = slower than target, negative = faster,
 * 0 = inside the band. Returns null when there's no usable target.
 */
function vsTargetSec(paceSec: number, tp: TargetPace): number | null {
  const a = parsePace(tp?.min);
  const b = parsePace(tp?.max);
  if (a == null && b == null) return null;
  const lo = Math.min(a ?? b!, b ?? a!);
  const hi = Math.max(a ?? b!, b ?? a!);
  if (paceSec > hi) return Math.round(paceSec - hi);
  if (paceSec < lo) return Math.round(paceSec - lo);
  return 0;
}

function elapsedAtKm(series: ChartSeries | null, targetKm?: number): number | null {
  if (!series || targetKm == null) return null;
  let best = 0;
  for (let i = 0; i < series.km.length; i++) {
    if (series.km[i]! <= targetKm) best = series.elapsed[i]!;
    else break;
  }
  return best;
}

export default function WorkoutDetail({
  source,
  externalId,
  unlocked,
  onBack,
}: {
  source: string;
  externalId: string;
  unlocked: boolean;
  onBack: () => void;
}) {
  const [hoverKm, setHoverKm] = useState<number | null>(null);
  // A table row selected to highlight its segment on the map. `key` identifies
  // the row (so clicking it again toggles off); km bounds drive the overlay.
  const [highlight, setHighlight] = useState<{
    key: string;
    startKm: number;
    endKm: number;
  } | null>(null);
  const toggleHighlight = (key: string, startKm: number, endKm: number) =>
    setHighlight((cur) => (cur?.key === key ? null : { key, startKm, endKm }));

  const detailQ = useActivityDetail(source, externalId);
  const analyzeM = useAnalyzeWorkout(source, externalId);
  const resyncM = useResyncActivity(source, externalId);
  const detail = detailQ.data ?? null;
  const loading = detailQ.isLoading;
  // Prefer a just-run analysis; otherwise the one stored with the detail.
  const analysis = analyzeM.data ?? detail?.analysis?.analysis ?? null;
  const analyzing = analyzeM.isPending;
  const queryError = detailQ.error ?? analyzeM.error;
  const error = queryError ? String(queryError) : null;

  const geo = useMemo(() => {
    const pl = detail?.activity.polyline;
    if (!pl) return null;
    return routeGeometry(decodePolyline(pl));
  }, [detail?.activity.polyline]);

  const highlightSeg = useMemo(() => {
    if (!geo || !highlight) return null;
    return segmentBetween(geo, highlight.startKm, highlight.endKm);
  }, [geo, highlight]);

  const runAnalysis = () => analyzeM.mutate();

  const a = detail?.activity;
  const extras = detail?.extras ?? null;

  return (
    <section className="flex flex-col gap-8 md:gap-10">
      <div className="-mb-4 flex items-center justify-between gap-4 md:-mb-6">
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={onBack}
          aria-label="voltar"
          title="voltar"
          className="-ml-2"
        >
          <ArrowLeftIcon className="size-5" />
        </Button>
        {a && unlocked && (
          <Button
            variant="secondary"
            onClick={() => void runAnalysis()}
            disabled={analyzing || !detail?.series}
            title={
              detail?.series ? "" : "Sem série — faça re-sync desta corrida"
            }
            className="px-3.5"
          >
            <SparkleIcon className={analyzing ? "animate-pulse" : ""} />
            {analyzing
              ? "analisando…"
              : analysis
                ? "re-analisar"
                : "analisar"}
          </Button>
        )}
      </div>

      {loading && (
        <>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="mt-3 h-20 w-48 md:h-28 md:w-72" />
            <div className="mt-3 flex gap-8">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <Skeleton className="mb-2 h-8 w-16" />
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
          </div>
          <Skeleton className="h-96 w-full rounded-2xl" />
        </>
      )}
      {error && <Status tone="error">{error}</Status>}

      {a && (
        <>
          <Hero activity={a} extras={extras} />

          {detail?.plan && <PlanCard plan={detail.plan} />}

          {/* Analysis + watch stats read as one tile grid; hidden when both are empty. */}
          <div className="flex flex-col gap-2 empty:hidden">
            {analysis && <Cards analysis={analysis} />}
            {extras?.physio && <GarminCards extras={extras} />}
          </div>

          {detail?.series ? (
            <PaceChart
              series={detail.series}
              analysis={analysis}
              onHover={setHoverKm}
              highlight={highlight}
            />
          ) : isTreadmill(a) ? (
            <Status>
              Corrida na esteira — sem trace de GPS, então não há gráfico de
              pace nem mapa.
            </Status>
          ) : (
            <Status>
              <span className="flex flex-col items-start gap-3">
                <span>
                  Sem série de pace para esta corrida. Faça um re-sync para
                  trazer o trace.
                </span>
                {unlocked && (
                  <Button
                    variant="outline"
                    onClick={() => resyncM.mutate()}
                    disabled={resyncM.isPending}
                    className="px-3.5"
                  >
                    <ArrowsClockwiseIcon
                      className={resyncM.isPending ? "animate-spin" : ""}
                    />
                    {resyncM.isPending ? "re-sincronizando…" : "re-sync"}
                  </Button>
                )}
                {resyncM.isError && (
                  <span className="text-xs text-destructive">
                    {String(resyncM.error)}
                  </span>
                )}
              </span>
            </Status>
          )}

          {extras?.hrZones && extras.hrZones.length > 0 && (
            <ZonesBar zones={extras.hrZones} />
          )}

          {geo && (
            <RouteMap geo={geo} hoverKm={hoverKm} highlight={highlightSeg} />
          )}

          <BestEfforts
            efforts={detail?.activity.bestEfforts}
            selectable={geo != null}
            selectedKey={highlight?.key ?? null}
            onToggle={toggleHighlight}
          />

          {analysis ? (
            <>
              <RepTable
                analysis={analysis}
                series={detail?.series ?? null}
                selectable={geo != null}
                selectedKey={highlight?.key ?? null}
                onToggle={toggleHighlight}
              />
              <Coach analysis={analysis} />
            </>
          ) : (
            !analyzing && (
              <Status>
                {unlocked
                  ? "A análise roda sozinha logo após o sync e aparece aqui em ~1 min. Se não vier, clique em analisar."
                  : "Destranque para gerar a análise do treino."}
              </Status>
            )
          )}
        </>
      )}
    </section>
  );
}


/**
 * NRC-style summary: date line, name, the distance huge, then a flat row of
 * the headline numbers.
 */
function Hero({
  activity: a,
  extras,
}: {
  activity: Activity;
  extras: ActivityExtras | null;
}) {
  const conditions = conditionsMeta(extras);
  const stats: { label: string; value: string; unit?: string }[] = [];
  if (a.distance > 0) {
    stats.push({
      label: "Pace",
      value: paceFromSec(a.movingTime / (a.distance / 1000)),
      unit: "/km",
    });
  }
  stats.push({ label: "Tempo", value: duration(a.movingTime) });
  if (a.avgHr) {
    stats.push({ label: "FC média", value: `${Math.round(a.avgHr)}`, unit: "bpm" });
  }
  if (a.elevationGain > 0) {
    stats.push({
      label: "Elevação",
      value: `${Math.round(a.elevationGain)}`,
      unit: "m",
    });
  }

  return (
    <header className="flex flex-col gap-6">
      {/* React hoists this into <head>. */}
      <title>{`${a.name} · ${kmFmt(a.distance)} km · run`}</title>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {date(a.startDate)}
          {conditions && <> · {conditions}</>}
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl">
          <span className="truncate">{a.name}</span>
          {isTreadmill(a) && (
            <TreadmillIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
          )}
          <StravaLink
            source={a.source}
            externalId={a.externalId}
            className="text-muted-foreground hover:text-foreground"
          />
        </h1>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-8xl md:text-[10rem]">
          {kmFmt(a.distance)}
        </span>
        <span className="font-display text-3xl text-muted-foreground md:text-4xl">
          km
        </span>
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-5 sm:gap-x-10 md:gap-x-14">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col-reverse gap-1.5">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="font-display text-3xl normal-case sm:text-4xl md:text-5xl">
              {s.value}
              {s.unit && <Unit>{s.unit}</Unit>}
            </dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

/** Small unit next to a big display number ("5:40 /km"). */
function Unit({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1 font-sans text-sm font-medium normal-case tracking-normal text-muted-foreground">
      {children}
    </span>
  );
}

/** Section title in the display face. */
function SectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2 className={cn("mb-4 font-display text-2xl md:text-3xl", className)}>
      {children}
    </h2>
  );
}

function PlanCard({ plan }: { plan: PlannedRun }) {
  const meta: string[] = [];
  if (plan.distance) meta.push(`${kmFmt(plan.distance)} km`);
  if (plan.durationSec) meta.push(duration(plan.durationSec));
  if (plan.paceTargetSec) meta.push(`${paceFromSec(plan.paceTargetSec)}/km`);

  return (
    <div className="rounded-2xl bg-card p-5 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <Badge>{PLAN_TYPE_LABELS[plan.type]}</Badge>
          <span className="text-xs text-muted-foreground">
            {PLAN_STATUS_LABEL.planned}
          </span>
          <PlanStatusTag plan={plan} />
          <ComplianceMeta plan={plan} />
        </div>
        {meta.length > 0 && (
          <span className="text-sm font-semibold tabular-nums">
            {meta.join(" · ")}
          </span>
        )}
      </div>
      {plan.workout && (
        <WorkoutSteps
          workout={plan.workout}
          className={cn("text-base", plan.notes && "mb-2")}
        />
      )}
      {plan.notes && (
        <p
          className={cn(
            "leading-relaxed",
            plan.workout ? "text-sm text-muted-foreground" : "text-base",
          )}
        >
          {plan.notes}
        </p>
      )}
    </div>
  );
}

/** "14°C · 69% · RPE 7" — conditions + athlete feedback for the header line. */
function conditionsMeta(extras: ActivityExtras | null): string {
  if (!extras) return "";
  const parts: string[] = [];
  if (extras.weather?.tempC != null) parts.push(`${extras.weather.tempC}°C`);
  if (extras.weather?.humidity != null) parts.push(`${extras.weather.humidity}%`);
  if (extras.feedback?.rpe != null) parts.push(`RPE ${extras.feedback.rpe}`);
  return parts.join(" · ");
}

const TE_LABELS: Record<string, string> = {
  RECOVERY: "recuperação",
  BASE: "base",
  TEMPO: "tempo",
  THRESHOLD: "limiar",
  VO2MAX: "VO2max",
  ANAEROBIC_CAPACITY: "anaeróbico",
  SPRINT: "sprint",
};

/** Second stat row: what the watch computed beyond pace/HR. */
function GarminCards({ extras }: { extras: ActivityExtras }) {
  const p = extras.physio!;
  const cards: { label: string; value: string; unit?: string; sub?: string }[] =
    [];

  if (p.aerobicTE != null) {
    cards.push({
      label: "Training effect",
      value: `${p.aerobicTE.toFixed(1)}${p.anaerobicTE != null ? ` / ${p.anaerobicTE.toFixed(1)}` : ""}`,
      sub: p.teLabel ? (TE_LABELS[p.teLabel] ?? p.teLabel.toLowerCase()) : "aeróbico / anaeróbico",
    });
  }
  if (p.trainingLoad != null) {
    cards.push({
      label: "Carga",
      value: `${p.trainingLoad}`,
      sub:
        p.bodyBatteryDiff != null
          ? `body battery ${p.bodyBatteryDiff}`
          : undefined,
    });
  }
  if (p.normPower != null || p.avgPower != null) {
    cards.push({
      label: "Potência",
      value: `${p.normPower ?? p.avgPower}`,
      unit: "W",
      sub:
        p.normPower != null && p.avgPower != null
          ? `NP · média ${p.avgPower} W`
          : p.normPower != null
            ? "normalizada"
            : "média",
    });
  }
  if (p.avgCadence != null) {
    cards.push({
      label: "Cadência",
      value: `${p.avgCadence}`,
      unit: "spm",
      sub: p.gctMs != null ? `contato ${p.gctMs} ms` : undefined,
    });
  }
  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cards.slice(0, 4).map((c) => (
        <StatTile
          key={c.label}
          icon={<GaugeIcon />}
          label={c.label}
          value={c.value}
          unit={c.unit}
          sub={c.sub}
        />
      ))}
    </div>
  );
}

// Z1 → Z5, easy to hard: gray, blue, green, orange, red.
const ZONE_COLORS = [
  "bg-chart-3",
  "bg-chart-4",
  "bg-success",
  "bg-chart-5",
  "bg-chart-2",
];

/** Horizontal stacked bar of time per HR zone. */
function ZonesBar({ zones }: { zones: ZoneTime[] }) {
  const total = zones.reduce((acc, z) => acc + z.secs, 0);
  if (total <= 0) return null;
  return (
    <div>
      <SectionTitle>Zonas de FC</SectionTitle>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {zones.map((z) => {
          const pct = (z.secs / total) * 100;
          if (pct < 0.5) return null;
          return (
            <div
              key={z.zone}
              style={{ width: `${pct}%` }}
              title={`Z${z.zone} (${z.low}+ bpm): ${Math.round(z.secs / 60)} min`}
              className={cn("h-full", ZONE_COLORS[z.zone - 1] ?? "bg-chart-3")}
            />
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-5 gap-2">
        {zones.map((z) => (
          <div key={z.zone} className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  "inline-block size-2 rounded-full",
                  ZONE_COLORS[z.zone - 1] ?? "bg-chart-3",
                )}
              />
              Z{z.zone}
            </span>
            <span className="font-display text-2xl md:text-3xl">
              {Math.round(z.secs / 60)}
              <Unit>min</Unit>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Cards({ analysis }: { analysis: WorkoutAnalysis }) {
  if (!analysis.totals) return null;
  const work = workSections(analysis.sections);
  const fastest = work.reduce<WorkoutSection | null>(
    (acc, s) =>
      !acc || s.avg_pace_sec_per_km < acc.avg_pace_sec_per_km ? s : acc,
    null,
  );
  const slowest = work.reduce<WorkoutSection | null>(
    (acc, s) =>
      !acc || s.avg_pace_sec_per_km > acc.avg_pace_sec_per_km ? s : acc,
    null,
  );
  const tp = analysis.prescription?.target_pace_min_per_km;
  const targetLabel =
    tp?.min && tp?.max
      ? `alvo ${tp.min}–${tp.max}`
      : tp?.min
        ? `alvo ${tp.min}`
        : undefined;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StatTile
        icon={<GaugeIcon />}
        label="Pace médio"
        value={paceFromSec(analysis.totals.avg_pace_sec_per_km)}
        unit="/km"
        sub={targetLabel}
      />
      <StatTile
        icon={<LightningIcon />}
        label="Mais rápido"
        value={fastest ? paceFromSec(fastest.avg_pace_sec_per_km) : "—"}
        unit={fastest ? "/km" : undefined}
        sub={fastest?.index ? `tiro ${fastest.index}` : undefined}
      />
      <StatTile
        icon={<GaugeIcon />}
        label="Mais lento"
        value={slowest ? paceFromSec(slowest.avg_pace_sec_per_km) : "—"}
        unit={slowest ? "/km" : undefined}
        sub={slowest?.index ? `tiro ${slowest.index}` : undefined}
      />
      <StatTile
        icon={<HeartbeatIcon />}
        label="FC máx"
        value={analysis.totals.max_hr ? `${analysis.totals.max_hr}` : "—"}
        unit={analysis.totals.max_hr ? "bpm" : undefined}
        sub={
          analysis.analysis?.rpe_estimate
            ? `RPE ${analysis.analysis.rpe_estimate}`
            : undefined
        }
      />
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  unit,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl bg-card p-4 sm:p-5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-3 font-display text-3xl normal-case sm:text-4xl">
        {value}
        {unit && <Unit>{unit}</Unit>}
      </div>
      {sub && (
        <div className="mt-1.5 truncate text-xs text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}

/**
 * Tokens useThemeColors doesn't expose (success for the target band, popover
 * for the tooltip), read the same way and re-read when the OS theme flips.
 */
function useExtraColors() {
  const dark = useDarkMode();
  return useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      success: style.getPropertyValue("--success").trim(),
      popover: style.getPropertyValue("--popover").trim(),
    };
    // `dark` is the cache key: the computed values change when it flips.
  }, [dark]);
}

type ChartPoint = {
  km: number;
  pace: number | null;
  hr: number | null;
  ele: number | null;
  power: number | null;
  cadence: number | null;
};

function PaceChart({
  series,
  analysis,
  onHover,
  highlight,
}: {
  series: ChartSeries;
  analysis: WorkoutAnalysis | null;
  onHover: (km: number | null) => void;
  highlight?: { startKm: number; endKm: number } | null;
}) {
  const [showPower, setShowPower] = useState(false);
  const [showCadence, setShowCadence] = useState(false);
  const c = useThemeColors();
  const extra = useExtraColors();

  const data: ChartPoint[] = useMemo(
    () =>
      series.km.map((km, i) => ({
        km,
        pace: series.pace[i] ?? null,
        hr: series.hr[i] ?? null,
        ele: series.ele?.[i] ?? null,
        power: series.power?.[i] ?? null,
        cadence: series.cadence?.[i] ?? null,
      })),
    [series],
  );

  const paces = data
    .map((d) => d.pace)
    .filter((p): p is number => p != null);
  const minPace = paces.length ? Math.min(...paces) : 200;
  const maxPace = paces.length ? Math.max(...paces) : 600;
  const tp = analysis?.prescription?.target_pace_min_per_km;
  const targetMin = parsePace(tp?.min);
  const targetMax = parsePace(tp?.max);
  // Y domain padded; reversed so faster (lower sec/km) sits on top.
  const lo = Math.max(0, Math.min(minPace, targetMin ?? minPace) - 20);
  const hi = Math.max(maxPace, targetMax ?? maxPace) + 20;

  const hrs = data.map((d) => d.hr).filter((h): h is number => h != null);
  const hasHr = hrs.length > 0;
  // Pad the HR band downward so the area sits low and doesn't fight the pace line.
  const hrLo = hasHr ? Math.max(0, Math.min(...hrs) - 25) : 0;
  const hrHi = hasHr ? Math.max(...hrs) + 8 : 200;

  // Optional streams. Elevation renders as a subtle floor area (its domain is
  // stretched upward so the profile hugs the bottom quarter of the chart).
  const eles = data.map((d) => d.ele).filter((e): e is number => e != null);
  const hasEle = eles.length > 0;
  const eleMin = hasEle ? Math.min(...eles) : 0;
  const eleMax = hasEle ? Math.max(...eles) : 1;
  const eleHi = eleMax + Math.max(20, (eleMax - eleMin) * 3);
  const powers = data.map((d) => d.power).filter((p): p is number => p != null);
  const hasPower = powers.length > 0;
  const cads = data.map((d) => d.cadence).filter((c): c is number => c != null);
  const hasCadence = cads.length > 0;

  const reps = workSections(analysis?.sections ?? []).filter(
    (s) => s.start_km != null && s.end_km != null,
  );

  const repDist = analysis?.prescription?.rep_distance_m;
  const workKind = reps[0]?.kind;
  const repsLabel = reps.length ? workBandLabel(workKind, repDist) : null;
  const targetLabel =
    targetMin != null && targetMax != null
      ? `Alvo ${paceFromSec(targetMin)}–${paceFromSec(targetMax)}/km`
      : null;

  const axisTick = { fontSize: 11, fill: c.mutedForeground };

  return (
    <div className="rounded-2xl bg-card px-1 pt-4 pb-2 sm:px-4 sm:pt-6 sm:pb-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 pb-4 text-xs text-muted-foreground sm:px-2">
        <LegendItem label="Pace">
          <span className="inline-block h-1 w-4 rounded-full bg-chart-1" />
        </LegendItem>
        {repsLabel && (
          <LegendItem label={repsLabel}>
            <span className="inline-block size-3 rounded-sm bg-foreground/10" />
          </LegendItem>
        )}
        {targetLabel && (
          <LegendItem label={targetLabel}>
            <span className="inline-block h-2.5 w-4 rounded-sm border border-dashed border-success bg-success/15" />
          </LegendItem>
        )}
        {hasHr && (
          <LegendItem label="FC">
            <span className="inline-block h-2.5 w-4 rounded-sm border-t-2 border-chart-2 bg-chart-2/20" />
          </LegendItem>
        )}
        {hasEle && (
          <LegendItem label="Elevação">
            <span className="inline-block h-2.5 w-4 rounded-sm bg-chart-3/40" />
          </LegendItem>
        )}
        {(hasPower || hasCadence) && (
          <span className="flex items-center gap-1 sm:ml-auto">
            {hasPower && (
              <LegendToggle
                label="Potência"
                swatch="bg-chart-5"
                active={showPower}
                onToggle={() => setShowPower((v) => !v)}
              />
            )}
            {hasCadence && (
              <LegendToggle
                label="Cadência"
                swatch="bg-chart-4"
                active={showCadence}
                onToggle={() => setShowCadence((v) => !v)}
              />
            )}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart
          data={data}
          margin={{ top: 16, right: 4, bottom: 4, left: 0 }}
          onMouseMove={(state: { activeLabel?: string | number }) => {
            const v = state?.activeLabel;
            if (v != null && v !== "") onHover(Number(v));
          }}
          onMouseLeave={() => onHover(null)}
        >
          <CartesianGrid
            vertical={false}
            stroke={c.foreground}
            strokeOpacity={0.06}
          />
          {hasEle && (
            <Area
              yAxisId="ele"
              type="monotone"
              dataKey="ele"
              stroke={c.chart3}
              strokeOpacity={0.6}
              strokeWidth={1}
              fill={c.chart3}
              fillOpacity={0.22}
              connectNulls
              isAnimationActive={false}
              activeDot={false}
            />
          )}
          {hasHr && (
            <Area
              yAxisId="hr"
              type="monotone"
              dataKey="hr"
              stroke={c.chart2}
              strokeOpacity={0.7}
              strokeWidth={1.5}
              fill={c.chart2}
              fillOpacity={0.1}
              connectNulls
              isAnimationActive={false}
              activeDot={false}
            />
          )}
          {targetMin != null && targetMax != null && (
            <ReferenceArea
              yAxisId="pace"
              y1={targetMin}
              y2={targetMax}
              fill={extra.success}
              fillOpacity={0.12}
              stroke={extra.success}
              strokeOpacity={0.6}
              strokeDasharray="4 4"
            />
          )}
          {reps.map((r, i) => (
            <ReferenceArea
              key={i}
              yAxisId="pace"
              x1={r.start_km}
              x2={r.end_km}
              fill={c.foreground}
              fillOpacity={0.05}
              label={{
                value: r.index ? `${r.index}` : undefined,
                position: "insideTop",
                fontSize: 11,
                fontWeight: 600,
                fill: c.mutedForeground,
              }}
            />
          ))}
          {highlight && (
            <ReferenceArea
              yAxisId="pace"
              x1={highlight.startKm}
              x2={highlight.endKm}
              fill={c.chart5}
              fillOpacity={0.18}
              stroke={c.chart5}
              strokeOpacity={0.7}
            />
          )}
          <XAxis
            dataKey="km"
            type="number"
            domain={["dataMin", "dataMax"]}
            allowDataOverflow
            tickFormatter={(v: number) => `${v.toFixed(0)}`}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            unit=" km"
          />
          <YAxis
            yAxisId="pace"
            reversed
            domain={[lo, hi]}
            tickFormatter={(v: number) => paceFromSec(v)}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          {hasHr && (
            <YAxis
              yAxisId="hr"
              orientation="right"
              domain={[hrLo, hrHi]}
              tickFormatter={(v: number) => `${Math.round(v)}`}
              tick={{ ...axisTick, fill: c.chart2 }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
          )}
          {/* Hidden axes get width 0, or they still reserve space on the
              left and push the pace ticks off-canvas. */}
          {hasEle && (
            <YAxis yAxisId="ele" hide width={0} domain={[eleMin, eleHi]} />
          )}
          {hasPower && (
            <YAxis
              yAxisId="power"
              hide
              width={0}
              domain={[0, "dataMax + 40"]}
            />
          )}
          {hasCadence && (
            <YAxis
              yAxisId="cadence"
              hide
              width={0}
              domain={["dataMin - 40", "dataMax + 10"]}
            />
          )}
          <Tooltip
            formatter={((value: number, name: string) => {
              switch (name) {
                case "pace":
                  return [`${paceFromSec(value)}/km`, "pace"];
                case "hr":
                  return [`${Math.round(value)} bpm`, "fc"];
                case "ele":
                  return [`${Math.round(value)} m`, "elevação"];
                case "power":
                  return [`${Math.round(value)} W`, "potência"];
                case "cadence":
                  return [`${Math.round(value)} spm`, "cadência"];
                default:
                  return [String(value), name];
              }
            }) as never}
            labelFormatter={((v: number) => `${Number(v).toFixed(2)} km`) as never}
            cursor={{ stroke: c.mutedForeground, strokeOpacity: 0.5 }}
            contentStyle={{
              background: extra.popover,
              border: `1px solid ${c.border}`,
              borderRadius: 12,
              boxShadow: "0 8px 24px rgb(0 0 0 / 0.12)",
              fontSize: 12,
              fontVariantNumeric: "tabular-nums",
              padding: "8px 12px",
            }}
            labelStyle={{ color: c.foreground, fontWeight: 600, marginBottom: 2 }}
            itemStyle={{ color: c.foreground, padding: 0 }}
          />
          <Line
            yAxisId="pace"
            type="monotone"
            dataKey="pace"
            stroke={c.chart1}
            strokeWidth={2}
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 4, fill: c.chart1, stroke: c.card, strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
          />
          {hasPower && showPower && (
            <Line
              yAxisId="power"
              type="monotone"
              dataKey="power"
              stroke={c.chart5}
              strokeWidth={1.5}
              strokeOpacity={0.85}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
          {hasCadence && showCadence && (
            <Line
              yAxisId="cadence"
              type="monotone"
              dataKey="cadence"
              stroke={c.chart4}
              strokeWidth={1.5}
              strokeOpacity={0.85}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
          <Brush
            dataKey="km"
            height={24}
            travellerWidth={8}
            stroke={c.chart3}
            fill={c.background}
            tickFormatter={((v: number) => `${Number(v).toFixed(1)}`) as never}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function LegendItem({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {children}
      {label}
    </span>
  );
}

/** Clickable legend pill that shows/hides an optional series. */
function LegendToggle({
  label,
  swatch,
  active,
  onToggle,
}: {
  label: string;
  /** Background class of the series color, e.g. `bg-chart-4`. */
  swatch: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <Toggle
      size="sm"
      variant="outline"
      pressed={active}
      onPressedChange={onToggle}
      title={active ? `Ocultar ${label}` : `Mostrar ${label}`}
      className="h-7 gap-1.5 px-2.5 text-xs"
    >
      <span className={cn("inline-block h-1 w-3 rounded-full", swatch)} />
      {label}
    </Toggle>
  );
}

function RepTable({
  analysis,
  series,
  selectable,
  selectedKey,
  onToggle,
}: {
  analysis: WorkoutAnalysis;
  series: ChartSeries | null;
  selectable: boolean;
  selectedKey: string | null;
  onToggle: (key: string, startKm: number, endKm: number) => void;
}) {
  const work = workSections(analysis.sections);
  if (work.length === 0) return null;
  const tp = analysis.prescription?.target_pace_min_per_km;
  const hasTarget = parsePace(tp?.min) != null || parsePace(tp?.max) != null;
  const repDistanceM = analysis.prescription?.rep_distance_m;

  // Group consecutive sections by kind (e.g. the 5k's per-km "easy_split"s vs
  // the "rep" strides) so mixed workouts don't blur into one list with the
  // index restarting mid-table.
  const groups: { kind: WorkoutSection["kind"]; rows: WorkoutSection[] }[] = [];
  for (const s of work) {
    const last = groups[groups.length - 1];
    if (last && last.kind === s.kind) last.rows.push(s);
    else groups.push({ kind: s.kind, rows: [s] });
  }
  const multi = groups.length > 1;
  const colCount = hasTarget ? 9 : 8;
  const title = multi
    ? workBandLabel(undefined)
    : workBandLabel(
        groups[0]!.kind,
        groups[0]!.kind === "rep" ? repDistanceM : undefined,
      );

  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <div className="overflow-x-auto rounded-2xl bg-card">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-border">
              <Th>#</Th>
              <Th>Pace</Th>
              <Th>
                <span className="sr-only">Pace relativo</span>
              </Th>
              {hasTarget && <Th>vs alvo</Th>}
              <Th>Tempo</Th>
              <Th>Início</Th>
              <Th>Trecho (km)</Th>
              <Th>FC méd</Th>
              <Th>FC máx</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.map((g, gi) => {
              // Relative pace bars scale within the group: strides and easy
              // kilometres would otherwise squash each other.
              const paces = g.rows.map((s) => s.avg_pace_sec_per_km);
              const fastest = Math.min(...paces);
              const slowest = Math.max(...paces);
              return (
                <Fragment key={gi}>
                  {multi && (
                    <tr>
                      <td
                        colSpan={colCount}
                        className="px-5 pt-5 pb-2 text-sm font-semibold"
                      >
                        {workBandLabel(
                          g.kind,
                          g.kind === "rep" ? repDistanceM : undefined,
                        )}
                      </td>
                    </tr>
                  )}
                  {g.rows.map((s, i) => {
                    const start = elapsedAtKm(series, s.start_km);
                    // The single target band describes the easy/tempo portion; in a
                    // mixed workout it's meaningless for the (much faster) strides.
                    const showVs = hasTarget && !(multi && s.kind === "rep");
                    const vs = showVs
                      ? vsTargetSec(s.avg_pace_sec_per_km, tp)
                      : null;
                    const key = `rep:${gi}:${s.index ?? i}`;
                    const canSelect =
                      selectable && s.start_km != null && s.end_km != null;
                    const isFastest =
                      g.rows.length > 1 && s.avg_pace_sec_per_km === fastest;
                    const frac =
                      slowest > fastest
                        ? (slowest - s.avg_pace_sec_per_km) / (slowest - fastest)
                        : 1;
                    return (
                      <tr
                        key={`${g.kind}-${s.index ?? i}`}
                        onClick={
                          canSelect
                            ? () => onToggle(key, s.start_km!, s.end_km!)
                            : undefined
                        }
                        className={rowClass(canSelect, selectedKey === key)}
                      >
                        <Td className="font-semibold">{s.index ?? i + 1}</Td>
                        <Td className="font-semibold">
                          <span className="inline-flex items-center gap-1.5">
                            {paceFromSec(s.avg_pace_sec_per_km)}/km
                            {isFastest && (
                              <Badge
                                variant="volt"
                                title="Mais rápido"
                                className="size-5 px-0"
                              >
                                <LightningIcon weight="fill" />
                              </Badge>
                            )}
                          </span>
                        </Td>
                        <Td className="w-full min-w-24">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/5">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                isFastest
                                  ? "bg-volt"
                                  : "bg-chart-1 dark:bg-foreground/40",
                              )}
                              style={{ width: `${30 + 70 * frac}%` }}
                            />
                          </div>
                        </Td>
                        {hasTarget && (
                          <Td
                            className={
                              vs == null
                                ? "text-muted-foreground"
                                : vs > 0
                                  ? "text-destructive"
                                  : "text-success"
                            }
                          >
                            {vs == null
                              ? "—"
                              : vs === 0
                                ? "no alvo"
                                : `${vs > 0 ? "+" : ""}${vs}s`}
                          </Td>
                        )}
                        <Td>{duration(s.duration_sec)}</Td>
                        <Td className="text-muted-foreground">
                          {start != null ? duration(start) : "—"}
                        </Td>
                        <Td className="text-muted-foreground">
                          {s.start_km != null && s.end_km != null
                            ? `${s.start_km.toFixed(2)} → ${s.end_km.toFixed(2)}`
                            : "—"}
                        </Td>
                        <Td>{s.avg_hr ? Math.round(s.avg_hr) : "—"}</Td>
                        <Td>{s.max_hr ? Math.round(s.max_hr) : "—"}</Td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Coach({ analysis }: { analysis: WorkoutAnalysis }) {
  const an = analysis.analysis;
  if (!an) return null;
  const hasMeta =
    an.pattern || an.target_hit != null || an.hr_drift_bpm != null;
  return (
    <div>
      <SectionTitle>Análise</SectionTitle>
      <div className="flex flex-col gap-2">
        {hasMeta && (
          <div className="mb-2 flex flex-wrap gap-2 text-sm">
            {an.pattern && (
              <span className="rounded-full bg-card px-3.5 py-1.5">
                <span className="text-muted-foreground">padrão:</span>{" "}
                {PATTERN_LABEL[an.pattern] ?? an.pattern}
              </span>
            )}
            {an.target_hit != null && (
              <span className="rounded-full bg-card px-3.5 py-1.5">
                <span className="text-muted-foreground">alvo:</span>{" "}
                <span className={an.target_hit ? "text-success" : "text-destructive"}>
                  {an.target_hit ? "atingido" : "não atingido"}
                </span>
              </span>
            )}
            {an.hr_drift_bpm != null && (
              <span className="rounded-full bg-card px-3.5 py-1.5 tabular-nums">
                <span className="text-muted-foreground">drift fc:</span>{" "}
                {an.hr_drift_bpm} bpm
              </span>
            )}
          </div>
        )}

        {an.highlights && an.highlights.length > 0 && (
          <div className="rounded-2xl bg-card p-5 sm:p-6">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-success">
              <SparkleIcon weight="fill" className="size-4" /> pontos fortes
            </h3>
            <AnalysisList items={an.highlights} />
          </div>
        )}

        {an.issues && an.issues.length > 0 && (
          <div className="rounded-2xl bg-card p-5 sm:p-6">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-destructive">
              <WarningIcon weight="fill" className="size-4" /> problemas
            </h3>
            <AnalysisList items={an.issues} />
          </div>
        )}

        {an.next_workout_suggestion && (
          <div className="rounded-2xl bg-primary p-5 text-primary-foreground sm:p-6">
            <h3 className="mb-2 text-sm font-semibold opacity-70">
              próximo treino
            </h3>
            <p className="text-base leading-relaxed">
              {an.next_workout_suggestion}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function AnalysisList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed marker:text-muted-foreground">
      {items.map((h, i) => (
        <li key={i}>{h}</li>
      ))}
    </ul>
  );
}

// Computed server-side at ingest and stored on the activity (see
// @run/core/bestEfforts), so this renders whatever the run has — exact windows
// for runs whose samples were kept, kilometre-snapped ones for the rest.
function BestEfforts({
  efforts,
  selectable,
  selectedKey,
  onToggle,
}: {
  efforts: StoredBest[] | undefined;
  selectable: boolean;
  selectedKey: string | null;
  onToggle: (key: string, startKm: number, endKm: number) => void;
}) {
  if (!efforts || efforts.length === 0) return null;
  const anyApprox = efforts.some((e) => e.src === "splits");
  return (
    <div>
      <SectionTitle className="flex items-center gap-3">
        Melhores marcas
        <Badge variant="volt" className="size-6 px-0">
          <TrophyIcon weight="fill" />
        </Badge>
        {anyApprox && (
          <span
            title="Sem as amostras desta corrida, a janela só pode começar num quilômetro fechado — o tempo real é igual ou alguns segundos melhor"
            className="font-sans text-xs font-medium normal-case tracking-normal text-muted-foreground"
          >
            aprox
          </span>
        )}
      </SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {efforts.map((e) => {
          const key = `be:${e.m}`;
          const selected = selectedKey === key;
          const body = (
            <>
              <span className="text-sm font-semibold">{distanceLabel(e.m)}</span>
              <span className="mt-3 font-display text-4xl normal-case">
                {duration(e.t)}
              </span>
              <span className="mt-2 text-xs text-muted-foreground tabular-nums">
                {paceFromSec(Math.round(e.t / (e.m / 1000)))}/km
                {e.hr != null && <> · {e.hr} bpm</>}
              </span>
            </>
          );
          const tile = cn(
            "flex flex-col items-start rounded-2xl bg-card p-4 text-left sm:p-5",
            selected && "ring-2 ring-chart-5 ring-inset",
          );
          return selectable ? (
            <button
              key={e.m}
              type="button"
              aria-pressed={selected}
              onClick={() => onToggle(key, e.startKm, e.startKm + e.m / 1000)}
              className={cn(tile, "cursor-pointer transition-colors hover:bg-accent")}
            >
              {body}
            </button>
          ) : (
            <div key={e.m} className={tile}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Shared row styling for selectable, highlightable table rows. */
function rowClass(selectable: boolean, selected: boolean) {
  if (selected) return "bg-chart-5/15 cursor-pointer";
  return selectable ? "hover:bg-accent cursor-pointer transition-colors" : "";
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-3 text-left text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-5 last:pr-5">
      {children}
    </th>
  );
}
function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-3 py-3.5 whitespace-nowrap first:pl-5 last:pr-5",
        className,
      )}
    >
      {children}
    </td>
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
          ? "rounded-2xl bg-destructive/10 p-5 text-sm text-destructive"
          : "rounded-2xl bg-card p-5 text-sm leading-relaxed text-muted-foreground"
      }
    >
      {children}
    </p>
  );
}
