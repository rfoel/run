import { Dialog } from "@base-ui-components/react/dialog";
import {
  CalendarBlankIcon,
  ChatCircleTextIcon,
  ListChecksIcon,
  LockIcon,
  LockOpenIcon,
  PersonSimpleRunIcon,
} from "@phosphor-icons/react";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import Activities from "./components/Activities.tsx";
import Calendar from "./components/Calendar.tsx";
import Logo from "./components/Logo.tsx";
import Plan from "./components/Plan.tsx";

// Pulls in recharts + leaflet only when a workout is opened.
const WorkoutDetail = lazy(() => import("./components/WorkoutDetail.tsx"));
// Pulls in react-markdown + remark-gfm only when the (gated) chat is opened.
const Chat = lazy(() => import("./components/Chat.tsx"));
import {
  clearWriteToken,
  getWriteToken,
  setWriteToken,
  verifyWriteToken,
} from "./lib/api.ts";

type Tab = "calendar" | "activities" | "plan" | "chat";

type TabMeta = {
  path: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  private?: boolean;
};

const TABS: Record<Tab, TabMeta> = {
  calendar: { path: "/calendario", label: "Calendário", Icon: CalendarBlankIcon },
  activities: { path: "/corridas", label: "Corridas", Icon: PersonSimpleRunIcon },
  plan: { path: "/plano", label: "Plano", Icon: ListChecksIcon },
  chat: {
    path: "/treinador",
    label: "Treinador",
    Icon: ChatCircleTextIcon,
    private: true,
  },
};

const TAB_ORDER: Tab[] = ["calendar", "activities", "plan", "chat"];

function activeTabFor(pathname: string): Tab {
  const hit = TAB_ORDER.find(
    (t) =>
      pathname === TABS[t].path || pathname.startsWith(`${TABS[t].path}/`),
  );
  return hit ?? "calendar";
}

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const openDetail = (source: string, externalId: string) =>
    navigate(`/corridas/${source}/${encodeURIComponent(externalId)}`);

  useEffect(() => {
    const t = getWriteToken();
    if (!t) return;
    void verifyWriteToken(t).then((ok) => {
      if (ok) setUnlocked(true);
      else clearWriteToken();
    });
  }, []);

  const visibleTabs = TAB_ORDER.filter((t) => unlocked || !TABS[t].private);
  const activeTab = activeTabFor(location.pathname);

  function lock() {
    clearWriteToken();
    setUnlocked(false);
    if (TABS[activeTab].private) navigate("/calendario");
  }

  return (
    <div className="min-h-full bg-paper text-ink overflow-x-clip">
      <header className="border-b border-line">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-5 flex items-center sm:items-end justify-between gap-2 sm:gap-4">
          <Link
            to="/calendario"
            className="flex items-end gap-3 text-ink shrink-0"
          >
            <Logo className="h-6 sm:h-7 w-auto" />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <nav className="flex gap-0.5 sm:gap-1 text-xs uppercase tracking-[0.15em] font-medium">
              {visibleTabs.map((t) => {
                const { label, Icon, path } = TABS[t];
                const selected = t === activeTab;
                return (
                  <Link
                    key={t}
                    to={path}
                    title={label}
                    aria-label={label}
                    aria-current={selected ? "page" : undefined}
                    className={
                      "px-2 sm:px-3 py-2 flex items-center gap-2 rounded-md " +
                      (selected
                        ? "bg-accent text-[var(--color-accent-fg)]"
                        : "text-ink/60 hover:text-ink hover:bg-paper-2")
                    }
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden md:inline">{label}</span>
                  </Link>
                );
              })}
            </nav>
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
                className="flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] font-medium border border-line rounded-lg px-2 sm:px-3 py-1 hover:bg-accent hover:text-white"
              >
                <LockIcon className="h-4 w-4" />
                <span className="hidden md:inline">destrancar</span>
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <Routes>
          <Route path="/" element={<Navigate to="/calendario" replace />} />
          <Route
            path="/calendario"
            element={<Calendar onOpenActivity={openDetail} />}
          />
          <Route
            path="/corridas"
            element={<Activities unlocked={unlocked} onOpenActivity={openDetail} />}
          />
          <Route
            path="/corridas/:source/:externalId"
            element={<WorkoutDetailRoute unlocked={unlocked} />}
          />
          <Route path="/plano" element={<Plan unlocked={unlocked} />} />
          <Route
            path="/treinador"
            element={
              unlocked ? (
                <Suspense
                  fallback={
                    <p className="text-ink/60 font-mono text-sm">Carregando…</p>
                  }
                >
                  <Chat />
                </Suspense>
              ) : (
                <Navigate to="/calendario" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/calendario" replace />} />
        </Routes>
      </main>
      <UnlockDialog
        open={unlockOpen}
        onOpenChange={setUnlockOpen}
        onSuccess={() => {
          setUnlocked(true);
          setUnlockOpen(false);
        }}
      />
    </div>
  );
}

function WorkoutDetailRoute({ unlocked }: { unlocked: boolean }) {
  const { source, externalId } = useParams();
  const navigate = useNavigate();
  if (!source || !externalId) return <Navigate to="/corridas" replace />;
  return (
    <Suspense
      fallback={<p className="text-ink/60 font-mono text-sm">Carregando…</p>}
    >
      <WorkoutDetail
        source={source}
        externalId={decodeURIComponent(externalId)}
        unlocked={unlocked}
        onBack={() => navigate(-1)}
      />
    </Suspense>
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
        <Dialog.Popup className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card border border-line rounded-lg shadow-lg w-[min(92vw,24rem)] p-6 flex flex-col gap-4 outline-none">
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
              className="border border-line rounded-lg px-3 py-2 font-mono text-sm bg-card outline-none focus:border-accent"
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
                className="text-xs uppercase tracking-[0.2em] font-medium bg-accent text-white px-4 py-2 disabled:opacity-40"
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
