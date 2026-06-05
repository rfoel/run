import {
  PaperPlaneRightIcon,
  SparkleIcon,
  StopIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { chatStream, type ChatMessage } from "../lib/api.ts";

const STORAGE_KEY = "run.chat.history";
const MAX_TEXTAREA_PX = 200;

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function Chat() {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollAnchor = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Whether the viewport is near the bottom. Auto-scroll only follows new
  // content when true, so scrolling up to read isn't yanked back down.
  const atBottomRef = useRef(true);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // ignore quota
    }
  }, [messages]);

  useEffect(() => {
    if (!atBottomRef.current) return;
    scrollAnchor.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

  // Track how close the window is to the bottom of the page.
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const dist = doc.scrollHeight - window.scrollY - window.innerHeight;
      atBottomRef.current = dist < 120;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [input]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    // Sending always pins to the bottom so the new exchange is visible.
    atBottomRef.current = true;
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let acc = "";
    try {
      await chatStream(
        next,
        (chunk) => {
          acc += chunk;
          setMessages([...next, { role: "assistant", content: acc }]);
        },
        ctrl.signal,
      );
    } catch (e) {
      const aborted = ctrl.signal.aborted;
      const suffix = aborted ? "\n\n[interrompido]" : `\n\n[erro: ${String(e)}]`;
      setMessages([...next, { role: "assistant", content: acc + suffix }]);
    } finally {
      abortRef.current = null;
      setStreaming(false);
      // The coach may have created/edited planned runs (and linked past
      // activities) via tools. Refresh those views so Calendar/Plan aren't stale.
      void queryClient.invalidateQueries({ queryKey: ["plans"] });
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
    }
  }

  function abort() {
    abortRef.current?.abort();
  }

  function clear() {
    if (streaming) return;
    setMessages([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <section className="flex flex-col gap-4 sm:gap-6 pb-32">
      {messages.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={clear}
            disabled={streaming}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-medium text-ink/50 hover:text-ink disabled:opacity-30"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            <span>limpar</span>
          </button>
        </div>
      )}
      <div className="flex flex-col gap-3 min-h-[40vh]">
        {messages.length === 0 && (
          <div className="border border-line rounded-lg p-4 sm:p-6 bg-paper-2">
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
          <Bubble
            key={i}
            role={m.role}
            streaming={
              streaming && i === messages.length - 1 && m.role === "assistant"
            }
          >
            {m.content}
          </Bubble>
        ))}
        <div ref={scrollAnchor} className="scroll-mb-32" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-line"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-end border border-line rounded-lg bg-card">
            <textarea
              ref={textareaRef}
              rows={1}
              className="flex-1 min-w-0 bg-transparent px-3 sm:px-4 py-3 outline-none font-mono text-sm placeholder:text-ink/40 resize-none leading-relaxed"
              placeholder="pergunte… (Shift+Enter quebra linha)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={streaming}
            />
            {streaming ? (
              <button
                type="button"
                onClick={abort}
                aria-label="Parar"
                className="bg-accent text-white px-3 sm:px-6 py-3 text-xs uppercase tracking-[0.2em] font-medium flex items-center gap-2 shrink-0 self-stretch"
              >
                <span className="hidden sm:inline">Parar</span>
                <StopIcon className="h-4 w-4" weight="fill" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Enviar"
                className="bg-accent text-white px-3 sm:px-6 py-3 text-xs uppercase tracking-[0.2em] font-medium disabled:opacity-30 flex items-center gap-2 shrink-0 self-stretch"
              >
                <span className="hidden sm:inline">Enviar</span>
                <PaperPlaneRightIcon className="h-4 w-4" />
              </button>
            )}
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
      <div className="self-end max-w-[80%] bg-accent text-white px-4 py-3 rounded-lg rounded-br-md font-mono text-sm whitespace-pre-wrap shadow-sm">
        {children}
      </div>
    );
  }
  const empty = !children;
  return (
    <div className="self-start max-w-[85%] bg-card border border-line rounded-lg rounded-bl-md px-4 py-3 text-sm shadow-sm">
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
            <code className="font-mono text-xs bg-paper-2 border border-line/20 px-1 py-0.5">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="font-mono text-xs bg-paper-2 border border-line rounded-lg p-2 overflow-x-auto mb-2 last:mb-0">
              {children}
            </pre>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="underline hover:text-ink/70">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-accent pl-3 italic text-ink/80 mb-2 last:mb-0">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-line my-3" />,
          table: ({ children }) => (
            <div className="overflow-x-auto mb-2 last:mb-0">
              <table className="border border-line rounded-lg font-mono text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-line px-2 py-1 text-left">{children}</th>,
          td: ({ children }) => <td className="border border-line/40 px-2 py-1">{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
