import Anthropic from "@anthropic-ai/sdk";
import { Resource } from "sst";
import type { PlannedRun } from "@run/core/plan";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM =
  "Generate short Strava activity titles from running plan notes. " +
  "Keep distance and key workout components (intervals, tempo, easy, strides, etc.). " +
  "Drop verbose pace targets, recovery instructions, parentheticals, and week/phase prefixes. " +
  "Match the input language. No trailing punctuation. " +
  "Reply with only the title — no quotes, no explanation.\n\n" +
  "Example:\n" +
  "Input: Semana 2 — Rodagem com strides: 5km fácil com 4x100m acelerados no final (ritmo 5k, recuperação completa entre cada um).\n" +
  "Output: 5km fácil + 4x100m strides";

export async function generateStravaTitle(
  plan: PlannedRun,
  fallback: string,
): Promise<string> {
  if (!plan.notes || !plan.notes.trim()) return fallback;
  try {
    const client = new Anthropic({ apiKey: Resource.AnthropicApiKey.value });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 64,
      system: SYSTEM,
      messages: [{ role: "user", content: plan.notes.trim() }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return fallback;
    const title = block.text
      .trim()
      .replace(/^["']+|["']+$/g, "")
      .replace(/[\s.…]+$/u, "")
      .trim();
    return title || fallback;
  } catch (e) {
    console.log(`title gen failed: ${(e as Error).message}`);
    return fallback;
  }
}
