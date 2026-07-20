export const km = (meters: number) => (meters / 1000).toFixed(2);

export const duration = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h) return `${h}h${m.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const pace = (meters: number, movingSec: number) => {
  if (meters === 0) return "--";
  const secPerKm = movingSec / (meters / 1000);
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
};

/** Format a pace given directly in seconds per km, e.g. 265 -> "4:25". */
export const paceFromSec = (secPerKm: number | null | undefined) => {
  if (secPerKm == null) return "--";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const LOCALE = "pt-BR";

export const date = (iso: string) =>
  new Date(iso).toLocaleDateString(LOCALE, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

/** Local-timezone YYYY-MM-DD (toISOString would shift across midnight UTC). */
export function localIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isoDateDaysFromNow(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}
