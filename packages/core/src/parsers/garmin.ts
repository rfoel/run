import { computeMetrics, type Metrics, type Track, type TrackPoint } from "../track.ts";
import {
  garminStartEpochSec,
  type GarminActivityDetails,
  type GarminActivityFull,
  type GarminActivitySummary,
  type GarminLap,
  type GarminWeather,
  type GarminZone,
} from "../garmin.ts";
import type { ActivityExtras, DeviceLap, ZoneTime } from "../workout.ts";

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
      power: at(metrics, "directPower"),
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

// ---- Extras normalization ---------------------------------------------------

const round1 = (v: number) => Math.round(v * 10) / 10;
const fToC = (f: number) => round1(((f - 32) * 5) / 9);
const mphToKph = (mph: number) => round1(mph * 1.609344);

function toDeviceLap(l: GarminLap): DeviceLap {
  const lap: DeviceLap = {
    index: l.lapIndex,
    distance: Math.round(l.distance ?? 0),
    duration: Math.round(l.duration ?? 0),
  };
  if (l.intensityType) lap.intensity = l.intensityType.toLowerCase();
  if (l.wktStepIndex != null) lap.wktStepIndex = l.wktStepIndex;
  if (l.averageSpeed && l.averageSpeed > 0)
    lap.paceSecPerKm = Math.round(1000 / l.averageSpeed);
  if (l.averageHR != null) lap.avgHr = Math.round(l.averageHR);
  if (l.maxHR != null) lap.maxHr = Math.round(l.maxHR);
  if (l.averagePower != null) lap.avgPower = Math.round(l.averagePower);
  if (l.averageRunCadence != null) lap.avgCadence = Math.round(l.averageRunCadence);
  if (l.elevationGain != null) lap.elevGain = Math.round(l.elevationGain);
  if (l.directWorkoutComplianceScore != null)
    lap.compliance = Math.round(l.directWorkoutComplianceScore);
  return lap;
}

const toZones = (zones: GarminZone[]): ZoneTime[] =>
  zones
    .filter((z) => z.secsInZone > 0)
    .map((z) => ({
      zone: z.zoneNumber,
      secs: Math.round(z.secsInZone),
      low: Math.round(z.zoneLowBoundary),
    }));

/**
 * Normalize Garmin's per-activity extras (full DTO, watch laps, zone times,
 * weather) into the source-agnostic {@link ActivityExtras} we store. Empty
 * sections are omitted so callers can feature-detect with plain truthiness.
 */
export function garminExtras(input: {
  full?: GarminActivityFull;
  laps?: GarminLap[];
  hrZones?: GarminZone[];
  powerZones?: GarminZone[];
  weather?: GarminWeather;
}): ActivityExtras {
  const extras: ActivityExtras = {};

  if (input.laps && input.laps.length > 0) {
    extras.laps = input.laps.map(toDeviceLap);
  }
  if (input.hrZones) {
    const z = toZones(input.hrZones);
    if (z.length) extras.hrZones = z;
  }
  if (input.powerZones) {
    const z = toZones(input.powerZones);
    if (z.length) extras.powerZones = z;
  }
  if (input.weather && input.weather.temp != null) {
    extras.weather = {
      tempC: fToC(input.weather.temp),
      ...(input.weather.apparentTemp != null && {
        feelsC: fToC(input.weather.apparentTemp),
      }),
      ...(input.weather.relativeHumidity != null && {
        humidity: input.weather.relativeHumidity,
      }),
      ...(input.weather.windSpeed != null && {
        windKph: mphToKph(input.weather.windSpeed),
      }),
      ...(input.weather.windDirectionCompassPoint && {
        windDir: input.weather.windDirectionCompassPoint,
      }),
      ...(input.weather.weatherTypeDTO?.desc && {
        desc: input.weather.weatherTypeDTO.desc,
      }),
    };
  }

  const s = input.full?.summaryDTO;
  if (s) {
    const physio: NonNullable<ActivityExtras["physio"]> = {};
    if (s.trainingEffect != null) physio.aerobicTE = round1(s.trainingEffect);
    if (s.anaerobicTrainingEffect != null)
      physio.anaerobicTE = round1(s.anaerobicTrainingEffect);
    if (s.trainingEffectLabel) physio.teLabel = s.trainingEffectLabel;
    if (s.activityTrainingLoad != null)
      physio.trainingLoad = Math.round(s.activityTrainingLoad);
    if (s.averagePower != null) physio.avgPower = Math.round(s.averagePower);
    if (s.maxPower != null) physio.maxPower = Math.round(s.maxPower);
    if (s.normalizedPower != null)
      physio.normPower = Math.round(s.normalizedPower);
    if (s.averageRunCadence != null)
      physio.avgCadence = Math.round(s.averageRunCadence);
    if (s.maxRunCadence != null) physio.maxCadence = Math.round(s.maxRunCadence);
    if (s.groundContactTime != null) physio.gctMs = Math.round(s.groundContactTime);
    if (s.strideLength != null) physio.strideLenCm = Math.round(s.strideLength);
    if (s.verticalOscillation != null)
      physio.vertOscCm = round1(s.verticalOscillation);
    if (s.verticalRatio != null) physio.vertRatio = round1(s.verticalRatio);
    if (s.calories != null) physio.calories = Math.round(s.calories);
    if (s.moderateIntensityMinutes != null)
      physio.modIntensityMin = s.moderateIntensityMinutes;
    if (s.vigorousIntensityMinutes != null)
      physio.vigIntensityMin = s.vigorousIntensityMinutes;
    if (s.differenceBodyBattery != null)
      physio.bodyBatteryDiff = s.differenceBodyBattery;
    if (s.avgGradeAdjustedSpeed != null && s.avgGradeAdjustedSpeed > 0)
      physio.gradeAdjustedPaceSecPerKm = Math.round(1000 / s.avgGradeAdjustedSpeed);
    if (Object.keys(physio).length) extras.physio = physio;

    const feedback: NonNullable<ActivityExtras["feedback"]> = {};
    // Garmin stores RPE x10 (70 = RPE 7) and feel 0-100.
    if (s.directWorkoutRpe != null) feedback.rpe = round1(s.directWorkoutRpe / 10);
    if (s.directWorkoutFeel != null) feedback.feel = s.directWorkoutFeel;
    if (s.directWorkoutComplianceScore != null)
      feedback.compliance = s.directWorkoutComplianceScore;
    if (Object.keys(feedback).length) extras.feedback = feedback;
  }

  return extras;
}
