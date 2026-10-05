/** An unscored sample loops on the same time source used by the scene and radar. */
export function advancePreview(time: number, delta: number, duration: number): number {
  if (!Number.isFinite(delta) || delta <= 0 || !Number.isFinite(duration) || duration <= 0) return time;
  return (time + delta) % duration;
}
