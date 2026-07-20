import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { Resource } from "sst";

const sqs = new SQSClient({});

/**
 * Queue a freshly synced run for automatic AI analysis (consumed by
 * activities/analyze-worker.ts). Best-effort: a queue failure must never fail
 * the sync/webhook that imported the run, so errors are logged and swallowed.
 */
export async function enqueueAnalysis(
  source: string,
  externalId: string,
): Promise<void> {
  try {
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: Resource.AnalyzeQueue.url,
        MessageBody: JSON.stringify({ source, externalId }),
      }),
    );
  } catch (err) {
    console.error(
      `enqueue analysis ${source}/${externalId} failed: ${(err as Error).message}`,
    );
  }
}
