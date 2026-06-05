import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import "./index.css";

const DAY = 24 * 60 * 60_000;

const queryClient = new QueryClient({
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
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "run.rq-cache",
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: DAY, buster: "v1" }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
