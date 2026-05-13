import { useEffect, useState } from "react";
import Activities from "./components/Activities.tsx";
import Calendar from "./components/Calendar.tsx";
import Chat from "./components/Chat.tsx";
import Logo from "./components/Logo.tsx";
import Plan from "./components/Plan.tsx";
import {
  clearWriteToken,
  getWriteToken,
  setWriteToken,
  verifyWriteToken,
} from "./lib/api.ts";

type Tab = "calendar" | "activities" | "plan" | "chat";

const TAB_LABELS: Record<Tab, string> = {
  calendar: "Calendário",
  activities: "Corridas",
  plan: "Plano",
  chat: "Treinador",
};

const PUBLIC_TABS: Tab[] = ["calendar", "activities", "plan"];
const PRIVATE_TABS: Tab[] = ["chat"];

export default function App() {
  const [tab, setTab] = useState<Tab>("calendar");
  const [unlocked, setUnlocked] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);

  useEffect(() => {
    const t = getWriteToken();
    if (!t) return;
    void verifyWriteToken(t).then((ok) => {
      if (ok) setUnlocked(true);
      else clearWriteToken();
    });
  }, []);

  const tabs = unlocked ? [...PUBLIC_TABS, ...PRIVATE_TABS] : PUBLIC_TABS;
  const activeTab = tabs.includes(tab) ? tab : "calendar";

  function lock() {
    clearWriteToken();
    setUnlocked(false);
    if (!PUBLIC_TABS.includes(tab)) setTab("calendar");
  }

  return (
    <div className="min-h-full bg-paper text-ink">
      <header className="border-b-2 border-ink">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-end justify-between gap-4">
          <a href="/" className="flex items-end gap-3 text-ink">
            <Logo className="h-7 w-auto" />
            <span className="text-xs uppercase tracking-[0.2em] pb-[3px] text-ink/60">
              treinador
            </span>
          </a>
          <div className="flex items-center gap-3">
            <nav className="flex gap-1 text-xs uppercase tracking-[0.15em] font-medium">
              {tabs.map((t) => (
                <TabBtn
                  key={t}
                  active={activeTab === t}
                  onClick={() => setTab(t)}
                >
                  {TAB_LABELS[t]}
                </TabBtn>
              ))}
            </nav>
            {unlocked ? (
              <button
                onClick={lock}
                title="Trancar (limpa senha)"
                className="text-[10px] uppercase tracking-[0.2em] font-medium text-ink/50 hover:text-ink"
              >
                trancar
              </button>
            ) : (
              <button
                onClick={() => setUnlockOpen(true)}
                title="Destrancar ações de escrita"
                className="text-[10px] uppercase tracking-[0.2em] font-medium border-2 border-ink px-3 py-1 hover:bg-ink hover:text-paper"
              >
                destrancar
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-10">
        {activeTab === "calendar" && <Calendar />}
        {activeTab === "activities" && <Activities unlocked={unlocked} />}
        {activeTab === "plan" && <Plan unlocked={unlocked} />}
        {activeTab === "chat" && unlocked && <Chat />}
      </main>
      {unlockOpen && (
        <UnlockDialog
          onClose={() => setUnlockOpen(false)}
          onSuccess={() => {
            setUnlocked(true);
            setUnlockOpen(false);
          }}
        />
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? "px-3 py-2 bg-ink text-paper"
          : "px-3 py-2 text-ink/60 hover:text-ink"
      }
    >
      {children}
    </button>
  );
}

function UnlockDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const ok = await verifyWriteToken(pw);
      if (!ok) {
        setError("senha incorreta");
        setSubmitting(false);
        return;
      }
      setWriteToken(pw);
      onSuccess();
    } catch (err) {
      setError(String(err));
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-ink/40 flex items-center justify-center p-6 z-50"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-paper border-2 border-ink w-full max-w-sm p-6 flex flex-col gap-4"
      >
        <div className="text-xs uppercase tracking-[0.2em] text-ink/60">
          Destrancar
        </div>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="senha"
          className="border-2 border-ink px-3 py-2 font-mono text-sm bg-paper outline-none"
          disabled={submitting}
        />
        {error && (
          <p className="font-mono text-xs text-red-700">{error}</p>
        )}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-xs uppercase tracking-[0.2em] font-medium px-3 py-2 text-ink/60 hover:text-ink"
          >
            cancelar
          </button>
          <button
            type="submit"
            disabled={!pw || submitting}
            className="text-xs uppercase tracking-[0.2em] font-medium bg-ink text-paper px-4 py-2 disabled:opacity-40"
          >
            {submitting ? "verificando…" : "entrar"}
          </button>
        </div>
      </form>
    </div>
  );
}
