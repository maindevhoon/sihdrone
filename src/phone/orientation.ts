import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import type { Pose } from "./protocol";
const correction = new Quaternion().setFromAxisAngle(
  new Vector3(1, 0, 0),
  -Math.PI / 2,
);
/** Device intrinsic Z-X'-Y'' angles -> Three camera, including display rotation. */
export function deviceQuaternion(
  alpha: number,
  beta: number,
  gamma: number,
  screen: number,
) {
  return new Quaternion()
    .setFromEuler(
      new Euler(
        MathUtils.degToRad(beta),
        MathUtils.degToRad(alpha),
        -MathUtils.degToRad(gamma),
        "YXZ",
      ),
    )
    .multiply(correction)
    .multiply(
      new Quaternion().setFromAxisAngle(
        new Vector3(0, 0, 1),
        -MathUtils.degToRad(screen),
      ),
    )
    .normalize();
}
export function relativePose(reference: Quaternion, current: Quaternion): Pose {
  return reference
    .clone()
    .invert()
    .multiply(current)
    .normalize()
    .toArray() as Pose;
}
export function smoothing(delta: number) {
  return 1 - Math.exp(-Math.min(Math.max(delta, 0), 0.1) * 22);
}
/** A forgiving angular gate, bounded in angle rather than world-space distance. */
export function pickGaze(
  origin: Vector3,
  direction: Vector3,
  contacts: { id: number; position: [number, number, number] }[],
  degrees = 3,
) {
  let selected: number | null = null,
    best = Math.cos(MathUtils.degToRad(degrees));
  for (const contact of contacts) {
    const offset = new Vector3(...contact.position).sub(origin);
    if (offset.lengthSq() < 0.01) continue;
    const score = offset.normalize().dot(direction);
    if (score > best) {
      best = score;
      selected = contact.id;
    }
  }
  return selected;
}
