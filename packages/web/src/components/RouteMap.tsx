import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, TileLayer } from "react-leaflet";
import { basemapProps, useDarkMode, useThemeColors } from "../lib/theme.ts";
import {
  positionAtKm,
  type LatLng,
  type RouteGeometry,
} from "../lib/polyline.ts";

export default function RouteMap({
  geo,
  hoverKm,
  highlight,
}: {
  geo: RouteGeometry;
  hoverKm: number | null;
  /** A sub-segment to emphasise (e.g. a best effort or a rep). */
  highlight?: LatLng[] | null;
}) {
  const dark = useDarkMode();
  const c = useThemeColors();
  const marker = hoverKm != null ? positionAtKm(geo, hoverKm) : null;
  const start = geo.points[0]!;
  const end = geo.points[geo.points.length - 1]!;

  return (
    // `isolate` keeps leaflet's high z-index panes below the sticky app header.
    <div className="relative isolate overflow-hidden rounded-2xl bg-card [&_.leaflet-bar]:overflow-hidden [&_.leaflet-bar]:rounded-full [&_.leaflet-bar]:border-0! [&_.leaflet-bar]:shadow-none [&_.leaflet-bar_a]:border-border! [&_.leaflet-bar_a]:bg-background! [&_.leaflet-bar_a]:text-foreground! [&_.leaflet-bar_a:hover]:bg-accent!">
      <MapContainer
        bounds={geo.bounds}
        boundsOptions={{ padding: [24, 24] }}
        scrollWheelZoom={false}
        className="h-72 w-full md:h-96"
        style={{ background: c.card }}
        attributionControl={false}
      >
        <TileLayer
          key={dark ? "dark" : "light"}
          {...basemapProps(dark)}
        />
        <Polyline
          positions={geo.points}
          pathOptions={{
            color: c.chart1,
            weight: 4,
            opacity: 0.95,
            lineCap: "round",
            lineJoin: "round",
          }}
        />
        {highlight && highlight.length >= 2 && (
          <Polyline
            positions={highlight}
            pathOptions={{
              color: c.chart5,
              weight: 7,
              opacity: 1,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        )}
        <CircleMarker
          center={start}
          radius={6}
          pathOptions={{
            color: c.chart1,
            weight: 3,
            fillColor: c.background,
            fillOpacity: 1,
          }}
        />
        <CircleMarker
          center={end}
          radius={6}
          pathOptions={{
            color: c.background,
            weight: 2,
            fillColor: c.chart1,
            fillOpacity: 1,
          }}
        />
        {marker && (
          <CircleMarker
            center={marker}
            radius={7}
            pathOptions={{
              color: c.background,
              weight: 2,
              fillColor: c.chart2,
              fillOpacity: 1,
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
