import { useMemo, useSyncExternalStore } from "react";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** True while the OS is in dark mode; re-renders when it flips. */
export function useDarkMode(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
}

const TOKENS = {
  foreground: "--foreground",
  mutedForeground: "--muted-foreground",
  background: "--background",
  card: "--card",
  border: "--border",
  volt: "--volt",
  chart1: "--chart-1",
  chart2: "--chart-2",
  chart3: "--chart-3",
  chart4: "--chart-4",
  chart5: "--chart-5",
} as const;

export type ThemeColors = Record<keyof typeof TOKENS, string>;

/**
 * The theme tokens from index.css as concrete colors, for libraries that need
 * a real color string (recharts, leaflet) rather than a CSS class. Re-read
 * whenever the OS theme flips.
 */
export function useThemeColors(): ThemeColors {
  const dark = useDarkMode();
  return useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      Object.entries(TOKENS).map(([key, name]) => [
        key,
        style.getPropertyValue(name).trim(),
      ]),
    ) as ThemeColors;
    // `dark` is the cache key: the computed values change when it flips.
  }, [dark]);
}

/**
 * Esri's gray canvas basemap matching the theme — keyless, unlike CARTO's,
 * which now answers every tile with an "API key required" image. Spread onto a
 * TileLayer keyed on `dark` so it swaps when the OS theme flips.
 */
export function basemapProps(dark: boolean) {
  const style = dark ? "World_Dark_Gray_Base" : "World_Light_Gray_Base";
  return {
    url: `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${style}/MapServer/tile/{z}/{y}/{x}`,
    attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
    // Past z16 the service serves "map data not yet available" tiles.
    maxNativeZoom: 16,
  };
}
