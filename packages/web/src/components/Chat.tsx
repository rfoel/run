import { useState } from "react";
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
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 min-h-[40vh]">
        {messages.length === 0 && (
          <div className="border-2 border-ink p-6 bg-paper-2">
            <div className="text-xs uppercase tracking-[0.2em] text-ink/60 mb-2">
              Pergunte ao treinador
            </div>
            <p className="font-mono text-sm">
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
        className="flex gap-0 border-2 border-ink sticky bottom-4 bg-paper"
      >
        <input
          className="flex-1 bg-transparent px-4 py-3 outline-none font-mono text-sm placeholder:text-ink/40"
          placeholder="pergunte…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={streaming}
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="bg-ink text-paper px-6 py-3 text-xs uppercase tracking-[0.2em] font-medium disabled:opacity-30"
        >
          Enviar
        </button>
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
  children: React.ReactNode;
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
    <div className="self-start max-w-[85%] border-2 border-ink px-4 py-3 font-mono text-sm whitespace-pre-wrap">
      {empty && streaming ? (
        <span className="text-ink/50">pensando…</span>
      ) : (
        <>
          {children}
          {streaming && <span className="inline-block w-2 h-4 bg-ink ml-1 align-middle animate-pulse" />}
        </>
      )}
    </div>
  );
}
