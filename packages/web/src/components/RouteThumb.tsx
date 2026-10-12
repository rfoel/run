import { useMemo } from "react";
import { cn } from "cn";
import { decodePolyline } from "../lib/polyline.ts";

/** The thumbnail polylines are encoded at precision 4 (see @run/core/routeThumb). */
const THUMB_PRECISION = 4;

/**
 * A run's route as a bare line — no map tiles, just the shape, NRC-style.
 * Drawn in `currentColor`, so the caller picks the color. Renders nothing for
 * runs without a route (treadmill, manual).
 */
export default function RouteThumb({
  thumb,
  className,
  strokeWidth = 2.5,
}: {
  thumb?: string;
  className?: string;
  strokeWidth?: number;
}) {
  const shape = useMemo(() => {
    if (!thumb) return undefined;
    const pts = decodePolyline(thumb, THUMB_PRECISION);
    if (pts.length < 2) return undefined;
    // Equirectangular around the route; SVG y grows downwards, so flip lat.
    const lat0 = (pts.reduce((s, p) => s + p[0], 0) / pts.length) * (Math.PI / 180);
    const xy = pts.map(([lat, lng]) => [lng * Math.cos(lat0), -lat] as const);
    const xs = xy.map((p) => p[0]);
    const ys = xy.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(...xs) - minX;
    const h = Math.max(...ys) - minY;
    const span = Math.max(w, h) || 1;
    // Fit the longer side to 100 units and centre the shorter one.
    const scale = 100 / span;
    const ox = (100 - w * scale) / 2;
    const oy = (100 - h * scale) / 2;
    const at = ([x, y]: readonly [number, number]) =>
      [(x - minX) * scale + ox, (y - minY) * scale + oy] as const;
    const path = xy
      .map((p, i) => {
        const [x, y] = at(p);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join("");
    return { path, start: at(xy[0]!) };
  }, [thumb]);

  if (!shape) return null;
  return (
    <svg
      viewBox="-6 -6 112 112"
      className={cn("shrink-0 overflow-visible", className)}
      aria-hidden="true"
    >
      <path
        d={shape.path}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={shape.start[0]}
        cy={shape.start[1]}
        r={strokeWidth * 1.2}
        fill="currentColor"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
