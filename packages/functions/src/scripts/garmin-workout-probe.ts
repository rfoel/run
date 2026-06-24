import {
  getValidAccessToken,
  buildStructuredWorkout,
  createWorkout,
  getWorkout,
  deleteWorkout,
  type StructuredWorkout,
} from "@run/core/garmin";

/**
 * Probe the Garmin workout-service: build a structured interval workout, POST
 * it, GET it back, and print what Garmin actually stored. Used to verify the
 * RepeatGroupDTO payload renders as a proper "5x …" workout before wiring the
 * LLM interpreter into the push flow.
 *
 *   sst shell --stage production -- node packages/functions/src/scripts/garmin-workout-probe.ts
 *
 * Flags:
 *   --keep    don't delete the probe workout afterwards (inspect it on the watch)
 *   --dry     just print the payload we WOULD send, no API calls
 */

// "Tiros de 1km": aquecimento 1km + 5x(1000m em 4:30–4:45/km, 2min trote) + desaquecimento 1km
const PROBE: StructuredWorkout = {
  name: "PROBE Tiros 5x1000m",
  description:
    "Aquecimento 1km + 5x1000m em 4:30–4:45/km com 2min de trote + desaquecimento 1km",
  elements: [
    { kind: "warmup", duration: { kind: "distance", meters: 1000 } },
    {
      repeat: 5,
      steps: [
        {
          kind: "run",
          duration: { kind: "distance", meters: 1000 },
          paceFastSec: 262, // 4:22/km
          paceSlowSec: 278, // 4:38/km
          notes: "tiro forte, ritmo consistente",
        },
        {
          kind: "recovery",
          duration: { kind: "time", seconds: 120 },
          notes: "trote",
        },
      ],
    },
    { kind: "cooldown", duration: { kind: "distance", meters: 1000 } },
  ],
};

async function main() {
  const dry = process.argv.includes("--dry");
  const keep = process.argv.includes("--keep");

  const payload = buildStructuredWorkout(PROBE);
  console.log("=== payload we send ===");
  console.log(JSON.stringify(payload, null, 2));
  if (dry) {
    console.log("\ndry run — nothing sent.");
    return;
  }

  const token = await getValidAccessToken();
  console.log("\nauthenticated with Garmin.");

  const created = await createWorkout(PROBE, token);
  console.log(`created workout #${created.workoutId} "${created.workoutName}"`);
  console.log(
    `  https://connect.garmin.com/modern/workout/${created.workoutId}`,
  );

  const stored = await getWorkout(created.workoutId, token);
  console.log("\n=== what Garmin stored (round-trip) ===");
  const segs = (stored as Record<string, unknown>).workoutSegments;
  console.log(JSON.stringify(segs, null, 2));

  if (keep) {
    console.log(`\nkept workout #${created.workoutId} — delete it manually.`);
  } else {
    await deleteWorkout(created.workoutId, token);
    console.log(`\ndeleted probe workout #${created.workoutId}.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
