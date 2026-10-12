import { BarbellIcon } from "@phosphor-icons/react";
import { type Activity } from "../lib/api.ts";

/** A run is "indoor" (treadmill / manual) when it has no GPS track. */
export function isTreadmill(a: Pick<Activity, "indoor">) {
  return a.indoor === true;
}

/** Small barbell glyph marking a treadmill run. Render only when isTreadmill. */
export function TreadmillIcon({ className = "size-3.5 text-muted-foreground" }) {
  return (
    <BarbellIcon className={className} weight="bold" aria-label="Esteira" />
  );
}
