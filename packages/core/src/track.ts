import polyline from "@mapbox/polyline";

export type TrackPoint = {
  time: number; // unix seconds
  lat: number;
  lon: number;
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

function haversine(a: TrackPoint, b: TrackPoint) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(x));
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
    const dd = haversine(prev, cur);
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
  const encoded = polyline.encode(pts.map((p) => [p.lat, p.lon]));

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
