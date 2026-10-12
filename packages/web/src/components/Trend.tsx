import { HeartbeatIcon, TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import { cn } from "cn";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useActivities, useRecords } from "../lib/queries.ts";
import { fitnessTrend, type TrendPoint } from "@run/core/fitness";
import { paceFromSec } from "../lib/format.ts";
import { useThemeColors } from "../lib/theme.ts";
import { Skeleton } from "./Skeleton.tsx";
import type { AllTimeRecord } from "../lib/api.ts";

type Range = 12 | 24 | 0; // 0 = everything
const RANGES: Range[] = [12, 24, 0];
const RANGE_LABELS: Record<Range, string> = {
  12: "12 meses",
  24: "24 meses",
  0: "tudo",
};

const SECTION_TITLE = "font-display text-2xl md:text-3xl";

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
      <p className="rounded-2xl bg-card px-5 py-4 text-sm text-destructive">
        {String(error)}
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-10 md:gap-14">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={SECTION_TITLE}>Ritmo a batimento fixo</h2>
          <ToggleGroup
            value={[String(range)]}
            onValueChange={(v) => {
              const next = v[0];
              if (next != null) setRange(Number(next) as Range);
            }}
          >
            {RANGES.map((r) => (
              <ToggleGroupItem
                key={r}
                value={String(r)}
                aria-label={RANGE_LABELS[r]}
                className="px-3.5"
              >
                {RANGE_LABELS[r]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {!trend ? (
          <p className="rounded-2xl bg-card px-5 py-4 text-sm text-muted-foreground">
            Não há corridas com frequência cardíaca suficientes nesse período.
          </p>
        ) : (
          <>
            <Headline trend={trend} />
            <Chart points={trend.points} />
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              Cada ponto é a mediana do mês do ritmo que você sustentaria a{" "}
              {trend.refHr} bpm — velocidade dividida pelo batimento, que remove
              a decisão de quão forte correr. Ficar mais rápido no mesmo
              batimento é o que significa estar mais em forma. Não corrige
              altimetria nem calor, então leia como tendência, não como medida.
              Meses com menos de 3 corridas na faixa ficam de fora, e a linha
              corta onde você parou de correr.
            </p>
          </>
        )}
      </div>

      {trend && <MonthTable points={trend.points} />}

      <Records />
    </section>
  );
}

function Records() {
  const { data, isPending, error } = useRecords();

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-40" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }
  if (error || !data || data.length === 0) return null;

  const anyApprox = data.some((r) => r.src === "splits");

  return (
    <div className="flex flex-col gap-4">
      <h3 className={SECTION_TITLE}>Recordes</h3>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {data.map((r) => (
          <li key={r.meters}>
            <Link
              to={`/corridas/${r.source}/${encodeURIComponent(r.externalId)}`}
              viewTransition
              className="flex h-full flex-col gap-3 rounded-2xl bg-card p-4 transition-colors hover:bg-accent md:p-5"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-muted-foreground">
                  {r.label}
                </span>
                {r.src === "splits" && (
                  <span
                    title="Calculado a partir dos splits por km — nunca mais rápido que o real, às vezes alguns segundos mais lento"
                    className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground"
                  >
                    aprox
                  </span>
                )}
              </span>
              <span className="font-display text-4xl md:text-5xl">
                {formatRecord(r)}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {paceFromSec(r.paceSecPerKm)}
                </span>
                /km
                {" · "}
                {r.startDate.slice(0, 7).split("-").reverse().join("/")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
        Melhor janela de cada distância em todo o histórico, clicável pra abrir a
        corrida.
        {anyApprox && (
          <>
            {" "}
            As marcadas{" "}
            <span className="text-xs font-semibold uppercase">aprox</span> vêm
            dos splits por km, porque a corrida foi importada sem as amostras e a
            janela só pode começar num quilômetro fechado — o tempo real é igual
            ou alguns segundos melhor.
          </>
        )}
      </p>
    </div>
  );
}

/**
 * A record needs its seconds at every length, so this can't use `duration` —
 * that renders an hour-plus time as "1h52", and a half-marathon PR losing its
 * seconds is exactly the wrong place to round.
 */
function formatRecord(r: AllTimeRecord): string {
  const s = r.timeSec;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}:${pad(s % 60)}`;
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

function StatTile({
  label,
  className,
  children,
}: {
  label: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl bg-card p-4 md:p-5", className)}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
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
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <StatTile label="Ritmo atual" className="col-span-2 sm:col-span-1">
        <p className="flex items-baseline gap-1.5">
          <span className="font-display text-6xl md:text-7xl">
            {paceFromSec(withData[withData.length - 1]?.paceSecPerKm)}
          </span>
          <span className="text-sm font-semibold text-muted-foreground">/km</span>
        </p>
      </StatTile>
      <StatTile label="No período">
        {delta == null ? (
          <p className="font-display text-5xl text-muted-foreground md:text-7xl">
            --
          </p>
        ) : (
          // Icon plus the words "mais rápido"/"mais lento" carry the direction;
          // the colour only reinforces it.
          <div className={faster ? "text-success" : "text-destructive"}>
            <p className="flex items-baseline gap-1.5">
              <Icon weight="bold" className="size-6 shrink-0 self-center md:size-7" />
              <span className="font-display text-5xl md:text-7xl">
                {Math.abs(Math.round(delta))}
              </span>
              <span className="text-sm font-semibold">s/km</span>
            </p>
            <p className="mt-1 text-sm font-semibold">
              {faster ? "mais rápido" : "mais lento"}
            </p>
          </div>
        )}
      </StatTile>
      <StatTile
        label={
          <>
            <HeartbeatIcon weight="bold" className="size-3.5" />
            Referência
          </>
        }
      >
        <div>
          <p className="flex items-baseline gap-1.5">
            <span className="font-display text-5xl md:text-7xl">
              {trend.refHr}
            </span>
            <span className="text-sm font-semibold text-muted-foreground">
              bpm
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {trend.sampled} corridas na faixa
          </p>
        </div>
      </StatTile>
    </div>
  );
}

function Chart({ points }: { points: TrendPoint[] }) {
  const colors = useThemeColors();
  let lastIndex = -1;
  points.forEach((p, i) => {
    if (p.paceSecPerKm != null) lastIndex = i;
  });
  const ticks = paceTicks(points);

  return (
    <div className="rounded-2xl bg-card px-2 pt-6 pb-3 md:px-4 md:pt-8">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 4 }}>
          <CartesianGrid
            vertical={false}
            stroke={colors.foreground}
            strokeOpacity={0.07}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: colors.mutedForeground }}
            axisLine={false}
            tickLine={false}
            tickMargin={10}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            // Reversed so a faster pace sits higher: improving reads as "up".
            reversed
            domain={["dataMin - 10", "dataMax + 10"]}
            ticks={ticks}
            tickFormatter={(v: number) => paceFromSec(v)}
            tick={{ fontSize: 12, fill: colors.mutedForeground }}
            axisLine={false}
            tickLine={false}
            tickMargin={6}
            width={44}
          />
          <Tooltip
            content={<PaceTooltip color={colors.chart1} />}
            cursor={{ stroke: colors.mutedForeground, strokeOpacity: 0.4, strokeDasharray: "3 3" }}
          />
          <Line
            type="monotone"
            dataKey="paceSecPerKm"
            stroke={colors.chart1}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            // A month without enough running breaks the line instead of being
            // interpolated across.
            connectNulls={false}
            // No dots along the line, except the latest month (emphasised) and
            // any month isolated between gaps, which would otherwise vanish.
            dot={({ cx, cy, index }) => {
              const isLast = index === lastIndex;
              const isolated =
                points[index]?.paceSecPerKm != null &&
                points[index - 1]?.paceSecPerKm == null &&
                points[index + 1]?.paceSecPerKm == null;
              if (cx == null || cy == null || (!isLast && !isolated)) {
                return <g key={index} />;
              }
              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={isLast ? 6 : 3.5}
                  fill={colors.chart1}
                  stroke={colors.card}
                  strokeWidth={isLast ? 3 : 0}
                />
              );
            }}
            activeDot={{ r: 6, fill: colors.chart1, stroke: colors.card, strokeWidth: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Round pace ticks (every 15 or 30 s) inside the same ±10 s domain, so the axis
 * reads 5:30, 6:00… instead of landing on the domain's odd edges.
 */
function paceTicks(points: TrendPoint[]): number[] | undefined {
  const paces = points.flatMap((p) => (p.paceSecPerKm == null ? [] : [p.paceSecPerKm]));
  if (paces.length === 0) return undefined;
  const lo = Math.min(...paces) - 10;
  const hi = Math.max(...paces) + 10;
  const step = hi - lo > 120 ? 30 : 15;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  return ticks.length >= 2 ? ticks : undefined;
}

function PaceTooltip({
  active,
  payload,
  color,
}: {
  active?: boolean;
  payload?: { payload: TrendPoint }[];
  color: string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point || point.paceSecPerKm == null) return null;
  return (
    <div className="rounded-xl bg-popover px-3 py-2 text-popover-foreground shadow-lg ring-1 ring-foreground/5">
      {/* Value leads, label follows — the reader already knows the month. */}
      <p className="flex items-center gap-2 text-sm font-semibold tabular-nums">
        <span
          aria-hidden
          className="inline-block size-2 shrink-0 rounded-full"
          style={{ background: color }}
        />
        {paceFromSec(point.paceSecPerKm)}/km
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {point.label} · {point.runs} corridas
      </p>
    </div>
  );
}

// Keeps every plotted value reachable without hovering.
function MonthTable({ points }: { points: TrendPoint[] }) {
  const rows = points.filter((p) => p.paceSecPerKm != null).reverse();
  return (
    <div className="flex flex-col gap-4">
      <h3 className={SECTION_TITLE}>Por mês</h3>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card px-4 md:px-5 dark:divide-foreground/10">
        {rows.map((p) => (
          <li
            key={p.month}
            className="flex items-baseline justify-between gap-4 py-3.5"
          >
            <span className="text-sm font-medium">{p.label}</span>
            <span className="flex items-baseline gap-3 text-sm tabular-nums">
              <span className="text-muted-foreground">{p.runs} corridas</span>
              <span className="w-16 text-right font-semibold">
                {paceFromSec(p.paceSecPerKm)}
                <span className="font-normal text-muted-foreground">/km</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrendSkeleton() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-10 w-60 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "rounded-2xl bg-card p-4 md:p-5",
              i === 0 && "col-span-2 sm:col-span-1",
            )}
          >
            <Skeleton className="mb-3 h-3 w-20" />
            <Skeleton className="h-12 w-28" />
          </div>
        ))}
      </div>
      <Skeleton className="h-[340px] w-full rounded-2xl" />
    </section>
  );
}
