import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  analyzeWorkout,
  createCourse,
  deleteActivity,
  deletePlan,
  deleteSavedRoute,
  getActivityDetail,
  getStats,
  listActivities,
  listPlans,
  listSavedRoutes,
  pushGarmin,
  pushRouteToGarmin,
  resyncActivity,
  saveRoute,
  syncGarmin,
  syncStrava,
  type ActivityDetail,
  type WorkoutAnalysis,
} from "./api.ts";
import { importWorkoutDetail } from "./lazyDetail.ts";

type PlanOpts = { from?: string; to?: string };
type ActivityOpts = { from?: string; to?: string; limit?: number };

// Centralized query keys so reads and the mutations that invalidate them stay
// in sync. invalidateQueries matches by prefix, so e.g. ["plans"] busts every
// plan range at once.
export const qk = {
  plans: (o: PlanOpts = {}) => ["plans", o.from ?? null, o.to ?? null] as const,
  activities: (o: ActivityOpts = {}) =>
    ["activities", o.from ?? null, o.to ?? null, o.limit ?? null] as const,
  stats: () => ["stats"] as const,
  activityDetail: (source: string, externalId: string) =>
    ["activityDetail", source, externalId] as const,
};

export function usePlans(opts: PlanOpts = {}) {
  return useQuery({ queryKey: qk.plans(opts), queryFn: () => listPlans(opts) });
}

export function useActivities(opts: ActivityOpts = {}) {
  return useQuery({
    queryKey: qk.activities(opts),
    queryFn: () => listActivities(opts),
  });
}

export function useStats() {
  return useQuery({ queryKey: qk.stats(), queryFn: getStats });
}

export function useActivityDetail(source: string, externalId: string) {
  return useQuery({
    queryKey: qk.activityDetail(source, externalId),
    queryFn: () => getActivityDetail(source, externalId),
  });
}

// Warm both the detail data AND its lazy chunk (recharts + leaflet) on
// hover/focus so opening a run is instant. Returns a stable callback to attach
// to onMouseEnter/onFocus/onTouchStart.
export function usePrefetchActivityDetail() {
  const qc = useQueryClient();
  return (source: string, externalId: string) => {
    void importWorkoutDetail();
    void qc.prefetchQuery({
      queryKey: qk.activityDetail(source, externalId),
      queryFn: () => getActivityDetail(source, externalId),
      staleTime: 5 * 60_000,
    });
  };
}

export function useSyncStrava() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (days: number) => syncStrava(days),
    // Sync imports activities, recomputes stats, and links plans.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["activities"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
      void qc.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}

export function useSyncGarmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (days: number) => syncGarmin(days),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["activities"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
      void qc.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}

export function useCreateCourse() {
  return useMutation({
    mutationFn: (input: {
      name: string;
      description?: string;
      points: { lat: number; lon: number }[];
    }) => createCourse(input),
  });
}

export function useSavedRoutes() {
  return useQuery({ queryKey: ["routes"], queryFn: listSavedRoutes });
}

export function useSaveRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      points: { lat: number; lon: number }[];
      distance: number;
    }) => saveRoute(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["routes"] }),
  });
}

export function useDeleteRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSavedRoute(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["routes"] }),
  });
}

export function usePushRouteToGarmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pushRouteToGarmin(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["routes"] }),
  });
}

export function useGarminPush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: { from?: string; to?: string }) => pushGarmin(opts),
    // Pushed plans get a garminWorkoutId stamped server-side; refetch plans so
    // the "no Garmin" badge appears.
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["plans"] }),
  });
}

export function useDeleteActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { source: string; externalId: string }) =>
      deleteActivity(v.source, v.externalId),
    // Deleting recomputes stats and reverts the linked plan to "planned".
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["activities"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
      void qc.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}

export function useResyncActivity(source: string, externalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => resyncActivity(source, externalId),
    // The series is persisted server-side; refetch the detail to pull it in.
    onSuccess: () =>
      void qc.invalidateQueries({
        queryKey: qk.activityDetail(source, externalId),
      }),
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { date: string; id: string }) => deletePlan(v.date, v.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["plans"] }),
  });
}

export function useAnalyzeWorkout(source: string, externalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => analyzeWorkout(source, externalId),
    // The analysis is persisted server-side; reflect it in the cached detail so
    // it survives navigation without a refetch.
    onSuccess: (analysis: WorkoutAnalysis) => {
      qc.setQueryData(
        qk.activityDetail(source, externalId),
        (prev: ActivityDetail | undefined) =>
          prev
            ? {
                ...prev,
                analysis: {
                  analysis,
                  model: prev.analysis?.model ?? "",
                  createdAt: new Date().toISOString(),
                },
              }
            : prev,
      );
    },
  });
}
