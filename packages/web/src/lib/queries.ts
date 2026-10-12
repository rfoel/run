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
  listBlocks,
  listCities,
  listPlans,
  listRecords,
  listTracks,
  pushGarmin,
  resyncActivity,
  syncGarmin,
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
  blocks: () => ["blocks"] as const,
  activities: (o: ActivityOpts = {}) =>
    ["activities", o.from ?? null, o.to ?? null, o.limit ?? null] as const,
  stats: () => ["stats"] as const,
  tracks: () => ["tracks"] as const,
  cities: () => ["cities"] as const,
  records: () => ["records"] as const,
  activityDetail: (source: string, externalId: string) =>
    ["activityDetail", source, externalId] as const,
};

export function usePlans(opts: PlanOpts = {}) {
  return useQuery({ queryKey: qk.plans(opts), queryFn: () => listPlans(opts) });
}

// Training blocks are few and small, so the whole list is one cached (and
// persisted) entry. Like plans, they're edited by the coach over MCP, outside
// the app, so they keep the default staleness rather than a long one.
export function useBlocks() {
  return useQuery({ queryKey: qk.blocks(), queryFn: listBlocks });
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

// The whole history's geometry. Only changes when a sync imports a run, so it
// stays fresh far longer than the other reads.
export function useTracks() {
  return useQuery({
    queryKey: qk.tracks(),
    queryFn: listTracks,
    staleTime: 30 * 60_000,
  });
}

export function useCities() {
  return useQuery({
    queryKey: qk.cities(),
    queryFn: listCities,
    staleTime: 30 * 60_000,
  });
}

export function useRecords() {
  return useQuery({
    queryKey: qk.records(),
    queryFn: listRecords,
    staleTime: 30 * 60_000,
  });
}

// Auto-analysis lands asynchronously (SQS worker) shortly after a sync. While
// a recent run has its series but no analysis yet, poll the detail so the
// coach card appears without a manual refresh. Older never-analyzed runs
// don't poll — nothing is coming for them.
const AUTO_ANALYSIS_WINDOW_MS = 48 * 3600_000;

function analysisPending(detail: ActivityDetail | undefined): boolean {
  if (!detail || !detail.series || detail.analysis) return false;
  const age = Date.now() - new Date(detail.activity.startDate).getTime();
  return age < AUTO_ANALYSIS_WINDOW_MS;
}

export function useActivityDetail(source: string, externalId: string) {
  return useQuery({
    queryKey: qk.activityDetail(source, externalId),
    queryFn: () => getActivityDetail(source, externalId),
    refetchInterval: (query) =>
      analysisPending(query.state.data) ? 5000 : false,
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

export function useSyncGarmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (days: number) => syncGarmin(days),
    // Sync imports activities, recomputes stats, links plans, and kicks off
    // auto-analysis; refetch details so pending analyses start polling.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["activities"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
      void qc.invalidateQueries({ queryKey: ["plans"] });
      void qc.invalidateQueries({ queryKey: ["activityDetail"] });
      void qc.invalidateQueries({ queryKey: ["tracks"] });
      void qc.invalidateQueries({ queryKey: ["cities"] });
      void qc.invalidateQueries({ queryKey: ["records"] });
    },
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
      void qc.invalidateQueries({ queryKey: ["tracks"] });
      void qc.invalidateQueries({ queryKey: ["cities"] });
      void qc.invalidateQueries({ queryKey: ["records"] });
    },
  });
}

export function useResyncActivity(source: string, externalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => resyncActivity(source, externalId),
    // The series is persisted server-side; refetch the detail to pull it in.
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: qk.activityDetail(source, externalId),
      });
      // Resync upgrades the run's bests from splits-snapped to exact, which can
      // change who holds a record.
      void qc.invalidateQueries({ queryKey: ["activities"] });
      void qc.invalidateQueries({ queryKey: ["records"] });
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
      // The server also renames the activity to the analysis title.
      void qc.invalidateQueries({ queryKey: ["activities"] });
      void qc.invalidateQueries({
        queryKey: qk.activityDetail(source, externalId),
      });
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
