import polyline from "@mapbox/polyline";
import { listActivities } from "./activity.ts";
import { cellKey, resolvePlaces } from "./geo.ts";

/**
 * The heatmap draws every run the user ever recorded at once, so the payload —
 * not the per-run fidelity — is the constraint. Stored polylines are full
 * sample resolution (one point per GPS sample, precision 5), which is several
 * megabytes across a few hundred runs. Thinning to a few hundred points at
 * ~11 m precision keeps the drawn shape identical at city zoom while cutting
 * the response by roughly an order of magnitude.
 */

/** Coordinate precision of the returned polylines. 4 decimals is ~11 m. */
export const HEATMAP_PRECISION = 4;

/** Points kept per run. The heatmap needs the shape, not the samples. */
const MAX_POINTS = 300;

export type HeatmapTrack = {
  source: string;
  externalId: string;
  startDate: string;
  distance: number;
  /** Encoded [lat, lon] pairs at HEATMAP_PRECISION. */
  polyline: string;
};

/**
 * Thin a stored (precision-5) encoded polyline to at most MAX_POINTS and
 * re-encode it at HEATMAP_PRECISION. Returns undefined when there isn't enough
 * geometry left to draw a line.
 */
export function thinPolyline(encoded: string): string | undefined {
  const pts = polyline.decode(encoded);
  if (pts.length < 2) return undefined;
  const step = Math.ceil(pts.length / MAX_POINTS);
  const kept: [number, number][] = [];
  for (let i = 0; i < pts.length; i += step) kept.push(pts[i]!);
  // Keep the final sample so a loop still closes where it started.
  if ((pts.length - 1) % step !== 0) kept.push(pts[pts.length - 1]!);
  if (kept.length < 2) return undefined;
  return polyline.encode(kept, HEATMAP_PRECISION);
}

/**
 * Every outdoor run's geometry, thinned for the heatmap. Indoor runs carry no
 * polyline and are skipped.
 */
export async function listHeatmapTracks(
  opts: { userId?: string; from?: string; to?: string } = {},
): Promise<HeatmapTrack[]> {
  const activities = await listActivities({
    ...opts,
    // Effectively unbounded: the heatmap is the whole history.
    limit: 100_000,
    full: true,
  });
  const tracks: HeatmapTrack[] = [];
  for (const a of activities) {
    if (!a.polyline) continue;
    const thinned = thinPolyline(a.polyline);
    if (!thinned) continue;
    tracks.push({
      source: a.source,
      externalId: a.externalId,
      startDate: a.startDate,
      distance: a.distance,
      polyline: thinned,
    });
  }
  return tracks;
}

export type LatLng = [number, number];

export type CitySummary = {
  city: string;
  state?: string;
  country?: string;
  runs: number;
  /** Total metres run in this city. */
  distance: number;
  /** [SW, NE] corners covering every run here, so the UI can zoom to it. */
  bounds: [LatLng, LatLng];
};

/**
 * Every city the user has started a run in, busiest first. A run is attributed
 * by its *start* point — a route crossing into a neighbouring city still counts
 * as one run where it began.
 *
 * Cities come from cached grid-cell geocoding (see ./geo.ts), so this is
 * usually zero network calls; the first request after running somewhere new
 * pays roughly a second per new area.
 */
export async function listCities(
  opts: { userId?: string; from?: string; to?: string } = {},
): Promise<CitySummary[]> {
  const activities = await listActivities({ ...opts, limit: 100_000, full: true });

  const runs: { points: LatLng[]; distance: number }[] = [];
  for (const a of activities) {
    if (!a.polyline) continue;
    const points = polyline.decode(a.polyline) as LatLng[];
    if (points.length < 2) continue;
    runs.push({ points, distance: a.distance });
  }

  const places = await resolvePlaces(
    runs.map((r) => ({ lat: r.points[0]![0], lon: r.points[0]![1] })),
  );

  const byCity = new Map<string, CitySummary>();
  for (const run of runs) {
    const [startLat, startLon] = run.points[0]!;
    const place = places.get(cellKey(startLat, startLon));
    if (!place) continue; // unknown area — omitted rather than guessed at

    const key = `${place.city}|${place.state ?? ""}`;
    let entry = byCity.get(key);
    if (!entry) {
      entry = {
        ...place,
        runs: 0,
        distance: 0,
        bounds: [
          [90, 180],
          [-90, -180],
        ],
      };
      byCity.set(key, entry);
    }
    entry.runs++;
    entry.distance += run.distance;
    const [sw, ne] = entry.bounds;
    for (const [lat, lon] of run.points) {
      if (lat < sw[0]) sw[0] = lat;
      if (lon < sw[1]) sw[1] = lon;
      if (lat > ne[0]) ne[0] = lat;
      if (lon > ne[1]) ne[1] = lon;
    }
  }

  return [...byCity.values()].sort((a, b) => b.runs - a.runs);
}
