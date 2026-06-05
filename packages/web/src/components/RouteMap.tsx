import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, TileLayer } from "react-leaflet";
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
  const marker = hoverKm != null ? positionAtKm(geo, hoverKm) : null;

  return (
    <div className="border border-line rounded-lg overflow-hidden bg-card shadow-sm">
      <MapContainer
        bounds={geo.bounds}
        boundsOptions={{ padding: [16, 16] }}
        scrollWheelZoom={false}
        style={{ height: 280, width: "100%", background: "var(--color-paper-2, #eee)" }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          attribution="&copy; OpenStreetMap &copy; CARTO"
        />
        <Polyline
          positions={geo.points}
          pathOptions={{ color: "#3b3833", weight: 4, opacity: 0.9 }}
        />
        {highlight && highlight.length >= 2 && (
          <Polyline
            positions={highlight}
            pathOptions={{ color: "#f97316", weight: 6, opacity: 0.95 }}
          />
        )}
        {marker && (
          <CircleMarker
            center={marker}
            radius={7}
            pathOptions={{
              color: "#fff",
              weight: 2,
              fillColor: "#dc2626",
              fillOpacity: 1,
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
