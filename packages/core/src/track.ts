import polyline from "@mapbox/polyline";

export type TrackPoint = {
  time: number; // unix seconds
  lat?: number; // absent for indoor/treadmill runs (no GPS)
  lon?: number;
  dist?: number; // cumulative meters; used when GPS is absent
  ele?: number;
  hr?: number;
  cadence?: number;
};

export type Track = {
  points: TrackPoint[];
};

export type Split = {
  km: number;
  elapsedSec: number;
  movingSec: number;
  elevationDelta: number;
  avgHr?: number;
};

export type Metrics = {
  distance: number;
  movingTime: number;
  elapsedTime: number;
  elevationGain: number;
  avgSpeed: number;
  maxSpeed: number;
  avgHr?: number;
  maxHr?: number;
  avgCadence?: number;
  hasHr: boolean;
  splits: Split[];
  polyline?: string;
  startTime: string;
};

const EARTH_RADIUS = 6371000;
const MOVING_GAP_THRESHOLD = 10; // sec; gaps > this = paused

/**
 * Compact per-sample series for charting a single workout: cumulative distance,
 * smoothed pace, HR and elapsed time as parallel arrays. Designed to be stored
 * as its own DynamoDB item and rendered as a pace-vs-distance line.
 */
export type ChartSeries = {
  km: number[]; // cumulative distance, km
  pace: (number | null)[]; // smoothed sec/km; null when stopped/too slow
  hr: (number | null)[];
  elapsed: number[]; // seconds from start
};

const PACE_FLOOR_SPEED = 0.5; // m/s; below this we treat the runner as stopped
const PACE_CEIL = 900; // sec/km; clamp slow paces so the chart stays readable

/**
 * Build a chart series from a track. Pace is smoothed over a trailing time
 * window (default ~12s) to kill GPS jitter, then the series is downsampled to
 * at most `maxPoints` evenly-strided samples so it stays small in storage and
 * fast to render.
 */
export function buildChartSeries(
  track: Track,
  opts: { windowSec?: number; maxPoints?: number } = {},
): ChartSeries {
  const windowSec = opts.windowSec ?? 12;
  const maxPoints = opts.maxPoints ?? 800;
  const pts = track.points;
  if (pts.length < 2) return { km: [], pace: [], hr: [], elapsed: [] };

  const start = pts[0]!.time;
  // Cumulative distance at each point.
  const cum: number[] = new Array(pts.length);
  cum[0] = 0;
  for (let i = 1; i < pts.length; i++) {
    cum[i] = cum[i - 1]! + segDist(pts[i - 1]!, pts[i]!);
  }

  // Smoothed pace at each point from a trailing window.
  const paceAt: (number | null)[] = new Array(pts.length);
  let w = 0; // left edge of the trailing window
  for (let i = 0; i < pts.length; i++) {
    const tCur = pts[i]!.time;
    while (w < i && tCur - pts[w]!.time > windowSec) w++;
    const dt = tCur - pts[w]!.time;
    const dd = cum[i]! - cum[w]!;
    if (dt <= 0 || dd <= 0) {
      paceAt[i] = null;
      continue;
    }
    const speed = dd / dt;
    if (speed < PACE_FLOOR_SPEED) {
      paceAt[i] = null;
      continue;
    }
    paceAt[i] = Math.min(PACE_CEIL, 1000 / speed);
  }

  const stride = Math.max(1, Math.ceil(pts.length / maxPoints));
  const km: number[] = [];
  const pace: (number | null)[] = [];
  const hr: (number | null)[] = [];
  const elapsed: number[] = [];
  for (let i = 0; i < pts.length; i += stride) {
    km.push(Math.round(cum[i]! / 10) / 100); // km, 2 decimals
    pace.push(paceAt[i] == null ? null : Math.round(paceAt[i]!));
    hr.push(pts[i]!.hr ?? null);
    elapsed.push(pts[i]!.time - start);
  }
  // Always include the final sample so the line reaches full distance.
  const lastIdx = pts.length - 1;
  if ((pts.length - 1) % stride !== 0) {
    km.push(Math.round(cum[lastIdx]! / 10) / 100);
    pace.push(paceAt[lastIdx] == null ? null : Math.round(paceAt[lastIdx]!));
    hr.push(pts[lastIdx]!.hr ?? null);
    elapsed.push(pts[lastIdx]!.time - start);
  }
  return { km, pace, hr, elapsed };
}

