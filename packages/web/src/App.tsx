import {
  CalendarBlankIcon,
  ListChecksIcon,
  LockIcon,
  LockOpenIcon,
  MapTrifoldIcon,
  PersonSimpleRunIcon,
  TrendUpIcon,
  type Icon,
} from "@phosphor-icons/react";
import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  Link,
  Navigate,
  Outlet,
  ScrollRestoration,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import Activities from "./components/Activities.tsx";
import Calendar from "./components/Calendar.tsx";
import Plan from "./components/Plan.tsx";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { importWorkoutDetail } from "./lib/lazyDetail.ts";
import { WorkoutDetailSkeleton } from "./components/Skeleton.tsx";

// Pulls in recharts + leaflet only when a workout is opened. The factory is
// shared with the hover prefetch in the queries layer.
const WorkoutDetail = lazy(importWorkoutDetail);
// Pulls in leaflet only when the heatmap is opened.
const Heatmap = lazy(() => import("./components/Heatmap.tsx"));
// Pulls in recharts only when the trend is opened — it must not land on the
// always-loaded path just because a main tab shows a chart.
const Trend = lazy(() => import("./components/Trend.tsx"));
import {
  clearWriteToken,
  getWriteToken,
  setWriteToken,
  verifyWriteToken,
} from "./lib/api.ts";

type Tab = "calendar" | "activities" | "plan" | "map" | "trend";

type TabMeta = {
  path: string;
  label: string;
  Icon: Icon;
};

const TABS: Record<Tab, TabMeta> = {
  calendar: { path: "/calendario", label: "Calendário", Icon: CalendarBlankIcon },
  activities: { path: "/corridas", label: "Corridas", Icon: PersonSimpleRunIcon },
  plan: { path: "/plano", label: "Plano", Icon: ListChecksIcon },
  map: { path: "/mapa", label: "Mapa", Icon: MapTrifoldIcon },
  trend: { path: "/evolucao", label: "Evolução", Icon: TrendUpIcon },
};

const TAB_ORDER: Tab[] = ["calendar", "activities", "plan", "map", "trend"];

/** The floating glass surface shared by the dock and the lock bubble. */
const GLASS =
  "pointer-events-auto rounded-full border border-foreground/10 bg-background/65 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.45)] backdrop-blur-2xl backdrop-saturate-150 dark:bg-card/75";

// Routes live on the data router (router.tsx); the unlocked state stays here
// in the layout and reaches route elements through context.
const UnlockContext = createContext(false);
const useUnlocked = () => useContext(UnlockContext);

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

  useEffect(() => {
    const t = getWriteToken();
    if (!t) return;
    void verifyWriteToken(t).then((ok) => {
      if (ok) setUnlocked(true);
      else clearWriteToken();
    });
  }, []);

  const activeTab = activeTabFor(location.pathname);
  // Big NRC-style title on the tab roots only, not on a workout's detail.
  const isTabRoot = TAB_ORDER.some((t) => location.pathname === TABS[t].path);

  function lock() {
    clearWriteToken();
    setUnlocked(false);
  }

  return (
    <div className="min-h-full overflow-x-clip pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-32">
      {/* No top bar: the logo lives in the page's monogram background, and
          navigation and the lock float at the bottom. */}
      <main className="mx-auto max-w-5xl px-4 pt-[calc(env(safe-area-inset-top)+2rem)] pb-10 sm:px-6 md:pt-14">
        {isTabRoot && (
          <h1 className="font-display mb-6 text-6xl md:mb-10 md:text-8xl">
            {TABS[activeTab].label}
          </h1>
        )}
        <UnlockContext.Provider value={unlocked}>
          <Outlet />
        </UnlockContext.Provider>
      </main>
      {/* A floating, translucent dock on every screen size; the page scrolls
          under it. Phones get a full-width tab bar, wider screens a compact
          pill with icon and label side by side. The lock is its own bubble
          beside it. */}
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:pb-6">
        <div className="mx-auto flex max-w-md items-center gap-2 md:max-w-fit">
          <div className={cn(GLASS, "grid flex-1 grid-cols-5 gap-1 p-1.5 md:flex md:p-2")}>
            {TAB_ORDER.map((t) => {
              const { label, Icon, path } = TABS[t];
              const selected = t === activeTab;
              return (
                <Link
                  key={t}
                  to={path}
                  viewTransition
                  aria-current={selected ? "page" : undefined}
                  className={
                    "flex flex-col items-center gap-0.5 rounded-full py-2 text-[10px] font-semibold transition-colors md:flex-row md:gap-2 md:px-5 md:py-2.5 md:text-sm " +
                    (selected
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground active:bg-foreground/5")
                  }
                >
                  <Icon
                    className="size-[22px] md:size-5"
                    weight={selected ? "fill" : "regular"}
                  />
                  {label}
                </Link>
              );
            })}
          </div>
          <button
            type="button"
            onClick={unlocked ? lock : () => setUnlockOpen(true)}
            title={unlocked ? "Trancar (limpa senha)" : "Destrancar ações de escrita"}
            aria-label={unlocked ? "Trancar" : "Destrancar"}
            className={cn(
              GLASS,
              "flex size-16 shrink-0 items-center justify-center transition-colors hover:bg-foreground/5 md:size-[58px]",
              unlocked ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {unlocked ? (
              <LockOpenIcon className="size-6 md:size-5" weight="bold" />
            ) : (
              <LockIcon className="size-6 md:size-5" />
            )}
          </button>
        </div>
      </nav>
      <ScrollRestoration />
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

// ---- Route elements (mounted by router.tsx, state via UnlockContext) -------

function useOpenDetail() {
  const navigate = useNavigate();
  return (source: string, externalId: string) =>
    navigate(`/corridas/${source}/${encodeURIComponent(externalId)}`);
}

export function CalendarRoute() {
  return <Calendar onOpenActivity={useOpenDetail()} />;
}

export function ActivitiesRoute() {
  return <Activities unlocked={useUnlocked()} onOpenActivity={useOpenDetail()} />;
}

export function PlanRoute() {
  return <Plan unlocked={useUnlocked()} />;
}

export function MapRoute() {
  return (
    <Suspense fallback={null}>
      <Heatmap />
    </Suspense>
  );
}

export function TrendRoute() {
  return (
    <Suspense fallback={null}>
      <Trend />
    </Suspense>
  );
}

export function WorkoutDetailRoute() {
  const unlocked = useUnlocked();
  const { source, externalId } = useParams();
  const navigate = useNavigate();
  if (!source || !externalId) return <Navigate to="/corridas" replace />;
  return (
    <Suspense fallback={<WorkoutDetailSkeleton />}>
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl">Destrancar</DialogTitle>
          <DialogDescription>
            Digite a senha para liberar as ações de escrita.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input
            type="password"
            autoFocus
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Senha"
            aria-invalid={!!error}
            disabled={submitting}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={!pw || submitting}>
              {submitting ? "Verificando…" : "Entrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
