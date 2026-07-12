import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  ArrowClockwiseIcon,
  ArrowUUpLeftIcon,
  FloppyDiskIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useCreateCourse } from "../lib/queries.ts";
import { km } from "../lib/format.ts";
import type { LatLng } from "../lib/polyline.ts";

// FOSSGIS-hosted OSRM with a real pedestrian profile (`routed-foot`). Unlike
// the project-osrm.org demo (car-only — it respects one-way streets even on a
// /foot/ URL), this ignores driving direction, which is what we want for a
// running route. Free, no key, best-effort; swapping providers is a change to
// this one constant.
const OSRM = "https://routing.openstreetmap.de/routed-foot/route/v1/foot";

type Snapped = { points: LatLng[]; distanceMeter: number };

async function snapRoute(waypoints: LatLng[]): Promise<Snapped> {
  if (waypoints.length < 2) return { points: waypoints, distanceMeter: 0 };
  const coords = waypoints.map(([lat, lon]) => `${lon},${lat}`).join(";");
  const res = await fetch(
    `${OSRM}/${coords}?overview=full&geometries=geojson&continue_straight=false`,
  );
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const json = (await res.json()) as {
    routes?: { geometry: { coordinates: [number, number][] }; distance: number }[];
  };
  const route = json.routes?.[0];
  if (!route) throw new Error("sem rota entre os pontos");
  return {
    points: route.geometry.coordinates.map(([lon, lat]) => [lat, lon] as LatLng),
    distanceMeter: route.distance,
  };
}

/** Cap the point count sent to Garmin without losing route shape. */
function decimate(points: LatLng[], max = 3000): LatLng[] {
  if (points.length <= max) return points;
  const stride = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % stride === 0);
  if (out[out.length - 1] !== points[points.length - 1]) {
    out.push(points[points.length - 1]!);
  }
  return out;
}

function ClickCapture({ onAdd }: { onAdd: (ll: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onAdd([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

/** Pan/zoom to fit the drawn route the first time it appears. */
function FitToRoute({ points }: { points: LatLng[] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (points.length < 2 || fitted.current) return;
    map.fitBounds(points as [number, number][], { padding: [24, 24] });
    fitted.current = true;
  }, [points, map]);
  return null;
}

const DEFAULT_CENTER: LatLng = [-23.5505, -46.6333]; // São Paulo

export default function RouteBuilder() {
  const [waypoints, setWaypoints] = useState<LatLng[]>([]);
  const [snapped, setSnapped] = useState<Snapped>({ points: [], distanceMeter: 0 });
  const [outBack, setOutBack] = useState(false);
  const [name, setName] = useState("");
  const [routeError, setRouteError] = useState<string | null>(null);
  const create = useCreateCourse();

  // Waypoints run through OSRM; out-and-back mirrors them back to the start.
  const effectiveWaypoints = useMemo<LatLng[]>(() => {
    if (!outBack || waypoints.length < 2) return waypoints;
    return [...waypoints, ...waypoints.slice(0, -1).reverse()];
  }, [waypoints, outBack]);

  useEffect(() => {
    let cancelled = false;
    if (effectiveWaypoints.length < 2) {
      setSnapped({ points: effectiveWaypoints, distanceMeter: 0 });
      setRouteError(null);
      return;
    }
    snapRoute(effectiveWaypoints)
      .then((s) => {
        if (!cancelled) {
          setSnapped(s);
          setRouteError(null);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setRouteError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveWaypoints]);

  const canSave = name.trim().length > 0 && snapped.points.length >= 2;

  function save() {
    if (!canSave) return;
    const points = decimate(snapped.points).map(([lat, lon]) => ({ lat, lon }));
    create.mutate({ name: name.trim(), points });
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-[0.2em] text-ink/60">
          Criar percurso
        </h2>
        <span className="font-mono text-xs text-ink/70">
          {km(snapped.distanceMeter)} km · {waypoints.length} ponto(s)
        </span>
      </div>

      <p className="text-xs text-ink/50 mb-2">
        Clique no mapa para marcar pontos — a rota segue as ruas. O último ponto
        pode fechar o trajeto ou use ida-e-volta.
      </p>

      <div className="border border-line rounded-lg overflow-hidden bg-card shadow-sm mb-3">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={14}
          scrollWheelZoom
          style={{ height: 420, width: "100%", background: "var(--color-paper-2, #eee)" }}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            attribution="&copy; OpenStreetMap &copy; CARTO"
          />
          <ClickCapture onAdd={(ll) => setWaypoints((w) => [...w, ll])} />
          <FitToRoute points={snapped.points} />
          {snapped.points.length >= 2 && (
            <Polyline
              positions={snapped.points}
              pathOptions={{ color: "#f97316", weight: 5, opacity: 0.9 }}
            />
          )}
          {waypoints.map((w, i) => (
            <CircleMarker
              key={i}
              center={w}
              radius={i === 0 ? 7 : 5}
              pathOptions={{
                color: "#fff",
                weight: 2,
                fillColor: i === 0 ? "#16a34a" : "#3b3833",
                fillOpacity: 1,
              }}
            />
          ))}
        </MapContainer>
      </div>

      {routeError && (
        <p className="text-xs text-red-700 mb-3">
          Falha ao traçar rota ({routeError}). Tente outro ponto.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setWaypoints((w) => w.slice(0, -1))}
          disabled={waypoints.length === 0}
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-medium border border-line rounded-lg px-3 py-1.5 hover:bg-accent hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink"
        >
          <ArrowUUpLeftIcon className="h-3.5 w-3.5" /> desfazer
        </button>
        <button
          onClick={() => setWaypoints([])}
          disabled={waypoints.length === 0}
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-medium border border-line rounded-lg px-3 py-1.5 hover:bg-accent hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink"
        >
          <TrashIcon className="h-3.5 w-3.5" /> limpar
        </button>
        <button
          onClick={() => setOutBack((v) => !v)}
          className={
            "flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-medium border rounded-lg px-3 py-1.5 " +
            (outBack
              ? "bg-accent text-white border-accent"
              : "border-line hover:bg-accent hover:text-white")
          }
        >
          <ArrowClockwiseIcon className="h-3.5 w-3.5" /> ida-e-volta
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do percurso"
          className="flex-1 min-w-[180px] border border-line rounded-lg px-3 py-2 text-sm bg-paper focus:outline-none focus:border-accent"
        />
        <button
          onClick={save}
          disabled={!canSave || create.isPending}
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-medium border border-line rounded-lg px-4 py-2 hover:bg-accent hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink"
        >
          <FloppyDiskIcon className="h-3.5 w-3.5" />
          {create.isPending ? "enviando…" : "enviar ao Garmin"}
        </button>
      </div>

      {create.isSuccess && create.data && (
        <p className="text-xs text-ink/70 mt-3">
          Percurso criado no Garmin.{" "}
          <a
            href={create.data.url}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-accent"
          >
            Abrir no Garmin Connect
          </a>
        </p>
      )}
      {create.isError && (
        <p className="text-xs text-red-700 mt-3">
          {(create.error as Error).message}
        </p>
      )}
    </section>
  );
}
