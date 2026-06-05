import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_API_PROXY_TARGET ?? "https://run.rfoel.dev";
  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          // Split vendors into stable, cacheable chunks. recharts/leaflet/
          // markdown already land in their lazy route chunks; this keeps the
          // always-loaded vendor code (react, router, query, base-ui, icons)
          // in its own long-cached file separate from app code.
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (/recharts|d3-|victory-vendor/.test(id)) return "recharts";
            if (/leaflet/.test(id)) return "leaflet";
            if (
              /react-markdown|remark|micromark|mdast|hast|unist|decode-named/.test(
                id,
              )
            )
              return "markdown";
            if (/@base-ui-components/.test(id)) return "base-ui";
            if (/@phosphor-icons/.test(id)) return "icons";
            if (/react-router|@tanstack|scheduler|react-dom|\/react\//.test(id))
              return "react-vendor";
          },
        },
      },
    },
    server: {
      proxy: {
        "/api": {
          target,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
