import { MathUtils, Quaternion, Vector3 } from "three";
import type { Pose } from "./protocol";
import { deviceQuaternion } from "./orientation";

export type SensorSource = "relative" | "orientation" | "absolute";
/** W3C device-frame quaternion -> the same Y-up camera basis as deviceorientation. */
export function sensorQuaternion(values: readonly number[], screen: number) {
  if (
    values.length !== 4 ||
    !values.every(Number.isFinite) ||
    Math.abs(Math.hypot(...values) - 1) > 0.02
  )
    return null;
  const device = new Quaternion(values[0], values[1], values[2], values[3]);
  const worldBasis = new Quaternion().setFromAxisAngle(
    new Vector3(1, 0, 0),
    -Math.PI / 2,
  );
  return worldBasis
    .multiply(device)
    .multiply(
      new Quaternion().setFromAxisAngle(
        new Vector3(0, 0, 1),
        -MathUtils.degToRad(screen),
      ),
    )
    .normalize();
}
/** Retain the last camera offset across a source restart, screen turn or sampling gap. */
export class SensorStream {
  private reference: Quaternion | null = null;
  private anchor = new Quaternion();
  private output = new Quaternion();
  private source: SensorSource | null = null;
  private screen = 0;
  private last = -Infinity;
  rebase() {
    this.reference = null;
    this.anchor.copy(this.output);
  }
  recenter(): Pose {
    this.output.identity();
    this.anchor.identity();
    this.reference = null;
    return [0, 0, 0, 1];
  }
  age(now: number) {
    return now - this.last;
  }
  update(
    raw: Quaternion,
    source: SensorSource,
    screen: number,
    now: number,
  ): Pose | null {
    if (
      ![raw.x, raw.y, raw.z, raw.w].every(Number.isFinite) ||
      Math.abs(raw.length() - 1) > 0.02
    )
      return null;
    if (
      this.source !== source ||
      this.screen !== screen ||
      this.age(now) > 1000
    )
      this.rebase();
    this.source = source;
    this.screen = screen;
    this.last = now;
    this.reference ||= raw.clone();
    const target = this.anchor
      .clone()
      .multiply(this.reference.clone().invert().multiply(raw))
      .normalize();
    // Reject one-sample compass discontinuities; re-anchor without snapping the camera.
    if (this.output.angleTo(target) > Math.PI * 0.75) {
      this.rebase();
      this.reference = raw.clone();
    } else this.output.copy(target);
    return this.output.toArray() as Pose;
  }
}
// Kept in one place so fallback sources share validation and null-alpha handling.
export function eventQuaternion(
  alpha: number | null,
  beta: number | null,
  gamma: number | null,
  screen: number,
  previousAlpha = 0,
) {
  if (
    beta === null ||
    gamma === null ||
    ![beta, gamma, alpha ?? previousAlpha].every(Number.isFinite)
  )
    return null;
  return deviceQuaternion(alpha ?? previousAlpha, beta, gamma, screen);
}
