import type { Category, Scenario, TrackDecision } from "../simulation";

export type Pose = [number, number, number, number];
export type PhoneContact = {
  id: number;
  range: number;
  bearing: number;
  altitude: number;
  speed: number;
};
export type PhoneSnapshot = {
  scenario: Scenario;
  epoch: number;
  time: number;
  phase: "preview" | "running" | "paused" | "replay";
  playing: boolean;
  decisions?: TrackDecision[];
  selectedTrack: number;
  theatre?: string;
  prepared?: boolean;
  aimedTrack?: number | null;
  bearing?: number;
  status?: string;
  contacts?: PhoneContact[];
  holdReason?: string;
};
export type PhoneAction =
  | { type: "observe"; track: number; epoch: number }
  | { type: "classify"; track: number; answer: Category; epoch: number };
export type PhoneTelemetry = {
  orientation: boolean;
  motion: boolean;
  acceleration: number | null;
  rotationRate: number | null;
  screen: number;
};
export type PhoneControl = { type: "control"; epoch: number } & (
  | { control: "recenter" | "next-track" | "home" | "north" | "hold" }
  | { control: "select-track"; track: number }
  | { control: "zoom"; amount: number }
  | { control: "pan"; x: number; y: number }
);
export type PhoneControls = { revision: number; queue: PhoneControl[] };
export function validControl(value: unknown): value is PhoneControl {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  if (m.type !== "control" || !Number.isSafeInteger(m.epoch)) return false;
  if (
    ["recenter", "next-track", "home", "north", "hold"].includes(
      m.control as string,
    )
  )
    return true;
  if (m.control === "select-track")
    return Number.isSafeInteger(m.track) && (m.track as number) >= 0;
  if (m.control === "zoom")
    return (
      typeof m.amount === "number" &&
      Number.isFinite(m.amount) &&
      Math.abs(m.amount) <= 0.3
    );
  return (
    m.control === "pan" &&
    [m.x, m.y].every(
      (n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 120,
    )
  );
}
export type PhoneMessage =
  | PhoneControl
  | PhoneAction
  | { type: "pose"; pose: Pose; telemetry: PhoneTelemetry }
  | { type: "ready"; epoch: number }
  | { type: "hold" };
export type WireMessage =
  | PhoneMessage
  | { type: "snapshot"; state: PhoneSnapshot }
  | { type: "tick"; state: Omit<PhoneSnapshot, "scenario"> }
  | { type: "peer"; connected: boolean }
  | { type: "ping"; at: number }
  | { type: "pong"; at: number };

export function validPose(value: unknown): value is Pose {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((n) => typeof n === "number" && Number.isFinite(n))
  )
    return false;
  const norm = Math.hypot(...value);
  return norm > 0.99 && norm < 1.01;
}
export function validAction(value: unknown): value is PhoneAction {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(m.track) &&
    (m.track as number) >= 0 &&
    Number.isSafeInteger(m.epoch) &&
    (m.type === "observe" ||
      (m.type === "classify" &&
        ["Single drone", "Drone group", "Bird"].includes(m.answer as string)))
  );
}
/** Never let an old/paused/disconnected handset submit a decision against a new encounter. */
export function acceptsAction(
  action: PhoneAction,
  state: PhoneSnapshot,
  ready: boolean,
) {
  return (
    ready &&
    state.prepared !== false &&
    state.phase === "running" &&
    state.playing &&
    action.epoch === state.epoch &&
    action.track < state.scenario.count &&
    state.time >= state.scenario.arrival &&
    state.time < state.scenario.duration
  );
}
/** Brief interpolation only. Loss of updates holds the phone rather than running its own exercise. */
export function remoteTime(
  state: PhoneSnapshot,
  ageMs: number,
  connected: boolean,
) {
  const advance =
    connected && state.playing && ageMs >= 0 && ageMs <= 500
      ? Math.min(ageMs, 200) / 1000
      : 0;
  return Math.min(state.scenario.duration, Math.max(0, state.time + advance));
}
