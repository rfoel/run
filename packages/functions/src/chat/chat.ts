import Anthropic from "@anthropic-ai/sdk";
import { Resource } from "sst";
import { listActivities, type Activity } from "@run/core/activity";
import { runTool, tools } from "./tools.ts";

type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatRequest = { messages: ChatMessage[] };

const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ROUNDS = 12;

const SYSTEM = `You are a running coach with full access to the athlete's Strava history and their training plan.

LANGUAGE:
- Always reply in Brazilian Portuguese (pt-BR). The athlete is Brazilian.
- Write planned-run \`notes\` in Portuguese too (e.g. "6x800m em ritmo de 5k com 90s trote", "longão fácil, manter zona 2", "tiros curtos com recuperação completa").
- Keep tool names, enum values (easy/long/tempo/interval/race/recovery), and dates in their original format.
- Use Brazilian running terms: "tiro" (interval), "longão" (long run), "regenerativo" (recovery), "rodagem" / "leve" (easy), "tempo" (tempo).

Always reason from the data in <activities>. Cite specific runs by date when relevant.
Distances in meters, durations in seconds — convert to km / min:sec for output.
Be concrete: pace targets, weekly volume, workout types. No fluff.

When the athlete asks for a plan, an upcoming workout, or any change to their schedule,
use the planning tools to actually create / update planned runs — don't just describe them in text.

PLAN STRUCTURE RULES:
- A "week" is Monday through Sunday in the athlete's calendar.
- Week 1 of any new plan starts on the Monday given in <context> (next Monday from today,
  or today if today is Monday). Do NOT start the plan mid-week.
- Each W# block stays inside a single Mon–Sun window.
- For race-targeted plans, count weeks backwards from race day so the final week is the taper.

RESTART:
- When the athlete asks to delete their plan and start over, call clear_all_planned_runs
  ONCE before creating any new planned runs.

EDITING EXISTING PLANS:
- If the athlete asks to change a workout (type, distance, pace, notes) — call
  update_planned_run with the existing plan id.
- If the athlete asks to move a workout to a different day — call move_planned_run.
- If the athlete asks "what's on tomorrow / this week / etc" — call list_planned_runs.
- Always list_planned_runs first when you need an id, dates, or to confirm what exists.

SYNCING WITH HISTORY:
- After creating plans whose dates overlap days the athlete has already run,
  call link_past_activities once to snapshot the existing Strava runs onto
  those plans.`;

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

export const handler = awslambda.streamifyResponse(async (event, stream) => {
  const body = (event as { body?: string }).body;
  if (!body) {
    stream.write("missing body");
    stream.end();
    return;
  }
  const { messages } = JSON.parse(body) as ChatRequest;

  const responseStream = awslambda.HttpResponseStream.from(stream, {
    statusCode: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });

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

  const client = new Anthropic({ apiKey: Resource.AnthropicApiKey.value });

  const conversation: Array<{
    role: "user" | "assistant";
    content: string | ContentBlock[];
  }> = messages.map((m) => ({ role: m.role, content: m.content }));

  // Keep-alive: CloudFront drops the origin connection after ~55s of silence.
  // Write a zero-width space periodically so something is always flowing.
  const heartbeat = setInterval(() => {
    try {
      responseStream.write("​");
    } catch {
      // stream closed
    }
  }, 8000);

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
          responseStream.write(ev.delta.text);
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
          responseStream.write(`\n[continuando…]\n`);
          conversation.push({ role: "user", content: "Continue." });
          continue;
        }
        break;
      }
      responseStream.write(
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
            responseStream.write(`  ✓ ${block.name}\n`);
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: JSON.stringify(result),
            };
          } catch (err) {
            responseStream.write(
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
    responseStream.write(`\n\n[erro: ${(err as Error).message}]`);
  } finally {
    clearInterval(heartbeat);
    responseStream.end();
  }
});
