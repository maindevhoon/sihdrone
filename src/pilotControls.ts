import type { PilotInput } from "./flightTypes";
export function pilotInput(
  keys: ReadonlySet<string>,
  fixedWing: boolean,
): PilotInput {
  const axis = (positive: string, negative: string) =>
    Number(keys.has(positive)) - Number(keys.has(negative));
  return {
    forward: fixedWing ? 0 : axis("KeyW", "KeyS"),
    right: fixedWing ? 0 : axis("KeyD", "KeyA"),
    climb: fixedWing ? 0 : axis("KeyR", "KeyF"),
    yaw: axis("KeyE", "KeyQ"),
    throttle: fixedWing ? axis("KeyW", "KeyS") : 0,
    pitch: fixedWing ? axis("ArrowUp", "ArrowDown") : 0,
    roll: fixedWing ? axis("KeyD", "KeyA") : 0,
  };
}
export const PILOT_KEYS = new Set([
  "KeyW",
  "KeyS",
  "KeyA",
  "KeyD",
  "KeyQ",
  "KeyE",
  "KeyR",
  "KeyF",
  "ArrowUp",
  "ArrowDown",
]);
