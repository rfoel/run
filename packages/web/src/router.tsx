import { createBrowserRouter, redirect } from "react-router-dom";
import type { LoaderFunctionArgs } from "react-router-dom";
import App, {
  ActivitiesRoute,
  CalendarRoute,
  ChatRoute,
  CoursesRoute,
  PlanRoute,
  WorkoutDetailRoute,
} from "./App.tsx";
import { queryClient } from "./lib/queryClient.ts";
import { qk } from "./lib/queries.ts";
import {
  getActivityDetail,
  getStats,
  listActivities,
  listPlans,
  listSavedRoutes,
} from "./lib/api.ts";
import { isoDateDaysFromNow, localIso } from "./lib/format.ts";
import { importWorkoutDetail } from "./lib/lazyDetail.ts";

// Loaders kick data fetching off at navigation time, in parallel with the
// route's lazy JS chunk — instead of waiting for the component to mount and
// its useQuery to fire (the classic deep-link waterfall). They deliberately do
// NOT await: components render immediately from the persisted cache (or a
// skeleton) exactly as before, and prefetchQuery respects staleTime, so a
// fresh cache entry costs nothing.

function calendarLoader() {
  // Same 3-month window Calendar computes for the current month.
  const d = new Date();
  const from = localIso(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const to = localIso(new Date(d.getFullYear(), d.getMonth() + 2, 0));
  void queryClient.prefetchQuery({
    queryKey: qk.plans({ from, to }),
    queryFn: () => listPlans({ from, to }),
  });
  void queryClient.prefetchQuery({
    queryKey: qk.activities({ from, to, limit: 1000 }),
    queryFn: () => listActivities({ from, to, limit: 1000 }),
  });
  return null;
}

function activitiesLoader() {
  void queryClient.prefetchQuery({
    queryKey: qk.activities({ limit: 1000 }),
    queryFn: () => listActivities({ limit: 1000 }),
  });
  void queryClient.prefetchQuery({
    queryKey: qk.stats(),
    queryFn: getStats,
  });
  return null;
}

function workoutDetailLoader({ params }: LoaderFunctionArgs) {
  const { source, externalId } = params;
  if (!source || !externalId) return null;
  const id = decodeURIComponent(externalId);
  // Warm the heavy chunk (recharts + leaflet) alongside the data.
  void importWorkoutDetail();
  void queryClient.prefetchQuery({
    queryKey: qk.activityDetail(source, id),
    queryFn: () => getActivityDetail(source, id),
  });
  return null;
}

function planLoader() {
  const from = isoDateDaysFromNow(-14);
  void queryClient.prefetchQuery({
    queryKey: qk.plans({ from }),
    queryFn: () => listPlans({ from }),
  });
  return null;
}

function coursesLoader() {
  void queryClient.prefetchQuery({
    queryKey: ["routes"],
    queryFn: listSavedRoutes,
  });
  return null;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, loader: () => redirect("/calendario") },
      { path: "calendario", element: <CalendarRoute />, loader: calendarLoader },
      {
        path: "corridas",
        element: <ActivitiesRoute />,
        loader: activitiesLoader,
      },
      {
        path: "corridas/:source/:externalId",
        element: <WorkoutDetailRoute />,
        loader: workoutDetailLoader,
      },
      { path: "plano", element: <PlanRoute />, loader: planLoader },
      { path: "percursos", element: <CoursesRoute />, loader: coursesLoader },
      { path: "treinador", element: <ChatRoute /> },
      { path: "*", loader: () => redirect("/calendario") },
    ],
  },
]);
