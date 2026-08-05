/**
 * Physical plausibility limits, shared by everything that reads a run's samples.
 *
 * Kept in their own module because two very different consumers need the same
 * number — the chart series builder and the best-effort search — and a threshold
 * like this drifting between them would mean one of them silently accepting data
 * the other rejects.
 */

/**
 * Nothing above this is a human running: 8 m/s is 2:05/km, faster than the
 * 1500 m world record pace. Anything beyond it is a broken distance stream.
 *
 * This is not hypothetical. Nine runs in this table, all from one bad 2018
 * Strava import, contain jumps between 12 and 130 m/s — 130 m/s being 468 km/h.
 * Left unchecked they drew a 0:11/km chart and, because a maximum over a whole
 * history finds exactly the worst glitch, took six of the ten all-time records.
 */
export const MAX_HUMAN_SPEED_MPS = 8;

/** The same limit expressed as the fastest believable pace, in sec/km. */
export const MIN_HUMAN_PACE_SEC_PER_KM = 1000 / MAX_HUMAN_SPEED_MPS;
