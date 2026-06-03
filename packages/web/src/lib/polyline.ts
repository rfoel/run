export type LatLng = [number, number];

/** Decode a Google/Strava encoded polyline into [lat, lng] pairs. */
export function decodePolyline(str: string, precision = 5): LatLng[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coords: LatLng[] = [];
  const factor = Math.pow(10, precision);

  while (index < str.length) {
    let result = 1;
    let shift = 0;
    let b: number;
    do {
      b = str.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 1;
    shift = 0;
    do {
      b = str.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}

const EARTH_RADIUS = 6371000;

function haversine(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(x));
}

export type RouteGeometry = {
  points: LatLng[];
  cum: number[]; // cumulative meters at each point
  totalM: number;
  bounds: [LatLng, LatLng]; // [SW, NE]
};

export function routeGeometry(points: LatLng[]): RouteGeometry | null {
  if (points.length < 2) return null;
  const cum = new Array<number>(points.length);
  cum[0] = 0;
  let minLat = points[0]![0];
  let maxLat = points[0]![0];
  let minLng = points[0]![1];
  let maxLng = points[0]![1];
  for (let i = 1; i < points.length; i++) {
    cum[i] = cum[i - 1]! + haversine(points[i - 1]!, points[i]!);
    const [la, ln] = points[i]!;
    if (la < minLat) minLat = la;
    if (la > maxLat) maxLat = la;
    if (ln < minLng) minLng = ln;
    if (ln > maxLng) maxLng = ln;
  }
  return {
    points,
    cum,
    totalM: cum[cum.length - 1]!,
    bounds: [
      [minLat, minLng],
      [maxLat, maxLng],
    ],
  };
}

/** Interpolate the lat/lng at a cumulative distance (in km) along the route. */
export function positionAtKm(geo: RouteGeometry, km: number): LatLng | null {
  const target = km * 1000;
  const { cum, points } = geo;
  if (target <= 0) return points[0]!;
  if (target >= geo.totalM) return points[points.length - 1]!;
  // Linear scan is fine for a few thousand points and avoids edge-case bugs.
  let i = 1;
  while (i < cum.length && cum[i]! < target) i++;
  const prevD = cum[i - 1]!;
  const nextD = cum[i]!;
  const t = nextD > prevD ? (target - prevD) / (nextD - prevD) : 0;
  const a = points[i - 1]!;
  const b = points[i]!;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
