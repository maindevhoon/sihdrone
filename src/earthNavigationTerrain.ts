import { Cartesian3, Cartographic } from 'cesium';
import { MIN_EARTH_RANGE, zoomRange } from './earthNavigationMath';

export type SurfaceHeight = (position: Cartographic) => number | undefined;

/** Dolly along the picked surface ray. Its screen position and the camera's attitude stay fixed. */
export function zoomDestination(position: Cartesian3, target: Cartesian3, logScale: number): Cartesian3 {
  const offset = Cartesian3.subtract(position, target, new Cartesian3());
  const range = Cartesian3.magnitude(offset);
  if (range < 1 || !Number.isFinite(logScale)) return Cartesian3.clone(position);
  Cartesian3.multiplyByScalar(offset, zoomRange(range, logScale) / range, offset);
  return Cartesian3.add(target, offset, offset);
}

/** Stop along the requested path before entering loaded terrain, rather than snapping upward. */
export function limitTerrainMotion(from: Cartesian3, to: Cartesian3, heightAt: SurfaceHeight): Cartesian3 {
  const clearance = (point: Cartesian3) => {
    const position = Cartographic.fromCartesian(point);
    return position.height - (heightAt(position) ?? 0);
  };
  // If finer tiles just loaded around the camera, still let the operator move out of the slope.
  const minimum = Math.min(MIN_EARTH_RANGE, clearance(from));
  const steps = Math.min(16, Math.max(1, Math.ceil(Cartesian3.distance(from, to) / 100)));
  let safe = 0;
  for (let step = 1; step <= steps; step++) {
    let blocked = step / steps;
    const point = Cartesian3.lerp(from, to, blocked, new Cartesian3());
    if (clearance(point) < minimum - .001) {
      // Keep the same ray and cursor anchor at the boundary, including on sloping ground.
      for (let iteration = 0; iteration < 12; iteration++) {
        const middle = (safe + blocked) / 2;
        if (clearance(Cartesian3.lerp(from, to, middle, point)) >= minimum) safe = middle;
        else blocked = middle;
      }
      return Cartesian3.lerp(from, to, safe, point);
    }
    safe = blocked;
  }
  return Cartesian3.clone(to);
}
