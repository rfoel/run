import { AlertDialog } from "@base-ui-components/react/alert-dialog";
import {
  CheckCircleIcon,
  MinusCircleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import {
  deletePlan as apiDeletePlan,
  listPlans,
  type PlannedRun,
} from "../lib/api.ts";
import { duration, km } from "../lib/format.ts";

const TYPE_LABELS: Record<PlannedRun["type"], string> = {
  easy: "Leve",
  long: "Longão",
  tempo: "Tempo",
  interval: "Tiro",
  race: "Prova",
  recovery: "Regen",
};

export default function Plan({ unlocked }: { unlocked: boolean }) {
  const [items, setItems] = useState<PlannedRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const from = isoDateDaysFromNow(-14);
      const list = await listPlans({ from });
      setItems(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (loading) {
    return <p className="text-ink/60 font-mono text-sm">Carregando…</p>;
  }
  if (error) {
    return (
      <p className="border-2 border-ink p-5 bg-paper-2 font-mono text-sm">
        {error}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <div className="border-2 border-ink p-6 bg-paper-2">
        <div className="text-xs uppercase tracking-[0.2em] text-ink/60 mb-2">
          Nenhum treino planejado
        </div>
        {unlocked && (
          <p className="font-mono text-sm">
            Vá para a aba Treinador e peça: "Monta um plano de 5k abaixo de 20min em 12 semanas"
          </p>
        )}
      </div>
    );
  }

  const byWeek = groupByWeek(items);

  return (
    <section className="flex flex-col gap-8">
      {[...byWeek.entries()].map(([weekLabel, runs]) => (
        <div key={weekLabel}>
          <h2 className="text-xs uppercase tracking-[0.2em] mb-3 text-ink/60">
            {weekLabel}
          </h2>
          <ul className="border-2 border-ink divide-y-2 divide-ink">
            {runs.map((p) => (
              <PlanRow
                key={`${p.date}/${p.id}`}
                plan={p}
                unlocked={unlocked}
                onDelete={refresh}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function PlanRow({
  plan,
  unlocked,
  onDelete,
}: {
  plan: PlannedRun;
  unlocked: boolean;
  onDelete: () => void | Promise<void>;
}) {
  const done = plan.status === "done";
  const skipped = plan.status === "skipped";
  return (
    <li
      className={
        "px-5 py-4 flex items-start justify-between gap-6 hover:bg-paper-2 " +
        (skipped ? "opacity-50" : "")
      }
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <span className="font-mono text-xs uppercase tracking-wider bg-ink text-paper px-2 py-0.5">
            {TYPE_LABELS[plan.type]}
          </span>
          <span className="font-mono text-sm font-semibold">
            {formatDate(plan.date)}
          </span>
          {done && (
            <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-700 flex items-center gap-1">
              <CheckCircleIcon weight="fill" className="h-3.5 w-3.5" />
              feito
            </span>
          )}
          {skipped && (
            <span className="text-[10px] uppercase tracking-[0.2em] text-ink/50 flex items-center gap-1">
              <MinusCircleIcon className="h-3.5 w-3.5" />
              pulado
            </span>
          )}
        </div>
        {plan.notes && (
          <p className="text-sm text-ink/80 whitespace-pre-wrap">
            {plan.notes}
          </p>
        )}
      </div>
      <div className="text-right shrink-0 font-mono text-sm">
        <div className={done ? "text-ink/50 line-through" : "font-semibold"}>
          {plannedTarget(plan)}
        </div>
        {done && (
          <div className="text-ink font-semibold mt-0.5">
            {actualSummary(plan)}
          </div>
        )}
        {plan.paceTargetSec && !done && (
          <div className="text-ink/60 text-xs mt-1">
            {paceString(plan.paceTargetSec)}
          </div>
        )}
        {!done && unlocked && (
          <DeletePlanButton
            plan={plan}
            onDeleted={onDelete}
          />
        )}
      </div>
    </li>
  );
}

function DeletePlanButton({
  plan,
  onDeleted,
}: {
  plan: PlannedRun;
  onDeleted: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await apiDeletePlan(plan.date, plan.id);
      await onDeleted();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger
        className="text-[10px] uppercase tracking-[0.2em] text-ink/40 hover:text-ink mt-2 flex items-center gap-1 ml-auto"
        aria-label="Excluir treino"
      >
        <TrashIcon className="h-3.5 w-3.5" />
        excluir
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 bg-ink/40 z-40" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-paper border-2 border-ink w-[min(92vw,24rem)] p-6 flex flex-col gap-4 outline-none">
          <AlertDialog.Title className="text-xs uppercase tracking-[0.2em] text-ink/60 flex items-center gap-2">
            <TrashIcon className="h-4 w-4" />
            Excluir treino
          </AlertDialog.Title>
          <AlertDialog.Description className="font-mono text-sm">
            {formatDate(plan.date)} — {plannedTarget(plan)}
          </AlertDialog.Description>
          <div className="flex gap-2 justify-end">
            <AlertDialog.Close
              className="text-xs uppercase tracking-[0.2em] font-medium px-3 py-2 text-ink/60 hover:text-ink"
              disabled={busy}
            >
              cancelar
            </AlertDialog.Close>
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="text-xs uppercase tracking-[0.2em] font-medium bg-ink text-paper px-4 py-2 disabled:opacity-40"
            >
              {busy ? "excluindo…" : "excluir"}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function plannedTarget(p: PlannedRun) {
  if (p.distance) return `${km(p.distance)} km`;
  if (p.durationSec) return duration(p.durationSec);
  return "—";
}

function actualSummary(p: PlannedRun) {
  const parts: string[] = [];
  if (p.actualDistance) parts.push(`${km(p.actualDistance)} km`);
  if (p.actualMovingTime && p.actualDistance) {
    parts.push(pace(p.actualDistance, p.actualMovingTime));
  } else if (p.actualMovingTime) {
    parts.push(duration(p.actualMovingTime));
  }
  if (p.actualAvgHr) parts.push(`${Math.round(p.actualAvgHr)} bpm`);
  return parts.join(" · ");
}

function pace(meters: number, sec: number) {
  if (meters === 0) return "—";
  const sPerKm = sec / (meters / 1000);
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

function paceString(secPerKm: number) {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

function formatDate(yyyymmdd: string) {
  const d = new Date(`${yyyymmdd}T00:00:00`);
  return d.toLocaleDateString("pt-BR", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function isoDateDaysFromNow(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function groupByWeek(plans: PlannedRun[]) {
  const out = new Map<string, PlannedRun[]>();
  for (const p of plans) {
    const d = new Date(`${p.date}T00:00:00`);
    const monday = new Date(d);
    const day = d.getDay() || 7;
    monday.setDate(d.getDate() - (day - 1));
    const label = `Semana de ${monday.toLocaleDateString("pt-BR", {
      month: "short",
      day: "numeric",
    })}`;
    const arr = out.get(label) ?? [];
    arr.push(p);
    out.set(label, arr);
  }
  return out;
}
