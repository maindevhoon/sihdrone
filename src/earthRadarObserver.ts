import { Cartesian3, Matrix4 } from 'cesium';
import { DEFAULT_RADAR_OBSERVER } from './radarMath';
import type { Position } from './simulation';

/** Follow the reticle on the exercise airspace plane, independent of loaded terrain tiles.
 * The original sensor site translates with this point; altitude remains relative to the airspace datum.
 */
export function earthRadarObserver(
  inverseFrame: Matrix4, cameraPosition: Cartesian3, cameraDirection: Cartesian3,
  airspaceHeight: number, metresPerUnit = 8,
): Position | null {
  const origin = Matrix4.multiplyByPoint(inverseFrame, cameraPosition, new Cartesian3());
  const direction = Matrix4.multiplyByPointAsVector(inverseFrame, cameraDirection, new Cartesian3());
  if (direction.z >= -1e-6) return null;
  const distance = (airspaceHeight - origin.z) / direction.z;
  if (!Number.isFinite(distance) || distance < 0) return null;
  return [
    DEFAULT_RADAR_OBSERVER[0] + (origin.x + direction.x * distance) / metresPerUnit,
    DEFAULT_RADAR_OBSERVER[1],
    DEFAULT_RADAR_OBSERVER[2] - (origin.y + direction.y * distance) / metresPerUnit,
  ];
}
