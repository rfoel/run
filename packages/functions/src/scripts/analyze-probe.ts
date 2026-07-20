import { Resource } from "sst";
import { buildAnalysisRequest } from "../activities/analyze.ts";

/**
 * Diagnostic: run the exact /analyze request and dump the raw response shape
 * (stop_reason, block types, tool-input keys, usage) WITHOUT persisting.
 *
 *   sst shell --stage production -- node packages/functions/src/scripts/analyze-probe.ts garmin <activityId>
 */

const source = process.argv[2] ?? "garmin";
const externalId = process.argv[3] ?? "23618280127";

const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
const { request } = await buildAnalysisRequest(source, externalId);
const client = new AnthropicClient({ apiKey: Resource.AnthropicApiKey.value });
const msg = await client.messages.create(request);

console.log("stop_reason:", msg.stop_reason);
console.log("usage:", JSON.stringify(msg.usage));
console.log("blocks:", msg.content.map((b) => b.type).join(", "));
for (const b of msg.content) {
  if (b.type === "text") {
    console.log(`text block (${b.text.length} chars):`, b.text.slice(0, 300));
  } else if (b.type === "tool_use") {
    const input = b.input as Record<string, unknown>;
    console.log("tool_use name:", b.name);
    console.log("input keys:", Object.keys(input).join(", "));
    console.log(
      "sections:",
      Array.isArray(input.sections) ? `array[${(input.sections as unknown[]).length}]` : typeof input.sections,
      "| totals:",
      typeof input.totals,
    );
    console.log("input preview:", JSON.stringify(input).slice(0, 800));
  }
}
