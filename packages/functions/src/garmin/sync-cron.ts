import { syncGarmin } from "./sync.ts";

/**
 * Scheduled ingestion. The Garmin API has no webhook, so without this a run
 * only lands in the app when someone unlocks it and presses "sincronizar".
 *
 * The lookback is deliberately short. The sync loop re-fetches detail samples
 * for every activity inside the window, imported or not, and that endpoint
 * throttles hard — so a wide window on a 6-hourly schedule would hammer it.
 * A couple of days is enough to cover a missed run or a late upload from the
 * watch, and putActivity is idempotent so the overlap is harmless.
 */
const DEFAULT_LOOKBACK_DAYS = 2;

export async function handler(event?: { days?: number }) {
  const days = event?.days ?? DEFAULT_LOOKBACK_DAYS;
  const result = await syncGarmin(days);
  // Surfaces in CloudWatch — the only place a scheduled run reports to.
  console.log(`garmin sync (${days}d): ${JSON.stringify(result)}`);
  return result;
}
