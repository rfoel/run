import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  analyzeWorkout,
  deleteActivity,
  deletePlan,
  getActivityDetail,
  getStats,
  listActivities,
  listPlans,
  syncStrava,
  type ActivityDetail,
  type WorkoutAnalysis,
} from "./api.ts";

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

// Warm the detail cache on hover/focus so opening a run is instant. Returns a
// stable callback to attach to onMouseEnter/onFocus/onTouchStart.
export function usePrefetchActivityDetail() {
  const qc = useQueryClient();
  return (source: string, externalId: string) =>
    void qc.prefetchQuery({
      queryKey: qk.activityDetail(source, externalId),
      queryFn: () => getActivityDetail(source, externalId),
      staleTime: 5 * 60_000,
    });
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
