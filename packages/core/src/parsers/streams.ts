import type { Track, TrackPoint } from "../track.ts";

export type StravaStreamSet = {
  time?: { data: number[] };
  latlng?: { data: [number, number][] };
  distance?: { data: number[] }; // cumulative meters; present for indoor runs
  altitude?: { data: number[] };
  heartrate?: { data: number[] };
  cadence?: { data: number[] };
};

/**
 * Strava streams are parallel arrays. `time` is seconds offset from activity start.
 * `startEpochSec` converts those to absolute unix time.
 */
export function streamsToTrack(
  streams: StravaStreamSet,
  startEpochSec: number,
): Track {
  const times = streams.time?.data ?? [];
  const latlngs = streams.latlng?.data ?? [];
  const dists = streams.distance?.data ?? [];
  const eles = streams.altitude?.data ?? [];
  const hrs = streams.heartrate?.data ?? [];
  const cads = streams.cadence?.data ?? [];

  // Drive off `time`; indoor/treadmill runs have no latlng but still carry a
  // cumulative `distance` stream we use to compute metrics.
  const len = times.length;
  const points: TrackPoint[] = [];
  for (let i = 0; i < len; i++) {
    const ll = latlngs[i];
    points.push({
      time: startEpochSec + times[i]!,
      lat: ll?.[0],
      lon: ll?.[1],
      dist: dists[i],
      ele: eles[i],
      hr: hrs[i],
      cadence: cads[i],
    });
  }
  return { points };
}
