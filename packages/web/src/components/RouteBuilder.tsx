import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  ArrowUUpLeftIcon,
  CrosshairIcon,
  FloppyDiskIcon,
  PaperPlaneRightIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type { Map as LeafletMap } from "leaflet";
import {
  useCreateCourse,
  useDeleteRoute,
  usePushRouteToGarmin,
  useSavedRoutes,
  useSaveRoute,
} from "../lib/queries.ts";
import { km } from "../lib/format.ts";
import type { LatLng } from "../lib/polyline.ts";

// FOSSGIS-hosted OSRM, bicycle profile. Sticks to real roads (unlike the foot
// profile, which zig-zags onto footpaths/trails), but relaxes one-way
// restrictions the way the car profile won't — the sweet spot for laying out a
// running route. Free, no key, best-effort; swapping providers is a change to
// this one constant.
const OSRM = "https://routing.openstreetmap.de/routed-bike/route/v1/bike";

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

// Draggable waypoint dot (start is green). Midpoint handles are smaller and
// translucent — drag one to insert a new waypoint on that segment.
const dotIcon = (fill: string, size: number, opacity = 1) =>
  L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${fill};opacity:${opacity};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35);cursor:grab"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
const startIcon = dotIcon("#16a34a", 16);
const wpIcon = dotIcon("#3b3833", 14);
const midIcon = dotIcon("#f97316", 12, 0.55);

