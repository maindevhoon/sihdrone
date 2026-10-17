import type {
  FlightDefinition,
  FlightProfile,
  FlightState,
  PilotInput,
  Quat,
  Vec3,
  WingPose,
  WindPreset,
} from "./flightTypes";
import { NEUTRAL_INPUT } from "./flightTypes";
import {
  add,
  attitude,
  clamp,
  conjugate,
  cross,
  dot,
  flightRandom,
  length,
  multiply,
  normalize,
  rotate,
  scale,
  sub,
  unit,
} from "./flightMath";
import { terrainHeight } from "./flightTerrain";
export const PHYSICS_HZ = 120,
  PHYSICS_DT = 1 / PHYSICS_HZ;
const G = 9.80665;
export const airDensity = (altitude: number) =>
  1.225 *
  Math.pow(
    Math.max(0.1, 1 - 2.25577e-5 * clamp(altitude, -500, 11000)),
    4.25588,
  );
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export function windAt(
  seed: number,
  preset: WindPreset,
  time: number,
  position: Vec3,
): Vec3 {
  if (preset === "calm") return [0, 0, 0];
  const r = flightRandom(seed ^ 0x6a09e667),
    angle = r() * Math.PI * 2,
    phase = r() * Math.PI * 2;
  const mean = preset === "breeze" ? 4 : 8,
    amplitude = preset === "breeze" ? 0.8 : 2.2;
  const gust =
    amplitude *
    (Math.sin(time * 0.63 + phase) + 0.45 * Math.sin(time * 1.71 + phase * 2));
  return [
    Math.sin(angle) * (mean + gust),
    0.2 * amplitude * Math.sin(time * 0.37 + position[0] / 170 + phase),
    -Math.cos(angle) * (mean + gust),
  ];
}
/** Smooth bursts with shoulder/elbow/wrist lag; identical at any frame rate or seek. */
export function wingPose(
  profile: FlightProfile,
  time: number,
  index = 0,
  roll = 0,
): WingPose {
  const cycle =
    (((time + index * 0.31) % profile.flapPeriod) + profile.flapPeriod) %
    profile.flapPeriod;
  const duration = profile.flapPeriod * profile.flapDuty;
  const blend =
    profile.kind === "bird" && cycle < duration
      ? Math.min(1, cycle / 0.18, (duration - cycle) / 0.18)
      : 0;
  const phase = (time + index * 0.31) * profile.flapHz * Math.PI * 2;
  return {
    shoulder: 0.12 + blend * Math.sin(phase) * 0.65,
    elbow: blend * (0.16 + 0.24 * Math.sin(phase - 0.7)),
    wrist: blend * (0.12 + 0.2 * Math.sin(phase - 1.1)),
    tail: clamp(-roll * 0.25, -0.3, 0.3),
    flapping: blend > 0.05,
  };
}
export type FlightBody = {
  profile: FlightProfile;
  definition: FlightDefinition;
  seed: number;
  index: number;
  raw: number[];
  tick: number;
  route: number;
  heading: number;
  hold: Vec3;
  throttle: number;
  collided: boolean;
  boundary: boolean;
  waitingUntil: number;
  avoidance: Vec3;
  wasMoving: boolean;
  surfaces: Vec3;
};
type Command = { motors: number[]; torque: Vec3; surfaces: Vec3; flap: number };
const vector = (a: number[], i: number): Vec3 => [a[i], a[i + 1], a[i + 2]];
const quaternion = (a: number[]): Quat => [a[6], a[7], a[8], a[9]];
export function createBody(
  profile: FlightProfile,
  definition: FlightDefinition,
  seed: number,
  index = 0,
): FlightBody {
  const p = [...definition.waypoints[0]] as Vec3,
    next = definition.waypoints[1];
  // Loose trailing formation in the leader's initial body frame, never world-axis offsets.
  const heading = Math.atan2(next[0] - p[0], p[2] - next[2]),
    offset = profile.kind === "bird" ? 12 : 9;
  p[0] -= Math.sin(heading) * index * offset;
  p[2] += Math.cos(heading) * index * offset;
  p[0] += Math.cos(heading) * (index % 2 ? 1 : -1) * index * offset * 0.45;
  p[2] += Math.sin(heading) * (index % 2 ? 1 : -1) * index * offset * 0.45;
  p[1] = Math.max(
    p[1] + index * 2,
    terrainHeight(definition.terrain, p[0], p[2]) + 35,
  );
  const flying = profile.kind !== "multirotor",
    q = attitude(heading, flying ? -0.06 : 0),
    v: Vec3 = flying
      ? [
          Math.sin(heading) * definition.cruiseSpeed,
          0,
          -Math.cos(heading) * definition.cruiseSpeed,
        ]
      : [0, 0, 0];
  const hover = Math.sqrt(
    1 /
      ((profile.thrustRatio * airDensity(definition.terrain.datum + p[1])) /
        1.225),
  );
  return {
    profile,
    definition,
    seed,
    index,
    raw: [
      ...p,
      ...v,
      ...q,
      0,
      0,
      0,
      ...profile.motors.map(() => (flying ? 0.65 : hover)),
      ...profile.motors.map(() => 0),
    ],
    tick: 0,
    route: 1,
    heading,
    hold: [...p],
    throttle: 0.65,
    collided: false,
    boundary: false,
    waitingUntil: 0,
    avoidance: [0, 0, 0],
    wasMoving: false,
    surfaces: [0, 0, 0],
  };
}
const allocations = new WeakMap<FlightProfile, number[][]>();
/** Motor allocation includes asymmetric arm positions and gives a hex redundant thrust sharing. */
function allocation(profile: FlightProfile): number[][] {
  const cached = allocations.get(profile);
  if (cached) return cached;
  const n = profile.motors.length,
    columns = profile.motors.map((m, i) => [
      1,
      -m[2],
      0.022 * (n === 6 ? (i % 2 ? 1 : -1) : Math.sign(m[0] * m[2])),
      m[0],
    ]);
  const matrix = Array.from({ length: 4 }, (_, r) =>
    Array.from({ length: 8 }, (_, c) =>
      c < 4 ? columns.reduce((sum, b) => sum + b[r] * b[c], 0) : +(c - 4 === r),
    ),
  );
  for (let pivot = 0; pivot < 4; pivot++) {
    const divisor = matrix[pivot][pivot];
    matrix[pivot] = matrix[pivot].map((v) => v / divisor);
    for (let row = 0; row < 4; row++)
      if (row !== pivot) {
        const factor = matrix[row][pivot];
        matrix[row] = matrix[row].map((v, c) => v - factor * matrix[pivot][c]);
      }
  }
  const result = columns.map((b) =>
    Array.from({ length: 4 }, (_, c) =>
      b.reduce((sum, v, r) => sum + v * matrix[r][c + 4], 0),
    ),
  );
  allocations.set(profile, result);
  return result;
}
function routeVelocity(body: FlightBody, leader?: FlightState): Vec3 {
  const { profile, definition } = body,
    p = vector(body.raw, 0),
    v = vector(body.raw, 3);
  let target: Vec3;
  if (leader && body.index) {
    const delay = body.index * 7,
      forward = rotate(leader.orientation, [0, 0, 1]),
      right = rotate(leader.orientation, [-1, 0, 0]);
    target = add(
      leader.position,
      add(
        scale(forward, -delay),
        scale(right, (body.index % 2 ? 1 : -1) * body.index * 5),
      ),
    );
    target[1] += body.index * 2;
  } else {
    target = definition.waypoints[body.route];
    const hold = definition.holds[body.route] ?? 0;
    if (
      hold &&
      Math.hypot(target[0] - p[0], target[2] - p[2]) < 3 &&
      length(v) < 1 &&
      body.waitingUntil === 0
    )
      body.waitingUntil = body.tick / PHYSICS_HZ + hold;
    const arrived = hold
      ? body.waitingUntil > 0 && body.tick / PHYSICS_HZ >= body.waitingUntil
      : Math.hypot(target[0] - p[0], target[2] - p[2]) <
        Math.max(15, length(v) * 2.5);
    if (arrived) {
      body.route = (body.route + 1) % definition.waypoints.length;
      target = definition.waypoints[body.route];
      body.waitingUntil = 0;
    }
  }
  const d = sub(target, p),
    h = Math.hypot(d[0], d[2]);
  if (leader && profile.kind !== "multirotor")
    return add(leader.velocity, scale(d, 0.25));
  const speed =
    profile.kind === "multirotor"
      ? Math.min(definition.cruiseSpeed, h * 0.4)
      : definition.cruiseSpeed;
  const ahead: Vec3 = [p[0] + v[0] * 4, 0, p[2] + v[2] * 4];
  const safe = Math.max(
    target[1],
    terrainHeight(
      definition.terrain,
      ...([ahead[0], ahead[2]] as [number, number]),
    ) + 45,
  );
  return add(
    [
      (d[0] / Math.max(1, h)) * speed,
      clamp((safe - p[1]) * 0.25, -profile.maxClimb, profile.maxClimb),
      (d[2] / Math.max(1, h)) * speed,
    ],
    body.avoidance,
  );
}
function command(
  body: FlightBody,
  input: PilotInput | undefined,
  leader?: FlightState,
): Command {
  const { profile: p, raw: s, definition: d } = body,
    pos = vector(s, 0),
    v = vector(s, 3),
    q = quaternion(s),
    omega = vector(s, 10),
    t = body.tick * PHYSICS_DT;
  const wind = windAt(body.seed, d.wind, t, pos),
    air = sub(v, wind),
    rho = airDensity(d.terrain.datum + pos[1]);
  const forward: Vec3 = [Math.sin(body.heading), 0, -Math.cos(body.heading)],
    right: Vec3 = [Math.cos(body.heading), 0, Math.sin(body.heading)];
  let wanted: Vec3;
  body.boundary = Math.hypot(pos[0], pos[2]) > d.terrain.size * 0.4;
  if (input && !body.boundary) {
    if (p.kind === "multirotor") {
      body.heading = wrap(body.heading + input.yaw * 1.05 * PHYSICS_DT);
      wanted = add(
        scale(forward, input.forward * Math.min(p.maxSpeed, 12)),
        scale(right, input.right * 8),
      );
      wanted[1] = input.climb * p.maxClimb;
      if (input.forward || input.right || input.climb) {
        body.hold = [...pos];
        body.wasMoving = true;
      } else {
        // Brake using a zero velocity command, then capture the actual stopping position.
        // Capturing a predicted point immediately can make a light quad reverse and oscillate.
        if (body.wasMoving && length(v) < 0.3) {
          body.hold = [...pos];
          body.wasMoving = false;
        }
        wanted = body.wasMoving ? [0, 0, 0] : scale(sub(body.hold, pos), 0.55);
      }
    } else {
      body.throttle = clamp(
        body.throttle + input.throttle * 0.22 * PHYSICS_DT,
        0,
        1,
      );
      body.heading = wrap(
        body.heading +
          (input.yaw * 0.3 +
            (Math.tan(input.roll * 0.65) * G) / Math.max(8, length(air))) *
            PHYSICS_DT,
      );
      wanted = scale(forward, d.cruiseSpeed);
      wanted[1] = -input.pitch * 5;
    }
  } else if (body.boundary) {
    wanted = scale(unit([-pos[0], 0, -pos[2]]), d.cruiseSpeed);
    wanted[1] = clamp(
      (terrainHeight(d.terrain, pos[0], pos[2]) + 70 - pos[1]) * 0.3,
      -3,
      3,
    );
  } else wanted = routeVelocity(body, leader);
  if (p.kind !== "multirotor" && (!input || body.boundary)) {
    // Wind triangle: preserve an attainable airspeed while following a ground course.
    const course = unit([wanted[0], 0, wanted[2]]),
      crosswind = sub([wind[0], 0, wind[2]], scale(course, dot(wind, course)));
    const crossSpeed = length(crosswind),
      limit = d.cruiseSpeed * 0.9;
    const compensation = scale(
      crosswind,
      Math.min(1, limit / Math.max(0.001, crossSpeed)),
    );
    const airTarget = sub(
      scale(
        course,
        Math.sqrt(Math.max(4, d.cruiseSpeed ** 2 - length(compensation) ** 2)),
      ),
      compensation,
    );
    wanted[0] = airTarget[0] + wind[0];
    wanted[2] = airTarget[2] + wind[2];
  }
  if (pos[1] + d.terrain.datum > p.maxAltitude - 20)
    wanted[1] = Math.min(wanted[1], -1);
  const acceleration = scale(
    sub(wanted, v),
    p.kind === "multirotor" ? 1.8 : 0.65,
  );
  acceleration[1] = clamp(acceleration[1], -4, 5);
  const horizontal = Math.hypot(acceleration[0], acceleration[2]);
  if (horizontal > 5) {
    acceleration[0] *= 5 / horizontal;
    acceleration[2] *= 5 / horizontal;
  }
  if (!input || body.boundary) {
    const travel = Math.atan2(wanted[0] - wind[0], -wanted[2] + wind[2]);
    body.heading = wrap(
      body.heading +
        wrap(travel - body.heading) *
          PHYSICS_DT *
          (p.kind === "multirotor" ? 1 : 0.9),
    );
  }
  const localDrag: Vec3 = air.map(
    (value, i) => 0.5 * rho * p.dragArea[i] * value * Math.abs(value),
  ) as Vec3;
  const thrust = add(scale(add(acceleration, [0, G, 0]), p.mass), localDrag);
  if (p.kind === "multirotor") {
    const horizontalThrust = Math.hypot(thrust[0], thrust[2]),
      limit = Math.max(0, thrust[1]) * Math.tan(0.65);
    if (horizontalThrust > limit) {
      thrust[0] *= limit / horizontalThrust;
      thrust[2] *= limit / horizontalThrust;
    }
  }
  let pitch: number, roll: number;
  if (p.kind === "multirotor") {
    pitch = Math.atan2(dot(thrust, forward), Math.max(1, thrust[1]));
    roll = Math.atan2(dot(thrust, right), Math.max(1, thrust[1]));
  } else {
    const airspeed = Math.max(6, length(air)),
      liftTarget = (p.mass * G) / (0.5 * rho * airspeed ** 2 * p.wingArea);
    const trim = clamp((liftTarget - p.liftZero) / p.liftSlope, -0.1, 0.22);
    pitch = -trim - clamp((wanted[1] - v[1]) * 0.055, -0.2, 0.2);
    roll = clamp(Math.atan2(dot(acceleration, right), G), -0.65, 0.65);
    if (input && !body.boundary) {
      roll = input.roll * 0.65;
      pitch = -trim + input.pitch * 0.3;
    }
    const alpha = Math.atan2(
      -dot(air, rotate(q, [0, 1, 0])),
      dot(air, rotate(q, [0, 0, 1])),
    );
    if (!input && Math.abs(alpha) > p.stallAngle * 0.95) {
      pitch = -Math.atan2(air[1], Math.hypot(air[0], air[2])) + 0.03;
      roll = 0;
    }
  }
  const target = attitude(
    body.heading,
    clamp(pitch, -0.5, p.kind === "multirotor" ? 0.5 : 0.9),
    clamp(roll, -0.7, 0.7),
  );
  let error = multiply(conjugate(q), target);
  if (error[3] < 0) error = error.map((n) => -n) as Quat;
  const torque: Vec3 = [0, 1, 2].map(
    (i) => p.inertia[i] * (error[i] * 110 - omega[i] * 13),
  ) as Vec3;
  if (p.kind === "multirotor") {
    // Align the thrust vector before yaw: a course reversal must never roll a quad over.
    const currentUp = rotate(q, [0, 1, 0]),
      tiltError = rotate(conjugate(q), cross(currentUp, unit(thrust)));
    torque[0] = p.inertia[0] * (tiltError[0] * 36 - omega[0] * 10);
    torque[2] = p.inertia[2] * (tiltError[2] * 36 - omega[2] * 10);
    const nose = rotate(q, [0, 0, 1]),
      actualHeading = Math.atan2(nose[0], -nose[2]);
    torque[1] = clamp(
      p.inertia[1] * (-wrap(body.heading - actualHeading) * 6 - omega[1] * 4),
      -p.mass * G * 0.004,
      p.mass * G * 0.004,
    );
  }
  const surfaces = torque.map((value, i) =>
    clamp(value / (p.mass * 0.3), -1, 1),
  ) as Vec3;
  let motors: number[];
  if (p.kind === "multirotor") {
    const up = rotate(q, [0, 1, 0]),
      collective = Math.max(0, thrust[1] / Math.max(0.3, up[1]));
    const maximum =
      (((p.mass * G * p.thrustRatio) / p.motors.length) * rho) / 1.225;
    motors = allocation(p).map((row) => {
      const force = dot(row.slice(1) as Vec3, torque) + row[0] * collective;
      return Math.sqrt(clamp(force / maximum, 0, 1));
    });
  } else {
    const throttle =
      input && !body.boundary
        ? body.throttle
        : clamp(0.65 + (d.cruiseSpeed - length(air)) * 0.1, 0, 1);
    motors = p.motors.map(() => throttle);
  }
  const wing = wingPose(p, t, body.index, roll);
  return { motors, torque, surfaces, flap: wing.flapping ? 1 : 0 };
}
function derivative(body: FlightBody, s: number[], c: Command): number[] {
  const p = body.profile,
    pos = vector(s, 0),
    v = vector(s, 3),
    q = normalize(quaternion(s)),
    w = vector(s, 10),
    n = p.motors.length;
  const rho = airDensity(body.definition.terrain.datum + pos[1]),
    air = sub(
      v,
      windAt(body.seed, body.definition.wind, body.tick * PHYSICS_DT, pos),
    );
  const up = rotate(q, [0, 1, 0]),
    front = rotate(q, [0, 0, 1]);
  let force: Vec3 = [0, -p.mass * G, 0],
    moment: Vec3 = [0, 0, 0];
  const motorDerivative = c.motors.map(
    (value, i) => (value - s[13 + i]) / p.motorLag,
  );
  if (p.kind === "multirotor") {
    for (let i = 0; i < n; i++) {
      const thrust =
          ((p.mass * G * p.thrustRatio) / n) * (rho / 1.225) * s[13 + i] ** 2,
        m = p.motors[i];
      const spin = n === 6 ? (i % 2 ? 1 : -1) : Math.sign(m[0] * m[2]);
      force = add(force, scale(up, thrust));
      moment = add(moment, [
        -m[2] * thrust,
        spin * 0.022 * thrust,
        m[0] * thrust,
      ]);
    }
    force = sub(
      force,
      air.map(
        (value, i) => 0.5 * rho * p.dragArea[i] * value * Math.abs(value),
      ) as Vec3,
    );
  } else {
    const speed = length(air),
      direction = unit(air),
      alpha = Math.atan2(-dot(air, up), dot(air, front));
    const stalled = Math.abs(alpha) > p.stallAngle;
    const cl = stalled
      ? Math.sign(alpha) *
        Math.max(
          0,
          p.liftZero +
            p.liftSlope * p.stallAngle -
            2 * (Math.abs(alpha) - p.stallAngle),
        )
      : p.liftZero + p.liftSlope * alpha;
    const liftDirection = unit(sub(up, scale(direction, dot(up, direction))));
    const dynamic = 0.5 * rho * speed ** 2 * p.wingArea;
    const flapLift =
      p.kind === "bird"
        ? c.flap *
          0.06 *
          Math.sin(body.tick * PHYSICS_DT * p.flapHz * Math.PI * 2)
        : 0;
    force = add(force, scale(liftDirection, dynamic * (cl + flapLift)));
    force = sub(
      force,
      scale(
        direction,
        dynamic * (0.035 + 0.065 * cl ** 2 + (stalled ? 0.4 : 0)),
      ),
    );
    const propulsion =
      p.kind === "bird"
        ? p.mass *
          G *
          c.flap *
          clamp(0.2 + (body.definition.cruiseSpeed - speed) * 0.2, 0, 1.5)
        : (p.mass * G * 1.3 * s[13] ** 2 * rho) / 1.225;
    force = add(force, scale(front, propulsion));
    // Control authority fades with airspeed; each body axis retains angular inertia.
    const authority = clamp(speed / 8, 0.08, 1);
    moment = c.torque.map(
      (value, i) =>
        clamp(value, -p.mass * 0.8, p.mass * 0.8) * authority -
        w[i] * p.inertia[i] * 0.2,
    ) as Vec3;
  }
  const angularMomentum: Vec3 = w.map(
    (value, i) => value * p.inertia[i],
  ) as Vec3;
  const angular = sub(moment, cross(w, angularMomentum)).map(
    (value, i) => value / p.inertia[i],
  ) as Vec3;
  const dq = scaleQuaternion(multiply(q, [...w, 0]), 0.5);
  return [
    ...v,
    ...scale(force, 1 / p.mass),
    ...dq,
    ...angular,
    ...motorDerivative,
    ...p.motors.map((_, i) => (s[13 + i] * p.maxRPM * Math.PI) / 30),
  ];
}
const scaleQuaternion = (q: Quat, n: number): Quat =>
  q.map((v) => v * n) as Quat;
