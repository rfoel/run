import {
  ArrowLeftIcon,
  GaugeIcon,
  HeartbeatIcon,
  LightningIcon,
  SparkleIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
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
  analyzeWorkout,
  getActivityDetail,
  type ActivityDetail,
  type ChartSeries,
  type WorkoutAnalysis,
  type WorkoutSection,
} from "../lib/api.ts";
import { date, duration, km as kmFmt, paceFromSec } from "../lib/format.ts";
import { decodePolyline, routeGeometry } from "../lib/polyline.ts";
import RouteMap from "./RouteMap.tsx";
import StravaLink from "./StravaLink.tsx";

// Granular work segments we chart/table. The parent `tempo` block is a
// container around its tempo_splits — including it would double-count (one
// extra row + an overlapping band), so we only fall back to it when no splits
// were produced.
const GRANULAR_KINDS = new Set(["rep", "tempo_split", "easy_split"]);

function workSections(sections: WorkoutSection[]): WorkoutSection[] {
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
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [analysis, setAnalysis] = useState<WorkoutAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [hoverKm, setHoverKm] = useState<number | null>(null);

  const geo = useMemo(() => {
    const pl = detail?.activity.polyline;
    if (!pl) return null;
    return routeGeometry(decodePolyline(pl));
  }, [detail?.activity.polyline]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getActivityDetail(source, externalId)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setAnalysis(d.analysis?.analysis ?? null);
      })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [source, externalId]);

  async function runAnalysis() {
    setAnalyzing(true);
    setError(null);
    try {
      const a = await analyzeWorkout(source, externalId);
      setAnalysis(a);
    } catch (e) {
      setError(String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  const a = detail?.activity;

  return (
    <section className="flex flex-col gap-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-medium text-ink/60 hover:text-ink self-start"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        voltar
      </button>

      {loading && <Status>Carregando…</Status>}
      {error && <Status tone="error">{error}</Status>}

      {a && (
        <>
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl font-bold flex items-center gap-2">
                <span className="truncate">{a.name}</span>
                <StravaLink source={a.source} externalId={a.externalId} />
              </h1>
              <p className="text-xs uppercase tracking-wider text-ink/50 mt-1">
                {date(a.startDate)} · {kmFmt(a.distance)} km ·{" "}
                {duration(a.movingTime)}
              </p>
            </div>
            {unlocked && (
              <button
                onClick={() => void runAnalysis()}
                disabled={analyzing || !detail?.series}
                title={
                  detail?.series ? "" : "Sem série — faça re-sync desta corrida"
                }
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-medium border-2 border-ink px-3 py-1.5 hover:bg-ink hover:text-paper disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink shrink-0"
              >
                <SparkleIcon
                  className={"h-3.5 w-3.5 " + (analyzing ? "animate-pulse" : "")}
                />
                {analyzing
                  ? "analisando…"
                  : analysis
                    ? "re-analisar"
                    : "analisar"}
              </button>
            )}
          </header>

          {analysis && <Cards analysis={analysis} />}

          {detail?.series ? (
            <PaceChart
              series={detail.series}
              analysis={analysis}
              onHover={setHoverKm}
            />
          ) : (
            <Status>
              Sem série de pace para esta corrida. Faça um re-sync no Strava
              para trazer o trace.
            </Status>
          )}

          {geo && <RouteMap geo={geo} hoverKm={hoverKm} />}

          {analysis ? (
            <>
              <RepTable analysis={analysis} series={detail?.series ?? null} />
              <Coach analysis={analysis} />
            </>
          ) : (
            !analyzing && (
              <Status>
                {unlocked
                  ? "Clique em analisar para gerar a leitura do treino (tiros, tabela e análise)."
                  : "Destranque para gerar a análise do treino."}
              </Status>
            )
          )}
        </>
      )}
    </section>
  );
}

function Cards({ analysis }: { analysis: WorkoutAnalysis }) {
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-ink border-2 border-ink">
      <Card
        icon={<GaugeIcon className="h-4 w-4" />}
        label="Pace médio"
        value={`${paceFromSec(analysis.totals.avg_pace_sec_per_km)}/km`}
        sub={targetLabel}
      />
      <Card
        icon={<LightningIcon className="h-4 w-4" />}
        label="Mais rápido"
        value={fastest ? `${paceFromSec(fastest.avg_pace_sec_per_km)}/km` : "—"}
        sub={fastest?.index ? `tiro ${fastest.index}` : undefined}
      />
      <Card
        icon={<GaugeIcon className="h-4 w-4" />}
        label="Mais lento"
        value={slowest ? `${paceFromSec(slowest.avg_pace_sec_per_km)}/km` : "—"}
        sub={slowest?.index ? `tiro ${slowest.index}` : undefined}
      />
      <Card
        icon={<HeartbeatIcon className="h-4 w-4" />}
        label="FC máx"
        value={analysis.totals.max_hr ? `${analysis.totals.max_hr} bpm` : "—"}
        sub={
          analysis.analysis?.rpe_estimate
            ? `RPE ${analysis.analysis.rpe_estimate}`
            : undefined
        }
      />
    </div>
  );
}

function Card({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-paper px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-ink/60 flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-xl sm:text-2xl font-bold font-mono mt-1">{value}</div>
      {sub && (
        <div className="text-[10px] uppercase tracking-[0.15em] text-ink/40 mt-0.5">
          {sub}
        </div>
      )}
    </div>
  );
}

type ChartPoint = { km: number; pace: number | null; hr: number | null };

function PaceChart({
  series,
  analysis,
  onHover,
}: {
  series: ChartSeries;
  analysis: WorkoutAnalysis | null;
  onHover: (km: number | null) => void;
}) {
  const data: ChartPoint[] = useMemo(
    () =>
      series.km.map((km, i) => ({
        km,
        pace: series.pace[i] ?? null,
        hr: series.hr[i] ?? null,
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

  return (
    <div className="border-2 border-ink p-2 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-2 pb-2 text-[10px] uppercase tracking-[0.15em] text-ink/60">
        <LegendItem label="Pace">
          <span className="inline-block w-4 h-0.5 bg-ink align-middle" />
        </LegendItem>
        {repsLabel && (
          <LegendItem label={repsLabel}>
            <span className="inline-block w-3 h-3 bg-ink/10 border border-ink/20 align-middle" />
          </LegendItem>
        )}
        {targetLabel && (
          <LegendItem label={targetLabel}>
            <span className="inline-block w-4 h-2 align-middle border border-dashed border-[#16a34a] bg-[#16a34a]/20" />
          </LegendItem>
        )}
        {hasHr && (
          <LegendItem label="FC">
            <span className="inline-block w-4 h-2 align-middle bg-[#dc2626]/25 border-b border-[#dc2626]/60" />
          </LegendItem>
        )}
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart
          data={data}
          margin={{ top: 16, right: 8, bottom: 8, left: 0 }}
          onMouseMove={(state: { activeLabel?: string | number }) => {
            const v = state?.activeLabel;
            if (v != null && v !== "") onHover(Number(v));
          }}
          onMouseLeave={() => onHover(null)}
        >
          <CartesianGrid stroke="currentColor" strokeOpacity={0.08} />
          {hasHr && (
            <Area
              yAxisId="hr"
              type="monotone"
              dataKey="hr"
              stroke="#dc2626"
              strokeOpacity={0.5}
              strokeWidth={1}
              fill="#dc2626"
              fillOpacity={0.14}
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
              fill="#16a34a"
              fillOpacity={0.14}
              stroke="#16a34a"
              strokeOpacity={0.5}
              strokeDasharray="4 4"
            />
          )}
          {reps.map((r, i) => (
            <ReferenceArea
              key={i}
              yAxisId="pace"
              x1={r.start_km}
              x2={r.end_km}
              fill="currentColor"
              fillOpacity={0.07}
              label={{
                value: r.index ? `${r.index}` : undefined,
                position: "insideTop",
                fontSize: 11,
                fill: "currentColor",
              }}
            />
          ))}
          <XAxis
            dataKey="km"
            type="number"
            domain={[0, "dataMax"]}
            tickFormatter={(v: number) => `${v.toFixed(0)}`}
            tick={{ fontSize: 11, fill: "currentColor" }}
            stroke="currentColor"
            strokeOpacity={0.3}
            unit=" km"
          />
          <YAxis
            yAxisId="pace"
            reversed
            domain={[lo, hi]}
            tickFormatter={(v: number) => paceFromSec(v)}
            tick={{ fontSize: 11, fill: "currentColor" }}
            stroke="currentColor"
            strokeOpacity={0.3}
            width={44}
          />
          {hasHr && (
            <YAxis
              yAxisId="hr"
              orientation="right"
              domain={[hrLo, hrHi]}
              tickFormatter={(v: number) => `${Math.round(v)}`}
              tick={{ fontSize: 11, fill: "#dc2626" }}
              stroke="#dc2626"
              strokeOpacity={0.3}
              width={32}
            />
          )}
          <Tooltip
            formatter={((value: number, name: string) =>
              name === "pace"
                ? [`${paceFromSec(value)}/km`, "pace"]
                : [`${Math.round(value)} bpm`, "fc"]) as never}
            labelFormatter={((v: number) => `${Number(v).toFixed(2)} km`) as never}
            contentStyle={{
              background: "var(--color-paper, #fff)",
              border: "2px solid currentColor",
              borderRadius: 0,
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
            }}
          />
          <Line
            yAxisId="pace"
            type="monotone"
            dataKey="pace"
            stroke="currentColor"
            strokeWidth={1.5}
            dot={false}
            connectNulls
            isAnimationActive={false}
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

function RepTable({
  analysis,
  series,
}: {
  analysis: WorkoutAnalysis;
  series: ChartSeries | null;
}) {
  const work = workSections(analysis.sections);
  if (work.length === 0) return null;
  const hasTarget = work.some((s) => s.vs_target_sec_per_km != null);

  return (
    <div className="border-2 border-ink overflow-x-auto">
      <table className="w-full text-sm font-mono">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.15em] text-ink/50 border-b-2 border-ink">
            <Th>#</Th>
            <Th>Início</Th>
            <Th>Trecho (km)</Th>
            <Th>Tempo</Th>
            <Th>Pace</Th>
            {hasTarget && <Th>vs alvo</Th>}
            <Th>FC méd</Th>
            <Th>FC máx</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/15">
          {work.map((s, i) => {
            const start = elapsedAtKm(series, s.start_km);
            return (
              <tr key={i} className="hover:bg-paper-2">
                <Td className="font-semibold">{s.index ?? i + 1}</Td>
                <Td>{start != null ? duration(start) : "—"}</Td>
                <Td>
                  {s.start_km != null && s.end_km != null
                    ? `${s.start_km.toFixed(2)} → ${s.end_km.toFixed(2)}`
                    : "—"}
                </Td>
                <Td>{duration(s.duration_sec)}</Td>
                <Td className="font-semibold">
                  {paceFromSec(s.avg_pace_sec_per_km)}/km
                </Td>
                {hasTarget && (
                  <Td
                    className={
                      s.vs_target_sec_per_km != null &&
                      s.vs_target_sec_per_km > 0
                        ? "text-red-700"
                        : "text-green-700"
                    }
                  >
                    {s.vs_target_sec_per_km != null
                      ? `${s.vs_target_sec_per_km > 0 ? "+" : ""}${s.vs_target_sec_per_km}s`
                      : "—"}
                  </Td>
                )}
                <Td>{s.avg_hr ? Math.round(s.avg_hr) : "—"}</Td>
                <Td>{s.max_hr ? Math.round(s.max_hr) : "—"}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const PATTERN_LABEL: Record<string, string> = {
  consistent: "consistente",
  positive_split: "positive split (desacelerando)",
  negative_split: "negative split (acelerando)",
  fade: "queda no fim",
  fast_start_stabilize: "saída rápida, estabilizou",
  irregular: "irregular",
};

function Coach({ analysis }: { analysis: WorkoutAnalysis }) {
  const an = analysis.analysis;
  if (!an) return null;
  return (
    <div className="border-2 border-ink p-5 flex flex-col gap-4 bg-paper-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] uppercase tracking-[0.2em] text-ink/60">
        {an.pattern && (
          <span>padrão: {PATTERN_LABEL[an.pattern] ?? an.pattern}</span>
        )}
        {an.target_hit != null && (
          <span>alvo: {an.target_hit ? "atingido" : "não atingido"}</span>
        )}
        {an.hr_drift_bpm != null && <span>drift fc: {an.hr_drift_bpm} bpm</span>}
      </div>

      {an.highlights && an.highlights.length > 0 && (
        <div>
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-green-700 mb-1.5 flex items-center gap-1.5">
            <SparkleIcon className="h-3.5 w-3.5" /> pontos fortes
          </h3>
          <ul className="text-sm list-disc pl-5 space-y-1">
            {an.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      )}

      {an.issues && an.issues.length > 0 && (
        <div>
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-red-700 mb-1.5 flex items-center gap-1.5">
            <WarningIcon className="h-3.5 w-3.5" /> problemas
          </h3>
          <ul className="text-sm list-disc pl-5 space-y-1">
            {an.issues.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      )}

      {an.next_workout_suggestion && (
        <div>
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-ink/60 mb-1.5">
            próximo treino
          </h3>
          <p className="text-sm">{an.next_workout_suggestion}</p>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-medium px-3 py-2.5">{children}</th>;
}
function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2.5 ${className}`}>{children}</td>;
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
          : "text-ink/60 font-mono text-sm border-2 border-dashed border-ink/20 p-5"
      }
    >
      {children}
    </p>
  );
}