function haversine(a: TrackPoint, b: TrackPoint) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat! - a.lat!);
  const dLon = toRad(b.lon! - a.lon!);
  const lat1 = toRad(a.lat!);
  const lat2 = toRad(b.lat!);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(x));
}

/**
 * Distance between two samples. Prefers GPS haversine; falls back to the delta
 * of the cumulative `dist` stream for indoor/treadmill runs with no latlng.
 */
function segDist(a: TrackPoint, b: TrackPoint) {
  if (a.lat != null && a.lon != null && b.lat != null && b.lon != null) {
    return haversine(a, b);
  }
  if (a.dist != null && b.dist != null) {
    return Math.max(0, b.dist - a.dist);
  }
  return 0;
}

export function computeMetrics(track: Track): Metrics {
  const pts = track.points;
  if (pts.length < 2) {
    throw new Error("track has fewer than 2 points");
  }
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;

  let distance = 0;
  let movingTime = 0;
  let elevationGain = 0;
  let maxSpeed = 0;
  let hrSum = 0;
  let hrCount = 0;
  let hrMax: number | undefined;
  let cadSum = 0;
  let cadCount = 0;

  const splits: Split[] = [];
  let splitStartDist = 0;
  let splitStartTime = first.time;
  let splitMoving = 0;
  let splitEleStart = first.ele ?? 0;
  let splitHrSum = 0;
  let splitHrCount = 0;
  let kmMark = 1;

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    const dt = cur.time - prev.time;
    const dd = segDist(prev, cur);
    distance += dd;

    const moving = dt > 0 && dt <= MOVING_GAP_THRESHOLD && dd > 0;
    if (moving) {
      movingTime += dt;
      splitMoving += dt;
      const speed = dd / dt;
      if (speed > maxSpeed) maxSpeed = speed;
    }

    if (prev.ele != null && cur.ele != null) {
      const de = cur.ele - prev.ele;
      if (de > 0) elevationGain += de;
    }

    if (cur.hr != null) {
      hrSum += cur.hr;
      hrCount++;
      if (hrMax == null || cur.hr > hrMax) hrMax = cur.hr;
      splitHrSum += cur.hr;
      splitHrCount++;
    }
    if (cur.cadence != null) {
      cadSum += cur.cadence;
      cadCount++;
    }

    while (distance >= kmMark * 1000) {
      splits.push({
        km: kmMark,
        elapsedSec: cur.time - splitStartTime,
        movingSec: splitMoving,
        elevationDelta: (cur.ele ?? splitEleStart) - splitEleStart,
        avgHr: splitHrCount > 0 ? splitHrSum / splitHrCount : undefined,
      });
      splitStartDist = kmMark * 1000;
      splitStartTime = cur.time;
      splitMoving = 0;
      splitEleStart = cur.ele ?? splitEleStart;
      splitHrSum = 0;
      splitHrCount = 0;
      kmMark++;
    }
  }

  // trailing partial km
  const tailDist = distance - splitStartDist;
  if (tailDist > 100) {
    splits.push({
      km: kmMark, // partial — caller can detect via tail flag if needed
      elapsedSec: last.time - splitStartTime,
      movingSec: splitMoving,
      elevationDelta: (last.ele ?? splitEleStart) - splitEleStart,
      avgHr: splitHrCount > 0 ? splitHrSum / splitHrCount : undefined,
    });
  }

  const elapsedTime = last.time - first.time;
  // Only encode a polyline when the track has GPS; indoor runs have none, and
  // a missing polyline is how the app flags an activity as indoor.
  const hasGps = pts.some((p) => p.lat != null && p.lon != null);
  const encoded = hasGps
    ? polyline.encode(pts.map((p) => [p.lat!, p.lon!]))
    : undefined;

  return {
    distance,
    movingTime,
    elapsedTime,
    elevationGain,
    avgSpeed: movingTime > 0 ? distance / movingTime : 0,
    maxSpeed,
    avgHr: hrCount > 0 ? hrSum / hrCount : undefined,
    maxHr: hrMax,
    avgCadence: cadCount > 0 ? cadSum / cadCount : undefined,
    hasHr: hrCount > 0,
    splits,
    polyline: encoded,
    startTime: new Date(first.time * 1000).toISOString(),
  };
}
