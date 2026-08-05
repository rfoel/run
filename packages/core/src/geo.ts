import { BatchGetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, tableName } from "./db.ts";

/**
 * Turning a run's start coordinate into a city name means reverse geocoding,
 * and Nominatim (OpenStreetMap) allows at most one request per second and asks
 * callers not to bulk-geocode. Hundreds of runs would be both slow and rude.
 *
 * Runs start from a handful of places, though — home, work, the odd trip — so
 * coordinates are first snapped to a coarse grid and each *cell* is geocoded
 * once and cached in DynamoDB. A few hundred runs collapse to a few cells, and
 * a new run in a familiar neighbourhood costs zero requests.
 *
 * The tradeoff: a cell is ~11 km wide, so a run starting near a municipal
 * border can be attributed to the neighbouring city.
 *
 * Each cell is geocoded from a real run's start point rather than the cell's
 * geometric centre. A synthetic centre can land in a lagoon or an unmapped
 * field, where Nominatim answers with the enclosing state and no city at all;
 * a point someone actually started running from is on a mapped street.
 */

/** Grid resolution in decimal degrees. 0.1° of latitude is ~11 km. */
const CELL_SIZE = 0.1;

/** Nominatim's usage policy requires a User-Agent identifying the caller. */
const USER_AGENT = "run.rfoel.dev (personal running log)";

/** Minimum spacing between Nominatim requests, per their usage policy. */
const REQUEST_SPACING_MS = 1100;

/**
 * zoom=12 is the level that reliably resolves to a municipality. zoom=10 was
 * tried first and returned only the enclosing *state* for some coordinates.
 */
const NOMINATIM_URL = (lat: number, lon: number) =>
  `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}` +
  `&format=jsonv2&zoom=12&accept-language=pt-BR`;

/**
 * A cell whose lookup came back empty is retried after this long. Cells are
 * geocoded from a real run's start point, so an empty answer usually means the
 * area is thinly mapped in OSM rather than genuinely placeless — worth another
 * try eventually, but not on every request.
 */
const NOT_FOUND_TTL_MS = 30 * 24 * 3600_000;

const GEO_PK = "GEO";
const cellSk = (cell: string) => `CELL#${cell}`;

export type Place = {
  city: string;
  state?: string;
  country?: string;
};

type CachedCell = {
  pk: string;
  sk: string;
  city?: string;
  state?: string;
  country?: string;
  /** Set when Nominatim answered but had no place for this cell (e.g. at sea). */
  notFound?: boolean;
  updatedAt: string;
};

/**
 * Grid cell containing a coordinate, as a stable string key. Uses the cell's
 * lower-left corner so the key is exact rather than subject to float drift.
 */
export function cellKey(lat: number, lon: number): string {
  const snap = (v: number) => Math.floor(v / CELL_SIZE) * CELL_SIZE;
  return `${snap(lat).toFixed(1)},${snap(lon).toFixed(1)}`;
}

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ask Nominatim which place a coordinate belongs to. Returns null when the
 * service answered but knows no place here, and throws on transport/server
 * failures — the caller caches the former and retries the latter.
 */
async function reverseGeocode(lat: number, lon: number): Promise<Place | null> {
  const res = await fetch(NOMINATIM_URL(lat, lon), {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const json = (await res.json()) as {
    address?: Record<string, string | undefined>;
  };
  const a = json.address;
  if (!a) return null;
  // Nominatim names the field after the settlement type it matched, so try the
  // ranks in descending size until one hits. `city` first is deliberate: for
  // Brazilian addresses it holds the municipality, which is what we want.
  const city =
    a.city ??
    a.town ??
    a.municipality ??
    a.village ??
    a.city_district ??
    a.county;
  if (!city) return null;
  return { city, state: a.state, country: a.country };
}

async function readCache(cells: string[]): Promise<Map<string, CachedCell>> {
  const found = new Map<string, CachedCell>();
  // BatchGet caps at 100 keys per call.
  for (let i = 0; i < cells.length; i += 100) {
    const chunk = cells.slice(i, i + 100);
    const res = await ddb.send(
      new BatchGetCommand({
        RequestItems: {
          [tableName()]: {
            Keys: chunk.map((cell) => ({ pk: GEO_PK, sk: cellSk(cell) })),
          },
        },
      }),
    );
    for (const item of (res.Responses?.[tableName()] ?? []) as CachedCell[]) {
      found.set(item.sk.slice("CELL#".length), item);
    }
  }
  return found;
}

async function writeCache(cell: string, place: Place | null): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        pk: GEO_PK,
        sk: cellSk(cell),
        ...(place ? place : { notFound: true }),
        updatedAt: new Date().toISOString(),
      } satisfies CachedCell,
    }),
  );
}

/**
 * Resolve each coordinate to a place, geocoding only the grid cells not already
 * cached. Coordinates whose cell has no known place are omitted from the
 * result, so callers should treat a missing key as "unknown", not an error.
 */
export async function resolvePlaces(
  points: { lat: number; lon: number }[],
): Promise<Map<string, Place>> {
  // One representative real coordinate per cell — the first one seen.
  const samples = new Map<string, { lat: number; lon: number }>();
  for (const p of points) {
    const cell = cellKey(p.lat, p.lon);
    if (!samples.has(cell)) samples.set(cell, p);
  }
  if (samples.size === 0) return new Map();

  const cached = await readCache([...samples.keys()]);
  const places = new Map<string, Place>();
  const stale: string[] = [];
  for (const [cell, item] of cached) {
    if (item.city) {
      places.set(cell, {
        city: item.city,
        state: item.state,
        country: item.country,
      });
    } else if (
      Date.now() - new Date(item.updatedAt).getTime() > NOT_FOUND_TTL_MS
    ) {
      stale.push(cell);
    }
  }

  const todo = [...samples.keys()].filter(
    (cell) => !cached.has(cell) || stale.includes(cell),
  );
  for (let i = 0; i < todo.length; i++) {
    const cell = todo[i]!;
    if (i > 0) await sleep(REQUEST_SPACING_MS);
    const { lat, lon } = samples.get(cell)!;
    try {
      const place = await reverseGeocode(lat, lon);
      await writeCache(cell, place);
      if (place) places.set(cell, place);
    } catch (e) {
      // Transport/server failure — leave it uncached so the next call retries.
      console.log(`geocode ${cell}: ${(e as Error).message}`);
    }
  }
  return places;
}
