import type Anthropic from "@anthropic-ai/sdk";
import { Resource } from "sst";
import type { PlannedRun } from "@run/core/plan";
import type { StructuredWorkout } from "@run/core/garmin";

/**
 * Intermediate "interpreter" prompt: turn a PlannedRun's free-text prescription
 * (type + distance + pace + notes) into a StructuredWorkout — warmup, repeat
 * blocks, recoveries, cooldown — so it pushes to Garmin as real structured steps
 * instead of one flat run. The model is forced to call emit_workout, so the
 * return value is a validated StructuredWorkout (or null if it didn't comply).
 */

const MODEL = "claude-sonnet-4-6";

const SYSTEM = `Você converte a prescrição de um treino de corrida em uma estrutura de passos para um relógio Garmin.

Recebe um <treino> com: tipo, distância total (metros), duração (segundos), pace alvo (seg/km) e notas em português (a prescrição real, ex.: "5x1000m em 4:30–4:45/km com 2min de trote. Aquecimento 1km + desaquecimento 1km").

Sua saída (via a tool emit_workout) é uma lista ORDENADA de "elements". Cada element é:
- um PASSO único: { kind, duration, ...pace, notes? }
- ou um BLOCO DE REPETIÇÃO: { repeat: N, steps: [ ...passos ] }

kind ∈ warmup | run | recovery | cooldown | rest:
- warmup = aquecimento; cooldown = desaquecimento; run = esforço/tiro/bloco principal;
  recovery = trote/caminhada de recuperação entre tiros; rest = parado.

duration: { kind: "distance", meters } | { kind: "time", seconds } | { kind: "lap" }.
- "1km"/"1000m" → distance 1000.  "2min" → time 120.  "press lap" / indefinido → lap.

PACE (sempre seg/km):
- Faixa explícita "4:30–4:45/km" → paceFastSec=270 (o menor/mais rápido), paceSlowSec=285 (o maior/mais lento).
- Pace único "ritmo de 4:30" → paceTargetSec=270.
- Aquecimento, desaquecimento e recovery normalmente SEM pace (deixe os campos de pace vazios), a menos que a prescrição dê um ritmo.
- Se as notas não derem pace para o esforço principal, use o pace alvo do <treino>.

REGRAS:
- "5x1000m ... com 2min de trote" → um bloco { repeat: 5, steps: [ {run 1000m + pace}, {recovery time 120s} ] }. NÃO repita manualmente; use repeat. O trote vai DENTRO do bloco (o sistema já remove o último trote sobrando).
- Aquecimento, se mencionado, é o PRIMEIRO element; desaquecimento é o ÚLTIMO.
- Treino sem estrutura (easy/long/tempo contínuo): devolva UM único passo run com a distância (ou duração) total e o pace alvo. Para tempo com aquecimento/desaquecimento, separe em warmup + run + cooldown.
- Não invente distâncias: respeite o que a prescrição diz. A soma das partes deve bater aproximadamente com a distância total quando ela existir.
- notes por passo: curtíssimas, em pt-BR, só se agregam (ex.: "forte", "trote"). Pode omitir.

name: título curto pro relógio (ex.: "Tiros 5x1000m"). description: a prescrição em uma linha.`;

const DURATION_SCHEMA = {
  type: "object",
  required: ["kind"],
  properties: {
    kind: { type: "string", enum: ["distance", "time", "lap"] },
    meters: { type: "number", description: "quando kind=distance" },
    seconds: { type: "number", description: "quando kind=time" },
  },
} as const;

const STEP_PROPS = {
  kind: {
    type: "string",
    enum: ["warmup", "run", "recovery", "cooldown", "rest"],
  },
  duration: DURATION_SCHEMA,
  paceTargetSec: { type: "number", description: "pace único, seg/km" },
  paceFastSec: { type: "number", description: "bound mais rápido, seg/km" },
  paceSlowSec: { type: "number", description: "bound mais lento, seg/km" },
  notes: { type: "string" },
} as const;

const WORKOUT_TOOL = {
  name: "emit_workout",
  description: "Emite o treino estruturado.",
  input_schema: {
    type: "object",
    required: ["name", "elements"],
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      elements: {
        type: "array",
        description:
          "Sequência ordenada. Cada item é um passo único (kind+duration) OU um bloco de repetição (repeat+steps).",
        items: {
          type: "object",
          properties: {
            ...STEP_PROPS,
            repeat: {
              type: "integer",
              description: "nº de repetições do bloco (>=2)",
            },
            steps: {
              type: "array",
              description: "passos repetidos pelo bloco",
              items: {
                type: "object",
                required: ["kind", "duration"],
                properties: STEP_PROPS,
              },
            },
          },
        },
      },
    },
  },
} as const;

function userMessage(plan: PlannedRun): string {
  const lines = [
    `tipo: ${plan.type}`,
    plan.distance ? `distância_total_m: ${plan.distance}` : null,
    plan.durationSec ? `duração_s: ${plan.durationSec}` : null,
    plan.paceTargetSec ? `pace_alvo_s_por_km: ${plan.paceTargetSec}` : null,
    `notas: ${plan.notes ?? "(sem notas)"}`,
  ].filter(Boolean);
  return `<treino>\n${lines.join("\n")}\n</treino>`;
}

/**
 * Interpret a plan into a StructuredWorkout. Returns null on any failure (no
 * tool call, API error) so the caller can fall back to the flat single step.
 */
export async function interpretWorkout(
  plan: PlannedRun,
): Promise<StructuredWorkout | null> {
  const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
  const client = new AnthropicClient({
    apiKey: Resource.AnthropicApiKey.value,
    // Local scripts hit a node-fetch@2 "Premature close" bug; the global
    // (undici) fetch avoids it. Lambda is unaffected, so only opt in via env.
    ...(process.env.INTERPRET_GLOBAL_FETCH
      ? { fetch: globalThis.fetch as unknown as typeof fetch }
      : {}),
  });
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM,
      tools: [WORKOUT_TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: "emit_workout" },
      messages: [{ role: "user", content: userMessage(plan) }],
    });
    const toolUse = msg.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return null;
    const sw = toolUse.input as StructuredWorkout;
    if (!sw || !Array.isArray(sw.elements) || sw.elements.length === 0)
      return null;
    return sw;
  } catch (e) {
    if (process.env.INTERPRET_DEBUG) console.error("interpretWorkout:", e);
    return null;
  }
}