/** Six-degree-of-freedom rigid-body integration, fixed timestep, Float64 JS numbers. */
export function stepBody(
  body: FlightBody,
  input?: PilotInput,
  leader?: FlightState,
): FlightState {
  if (body.collided) return bodyState(body);
  const c = command(body, input, leader),
    a = body.raw,
    h = PHYSICS_DT;
  const k1 = derivative(body, a, c),
    k2 = derivative(
      body,
      a.map((v, i) => v + (k1[i] * h) / 2),
      c,
    ),
    k3 = derivative(
      body,
      a.map((v, i) => v + (k2[i] * h) / 2),
      c,
    ),
    k4 = derivative(
      body,
      a.map((v, i) => v + k3[i] * h),
      c,
    );
  body.raw = a.map(
    (v, i) => v + (h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) / 6,
  );
  const q = normalize(quaternion(body.raw));
  body.raw.splice(6, 4, ...q);
  body.tick++;
  const p = vector(body.raw, 0),
    floor =
      terrainHeight(body.definition.terrain, p[0], p[2]) +
      body.profile.clearance;
  body.surfaces = c.surfaces;
  if (
    p[1] <= floor ||
    Math.abs(p[0]) > body.definition.terrain.size / 2 ||
    Math.abs(p[2]) > body.definition.terrain.size / 2
  ) {
    body.collided = true;
    body.raw.splice(3, 3, 0, 0, 0);
    body.raw.splice(10, 3, 0, 0, 0);
    body.raw.fill(0, 13, 13 + body.profile.motors.length);
  }
  return bodyState(body);
}
export function bodyState(body: FlightBody): FlightState {
  const { raw: s, profile: p } = body,
    n = p.motors.length,
    pos = vector(s, 0),
    v = vector(s, 3),
    q = quaternion(s),
    up = rotate(q, [0, 1, 0]),
    front = rotate(q, [0, 0, 1]);
  const air = sub(
    v,
    windAt(body.seed, body.definition.wind, body.tick * PHYSICS_DT, pos),
  );
  return {
    position: pos,
    velocity: v,
    orientation: q,
    angularVelocity: vector(s, 10),
    rotorRPM: s.slice(13, 13 + n).map((n) => n * p.maxRPM),
    rotorAngles: s.slice(13 + n, 13 + 2 * n),
    wing: wingPose(
      p,
      body.tick * PHYSICS_DT,
      body.index,
      Math.atan2(up[0], up[1]),
    ),
    surfaces: body.surfaces,
    airspeed: length(air),
    stalled:
      p.kind !== "multirotor" &&
      Math.abs(Math.atan2(-dot(air, up), dot(air, front))) > p.stallAngle,
    collided: body.collided,
  };
}
export { NEUTRAL_INPUT };
