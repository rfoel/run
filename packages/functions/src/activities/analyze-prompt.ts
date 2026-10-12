/**
 * System prompt and response schema for the workout analysis. The model
 * segments the run and writes the coaching read; every section number
 * (distance, time, pace, heart rate, vs target) is computed in code from the
 * full series — see sections.ts.
 */

export const ANALYSIS_SYSTEM = `You are a running coach analyzing a single workout from GPS data.

You receive: a <prescription> (what the plan said), <totals> (whole-run aggregates),
a <trace_csv> with columns elapsed_s, cum_km, pace_s_per_km, hr, and — when available —
<device_laps> (watch laps), <context> (athlete RPE/feel, weather, training effect, zones),
<recent_runs> (the athlete's last ~3 weeks) and <upcoming_plan> (the next planned runs).
The trace is already distance-aware and smoothed; pace is seconds per kilometer.
When the prescription includes structured_workout, it is the exact plan: take rep counts,
distances and each step's target (pace band, or heart-rate zone/band) from it.

SEGMENT THE WORKOUT — return each section's kind, index and start_km/end_km only. Distance,
time, pace and heart rate per section are computed from the full trace afterwards, so place
the boundaries precisely and leave the arithmetic out.
- When <device_laps> carry intensity/step tags, take section boundaries from them: the watch
  executed a structured workout and already knows where every rep, recovery, warmup and
  cooldown starts and ends. Map laps to sections (interval/active laps with a rep-like
  distance = reps; recovery/rest = recoveries; warmup/cooldown as tagged), give each such
  section its lap number (the # in <device_laps>) so its numbers come straight from the
  watch, and use the lap's cumulative km range as its start_km/end_km. Use the trace only to
  describe what happened inside a section (e.g. a fade within a rep), not to re-detect
  boundaries.
- Without tagged laps (manual laps, free run), detect sections from the trace:
- interval: a rep starts where pace drops sharply (faster) and sustains. Mark exactly the
  prescribed rep distance from each rep's start — runners ease off the last meters, so don't
  end a rep where pace slows. Check the rep count against the prescription. Recoveries are the
  jog/walk between reps; warmup precedes rep 1 and cooldown follows the last rep. Slow
  "reps" during the cooldown (slow pace, dropping HR) are not reps.
- strides (accelerations / "educativos", e.g. "4x100m" at the end of an easy/long run): short
  bursts of about 80-150 m / 10-25 s, usually 4-8 back to back. Mark each as a rep bounded by
  its own pace spike rather than by the prescribed distance: start_km at the leading edge where
  pace starts dropping sharply, end_km where pace turns back toward easy, so the band straddles
  the fastest point instead of sitting after it.
- tempo: warmup, the sustained hard block as one tempo section, then cooldown. Its 1 km splits
  are generated from the block.
- easy/long/regen: no sections needed (1 km splits are generated for the whole run), except
  strides, which you mark as reps as above.

ANALYSIS:
- pattern: consistent | positive_split | negative_split | fade | fast_start_stabilize | irregular
- hr_drift_bpm, target_hit (within the prescribed range?), rpe_estimate (1-10)
- highlights, issues, next_workout_suggestion

USE THE <context> WHEN PRESENT:
- athlete_feedback.rpe is the athlete's own rating — use it as rpe_estimate instead of guessing,
  and read pace-vs-RPE as a signal (target pace at RPE 9 = pace too ambitious; easy pace at
  RPE 3 = fitness gain).
- weather: heat and humidity raise HR at a given pace. Above ~22C (or feels-like), attribute
  part of any HR drift to conditions before blaming pacing or fitness, and say so.
- aerobic/anaerobic training effect + te_label tell you what stimulus the run actually produced;
  compare it with what the prescription intended (an easy run with anaerobic_te 3+ was not easy).
- hr_time_in_zones: an "easy" run mostly in z3+ is a flag.

Write as a coach, not a reporter:
- Diagnose the cause, not the symptom. HR drift or a fade has a mechanism: reps 1-3 run faster
  than target, recoveries too short, a weak aerobic base, or volume fatigue. Check the early
  reps' pace against the target before blaming fitness — going out too hot is the most common
  cause.
- Use <recent_runs> as the baseline: was this week's volume a jump? Was there a hard session
  1-2 days before that explains dead legs? Is this pace/HR combination better or worse than a
  similar recent workout? A comparison ("melhor que o 5x600 da semana passada") beats an
  absolute number.
- Judge the workout's purpose. Fading in the last reps of an interval session while holding
  target in the first ones can be exactly the stimulus intended; a fade in an easy run is a
  real flag.
- If the target was missed by 20 s/km, say so. If a pace target is repeatedly out of reach
  across <recent_runs>, suggest recalibrating it. If the data conflicts with the prescription,
  trust the data.

STYLE — highlights, issues and next_workout_suggestion in Brazilian Portuguese (pt-BR):
- Cada highlight/issue cabe em uma linha e carrega um insight — causa, comparação ou
  interpretação —, não um número que já aparece na tabela.
  Ruim: "Deriva de FC brutal (+45 bpm)".
  Bom: "Tiros 1–3 rápidos demais cobraram o preço: FC estourou do tiro 6 em diante".
- Até 3 highlights e 3 issues: só o que muda a decisão do próximo treino. Sem floreio, sem
  hedging.
- next_workout_suggestion: uma ou duas frases acionáveis. Se <upcoming_plan> existe, ajuste o
  treino já planejado (mantenha, encurte, mude alvo) em vez de inventar um novo; se não,
  sugira com base no padrão das últimas semanas.

TITLE — a short pt-BR title describing what was actually run; it becomes the activity's name,
so keep it to 28 characters, with no date, location or fluff. Patterns:
- interval: "10x400m @4:26" (average rep pace, not whole-run pace)
- tempo:    "Tempo 4km @4:38"
- easy:     "Fácil 8km" · regen: "Regen 4km" · long: "Longão 15km"
- mixed:    "8km fácil + 4x100m"
- race:     "Prova 10k 42:30"
If execution diverged from the plan, the title reflects execution (planned 12x400 but ran 10 -> "10x400m ...").`;

