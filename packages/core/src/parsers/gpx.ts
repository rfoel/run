import { XMLParser } from "fast-xml-parser";
import type { Track, TrackPoint } from "../track.ts";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Preserve element order isn't needed for trkpt — they're already in array.
  isArray: (name) => name === "trkpt" || name === "trkseg" || name === "trk",
});

type GpxTrkpt = {
  "@_lat": string;
  "@_lon": string;
  ele?: string | number;
  time?: string;
  extensions?: {
    "gpxtpx:TrackPointExtension"?: {
      "gpxtpx:hr"?: string | number;
      "gpxtpx:cad"?: string | number;
    };
    TrackPointExtension?: {
      hr?: string | number;
      cad?: string | number;
    };
  };
};

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function extractHr(p: GpxTrkpt): number | undefined {
  const ext = p.extensions;
  if (!ext) return undefined;
  const tpx = ext["gpxtpx:TrackPointExtension"] ?? ext.TrackPointExtension;
  if (!tpx) return undefined;
  return num((tpx as any)["gpxtpx:hr"] ?? (tpx as any).hr);
}

function extractCad(p: GpxTrkpt): number | undefined {
  const ext = p.extensions;
  if (!ext) return undefined;
  const tpx = ext["gpxtpx:TrackPointExtension"] ?? ext.TrackPointExtension;
  if (!tpx) return undefined;
  return num((tpx as any)["gpxtpx:cad"] ?? (tpx as any).cad);
}

export function parseGpx(xml: string): Track {
  const doc = parser.parse(xml) as {
    gpx?: { trk?: Array<{ trkseg?: Array<{ trkpt?: GpxTrkpt[] }> }> };
  };
  const trks = doc.gpx?.trk ?? [];
  const points: TrackPoint[] = [];

  for (const trk of trks) {
    for (const seg of trk.trkseg ?? []) {
      for (const p of seg.trkpt ?? []) {
        const lat = num(p["@_lat"]);
        const lon = num(p["@_lon"]);
        if (lat == null || lon == null) continue;
        const time = p.time ? Math.floor(new Date(p.time).getTime() / 1000) : NaN;
        if (!Number.isFinite(time)) continue;
        points.push({
          time,
          lat,
          lon,
          ele: num(p.ele),
          hr: extractHr(p),
          cadence: extractCad(p),
        });
      }
    }
  }

  return { points };
}
