import polyline from "@mapbox/polyline";

/**
 * A run's route reduced to a thumbnail: few enough points to ride along on
 * every activity in list responses (~200 bytes), still recognisably the route.
 * Douglas–Peucker keeps the corners that make the shape, unlike a uniform
 * stride, which rounds them off.
 */

/** Thumbnails are drawn ~80 px wide; ~11 m precision is far below a pixel. */
const THUMB_PRECISION = 4;
const MAX_POINTS = 64;
/** Simplify to this share of the route's bounding-box diagonal. */
const TOLERANCE = 0.006;

type XY = [number, number];

function perpendicular(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

/** Indices of the points Douglas–Peucker keeps at `epsilon`. */
function simplify(pts: XY[], epsilon: number): number[] {
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let worst = 0;
    let at = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicular(pts[i]!, pts[start]!, pts[end]!);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (at >= 0 && worst > epsilon) {
      keep[at] = 1;
      stack.push([start, at], [at, end]);
    }
  }
  const out: number[] = [];
  keep.forEach((k, i) => k && out.push(i));
  return out;
}

/**
 * A route reduced to its shape: Douglas–Peucker at `tolerance` (a share of the
 * route's bounding-box diagonal), then thinned to at most `maxPoints`. Empty
 * when there is no route to draw.
 */
export function simplifyRoute(
  latLngs: Array<[number, number]>,
  { tolerance, maxPoints }: { tolerance: number; maxPoints: number },
): Array<[number, number]> {
  if (latLngs.length < 2) return [];

  // Equirectangular projection around the route: fine at running scale, and
  // it makes the tolerance a real distance rather than degrees.
  const lat0 = (latLngs.reduce((s, p) => s + p[0], 0) / latLngs.length) * (Math.PI / 180);
  const xy: XY[] = latLngs.map(([lat, lng]) => [lng * Math.cos(lat0), lat]);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const diagonal = Math.hypot(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  );
  if (diagonal === 0) return [];

  let kept = simplify(xy, diagonal * tolerance);
  if (kept.length > maxPoints) {
    const step = Math.ceil(kept.length / maxPoints);
    kept = kept.filter((_, i) => i % step === 0 || i === kept.length - 1);
  }
  return kept.map((i) => latLngs[i]!);
}

/**
 * Encoded thumbnail polyline from a stored (precision-5) route polyline, or
 * undefined when there's no route to draw.
 */
export function routeThumb(encoded: string | undefined): string | undefined {
  if (!encoded) return undefined;
  const route = simplifyRoute(polyline.decode(encoded), {
    tolerance: TOLERANCE,
    maxPoints: MAX_POINTS,
  });
  if (route.length === 0) return undefined;
  return polyline.encode(route, THUMB_PRECISION);
}
