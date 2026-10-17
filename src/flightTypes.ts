export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type BirdId = "black-kite" | "house-crow" | "rock-pigeon";
export type FlightModelId =
  | "mavic-3"
  | "phantom-4-pro"
  | "matrice-350-rtk"
  | "mini-4-pro"
  | "typhoon-h480"
  | "rc-cessna"
  | BirdId;
export type WindPreset = "calm" | "breeze" | "gusty";
export type TerrainSnapshot = {
  version: 1;
  theatre: string;
  latitude: number;
  longitude: number;
  datum: number;
  size: number;
  resolution: number;
  heights: number[];
  source: "sampled" | "flat";
};
export type FlightDefinition = {
  version: 1;
  model: FlightModelId;
  wind: WindPreset;
  terrain: TerrainSnapshot;
  waypoints: Vec3[];
  holds: number[];
  cruiseSpeed: number;
};
export type PilotInput = {
  forward: number;
  right: number;
  climb: number;
  yaw: number;
  throttle: number;
  pitch: number;
  roll: number;
};
export const NEUTRAL_INPUT: PilotInput = {
  forward: 0,
  right: 0,
  climb: 0,
  yaw: 0,
  throttle: 0,
  pitch: 0,
  roll: 0,
};
export type FlightState = {
  position: Vec3;
  velocity: Vec3;
  orientation: Quat;
  angularVelocity: Vec3;
  rotorRPM: number[];
  rotorAngles: number[];
  wing: WingPose;
  surfaces: Vec3;
  airspeed: number;
  stalled: boolean;
  collided: boolean;
};
export type WingPose = {
  shoulder: number;
  elbow: number;
  wrist: number;
  tail: number;
  flapping: boolean;
};
export type FlightProfile = {
  id: FlightModelId;
  kind: "multirotor" | "fixed-wing" | "bird";
  mass: number;
  inertia: Vec3;
  motors: Vec3[];
  maxRPM: number;
  motorLag: number;
  thrustRatio: number;
  dragArea: Vec3;
  maxSpeed: number;
  maxClimb: number;
  maxAltitude: number;
  wingArea: number;
  liftSlope: number;
  liftZero: number;
  stallAngle: number;
  cruiseSpeed: number;
  flapHz: number;
  flapPeriod: number;
  flapDuty: number;
  clearance: number;
  source: string;
};
