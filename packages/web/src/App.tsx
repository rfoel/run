import { useState } from "react";
import Activities from "./components/Activities.tsx";
import Calendar from "./components/Calendar.tsx";
import Chat from "./components/Chat.tsx";
import Logo from "./components/Logo.tsx";
import Plan from "./components/Plan.tsx";

type Tab = "calendar" | "activities" | "plan" | "chat";

const TAB_LABELS: Record<Tab, string> = {
  calendar: "Calendário",
  activities: "Corridas",
  plan: "Plano",
  chat: "Treinador",
};

const TABS: Tab[] = ["calendar", "activities", "plan", "chat"];

export default function App() {
  const [tab, setTab] = useState<Tab>("calendar");
  return (
    <div className="min-h-full bg-paper text-ink">
      <header className="border-b-2 border-ink">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-end justify-between">
          <a href="/" className="flex items-end gap-3 text-ink">
            <Logo className="h-7 w-auto" />
            <span className="text-xs uppercase tracking-[0.2em] pb-[3px] text-ink/60">
              treinador
            </span>
          </a>
          <nav className="flex gap-1 text-xs uppercase tracking-[0.15em] font-medium">
            {TABS.map((t) => (
              <TabBtn key={t} active={tab === t} onClick={() => setTab(t)}>
                {TAB_LABELS[t]}
              </TabBtn>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-10">
        {tab === "calendar" && <Calendar />}
        {tab === "activities" && <Activities />}
        {tab === "plan" && <Plan />}
        {tab === "chat" && <Chat />}
      </main>
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
