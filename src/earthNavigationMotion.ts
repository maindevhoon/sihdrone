import { clamp, type NavigationIntent } from './earthNavigationMath';

export type NavigationMotion = { panX: number; panY: number; orbitX: number; orbitY: number; zoom: number };
export const emptyMotion = (): NavigationMotion => ({ panX: 0, panY: 0, orbitX: 0, orbitY: 0, zoom: 0 });
export const hasMotion = (motion: NavigationMotion) => Object.values(motion).some(value => value !== 0);

/** Coalesce bursts into bounded travel. Reversing a gesture cancels its remaining momentum. */
export function addMotion(motion: NavigationMotion, intent: NavigationIntent): NavigationMotion {
  const next = { ...motion };
  const add = (key: keyof NavigationMotion, value: number, limit: number) => {
    if (!Number.isFinite(value)) return;
    const previous = Math.sign(next[key]) === -Math.sign(value) ? 0 : next[key];
    next[key] = clamp(previous + value, -limit, limit);
  };
  if (intent.kind === 'zoom') add('zoom', intent.logScale, .45);
  else if (intent.kind === 'pan') { add('panX', intent.x, 120); add('panY', intent.y, 120); }
  else { add('orbitX', intent.x, 160); add('orbitY', intent.y, 160); }
  return next;
}

/** A short, frame-rate-independent ease, with speed limits even after a stalled frame. */
export function consumeMotion(motion: NavigationMotion, seconds: number) {
  const step = emptyMotion(), remaining = { ...motion };
  if (!Number.isFinite(seconds) || seconds <= 0) return { step, remaining };
  const dt = Math.min(seconds, .05), fraction = 1 - Math.exp(-dt / .09);
  for (const key of Object.keys(step) as (keyof NavigationMotion)[]) {
    const zoom = key === 'zoom', limit = (zoom ? 1.5 : key.startsWith('pan') ? 240 : 300) * dt;
    const amount = Math.abs(motion[key]) < (zoom ? .00005 : .02) ? motion[key] : motion[key] * fraction;
    step[key] = clamp(amount, -limit, limit);
    remaining[key] -= step[key];
  }
  return { step, remaining };
}
