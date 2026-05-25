import { PaperPlaneRightIcon, SparkleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { chatStream, type ChatMessage } from "../lib/api.ts";

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    let acc = "";
    try {
      await chatStream(next, (chunk) => {
        acc += chunk;
        setMessages([...next, { role: "assistant", content: acc }]);
      });
    } catch (e) {
      setMessages([
        ...next,
        { role: "assistant", content: acc + `\n\n[erro: ${String(e)}]` },
      ]);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 sm:gap-6 pb-24">
      <div className="flex flex-col gap-3 min-h-[40vh]">
        {messages.length === 0 && (
          <div className="border-2 border-ink p-4 sm:p-6 bg-paper-2">
            <div className="text-xs uppercase tracking-[0.2em] text-ink/60 mb-2 flex items-center gap-1.5">
              <SparkleIcon className="h-3.5 w-3.5" />
              Pergunte ao treinador
            </div>
            <p className="font-mono text-sm break-words">
              "Monta um plano de 5k abaixo de 20min em 12 semanas."
              <br />
              "Estou treinando demais essa semana?"
              <br />
              "Qual pace ideal pros meus longões?"
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} streaming={streaming && i === messages.length - 1 && m.role === "assistant"}>
            {m.content}
          </Bubble>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="fixed bottom-0 left-0 right-0 z-30 bg-paper border-t-2 border-ink"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex border-2 border-ink bg-paper">
            <input
              className="flex-1 min-w-0 bg-transparent px-3 sm:px-4 py-3 outline-none font-mono text-sm placeholder:text-ink/40"
              placeholder="pergunte…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={streaming}
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              aria-label="Enviar"
              className="bg-ink text-paper px-3 sm:px-6 py-3 text-xs uppercase tracking-[0.2em] font-medium disabled:opacity-30 flex items-center gap-2 shrink-0"
            >
              <span className="hidden sm:inline">Enviar</span>
              <PaperPlaneRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

function Bubble({
  role,
  children,
  streaming,
}: {
  role: "user" | "assistant";
  children: string;
  streaming?: boolean;
}) {
  if (role === "user") {
    return (
      <div className="self-end max-w-[80%] bg-ink text-paper px-4 py-3 font-mono text-sm whitespace-pre-wrap">
        {children}
      </div>
    );
  }
  const empty = !children;
  return (
    <div className="self-start max-w-[85%] border-2 border-ink px-4 py-3 text-sm">
      {empty && streaming ? (
        <span className="font-mono text-ink/50">pensando…</span>
      ) : (
        <>
          <Markdown>{children}</Markdown>
          {streaming && <span className="inline-block w-2 h-4 bg-ink ml-1 align-middle animate-pulse" />}
        </>
      )}
    </div>
  );
}

function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          h1: ({ children }) => <h1 className="text-base font-semibold uppercase tracking-wider mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-semibold uppercase tracking-wider mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => (
            <code className="font-mono text-xs bg-paper-2 border border-ink/20 px-1 py-0.5">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="font-mono text-xs bg-paper-2 border-2 border-ink p-2 overflow-x-auto mb-2 last:mb-0">
              {children}
            </pre>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="underline hover:text-ink/70">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-ink pl-3 italic text-ink/80 mb-2 last:mb-0">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-ink/30 my-3" />,
          table: ({ children }) => (
            <div className="overflow-x-auto mb-2 last:mb-0">
              <table className="border-2 border-ink font-mono text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-ink px-2 py-1 text-left">{children}</th>,
          td: ({ children }) => <td className="border border-ink/40 px-2 py-1">{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
