import { Dialog } from "@base-ui-components/react/dialog";
import { Tabs } from "@base-ui-components/react/tabs";
import {
  CalendarBlankIcon,
  ChatCircleTextIcon,
  ListChecksIcon,
  LockIcon,
  LockOpenIcon,
  PersonSimpleRunIcon,
} from "@phosphor-icons/react";
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

const TAB_META: Record<
  Tab,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  calendar: { label: "Calendário", Icon: CalendarBlankIcon },
  activities: { label: "Corridas", Icon: PersonSimpleRunIcon },
  plan: { label: "Plano", Icon: ListChecksIcon },
  chat: { label: "Treinador", Icon: ChatCircleTextIcon },
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
    <Tabs.Root
      value={activeTab}
      onValueChange={(v) => setTab(v as Tab)}
      className="min-h-full bg-paper text-ink overflow-x-clip"
    >
      <header className="border-b-2 border-ink">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-5 flex items-center sm:items-end justify-between gap-2 sm:gap-4">
          <a href="/" className="flex items-end gap-3 text-ink shrink-0">
            <Logo className="h-6 sm:h-7 w-auto" />
          </a>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Tabs.List className="flex gap-0.5 sm:gap-1 text-xs uppercase tracking-[0.15em] font-medium">
              {tabs.map((t) => {
                const { label, Icon } = TAB_META[t];
                return (
                  <Tabs.Tab
                    key={t}
                    value={t}
                    title={label}
                    aria-label={label}
                    className="px-2 sm:px-3 py-2 flex items-center gap-2 text-ink/60 hover:text-ink data-[selected]:bg-ink data-[selected]:text-paper"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden md:inline">{label}</span>
                  </Tabs.Tab>
                );
              })}
            </Tabs.List>
            {unlocked ? (
              <button
                onClick={lock}
                title="Trancar (limpa senha)"
                aria-label="Trancar"
                className="flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] font-medium text-ink/50 hover:text-ink"
              >
                <LockOpenIcon className="h-4 w-4" />
                <span className="hidden md:inline">trancar</span>
              </button>
            ) : (
              <button
                onClick={() => setUnlockOpen(true)}
                title="Destrancar ações de escrita"
                aria-label="Destrancar"
                className="flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] font-medium border-2 border-ink px-2 sm:px-3 py-1 hover:bg-ink hover:text-paper"
              >
                <LockIcon className="h-4 w-4" />
                <span className="hidden md:inline">destrancar</span>
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <Tabs.Panel value="calendar">
          <Calendar />
        </Tabs.Panel>
        <Tabs.Panel value="activities">
          <Activities unlocked={unlocked} />
        </Tabs.Panel>
        <Tabs.Panel value="plan">
          <Plan unlocked={unlocked} />
        </Tabs.Panel>
        {unlocked && (
          <Tabs.Panel value="chat">
            <Chat />
          </Tabs.Panel>
        )}
      </main>
      <UnlockDialog
        open={unlockOpen}
        onOpenChange={setUnlockOpen}
        onSuccess={() => {
          setUnlocked(true);
          setUnlockOpen(false);
        }}
      />
    </Tabs.Root>
  );
}

function UnlockDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setPw("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-ink/40 z-40" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-paper border-2 border-ink w-[min(92vw,24rem)] p-6 flex flex-col gap-4 outline-none">
          <Dialog.Title className="text-xs uppercase tracking-[0.2em] text-ink/60 flex items-center gap-2">
            <LockIcon className="h-4 w-4" />
            Destrancar
          </Dialog.Title>
          <form onSubmit={submit} className="flex flex-col gap-4">
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
              <Dialog.Close
                type="button"
                className="text-xs uppercase tracking-[0.2em] font-medium px-3 py-2 text-ink/60 hover:text-ink"
              >
                cancelar
              </Dialog.Close>
              <button
                type="submit"
                disabled={!pw || submitting}
                className="text-xs uppercase tracking-[0.2em] font-medium bg-ink text-paper px-4 py-2 disabled:opacity-40"
              >
                {submitting ? "verificando…" : "entrar"}
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
