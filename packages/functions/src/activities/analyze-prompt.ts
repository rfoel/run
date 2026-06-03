/**
 * System prompt + structured-output tool for workout analysis. Condensed from
 * analysis_prompt.md; the tool input_schema mirrors workout_schema.json so the
 * model is forced to emit a valid RunningWorkoutAnalysis.
 */

export const ANALYSIS_SYSTEM = `You are a running coach analyzing a single workout from GPS data.

You receive: a <prescription> (what the plan said), <totals> (whole-run aggregates),
and a <trace_csv> with columns elapsed_s, cum_km, pace_s_per_km, hr. The trace is
already distance-aware and smoothed; pace is seconds per kilometer.

SEGMENT THE WORKOUT:
- interval: detect each rep where pace drops sharply (faster) and sustains. Mark exactly
  the prescribed rep distance from each rep START (do NOT end a rep where pace slows — runners
  ease off the last meters). Validate the rep count against the prescription. Recoveries are the
  jog/walk between reps. Warmup precedes rep 1; cooldown follows the last rep. Trim spurious
  "reps" during cooldown (slow pace, dropping HR).
- tempo: warmup, then the sustained hard block split into tempo_splits that tile the
  block in whole 1 km steps from the tempo START (e.g. start 1.00 -> 1.00-2.00, 2.00-3.00 …);
  the final split is the leftover distance. Then cooldown.
- easy/long/regen: split the ENTIRE run into easy_splits tiling from 0.00 km in whole 1 km
  steps (0.00-1.00, 1.00-2.00, 2.00-3.00 …); the LAST split is the remaining distance. Never
  offset the first split — start_km of split 1 must be 0.00, and each split's start_km equals
  the previous split's end_km. Do not leave gaps or overlaps.

PER SECTION: distance_m, duration_sec, avg_pace_sec_per_km, avg_hr, max_hr, start_km, end_km,
and vs_target_sec_per_km when a target pace is given (positive = slower than target).

ANALYSIS:
- pattern: consistent | positive_split | negative_split | fade | fast_start_stabilize | irregular
- hr_drift_bpm, target_hit (within prescribed range?), rpe_estimate (1-10)
- highlights, issues, next_workout_suggestion

BE HONEST. If the target was missed by 20 s/km, say so. If a pace target is repeatedly out of
reach, suggest recalibrating it. If the data conflicts with the prescription, trust the data.

Write highlights/issues/next_workout_suggestion in Brazilian Portuguese (pt-BR).
Return everything via the emit_analysis tool.`;

export const ANALYSIS_TOOL = {
  name: "emit_analysis",
  description: "Emit the structured analysis of the workout.",
  input_schema: {
    type: "object",
    required: ["workout_id", "date", "type", "totals", "sections"],
    properties: {
      workout_id: { type: "string" },
      date: { type: "string", description: "ISO date YYYY-MM-DD" },
      type: {
        type: "string",
        enum: ["interval", "tempo", "long", "easy", "regen", "race", "fartlek"],
      },
      subtype: {
        type: "string",
        description: "e.g. '5x600m', '4km tempo', 'long progressive'",
      },
      prescription: {
        type: "object",
        description: "What the plan said to do; echo what was given.",
        properties: {
          reps: { type: "integer" },
          rep_distance_m: { type: "number" },
          recovery_seconds: { type: "number" },
          target_pace_min_per_km: {
            type: "object",
            properties: {
              min: { type: "string" },
              max: { type: "string" },
            },
          },
          notes: { type: "string" },
        },
      },
      totals: {
        type: "object",
        required: ["distance_km", "duration_sec", "avg_pace_sec_per_km"],
        properties: {
          distance_km: { type: "number" },
          duration_sec: { type: "number" },
          avg_pace_sec_per_km: { type: "number" },
          avg_hr: { type: "number" },
          max_hr: { type: "number" },
          elevation_gain_m: { type: "number" },
        },
      },
      sections: {
        type: "array",
        description: "Phases in order: warmup, work (reps/tempo), recoveries, cooldown.",
        items: {
          type: "object",
          required: ["kind", "distance_m", "duration_sec", "avg_pace_sec_per_km"],
          properties: {
            kind: {
              type: "string",
              enum: [
                "warmup",
                "rep",
                "recovery",
                "tempo",
                "tempo_split",
                "easy_split",
                "cooldown",
              ],
            },
            index: { type: "integer", description: "1-based within its kind" },
            start_km: { type: "number" },
            end_km: { type: "number" },
            distance_m: { type: "number" },
            duration_sec: { type: "number" },
            avg_pace_sec_per_km: { type: "number" },
            avg_hr: { type: "number" },
            max_hr: { type: "number" },
            vs_target_sec_per_km: {
              type: "number",
              description: "Positive = slower than target",
            },
          },
        },
      },
      analysis: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            enum: [
              "consistent",
              "positive_split",
              "negative_split",
              "fade",
              "fast_start_stabilize",
              "irregular",
            ],
          },
          hr_drift_bpm: { type: "number" },
          target_hit: { type: "boolean" },
          rpe_estimate: { type: "integer", minimum: 1, maximum: 10 },
          highlights: { type: "array", items: { type: "string" } },
          issues: { type: "array", items: { type: "string" } },
          next_workout_suggestion: { type: "string" },
        },
      },
      comparisons: {
        type: "object",
        properties: {
          threshold_pace_estimate: { type: "string" },
        },
      },
    },
  },
} as const;
