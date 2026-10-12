import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import { HEATMAP_PRECISION, type CitySummary } from "../lib/api.ts";
import { decodePolyline, type LatLng } from "../lib/polyline.ts";
import { useCities, useTracks } from "../lib/queries.ts";
import { km } from "../lib/format.ts";
import { basemapProps, useDarkMode, useThemeColors } from "../lib/theme.ts";
import { cn } from "cn";
import { Skeleton } from "./Skeleton.tsx";

// Each run is drawn as one faint line. Where runs overlap the strokes compound,
// so a street run twenty times reads almost solid while a one-off detour stays
// a ghost — that stacking IS the heat, which is why the map renders on canvas
// (`preferCanvas`): the SVG renderer both chokes on tens of thousands of
// vertices and would need a separate element per run. Volt glows on the dark
// basemap; on the light one the orange extra-series color reads as data rather
// than as another road.
const LINE_OPACITY = { dark: 0.22, light: 0.18 };
const LINE_WEIGHT = 2.5;

// The map fills what is left of the viewport under the shell: sticky header,
// the big page title, this page's heading row and, on mobile, the bottom tab
// bar — so it never sits under the bar.
const MAP_HEIGHT =
  "h-[calc(100svh-17.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] md:h-[calc(100svh-18.5rem)] min-h-80";

// Leaflet's zoom buttons, flattened into the theme.
const CONTROLS =
  "[&_.leaflet-bar]:overflow-hidden [&_.leaflet-bar]:rounded-xl! [&_.leaflet-bar]:border-0! [&_.leaflet-bar]:shadow-none! [&_.leaflet-bar_a]:border-border! [&_.leaflet-bar_a]:bg-background/90! [&_.leaflet-bar_a]:text-foreground! [&_.leaflet-bar_a]:backdrop-blur [&_.leaflet-bar_a:hover]:bg-accent!";

const PADDING: [number, number] = [24, 24];

type Bounds = [LatLng, LatLng]; // [SW, NE]

function boundsOf(tracks: LatLng[][]): Bounds | null {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const points of tracks) {
    for (const [lat, lng] of points) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }
  if (minLat === Infinity) return null;
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}

/**
 * Pans the map when a city is picked. A fresh object per click, so clicking the
 * same city again still re-runs the effect.
 */
function FlyTo({ focus }: { focus: { bounds: Bounds } | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyToBounds(focus.bounds, { padding: PADDING });
  }, [focus, map]);
  return null;
}

export default function Heatmap() {
  const { data, isPending, error } = useTracks();
  const [focus, setFocus] = useState<{ bounds: Bounds } | null>(null);
  const dark = useDarkMode();
  const colors = useThemeColors();

  const tracks = useMemo(
    () =>
      (data ?? [])
        .map((t) => decodePolyline(t.polyline, HEATMAP_PRECISION))
        .filter((points) => points.length >= 2),
    [data],
  );
  const bounds = useMemo(() => boundsOf(tracks), [tracks]);
  const totalMeters = useMemo(
    () => (data ?? []).reduce((sum, t) => sum + t.distance, 0),
    [data],
  );

  // One shared object, so re-renders (picking a city) don't restyle every run.
  const pathOptions = useMemo(
    () => ({
      color: dark ? colors.chart1 : colors.chart5,
      weight: LINE_WEIGHT,
      opacity: dark ? LINE_OPACITY.dark : LINE_OPACITY.light,
      interactive: false,
    }),
    [dark, colors],
  );

  if (isPending) return <HeatmapSkeleton />;
  if (error) {
    return (
      <p className="rounded-2xl bg-card px-5 py-4 text-sm text-destructive">
        {String(error)}
      </p>
    );
  }
  // No GPS anywhere — either nothing imported yet, or everything is treadmill.
  if (!bounds) {
    return (
      <p className="rounded-2xl bg-card px-5 py-4 text-sm text-muted-foreground">
        Nenhuma corrida com GPS ainda.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-10 md:gap-14">
      <div className="flex flex-col gap-3">
        <div className="flex min-h-8 items-center justify-between gap-3">
          <h2 className="font-display text-2xl md:text-3xl">Onde eu já passei</h2>
          {focus && (
            <button
              onClick={() => setFocus({ bounds })}
              className="h-8 shrink-0 rounded-full bg-secondary px-3.5 text-sm font-semibold transition-colors hover:bg-accent"
            >
              ver tudo
            </button>
          )}
        </div>
        <div
          className={cn(
            "relative isolate overflow-hidden rounded-2xl bg-card",
            CONTROLS,
          )}
        >
          <MapContainer
            bounds={bounds}
            boundsOptions={{ padding: PADDING }}
            preferCanvas
            attributionControl={false}
            className={MAP_HEIGHT}
            style={{ background: "var(--card)" }}
          >
            <TileLayer
              key={dark ? "dark" : "light"}
              {...basemapProps(dark)}
            />
            {tracks.map((points, i) => (
              <Polyline key={i} positions={points} pathOptions={pathOptions} />
            ))}
            <FlyTo focus={focus} />
          </MapContainer>
          <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-2xl bg-background/85 px-3.5 py-2.5 md:px-4 md:py-3 backdrop-blur-md md:bottom-4 md:left-4">
            <p className="flex items-baseline gap-1.5">
              <span className="font-display text-3xl md:text-5xl">
                {km(totalMeters)}
              </span>
              <span className="text-sm font-semibold text-muted-foreground">km</span>
            </p>
            <p className="mt-0.5 text-xs font-medium text-muted-foreground tabular-nums md:mt-1">
              {tracks.length} corridas
            </p>
          </div>
        </div>
      </div>

      <Cities onPick={(city) => setFocus({ bounds: city.bounds })} />
    </section>
  );
}

function Cities({ onPick }: { onPick: (city: CitySummary) => void }) {
  const { data, isPending, error } = useCities();

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-32" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }
  // The map is the point of this page; a failed city lookup shouldn't hide it.
  if (error || !data || data.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-2xl md:text-3xl">Cidades</h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((city) => (
          <li key={`${city.city}|${city.state ?? ""}`}>
            <button
              onClick={() => onPick(city)}
              className="flex h-full w-full items-end justify-between gap-4 rounded-2xl bg-card p-4 text-left transition-colors hover:bg-accent md:p-5"
            >
              <span className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-semibold">{city.city}</span>
                <span className="truncate text-xs font-medium text-muted-foreground tabular-nums">
                  {city.state && <>{city.state} · </>}
                  {city.runs} {city.runs === 1 ? "corrida" : "corridas"}
                </span>
              </span>
              <span className="flex shrink-0 items-baseline gap-1">
                <span className="font-display text-3xl md:text-4xl">
                  {km(city.distance)}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">km</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HeatmapSkeleton() {
  return (
    <section className="flex flex-col gap-3">
      <Skeleton className="h-8 w-56" />
      <Skeleton className={cn(MAP_HEIGHT, "w-full rounded-2xl")} />
    </section>
  );
}
