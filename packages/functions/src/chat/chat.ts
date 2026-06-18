import type Anthropic from "@anthropic-ai/sdk";
import { Resource } from "sst";
import { listActivities, type Activity } from "@run/core/activity";
import { runTool, tools } from "./tools.ts";
import SYSTEM from "./prompt.md";

type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatRequest = { messages: ChatMessage[] };

const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ROUNDS = 12;

function summarizeActivity(a: Activity) {
  const km = (a.distance / 1000).toFixed(2);
  const paceSecPerKm = a.movingTime / (a.distance / 1000);
  const min = Math.floor(paceSecPerKm / 60);
  const sec = Math.round(paceSecPerKm % 60).toString().padStart(2, "0");
  return [
    a.startDate.slice(0, 10),
    `${km}km`,
    `${Math.round(a.movingTime / 60)}min`,
    `${min}:${sec}/km`,
    a.avgHr ? `${Math.round(a.avgHr)}bpm` : "",
    `+${Math.round(a.elevationGain)}m`,
    a.name,
  ].filter(Boolean).join(" | ");
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

// Streams the coach reply to `write`. Auth, the HTTP stream, and the
// CloudFront keep-alive heartbeat are handled by the /chat route in api.ts.
// Anthropic is imported lazily so it lands in its own esbuild chunk and never
// loads on the cold-start path of the non-chat routes.
export async function runChat(
  body: string,
  write: (chunk: string) => Promise<unknown>,
): Promise<void> {
  const { messages } = JSON.parse(body) as ChatRequest;
  const { default: AnthropicClient } = await import("@anthropic-ai/sdk");

  const activities = await listActivities({ limit: 200 });
  const activityContext = activities.map(summarizeActivity).join("\n");
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ...
  const daysToMonday = dayOfWeek === 1 ? 0 : (8 - dayOfWeek) % 7;
  const nextMonday = new Date(now);
  nextMonday.setUTCDate(now.getUTCDate() + daysToMonday);
  const nextMondayStr = nextMonday.toISOString().slice(0, 10);
  const weekdayName = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    timeZone: "UTC",
  });

  const client = new AnthropicClient({ apiKey: Resource.AnthropicApiKey.value });

  const conversation: Array<{
    role: "user" | "assistant";
    content: string | ContentBlock[];
  }> = messages.map((m) => ({ role: m.role, content: m.content }));

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const llmStream = client.messages.stream({
        model: MODEL,
        max_tokens: 16384,
        tools: tools as unknown as Anthropic.Tool[],
        system: [
          { type: "text", text: SYSTEM },
          {
            type: "text",
            text:
              `<context>\n` +
              `Today: ${today} (${weekdayName}, UTC)\n` +
              `Plan-week-1 Monday: ${nextMondayStr}\n` +
              `</context>`,
          },
          {
            type: "text",
            text: `<activities>\n${activityContext}\n</activities>`,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: conversation as Anthropic.MessageParam[],
      });

      for await (const ev of llmStream) {
        if (
          ev.type === "content_block_delta" &&
          ev.delta.type === "text_delta"
        ) {
          await write(ev.delta.text);
        }
      }

      const final = await llmStream.finalMessage();
      conversation.push({
        role: "assistant",
        content: final.content as ContentBlock[],
      });

      const toolUseBlocks = final.content.filter(
        (b) => b.type === "tool_use",
      );

      // No tool calls: stop unless we hit max_tokens, in which case ask Claude
      // to continue with a fresh round.
      if (toolUseBlocks.length === 0) {
        if (final.stop_reason === "max_tokens") {
          await write(`\n[continuando…]\n`);
          conversation.push({ role: "user", content: "Continue." });
          continue;
        }
        break;
      }
      await write(
        `\n[${toolUseBlocks.length} ${toolUseBlocks.length === 1 ? "chamada" : "chamadas"} de ferramenta]\n`,
      );
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          if (block.type !== "tool_use") return null;
          try {
            const result = await runTool(
              block.name,
              block.input as Record<string, unknown>,
            );
            await write(`  ✓ ${block.name}\n`);
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: JSON.stringify(result),
            };
          } catch (err) {
            await write(
              `  ✗ ${block.name}: ${(err as Error).message}\n`,
            );
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: `error: ${(err as Error).message}`,
            };
          }
        }),
      );
      const validResults: ContentBlock[] = [];
      for (const r of toolResults) if (r) validResults.push(r);
      conversation.push({ role: "user", content: validResults });
    }
  } catch (err) {
    await write(`\n\n[erro: ${(err as Error).message}]`);
  }
}
