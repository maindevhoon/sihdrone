import type { TerrainSnapshot } from "./flightTypes";
import { clamp } from "./flightMath";
import { THEATRES, type Theatre } from "./theatres";
export const TERRAIN_SIZE = 2000,
  TERRAIN_RESOLUTION = 65;
export function flatTerrain(theatre: Theatre): TerrainSnapshot {
  return {
    version: 1,
    theatre: theatre.id,
    latitude: theatre.latitude ?? 0,
    longitude: theatre.longitude ?? 0,
    datum: theatre.elevation ?? 0,
    size: TERRAIN_SIZE,
    resolution: TERRAIN_RESOLUTION,
    heights: Array(TERRAIN_RESOLUTION ** 2).fill(0),
    source: "flat",
  };
}
/** Heights relative to the fixed session datum; simulation axes east/up/south. */
export function terrainHeight(terrain: TerrainSnapshot, x: number, z: number) {
  const n = terrain.resolution,
    u = clamp((x / terrain.size + 0.5) * (n - 1), 0, n - 1),
    v = clamp((z / terrain.size + 0.5) * (n - 1), 0, n - 1);
  const a = Math.min(n - 2, Math.floor(u)),
    b = Math.min(n - 2, Math.floor(v)),
    fx = u - a,
    fz = v - b,
    h = terrain.heights;
  return (
    (h[b * n + a] * (1 - fx) + h[b * n + a + 1] * fx) * (1 - fz) +
    (h[(b + 1) * n + a] * (1 - fx) + h[(b + 1) * n + a + 1] * fx) * fz
  );
}
export function validTerrain(value: unknown): value is TerrainSnapshot {
  if (!value || typeof value !== "object") return false;
  const t = value as TerrainSnapshot,
    site = THEATRES.find((s) => s.id === t.theatre);
  return (
    !!site &&
    t.version === 1 &&
    t.size === TERRAIN_SIZE &&
    t.resolution === TERRAIN_RESOLUTION &&
    t.latitude === (site.latitude ?? 0) &&
    t.longitude === (site.longitude ?? 0) &&
    Number.isFinite(t.datum) &&
    t.datum >= -500 &&
    t.datum <= 9000 &&
    ["flat", "sampled"].includes(t.source) &&
    Array.isArray(t.heights) &&
    t.heights.length === t.resolution ** 2 &&
    t.heights.every((h) => Number.isFinite(h) && Math.abs(h) <= 10000)
  );
}
