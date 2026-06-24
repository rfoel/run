import { interpretWorkout } from "../garmin/interpret.ts";
import { buildStructuredWorkout, type StructuredWorkout } from "@run/core/garmin";
import type { PlannedRun } from "@run/core/plan";

/**
 * Exercise the LLM interpreter on representative prescriptions and print the
 * StructuredWorkout it produces. No Garmin writes.
 *
 *   sst shell --stage production -- node packages/functions/src/scripts/interpret-probe.ts
 */

function plan(p: Partial<PlannedRun>): PlannedRun {
  return {
    id: "x",
    userId: "x",
    date: "2026-06-24",
    type: "easy",
    status: "planned",
    createdAt: "",
    updatedAt: "",
    ...p,
  } as PlannedRun;
}

const CASES: PlannedRun[] = [
  plan({
    type: "interval",
    distance: 7000,
    paceTargetSec: 270,
    notes:
      "Semana 6 — Tiros de 1km: 5x1000m em 4:30–4:45/km com 2min de trote. Aquecimento 1km + desaquecimento 1km. Sessão chave — foco em ritmo consistente.",
  }),
  plan({
    type: "easy",
    distance: 8000,
    paceTargetSec: 360,
    notes: "Corrida leve 8km, ritmo confortável conversável.",
  }),
  plan({
    type: "tempo",
    distance: 10000,
    paceTargetSec: 300,
    notes:
      "Tempo: aquecimento 2km, 6km contínuos a 5:00/km, desaquecimento 2km.",
  }),
  plan({
    type: "interval",
    distance: 9000,
    paceTargetSec: 240,
    notes:
      "8x400m forte (~1:35 cada) com 200m de trote entre. Aquecimento e desaquecimento de 2km.",
  }),
];

async function main() {
  for (const p of CASES) {
    console.log("\n========================================");
    console.log(`[${p.type}] ${p.notes}`);
    const sw = await interpretWorkout(p);
    if (!sw) {
      console.log("  -> null (fallback)");
      continue;
    }
    console.log(summarize(sw));
  }
}

function pace(s?: { paceFastSec?: number; paceSlowSec?: number; paceTargetSec?: number }) {
  if (!s) return "";
  const fmt = (x: number) =>
    `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, "0")}`;
  if (s.paceFastSec && s.paceSlowSec) return ` @ ${fmt(s.paceFastSec)}–${fmt(s.paceSlowSec)}`;
  if (s.paceTargetSec) return ` @ ${fmt(s.paceTargetSec)}`;
  return "";
}

function dur(d?: { kind: string; meters?: number; seconds?: number }) {
  if (!d) return "?";
  if (d.kind === "distance") return `${d.meters}m`;
  if (d.kind === "time") return `${d.seconds}s`;
  return "lap";
}

function summarize(sw: StructuredWorkout): string {
  const out: string[] = [`  name: ${sw.name}`];
  for (const el of sw.elements) {
    if (el.repeat && el.steps) {
      out.push(`  ${el.repeat}x:`);
      for (const s of el.steps)
        out.push(`    - ${s.kind} ${dur(s.duration)}${pace(s)}`);
    } else {
      out.push(`  - ${el.kind} ${dur(el.duration)}${pace(el)}`);
    }
  }
  // Also confirm it builds without throwing.
  buildStructuredWorkout(sw);
  return out.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
