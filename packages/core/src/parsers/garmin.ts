import { computeMetrics, type Metrics, type Track, type TrackPoint } from "../track.ts";
import {
  garminStartEpochSec,
  type GarminActivityDetails,
  type GarminActivitySummary,
} from "../garmin.ts";

/**
 * Garmin activity details are column-oriented: `metricDescriptors` names each
 * column, `activityDetailMetrics` holds the rows. We map the columns we care
 * about into TrackPoints. Indoor/treadmill runs omit latitude/longitude but
 * still carry `sumDistance`, which {@link computeMetrics} uses as a fallback.
 *
 * `startEpochSec` is used only when a row has no `directTimestamp`.
 */
export function detailsToTrack(
  details: GarminActivityDetails,
  startEpochSec: number,
): Track {
  const idx: Record<string, number> = {};
  for (const d of details.metricDescriptors ?? []) {
    idx[d.key] = d.metricsIndex;
  }
  const rows = details.activityDetailMetrics ?? [];

  const at = (row: (number | null)[], key: string): number | undefined => {
    const i = idx[key];
    if (i == null) return undefined;
    const v = row[i];
    return v == null ? undefined : v;
  };

  const points: TrackPoint[] = [];
  for (const { metrics } of rows) {
    const ts = at(metrics, "directTimestamp"); // ms epoch
    const elapsed = at(metrics, "sumElapsedDuration"); // seconds from start
    const time =
      ts != null
        ? Math.floor(ts / 1000)
        : startEpochSec + Math.round(elapsed ?? 0);
    points.push({
      time,
      lat: at(metrics, "directLatitude"),
      lon: at(metrics, "directLongitude"),
      dist: at(metrics, "sumDistance"),
      ele: at(metrics, "directElevation"),
      hr: at(metrics, "directHeartRate"),
      cadence: at(metrics, "directRunCadence"),
    });
  }
  return { points };
}

/** Metrics straight from the list summary — used when a detail track is absent. */
function metricsFromSummary(s: GarminActivitySummary): Metrics {
  const elapsed = s.elapsedDuration ?? s.duration;
  const moving = s.movingDuration ?? s.duration;
  return {
    distance: s.distance,
    movingTime: moving,
    elapsedTime: elapsed,
    elevationGain: s.elevationGain ?? 0,
    avgSpeed: s.averageSpeed ?? (moving ? s.distance / moving : 0),
    maxSpeed: s.maxSpeed ?? 0,
    avgHr: s.averageHR ?? undefined,
    maxHr: s.maxHR ?? undefined,
    avgCadence: s.averageRunningCadenceInStepsPerMinute ?? undefined,
    hasHr: s.averageHR != null,
    splits: [],
    startTime: new Date(garminStartEpochSec(s.startTimeGMT) * 1000).toISOString(),
  };
}

/**
 * Turn a Garmin summary (+ optional detail samples) into metrics and a track.
 * Prefers the sample track — that yields splits, a pace chart and, for outdoor
 * runs, a polyline. Falls back to the summary alone when details are missing
 * or too short (e.g. a manually-entered run).
 */
export function garminMetrics(
  summary: GarminActivitySummary,
  details?: GarminActivityDetails,
): { metrics: Metrics; track: Track | null } {
  if (details) {
    const track = detailsToTrack(details, garminStartEpochSec(summary.startTimeGMT));
    if (track.points.length >= 2) {
      return { metrics: computeMetrics(track), track };
    }
  }
  return { metrics: metricsFromSummary(summary), track: null };
}
