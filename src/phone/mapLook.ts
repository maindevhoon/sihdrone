import { Euler, Quaternion } from "three";
import { smoothing } from "./orientation";
import type { Pose } from "./protocol";

export type MapLook = { heading: number; pitch: number };
const tau = Math.PI * 2;
export const angleDelta = (from: number, to: number) =>
  ((((to - from + Math.PI) % tau) + tau) % tau) - Math.PI;
export function poseLook(pose: Pose): MapLook {
  const e = new Euler().setFromQuaternion(new Quaternion(...pose), "YXZ");
  return { heading: -e.y, pitch: e.x };
}
/** Rebase on desktop navigation rather than pulling it back to the phone's old reference. */
export class PhoneMapLook {
  private base: MapLook | null = null;
  private applied: MapLook | null = null;
  private revision = -1;
  reset() {
    this.base = null;
    this.applied = null;
  }
  update(
    current: MapLook,
    pose: Pose,
    revision: number,
    delta: number,
  ): MapLook {
    const offset = poseLook(pose);
    if (!this.base || revision !== this.revision) {
      // A new reference preserves the current geographic camera position and viewing direction.
      this.base = {
        heading: current.heading - offset.heading,
        pitch: current.pitch - offset.pitch,
      };
      this.applied = current;
      this.revision = revision;
    } else if (this.applied) {
      this.base.heading += angleDelta(this.applied.heading, current.heading);
      this.base.pitch += current.pitch - this.applied.pitch;
    }
    const target = {
      heading: this.base.heading + offset.heading,
      pitch: Math.max(
        (-85 * Math.PI) / 180,
        Math.min((60 * Math.PI) / 180, this.base.pitch + offset.pitch),
      ),
    };
    const ease = smoothing(delta);
    this.applied = {
      heading:
        (((current.heading +
          angleDelta(current.heading, target.heading) * ease) %
          tau) +
          tau) %
        tau,
      pitch: current.pitch + (target.pitch - current.pitch) * ease,
    };
    return this.applied;
  }
}
