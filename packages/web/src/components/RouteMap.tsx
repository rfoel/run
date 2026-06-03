import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, TileLayer } from "react-leaflet";
import { positionAtKm, type RouteGeometry } from "../lib/polyline.ts";

export default function RouteMap({
  geo,
  hoverKm,
}: {
  geo: RouteGeometry;
  hoverKm: number | null;
}) {
  const marker = hoverKm != null ? positionAtKm(geo, hoverKm) : null;

  return (
    <div className="border-2 border-ink overflow-hidden">
      <MapContainer
        bounds={geo.bounds}
        boundsOptions={{ padding: [16, 16] }}
        scrollWheelZoom={false}
        style={{ height: 280, width: "100%", background: "var(--color-paper-2, #eee)" }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap'
        />
        <Polyline
          positions={geo.points}
          pathOptions={{ color: "#1d4ed8", weight: 4, opacity: 0.85 }}
        />
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