export default function RouteBuilder() {
  const [waypoints, setWaypoints] = useState<LatLng[]>([]);
  const [snapped, setSnapped] = useState<Snapped>({ points: [], distanceMeter: 0 });
  const [outBack, setOutBack] = useState(false);
  const [name, setName] = useState("");
  const [routeError, setRouteError] = useState<string | null>(null);
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const create = useCreateCourse();
  const saveM = useSaveRoute();
  const savedRoutes = useSavedRoutes();
  const pushM = usePushRouteToGarmin();
  const deleteM = useDeleteRoute();

  function locate() {
    if (!("geolocation" in navigator)) {
      setGeoError("Geolocalização não suportada neste navegador.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ll: LatLng = [pos.coords.latitude, pos.coords.longitude];
        setWaypoints((w) => [...w, ll]);
        map?.setView(ll, 16);
        setLocating(false);
      },
      (err) => {
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Permissão de localização negada."
            : "Não foi possível obter a localização.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const moveWaypoint = (i: number, lat: number, lon: number) =>
    setWaypoints((w) => w.map((p, idx) => (idx === i ? [lat, lon] : p)));
  const insertWaypoint = (at: number, lat: number, lon: number) =>
    setWaypoints((w) => [...w.slice(0, at), [lat, lon], ...w.slice(at)]);
  const removeWaypoint = (i: number) =>
    setWaypoints((w) => w.filter((_, idx) => idx !== i));

  // Straight-line midpoint of each consecutive waypoint pair — dragging its
  // handle inserts a new waypoint between the two (which then re-snaps).
  const midpoints = useMemo(
    () =>
      waypoints.slice(0, -1).map((a, i) => {
        const b = waypoints[i + 1]!;
        return {
          at: i + 1,
          pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as LatLng,
        };
      }),
    [waypoints],
  );

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

  function currentPoints() {
    return decimate(snapped.points).map(([lat, lon]) => ({ lat, lon }));
  }

  // Push straight to Garmin (does not persist in the app).
  function sendToGarmin() {
    if (!canSave) return;
    create.mutate({ name: name.trim(), points: currentPoints() });
  }

  // Save in the app only; push later from the saved list.
  function saveLocal() {
    if (!canSave) return;
    saveM.mutate(
      {
        name: name.trim(),
        points: currentPoints(),
        distance: snapped.distanceMeter,
      },
      { onSuccess: () => setName("") },
    );
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
        Clique no mapa para marcar pontos — a rota segue as ruas. Arraste um
        ponto para movê-lo, arraste a alça laranja no meio de um trecho para
        inserir um ponto ali, e dê duplo-clique num ponto para removê-lo.
      </p>

      {/* Full-bleed: break out of the page's max-w container to span the
          viewport width. Controls below stay within the normal column. */}
      <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen border-y border-line overflow-hidden bg-card mb-3">
        <MapContainer
          ref={setMap}
          center={DEFAULT_CENTER}
          zoom={14}
          doubleClickZoom={false}
          scrollWheelZoom
          style={{ height: 520, width: "100%", background: "var(--color-paper-2, #eee)" }}
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
          {/* Midpoint handles: drag to insert a waypoint on that segment. */}
          {midpoints.map((m) => (
            <Marker
              key={`mid-${m.at}`}
              position={m.pos}
              draggable
              icon={midIcon}
              eventHandlers={{
                dragend: (e) => {
                  const ll = e.target.getLatLng();
                  insertWaypoint(m.at, ll.lat, ll.lng);
                },
              }}
            />
          ))}
          {/* Waypoints: drag to move, double-click to remove. */}
          {waypoints.map((w, i) => (
            <Marker
              key={`wp-${i}`}
              position={w}
              draggable
              icon={i === 0 ? startIcon : wpIcon}
              eventHandlers={{
                dragend: (e) => {
                  const ll = e.target.getLatLng();
                  moveWaypoint(i, ll.lat, ll.lng);
                },
                dblclick: () => removeWaypoint(i),
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
      {geoError && <p className="text-xs text-red-700 mb-3">{geoError}</p>}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={locate}
          disabled={locating}
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-medium border border-line rounded-lg px-3 py-1.5 hover:bg-accent hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink"
        >
          <CrosshairIcon
            className={"h-3.5 w-3.5 " + (locating ? "animate-pulse" : "")}
          />
          {locating ? "localizando…" : "minha posição"}
        </button>
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
          onClick={saveLocal}
          disabled={!canSave || saveM.isPending}
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-medium border border-line rounded-lg px-4 py-2 hover:bg-accent hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink"
        >
          <FloppyDiskIcon className="h-3.5 w-3.5" />
          {saveM.isPending ? "salvando…" : "salvar"}
        </button>
        <button
          onClick={sendToGarmin}
          disabled={!canSave || create.isPending}
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-medium border border-line rounded-lg px-4 py-2 hover:bg-accent hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink"
        >
          <PaperPlaneRightIcon className="h-3.5 w-3.5" />
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
      {saveM.isError && (
        <p className="text-xs text-red-700 mt-3">
          {(saveM.error as Error).message}
        </p>
      )}

      {(savedRoutes.data?.length ?? 0) > 0 && (
        <div className="mt-10">
          <h2 className="text-xs uppercase tracking-[0.2em] text-ink/60 mb-3">
            Percursos salvos
          </h2>
          <ul className="border border-line rounded-lg divide-y divide-line overflow-hidden">
            {savedRoutes.data!.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 bg-card"
              >
                <div className="min-w-0">
                  <p className="text-sm truncate">{r.name}</p>
                  <p className="font-mono text-[11px] text-ink/50">
                    {km(r.distance)} km
                    {r.garminCourseId ? " · no Garmin" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {r.garminCourseId ? (
                    <a
                      href={`https://connect.garmin.com/modern/course/${r.garminCourseId}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir no Garmin Connect"
                      className="p-1.5 rounded-md border border-line hover:bg-accent hover:text-white"
                    >
                      <ArrowSquareOutIcon className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <button
                      onClick={() => pushM.mutate(r.id)}
                      disabled={pushM.isPending}
                      title="Enviar ao Garmin"
                      className="p-1.5 rounded-md border border-line hover:bg-accent hover:text-white disabled:opacity-40"
                    >
                      <PaperPlaneRightIcon
                        className={
                          "h-3.5 w-3.5 " +
                          (pushM.isPending && pushM.variables === r.id
                            ? "animate-pulse"
                            : "")
                        }
                      />
                    </button>
                  )}
                  <button
                    onClick={() => deleteM.mutate(r.id)}
                    disabled={deleteM.isPending}
                    title="Apagar"
                    className="p-1.5 rounded-md border border-line hover:bg-red-600 hover:text-white hover:border-red-600 disabled:opacity-40"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {pushM.isError && (
            <p className="text-xs text-red-700 mt-2">
              {(pushM.error as Error).message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
