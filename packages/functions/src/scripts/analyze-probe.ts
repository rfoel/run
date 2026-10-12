import { mkdirSync, writeFileSync } from "node:fs";
import { Resource } from "sst";
import { buildAnalysisRequest, parseAnalysis } from "../activities/analyze.ts";

/**
 * Diagnostic: run the exact /analyze request for one or more runs WITHOUT
 * persisting, print each response's stop reason and token usage, and — with
 * --out <dir> — write the model's raw output and the finished analysis per
 * run, so two prompt versions can be compared on the same runs.
 *
 *   sst shell --stage production -- node packages/functions/src/scripts/analyze-probe.ts \
 *     [--out /tmp/probe-before] [--effort low] garmin:<activityId> [garmin:<activityId> ...]
 */

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const outDir = outAt >= 0 ? args.splice(outAt, 2)[1] : undefined;
// --effort <low|medium|high>: try adaptive thinking instead of thinking off.
const effortAt = args.indexOf("--effort");
const effort = effortAt >= 0 ? args.splice(effortAt, 2)[1] : undefined;
const runs = (args.length ? args : ["garmin:23618280127"]).map((r) => {
  const [source, externalId] = r.includes(":") ? r.split(":") : ["garmin", r];
  return { source: source!, externalId: externalId! };
});
if (outDir) mkdirSync(outDir, { recursive: true });

const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
const client = new AnthropicClient({ apiKey: Resource.AnthropicApiKey.value });

for (const { source, externalId } of runs) {
  const { request, ...ctx } = await buildAnalysisRequest(source, externalId);
  if (effort) {
    request.thinking = { type: "adaptive" };
    request.output_config = { ...request.output_config, effort: effort as "low" };
  }
  const started = Date.now();
  const msg = await client.messages.create(request);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `${source}/${externalId}: stop=${msg.stop_reason} ${seconds}s usage=${JSON.stringify(msg.usage)}`,
  );
  // Whatever the model returned — a tool call's input or a JSON text block.
  const output = msg.content.map((b) =>
    b.type === "tool_use" ? b.input : b.type === "text" ? b.text : { type: b.type },
  );
  // The stored shape: the model's output plus the numbers computed in code.
  let analysis: unknown;
  try {
    analysis = parseAnalysis(msg, ctx);
  } catch (e) {
    analysis = { error: (e as Error).message };
  }
  if (outDir) {
    writeFileSync(
      `${outDir}/${externalId}.json`,
      JSON.stringify({ usage: msg.usage, stop_reason: msg.stop_reason, output, analysis }, null, 2),
    );
  }
}
