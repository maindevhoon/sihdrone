import { AIRFRAMES } from "./airframes";
import { BIRDS } from "./birds";
import type { FlightModelId, FlightProfile } from "./flightTypes";
const base = {
  motorLag: 0.09,
  thrustRatio: 2.3,
  maxClimb: 5,
  maxAltitude: 5000,
  wingArea: 0,
  liftSlope: 4.75,
  liftZero: 0.28,
  stallAngle: 0.34,
  cruiseSpeed: 8,
  flapHz: 0,
  flapPeriod: 5,
  flapDuty: 0,
  clearance: 0.4,
};
const masses = {
  "mavic-3": 0.895,
  "phantom-4-pro": 1.375,
  "matrice-350-rtk": 6.47,
  "mini-4-pro": 0.249,
  "typhoon-h480": 1.98,
  "rc-cessna": 1.5,
};
const limits = {
  "mavic-3": [21, 6000],
  "phantom-4-pro": [20, 6000],
  "matrice-350-rtk": [23, 7000],
  "mini-4-pro": [16, 4000],
  "typhoon-h480": [13.5, 3000],
  "rc-cessna": [28, 6000],
};
/** Mass/size/limits are sourced. Inertia, drag, thrust curves and gains are estimates,
 * not proprietary manufacturer flight models. Typhoon/reference-plane ceilings are practice limits. */
export const FLIGHT_PROFILES: Record<FlightModelId, FlightProfile> =
  Object.fromEntries([
    ...Object.values(AIRFRAMES).map((a) => {
      const mass = masses[a.id],
        r = a.span * 0.25;
      return [
        a.id,
        {
          ...base,
          id: a.id,
          kind: a.fixedWing ? "fixed-wing" : "multirotor",
          mass,
          inertia: [
            mass * r * r * 0.35,
            mass * r * r * 0.6,
            mass * r * r * 0.35,
          ],
          motors: a.motors,
          maxRPM: ((a.bladePassHz * 60) / 2) * 1.7,
          dragArea: [
            a.span ** 2 * 0.06 + a.body.width * a.body.height,
            a.span ** 2 * 0.08 + a.body.width * a.body.length * 0.6,
            a.span ** 2 * 0.05 + a.body.width * a.body.height,
          ],
          maxSpeed: limits[a.id][0],
          maxAltitude: limits[a.id][1],
          wingArea: a.fixedWing ? 0.48 : 0,
          cruiseSpeed: a.fixedWing ? 17 : 8,
          clearance: a.fixedWing ? 0.3 : Math.max(0.15, a.gear.depth),
          source: a.source,
        },
      ];
    }),
    ...Object.values(BIRDS).map((b) => {
      const kite = b.id === "black-kite",
        pigeon = b.id === "rock-pigeon",
        mass = kite ? 0.735 : pigeon ? 0.32 : 0.3;
      return [
        b.id,
        {
          ...base,
          id: b.id,
          kind: "bird",
          mass,
          inertia: [mass * 0.008, mass * 0.02, mass * 0.035],
          motors: [],
          maxRPM: 0,
          dragArea: [0.012, 0.02, 0.009],
          maxSpeed: pigeon ? 22 : 18,
          maxAltitude: 8000,
          maxClimb: 3,
          wingArea: kite ? 0.28 : pigeon ? 0.065 : 0.11,
          cruiseSpeed: pigeon ? 14 : kite ? 11 : 10,
          flapHz: pigeon ? 6.5 : kite ? 2.5 : 4.5,
          flapPeriod: kite ? 6 : pigeon ? 3 : 4,
          flapDuty: kite ? 0.35 : pigeon ? 0.94 : 0.68,
          clearance: 0.12,
          source: b.source,
        },
      ];
    }),
  ]) as Record<FlightModelId, FlightProfile>;
export const WIND_PRESETS = ["calm", "breeze", "gusty"] as const;