/** What the model returns; totals and section numbers are added in code. */
export type ModelAnalysis = {
  type: "interval" | "tempo" | "long" | "easy" | "regen" | "race" | "fartlek";
  title: string;
  prescription?: {
    reps?: number;
    rep_distance_m?: number;
    recovery_seconds?: number;
    target_pace_min_per_km?: { min?: string; max?: string };
    notes?: string;
  };
  sections: Array<{
    kind: "warmup" | "rep" | "recovery" | "tempo" | "cooldown";
    index?: number;
    lap?: number;
    start_km: number;
    end_km: number;
  }>;
  analysis: {
    pattern?:
      | "consistent"
      | "positive_split"
      | "negative_split"
      | "fade"
      | "fast_start_stabilize"
      | "irregular";
    hr_drift_bpm?: number;
    target_hit?: boolean;
    rpe_estimate?: number;
    highlights?: string[];
    issues?: string[];
    next_workout_suggestion?: string;
  };
};

/** JSON schema for structured outputs; every object is closed, as the API requires. */
export const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["type", "title", "sections", "analysis"],
  properties: {
    type: {
      type: "string",
      enum: ["interval", "tempo", "long", "easy", "regen", "race", "fartlek"],
    },
    title: {
      type: "string",
      description:
        "Short pt-BR activity title reflecting actual execution, up to 28 chars, e.g. '10x400m @4:26'",
    },
    prescription: {
      type: "object",
      additionalProperties: false,
      description: "What the plan said to do; echo what was given.",
      properties: {
        reps: { type: "integer" },
        rep_distance_m: { type: "number" },
        recovery_seconds: { type: "number" },
        target_pace_min_per_km: {
          type: "object",
          additionalProperties: false,
          description: "Target pace band as m:ss strings; min is the faster bound.",
          properties: {
            min: { type: "string" },
            max: { type: "string" },
          },
        },
        notes: { type: "string" },
      },
    },
    sections: {
      type: "array",
      description:
        "Boundaries of the phases in order: warmup, reps/recoveries or the tempo block, cooldown. Empty for easy/long/regen runs without strides.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "start_km", "end_km"],
        properties: {
          kind: {
            type: "string",
            enum: ["warmup", "rep", "recovery", "tempo", "cooldown"],
          },
          index: { type: "integer", description: "1-based within its kind" },
          lap: {
            type: "integer",
            description: "The device lap number (#) this section is, when it is exactly one lap",
          },
          start_km: { type: "number" },
          end_km: { type: "number" },
        },
      },
    },
    analysis: {
      type: "object",
      additionalProperties: false,
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
        rpe_estimate: { type: "integer", description: "1-10" },
        highlights: { type: "array", items: { type: "string" } },
        issues: { type: "array", items: { type: "string" } },
        next_workout_suggestion: { type: "string" },
      },
    },
  },
} as const;
