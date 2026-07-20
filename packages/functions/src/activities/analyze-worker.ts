import type { SQSEvent } from "aws-lambda";
import { getAnalysis } from "@run/core/workout";
import { analyzeActivity } from "./analyze.ts";

// SQS consumer that auto-analyzes freshly synced runs. Messages are enqueued
// by the /garmin/sync route (see api.ts). Failures are logged and dropped —
// the web's "analisar" button remains the manual fallback, and retrying an
// LLM call forever would only burn tokens.
type AnalyzeMessage = { source: string; externalId: string };

export async function handler(event: SQSEvent) {
  for (const record of event.Records) {
    const { source, externalId } = JSON.parse(record.body) as AnalyzeMessage;
    try {
      // Idempotent: re-syncs re-enqueue the same run; keep the existing
      // analysis instead of paying for a new one.
      const existing = await getAnalysis(source, externalId);
      if (existing) {
        console.log(`skip ${source}/${externalId}: already analyzed`);
        continue;
      }
      const analysis = await analyzeActivity(source, externalId);
      console.log(
        `analyzed ${source}/${externalId}: ${analysis.type} ${analysis.subtype ?? ""}`,
      );
    } catch (err) {
      console.error(
        `analyze ${source}/${externalId} failed: ${(err as Error).message}`,
      );
    }
  }
}
