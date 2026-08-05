import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { HeartbeatIcon, TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useActivities } from "../lib/queries.ts";
import { fitnessTrend, type TrendPoint } from "../lib/fitness.ts";
import { paceFromSec } from "../lib/format.ts";
import { Skeleton } from "./Skeleton.tsx";

// One series, so one hue and no legend — the heading says what is plotted. This
// is the same orange the heatmap uses; the warm graphite that the rest of the UI
// wears failed the chroma floor for a data mark (it reads as ink, not data).
const LINE_COLOR = "#ea580c";

type Range = 12 | 24 | 0; // 0 = everything
const RANGES: Range[] = [12, 24, 0];
const RANGE_LABELS: Record<Range, string> = {
  12: "12 meses",
  24: "24 meses",
  0: "tudo",
};

export default function Trend() {
  const [range, setRange] = useState<Range>(24);
  const { data, isPending, error } = useActivities({ limit: 1000 });

  const trend = useMemo(
    () =>
      data ? fitnessTrend(data, { monthsBack: range || undefined }) : null,
    [data, range],
  );

  if (isPending) return <TrendSkeleton />;
  if (error) {
    return (
      <p className="border border-line rounded-lg bg-card px-5 py-4 font-mono text-sm text-red-700">
        {String(error)}
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-[0.2em] text-ink/60">
          Ritmo a batimento fixo
        </h2>
        <ToggleGroup
          value={[String(range)]}
          onValueChange={(v) => {
            const next = v[0];
            if (next != null) setRange(Number(next) as Range);
          }}
          className="flex gap-0.5 text-[10px] uppercase tracking-[0.2em] font-medium"
        >
          {RANGES.map((r) => (
            <Toggle
              key={r}
              value={String(r)}
              aria-label={RANGE_LABELS[r]}
              className="px-2 py-1 rounded-md text-ink/60 hover:text-ink data-[pressed]:bg-accent data-[pressed]:text-white"
            >
              {RANGE_LABELS[r]}
            </Toggle>
          ))}
        </ToggleGroup>
      </div>

      {!trend ? (
        <p className="border border-line rounded-lg bg-card px-5 py-4 font-mono text-sm text-ink/60">
          Não há corridas com frequência cardíaca suficientes nesse período.
        </p>
      ) : (
        <>
          <Headline trend={trend} />
          <Chart points={trend.points} />
          <p className="text-xs text-ink/50 leading-relaxed">
            Cada ponto é a mediana do mês do ritmo que você sustentaria a{" "}
            {trend.refHr} bpm — velocidade dividida pelo batimento, que remove a
            decisão de quão forte correr. Ficar mais rápido no mesmo batimento é
            o que significa estar mais em forma. Não corrige altimetria nem
            calor, então leia como tendência, não como medida. Meses com menos de
            3 corridas na faixa ficam de fora, e a linha corta onde você parou de
            correr.
          </p>
          <MonthTable points={trend.points} />
        </>
      )}
    </section>
  );
}

function Headline({
  trend,
}: {
  trend: NonNullable<ReturnType<typeof fitnessTrend>>;
}) {
  const withData = trend.points.filter((p) => p.paceSecPerKm != null);
  const delta = trend.deltaSecPerKm;
  const faster = delta != null && delta > 0;
  const Icon = faster ? TrendUpIcon : TrendDownIcon;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-line border border-line rounded-lg overflow-hidden">
      <div className="bg-card px-5 py-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-ink/50 mb-1">
          Ritmo atual
        </p>
        <p className="text-2xl font-mono tabular-nums">
          {paceFromSec(withData[withData.length - 1]?.paceSecPerKm)}
          <span className="text-sm text-ink/50">/km</span>
        </p>
      </div>
      <div className="bg-card px-5 py-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-ink/50 mb-1">
          No período
        </p>
        {delta == null ? (
          <p className="text-2xl font-mono text-ink/40">--</p>
        ) : (
          // Icon plus the words "mais rápido"/"mais lento" carry the direction;
          // the colour only reinforces it.
          <p
            className={
              "text-2xl font-mono tabular-nums flex items-baseline gap-2 " +
              (faster ? "text-green-700" : "text-red-700")
            }
          >
            <Icon className="h-5 w-5 shrink-0 self-center" />
            {Math.abs(Math.round(delta))}s
            <span className="text-sm">
              /km {faster ? "mais rápido" : "mais lento"}
            </span>
          </p>
        )}
      </div>
      <div className="bg-card px-5 py-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-ink/50 mb-1 flex items-center gap-1">
          <HeartbeatIcon className="h-3 w-3" />
          Referência
        </p>
        <p className="text-2xl font-mono tabular-nums">
          {trend.refHr}
          <span className="text-sm text-ink/50"> bpm</span>
        </p>
        <p className="text-[10px] text-ink/40 mt-1">
          {trend.sampled} corridas na faixa
        </p>
      </div>
    </div>
  );
}

function Chart({ points }: { points: TrendPoint[] }) {
  return (
    <div className="border border-line rounded-lg bg-card p-3">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.08} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            strokeOpacity={0.3}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            // Reversed so a faster pace sits higher: improving reads as "up".
            reversed
            domain={["dataMin - 10", "dataMax + 10"]}
            tickFormatter={(v: number) => paceFromSec(v)}
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            strokeOpacity={0.3}
            width={48}
          />
          <Tooltip content={<PaceTooltip />} />
          <Line
            type="monotone"
            dataKey="paceSecPerKm"
            stroke={LINE_COLOR}
            strokeWidth={2}
            // A month without enough running breaks the line instead of being
            // interpolated across.
            connectNulls={false}
            dot={{ r: 4, fill: LINE_COLOR, stroke: "var(--color-card)", strokeWidth: 2 }}
            activeDot={{ r: 6, fill: LINE_COLOR, stroke: "var(--color-card)", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PaceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: TrendPoint }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point || point.paceSecPerKm == null) return null;
  return (
    <div className="bg-card border border-line rounded-lg px-3 py-2 shadow-sm">
      {/* Value leads, label follows — the reader already knows the month. */}
      <p className="font-mono text-sm tabular-nums flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block w-3 h-0.5 shrink-0"
          style={{ background: LINE_COLOR }}
        />
        {paceFromSec(point.paceSecPerKm)}/km
      </p>
      <p className="text-xs text-ink/60 mt-0.5">
        {point.label} · {point.runs} corridas
      </p>
    </div>
  );
}

// Keeps every plotted value reachable without hovering.
function MonthTable({ points }: { points: TrendPoint[] }) {
  const rows = points.filter((p) => p.paceSecPerKm != null).reverse();
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs uppercase tracking-[0.2em] text-ink/60">
        Por mês
      </h3>
      <ul className="border border-line rounded-lg divide-y divide-line bg-card overflow-hidden">
        {rows.map((p) => (
          <li
            key={p.month}
            className="px-5 py-2.5 flex items-baseline justify-between gap-4"
          >
            <span className="text-sm">{p.label}</span>
            <span className="font-mono text-xs text-ink/60 tabular-nums">
              {paceFromSec(p.paceSecPerKm)}/km · {p.runs} corridas
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrendSkeleton() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-line border border-line rounded-lg overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card px-5 py-4">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-[300px] w-full" />
    </section>
  );
}
