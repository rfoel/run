import { MutationCache, QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { toast } from "sonner";

const DAY = 24 * 60 * 60_000;

function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/^Error:\s*/, "");
}

// Module-level so route loaders (which run outside React) share the same
// client/cache as the components.
export const queryClient = new QueryClient({
  // Any failed mutation (sync, delete, analyze) surfaces as a toast — no need
  // to wire error handling into every button.
  mutationCache: new MutationCache({
    onError: (err) => toast.error(errorMessage(err)),
  }),
  defaultOptions: {
    queries: {
      // Data stays "fresh" for 5 min: navigating away and back within that
      // window reads straight from cache — no refetch, instant render.
      staleTime: 5 * 60_000,
      // gcTime must be >= the persister maxAge, or restored entries get
      // dropped right after hydration.
      gcTime: DAY,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Persist the cache to localStorage so a cold open (new tab / relaunch) paints
// the last session's data instantly, then revalidates in the background.
export const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "run.rq-cache",
});

export const PERSIST_MAX_AGE = DAY;
