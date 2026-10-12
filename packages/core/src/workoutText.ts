import type {
  Duration,
  StepSpec,
  StructuredWorkout,
  WorkoutElement,
} from "./workoutTypes.ts";

// Plain-text views of a structured workout, shared by the web, the MCP tools
// and the analysis prompt. No I/O, so the web bundle can import it.

const pace = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

function durationText(d: Duration): string {
  switch (d.kind) {
    case "distance":
      return d.meters >= 1000 && d.meters % 100 === 0
        ? `${(d.meters / 1000).toLocaleString("pt-BR")} km`
        : `${d.meters} m`;
    case "time":
      return d.seconds >= 60 && d.seconds % 60 === 0
        ? `${d.seconds / 60} min`
        : d.seconds > 60
          ? `${Math.floor(d.seconds / 60)}min${String(d.seconds % 60).padStart(2, "0")}`
          : `${d.seconds} s`;
    case "lap":
      return "até apertar lap";
  }
}

function targetText(s: StepSpec): string {
  if (s.paceFastSec && s.paceSlowSec)
    return ` @ ${pace(Math.min(s.paceFastSec, s.paceSlowSec))}–${pace(Math.max(s.paceFastSec, s.paceSlowSec))}/km`;
  if (s.paceTargetSec) return ` @ ${pace(s.paceTargetSec)}/km`;
  if (s.hrLowBpm && s.hrHighBpm) return ` @ ${s.hrLowBpm}–${s.hrHighBpm} bpm`;
  if (s.hrZone) return ` @ Z${s.hrZone}`;
  return "";
}

const KIND_LABEL: Record<StepSpec["kind"], string> = {
  warmup: "Aquec.",
  run: "",
  recovery: "",
  cooldown: "Desaq.",
  rest: "parado",
};

function stepText(s: StepSpec): string {
  const base = `${durationText(s.duration)}${targetText(s)}`;
  switch (s.kind) {
    case "warmup":
    case "cooldown":
      return `${KIND_LABEL[s.kind]} ${base}`;
    case "recovery":
      return `${base} trote`;
    case "rest":
      return `${base} parado`;
    case "run":
      return base;
  }
}

function elementText(el: WorkoutElement): string | undefined {
  if (el.repeat && el.steps?.length) {
    const inner = el.steps.map(stepText).join(" + ");
    return el.steps.length > 1
      ? `${el.repeat}× (${inner})`
      : `${el.repeat}× ${inner}`;
  }
  if (el.kind && el.duration) return stepText(el as StepSpec);
  return undefined;
}

/** One line, e.g. "Aquec. 2 km · 6× (1000 m @ 4:30–4:45/km + 90 s trote) · Desaq. 1 km". */
export function describeWorkout(w: StructuredWorkout): string {
  return w.elements
    .map(elementText)
    .filter((t): t is string => !!t)
    .join(" · ");
}

/** Total distance in metres when every step is distance-based, else undefined. */
export function workoutDistance(w: StructuredWorkout): number | undefined {
  let total = 0;
  for (const el of w.elements) {
    const steps =
      el.repeat && el.steps?.length
        ? el.steps
        : el.kind && el.duration
          ? [el as StepSpec]
          : [];
    const times = el.repeat && el.steps?.length ? el.repeat : 1;
    for (const s of steps) {
      if (s.duration.kind !== "distance") return undefined;
      // The trailing recovery after the last rep is skipped on the watch.
      const reps =
        el.repeat && (s.kind === "recovery" || s.kind === "rest") && s === steps[steps.length - 1]
          ? times - 1
          : times;
      total += s.duration.meters * reps;
    }
  }
  return total > 0 ? total : undefined;
}
