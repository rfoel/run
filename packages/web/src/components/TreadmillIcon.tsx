import { BarbellIcon } from "@phosphor-icons/react";
import { type Activity } from "../lib/api.ts";

/** A run is "indoor" (treadmill / manual) when it has no GPS track. */
export function isTreadmill(a: Pick<Activity, "indoor">) {
  return a.indoor === true;
}

/** Small barbell glyph marking a treadmill run. Render only when isTreadmill. */
export function TreadmillIcon({ className = "h-3.5 w-3.5 text-ink/40" }) {
  return (
    <BarbellIcon className={className} weight="bold" aria-label="Esteira" />
  );
}
