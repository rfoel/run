// The WorkoutDetail chunk pulls in recharts + leaflet, so it's lazy. This
// factory is shared between the lazy() route in App and the hover prefetch in
// the queries layer — kept here (not in App) to avoid an import cycle.
export const importWorkoutDetail = () => import("../components/WorkoutDetail.tsx");
