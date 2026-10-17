import { flightForContact, formationIndex } from "./contactFlight";
import type { Scenario } from "./simulation";
import type { FlightState, Quat, Vec3 } from "./flightTypes";
import { bodyState, createBody, PHYSICS_HZ, stepBody } from "./flightPhysics";
import { FLIGHT_PROFILES } from "./flightProfiles";
import { add, clamp, length, scale, slerp, sub } from "./flightMath";
export const TRACE_HZ = 60,
  TRACE_STRIDE = 40;
export type FlightTrace = {
  data: Float32Array;
  count: number;
  frames: number;
  arrival: number;
  duration: number;
  models: string[];
};
function write(data: Float32Array, o: number, s: FlightState) {
  data.set(
    [...s.position, ...s.velocity, ...s.orientation, ...s.angularVelocity],
    o,
  );
  data.set(s.rotorRPM, o + 13);
  data.set(s.rotorAngles, o + 19);
  data.set(
    [
      s.wing.shoulder,
      s.wing.elbow,
      s.wing.wrist,
      s.wing.tail,
      +s.wing.flapping,
      ...s.surfaces,
      s.airspeed,
      +s.stalled,
      +s.collided,
    ],
    o + 25,
  );
}
function read(trace: FlightTrace, frame: number, index: number): FlightState {
  const a = trace.data,
    o = (frame * trace.count + index) * TRACE_STRIDE,
    n =
      FLIGHT_PROFILES[trace.models[index] as keyof typeof FLIGHT_PROFILES].motors
        .length;
  const vec = (start: number): Vec3 => [
    a[o + start],
    a[o + start + 1],
    a[o + start + 2],
  ];
  return {
    position: vec(0),
    velocity: vec(3),
    orientation: [...a.slice(o + 6, o + 10)] as Quat,
    angularVelocity: vec(10),
    rotorRPM: [...a.slice(o + 13, o + 13 + n)],
    rotorAngles: [...a.slice(o + 19, o + 19 + n)],
    wing: {
      shoulder: a[o + 25],
      elbow: a[o + 26],
      wrist: a[o + 27],
      tail: a[o + 28],
      flapping: !!a[o + 29],
    },
    surfaces: vec(30),
    airspeed: a[o + 33],
    stalled: !!a[o + 34],
    collided: !!a[o + 35],
  };
}
export function compileFlight(scenario: Scenario): FlightTrace {
  if (!scenario.flight) throw new Error("Missing v3 flight definition");
  const frames =
      Math.ceil((scenario.duration - scenario.arrival) * TRACE_HZ) + 1,
    data = new Float32Array(frames * scenario.count * TRACE_STRIDE);
  const bodies = Array.from({ length: scenario.count }, (_, i) =>
    createBody(FLIGHT_PROFILES[flightForContact(scenario, i)!.model], flightForContact(scenario, i)!, scenario.seed, formationIndex(scenario, i)),
  );
  let states = bodies.map((b) => bodyState(b));
  for (let f = 0; f < frames; f++) {
    states.forEach((s, i) =>
      write(data, (f * scenario.count + i) * TRACE_STRIDE, s),
    );
    if (f === frames - 1) break;
    for (let k = 0; k < PHYSICS_HZ / TRACE_HZ; k++) {
      bodies.forEach((body, i) => {
        body.avoidance = [0, 0, 0];
        states.forEach((other, j) => {
          if (i === j) return;
          const delta = sub(states[i].position, other.position),
            r = length(delta);
          if (r > 1e-5 && r < 7)
            body.avoidance = add(
              body.avoidance,
              scale(delta, ((7 - r) * 0.5) / r),
            );
        });
      });
      states = bodies.map((body, i) =>
        stepBody(body, undefined, formationIndex(scenario, i) ? states[i - formationIndex(scenario, i)] : undefined),
      );
    }
  }
  return {
    data,
    count: scenario.count,
    frames,
    arrival: scenario.arrival,
    duration: scenario.duration,
    models: bodies.map((_, i) => flightForContact(scenario, i)!.model),
  };
}
export function interpolateState(
  a: FlightState,
  b: FlightState,
  t: number,
  dt: number,
): FlightState {
  const lerp = (x: number, y: number) => x + (y - x) * t,
    vec = (x: Vec3, y: Vec3) => x.map((v, i) => lerp(v, y[i])) as Vec3;
  const h00 = 2 * t ** 3 - 3 * t * t + 1,
    h10 = t ** 3 - 2 * t * t + t,
    h01 = -2 * t ** 3 + 3 * t * t,
    h11 = t ** 3 - t * t;
  const position = a.position.map(
    (v, i) =>
      h00 * v +
      h10 * dt * a.velocity[i] +
      h01 * b.position[i] +
      h11 * dt * b.velocity[i],
  ) as Vec3;
  return {
    ...a,
    position,
    velocity: vec(a.velocity, b.velocity),
    orientation: slerp(a.orientation, b.orientation, t),
    angularVelocity: vec(a.angularVelocity, b.angularVelocity),
    rotorRPM: a.rotorRPM.map((v, i) => lerp(v, b.rotorRPM[i])),
    rotorAngles: a.rotorAngles.map((v, i) => lerp(v, b.rotorAngles[i])),
    wing: {
      shoulder: lerp(a.wing.shoulder, b.wing.shoulder),
      elbow: lerp(a.wing.elbow, b.wing.elbow),
      wrist: lerp(a.wing.wrist, b.wing.wrist),
      tail: lerp(a.wing.tail, b.wing.tail),
      flapping: t < 0.5 ? a.wing.flapping : b.wing.flapping,
    },
    surfaces: vec(a.surfaces, b.surfaces),
    airspeed: lerp(a.airspeed, b.airspeed),
    stalled: t < 0.5 ? a.stalled : b.stalled,
    collided: a.collided || b.collided,
  };
}
export function sampleTrace(
  trace: FlightTrace,
  time: number,
  index: number,
): FlightState {
  index = clamp(Math.floor(index), 0, trace.count - 1);
  const f = clamp(
      (Math.min(time, trace.duration) - trace.arrival) * TRACE_HZ,
      0,
      trace.frames - 1,
    ),
    lo = Math.floor(f),
    hi = Math.min(lo + 1, trace.frames - 1);
  const state = interpolateState(
    read(trace, lo, index),
    read(trace, hi, index),
    f - lo,
    1 / TRACE_HZ,
  );
  if (time < trace.arrival) {
    state.velocity = [0, 0, 0];
    state.angularVelocity = [0, 0, 0];
  }
  return state;
}
