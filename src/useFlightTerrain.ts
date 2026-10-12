import { useEffect, useState } from "react";
import type { TerrainSnapshot } from "./flightTypes";
import type { Theatre } from "./theatres";
import {
  flatTerrain,
  TERRAIN_RESOLUTION as N,
  TERRAIN_SIZE,
} from "./flightTerrain";
const snapshots = new Map<string, TerrainSnapshot>(),
  requests = new Map<string, Promise<TerrainSnapshot>>();
async function sample(theatre: Theatre): Promise<TerrainSnapshot> {
  const {
    ArcGISTiledElevationTerrainProvider,
    Cartographic,
    sampleTerrain,
    sampleTerrainMostDetailed,
  } = await import("cesium");
  const provider = await ArcGISTiledElevationTerrainProvider.fromUrl(
    "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer",
  );
  const lat = theatre.latitude!,
    lon = theatre.longitude!,
    perLon = 111320 * Math.cos((lat * Math.PI) / 180);
  const points = Array.from({ length: N * N }, (_, i) => {
    const x = ((i % N) / (N - 1) - 0.5) * TERRAIN_SIZE,
      z = (Math.floor(i / N) / (N - 1) - 0.5) * TERRAIN_SIZE;
    return Cartographic.fromDegrees(lon + x / perLon, lat - z / 111320);
  });
  const heights = provider.availability
    ? await sampleTerrainMostDetailed(provider, points)
    : await sampleTerrain(provider, 12, points);
  if (heights.some((p) => !Number.isFinite(p.height)))
    throw new Error("Terrain returned incomplete elevations.");
  const datum = heights[(N * N - 1) / 2].height;
  const snapshot: TerrainSnapshot = {
    ...flatTerrain(theatre),
    datum,
    source: "sampled",
    heights: heights.map((p) => Math.round((p.height - datum) * 100) / 100),
  };
  snapshots.set(theatre.id, snapshot);
  while (snapshots.size > 2) snapshots.delete(snapshots.keys().next().value!);
  return snapshot;
}
function load(theatre: Theatre) {
  const existing = requests.get(theatre.id);
  if (existing) return existing;
  let timer: ReturnType<typeof setTimeout>;
  const promise = Promise.race([
    sample(theatre),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Terrain sampling timed out.")),
        20000,
      );
    }),
  ]).finally(() => {
    clearTimeout(timer);
    requests.delete(theatre.id);
  });
  requests.set(theatre.id, promise);
  return promise;
}
export function useFlightTerrain(theatre: Theatre, enabled = true) {
  const [terrain, setTerrain] = useState<TerrainSnapshot>(),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError("");
    if (!enabled) return;
    if (theatre.kind === "synthetic") {
      setTerrain(flatTerrain(theatre));
      return;
    }
    const cached = snapshots.get(theatre.id);
    if (cached) {
      setTerrain(cached);
      return;
    }
    setTerrain(undefined);
    void load(theatre).then(
      (t) => {
        if (!cancelled) setTerrain(t);
      },
      (e) => {
        if (!cancelled)
          setError(`${e.message} Retry, or choose flat practice.`);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [theatre, enabled, retry]);
  return {
    terrain: terrain?.theatre === theatre.id ? terrain : undefined,
    error,
    retry: () => {
      snapshots.delete(theatre.id);
      setRetry((n) => n + 1);
    },
    useFlat: () => {
      setTerrain(flatTerrain(theatre));
      setError("");
    },
  };
}
