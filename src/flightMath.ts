import type { Quat, Vec3 } from "./flightTypes";
export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
export const add = (a: Vec3, b: Vec3): Vec3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
export const sub = (a: Vec3, b: Vec3): Vec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
export const scale = (a: Vec3, n: number): Vec3 => [
  a[0] * n,
  a[1] * n,
  a[2] * n,
];
export const dot = (a: Vec3, b: Vec3) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3) => Math.hypot(...a);
export const unit = (a: Vec3): Vec3 => scale(a, 1 / Math.max(1e-9, length(a)));
export const conjugate = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];
export function multiply(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export function normalize(q: Quat): Quat {
  const n = Math.hypot(...q);
  return n > 1e-12 ? (q.map((v) => v / n) as Quat) : [0, 0, 0, 1];
}
export function rotate(q: Quat, v: Vec3): Vec3 {
  const u: Vec3 = [q[0], q[1], q[2]],
    t = scale(cross(u, v), 2);
  return add(v, add(scale(t, q[3]), cross(u, t)));
}
/** YXZ orientation; model nose +Z, compass north -Z. */
export function attitude(heading: number, pitch = 0, roll = 0): Quat {
  const y = (Math.PI - heading) / 2,
    x = pitch / 2,
    z = roll / 2;
  return normalize(
    multiply(
      multiply(
        [0, Math.sin(y), 0, Math.cos(y)],
        [Math.sin(x), 0, 0, Math.cos(x)],
      ),
      [0, 0, Math.sin(z), Math.cos(z)],
    ),
  );
}
export function slerp(a: Quat, b: Quat, t: number): Quat {
  let d = a.reduce((s, v, i) => s + v * b[i], 0);
  if (d < 0) {
    b = b.map((v) => -v) as Quat;
    d = -d;
  }
  if (d > 0.9995) return normalize(a.map((v, i) => v + (b[i] - v) * t) as Quat);
  const angle = Math.acos(clamp(d, -1, 1)),
    s = Math.sin(angle);
  return a.map(
    (v, i) => (v * Math.sin((1 - t) * angle) + b[i] * Math.sin(t * angle)) / s,
  ) as Quat;
}
/** Deterministic seeded stream, separate from the historical scenario stream. */
export function flightRandom(seed: number) {
  let n = seed >>> 0;
  return () => {
    n += 0x6d2b79f5;
    let t = Math.imul(n ^ (n >>> 15), n | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
