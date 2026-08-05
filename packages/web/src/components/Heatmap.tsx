import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import { HEATMAP_PRECISION, type CitySummary } from "../lib/api.ts";
import { decodePolyline, type LatLng } from "../lib/polyline.ts";
import { useCities, useTracks } from "../lib/queries.ts";
import { km } from "../lib/format.ts";
import { Skeleton } from "./Skeleton.tsx";

// Each run is drawn as one faint line. Where runs overlap the strokes compound,
// so a street run twenty times reads almost solid while a one-off detour stays
// a ghost — that stacking IS the heat, which is why the map renders on canvas
// (`preferCanvas`): the SVG renderer both chokes on tens of thousands of
// vertices and would need a separate element per run.
const LINE_COLOR = "#ea580c";
const LINE_OPACITY = 0.15;
const LINE_WEIGHT = 2.5;

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

  if (isPending) return <HeatmapSkeleton />;
  if (error) {
    return (
      <p className="border border-line rounded-lg bg-card px-5 py-4 font-mono text-sm text-red-700">
        {String(error)}
      </p>
    );
  }
  // No GPS anywhere — either nothing imported yet, or everything is treadmill.
  if (!bounds) {
    return (
      <p className="border border-line rounded-lg bg-card px-5 py-4 font-mono text-sm text-ink/60">
        Nenhuma corrida com GPS ainda.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs uppercase tracking-[0.2em] text-ink/60">
            Onde eu já passei
          </h2>
          <div className="flex items-center gap-3">
            <p className="font-mono text-xs text-ink/60">
              {tracks.length} corridas · {km(totalMeters)} km
            </p>
            {focus && (
              <button
                onClick={() => setFocus({ bounds })}
                className="text-[10px] uppercase tracking-[0.2em] font-medium text-ink/60 hover:text-ink"
              >
                ver tudo
              </button>
            )}
          </div>
        </div>
        <div className="border border-line rounded-lg overflow-hidden bg-card shadow-sm">
          <MapContainer
            bounds={bounds}
            boundsOptions={{ padding: PADDING }}
            preferCanvas
            attributionControl={false}
            className="h-[65vh] min-h-96"
            style={{ background: "var(--color-paper-2)" }}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              attribution="&copy; OpenStreetMap &copy; CARTO"
            />
            {tracks.map((points, i) => (
              <Polyline
                key={i}
                positions={points}
                pathOptions={{
                  color: LINE_COLOR,
                  weight: LINE_WEIGHT,
                  opacity: LINE_OPACITY,
                  interactive: false,
                }}
              />
            ))}
            <FlyTo focus={focus} />
          </MapContainer>
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
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  // The map is the point of this page; a failed city lookup shouldn't hide it.
  if (error || !data || data.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs uppercase tracking-[0.2em] text-ink/60">
        Cidades
      </h2>
      <ul className="border border-line rounded-lg divide-y divide-line bg-card overflow-hidden">
        {data.map((city) => (
          <li key={`${city.city}|${city.state ?? ""}`}>
            <button
              onClick={() => onPick(city)}
              className="w-full px-5 py-3 flex items-baseline justify-between gap-4 text-left hover:bg-paper-2"
            >
              <span className="min-w-0">
                <span className="truncate">{city.city}</span>
                {city.state && (
                  <span className="text-ink/50 text-sm"> · {city.state}</span>
                )}
              </span>
              <span className="font-mono text-xs text-ink/60 shrink-0 tabular-nums">
                {city.runs} {city.runs === 1 ? "corrida" : "corridas"} ·{" "}
                {km(city.distance)} km
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
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-28" />
      </div>
      <Skeleton className="h-[65vh] min-h-96 w-full" />
    </section>
  );
}
