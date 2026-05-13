import { gunzipSync } from "node:zlib";
import FitParser from "fit-file-parser";
import type { Track, TrackPoint } from "@run/core/track";

type FitRecord = {
  timestamp?: Date;
  position_lat?: number;
  position_long?: number;
  altitude?: number;
  enhanced_altitude?: number;
  heart_rate?: number;
  cadence?: number;
};

type FitSession = {
  start_time?: Date;
  sport?: string;
  sub_sport?: string;
};

type FitData = {
  records?: FitRecord[];
  sessions?: FitSession[];
};

export type FitResult = {
  track: Track;
  startTime: Date;
  sport?: string;
};

export function parseFit(gzippedBuffer: Buffer): Promise<FitResult> {
  const raw = gunzipSync(gzippedBuffer);
  return new Promise((resolve, reject) => {
    const parser = new (FitParser as any)({
      force: true,
      speedUnit: "m/s",
      lengthUnit: "m",
      temperatureUnit: "celsius",
      elapsedRecordField: false,
      mode: "list",
    });
    parser.parse(raw, (err: Error | null, data: FitData) => {
      if (err) return reject(err);
      const records = data.records ?? [];
      const points: TrackPoint[] = [];
      for (const r of records) {
        if (r.position_lat == null || r.position_long == null) continue;
        if (!r.timestamp) continue;
        const time = Math.floor(r.timestamp.getTime() / 1000);
        points.push({
          time,
          lat: r.position_lat,
          lon: r.position_long,
          ele: r.enhanced_altitude ?? r.altitude,
          hr: r.heart_rate,
          cadence: r.cadence,
        });
      }
      const session = data.sessions?.[0];
      resolve({
        track: { points },
        startTime: session?.start_time ?? records[0]?.timestamp ?? new Date(),
        sport: session?.sport,
      });
    });
  });
}
