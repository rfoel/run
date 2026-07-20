import { analyzeActivity } from "../activities/analyze.ts";

// One-off: analyze a single run end-to-end (persists the analysis).
//   sst shell --stage production -- node packages/functions/src/scripts/analyze-once.ts garmin <id>
const source = process.argv[2] ?? "garmin";
const externalId = process.argv[3] ?? "23618280127";

const a = await analyzeActivity(source, externalId);
console.log(`type=${a.type} subtype=${a.subtype ?? "-"} sections=${a.sections.length}`);
console.log("pattern:", a.analysis?.pattern, "| rpe:", a.analysis?.rpe_estimate, "| target_hit:", a.analysis?.target_hit);
console.log("highlights:", JSON.stringify(a.analysis?.highlights, null, 1));
console.log("issues:", JSON.stringify(a.analysis?.issues, null, 1));
console.log("próximo:", a.analysis?.next_workout_suggestion);
