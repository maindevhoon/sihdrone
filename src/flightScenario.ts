import type { Category } from "./simulation";
import type {
  FlightDefinition,
  FlightModelId,
  TerrainSnapshot,
  Vec3,
  WindPreset,
} from "./flightTypes";
import { FLIGHT_PROFILES } from "./flightProfiles";
import { flightRandom } from "./flightMath";
import { terrainHeight } from "./flightTerrain";
export function createFlightDefinition(
  seed: number,
  category: Category,
  terrain: TerrainSnapshot,
  wind: WindPreset = "breeze",
  model?: FlightModelId,
): FlightDefinition {
  const random = flightRandom(seed ^ 0xbb67ae85);
  const birds: FlightModelId[] = ["black-kite", "house-crow", "rock-pigeon"];
  const drones: FlightModelId[] = [
    "mavic-3",
    "phantom-4-pro",
    "matrice-350-rtk",
    "mini-4-pro",
    "typhoon-h480",
    "rc-cessna",
  ];
  const pool = (category === "Bird" ? birds : drones).filter(
    (id) => FLIGHT_PROFILES[id].maxAltitude > terrain.datum + 250,
  );
  model ??= pool[Math.floor(random() * pool.length)] ?? "matrice-350-rtk";
  const p = FLIGHT_PROFILES[model],
    radius = p.kind === "multirotor" ? 55 + random() * 55 : 150 + random() * 85,
    angle = random() * Math.PI * 2,
    pattern = Math.floor(random() * 4);
  const shapes = [
    Array.from({ length: 8 }, (_, i) => [
      Math.sin((i * Math.PI) / 4),
      Math.cos((i * Math.PI) / 4),
    ]),
    [
      [1, 0.35],
      [-1, 0.35],
      [-1, -0.35],
      [1, -0.35],
    ],
    [
      [0, 0],
      [1, 1],
      [1.25, 0],
      [1, -1],
      [0, 0],
      [-1, 1],
      [-1.25, 0],
      [-1, -1],
    ],
    [
      [1, 0],
      [0.6, 0.6],
      [0, 1],
      [-0.6, 0.6],
      [-1, 0],
      [-0.6, -0.6],
      [0, -1],
      [0.6, -0.6],
    ],
  ];
  const points: Vec3[] = shapes[pattern].map(([u, v], i) => {
    const x = radius * (u * Math.cos(angle) - v * Math.sin(angle)),
      z = radius * (u * Math.sin(angle) + v * Math.cos(angle));
    return [x || 0, terrainHeight(terrain, x, z) + 60 + (i % 3) * 5, z || 0];
  });
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    let high = 0;
    for (let j = 0; j <= 20; j++)
      high = Math.max(
        high,
        terrainHeight(
          terrain,
          a[0] + ((b[0] - a[0]) * j) / 20,
          a[2] + ((b[2] - a[2]) * j) / 20,
        ),
      );
    a[1] = Math.max(a[1], high + 65);
    b[1] = Math.max(b[1], high + 65);
  }
  return {
    version: 1,
    model,
    wind,
    terrain,
    waypoints: points,
    holds: points.map((_, i) =>
      p.kind === "multirotor" && pattern === 1 && i % 2 === 1 ? 2 : 0,
    ),
    cruiseSpeed:
      p.kind === "multirotor"
        ? 5 + random() * 4
        : p.cruiseSpeed + (wind === "gusty" ? 4 : 0),
  };
}
