import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createScenario,
  contactPosition,
  scoreSession,
  type Session,
} from "./simulation";
import { VARIATION_SEEDS } from "./variations";
import { FLIGHT_PROFILES } from "./flightProfiles";
import { compileFlight, sampleTrace } from "./flightTrace";
import {
  bodyState,
  createBody,
  stepBody,
  PHYSICS_HZ,
  airDensity,
  windAt,
} from "./flightPhysics";
import { NEUTRAL_INPUT } from "./flightTypes";
import { flatTerrain, terrainHeight, validTerrain } from "./flightTerrain";
import { theatreById } from "./theatres";
import { createFlightDefinition } from "./flightScenario";
import { pilotInput } from "./pilotControls";
import { contactKinematics } from "./kinematics";
import { contactReadout } from "./radarMath";
import { readSessions, saveSessions, STORAGE_KEY } from "./storage";
import {
  createFlightModel,
  disposeModel,
  poseContact,
} from "./contactGeometry";
import { Group, Box3 } from "three";
import { BIRDS } from "./birds";
import { readFileSync } from "node:fs";
import type { FlightModelId } from "./flightTypes";
const flat = flatTerrain(theatreById("district"));
test("all 200 v3 variations produce finite, airborne flight at real physical scale", () => {
  const seen = new Set<string>();
  for (const seed of VARIATION_SEEDS) {
    const s = createScenario(
      "mixed",
      seed,
      "guided",
      false,
      3,
      {},
      { terrain: flat, wind: "gusty" },
    );
    assert.deepEqual(
      s,
      createScenario(
        "mixed",
        seed,
        "guided",
        false,
        3,
        {},
        { terrain: flat, wind: "gusty" },
      ),
    );
    const trace = compileFlight(s);
    seen.add(s.flight!.model);
    for (let time = s.arrival; time < 45; time += 2)
      for (let i = 0; i < s.count; i++) {
        const state = sampleTrace(trace, time, i);
        assert.ok(
          [
            ...state.position,
            ...state.velocity,
            ...state.orientation,
            ...state.rotorRPM,
          ].every(Number.isFinite),
          `${seed} at ${time}`,
        );
        assert.ok(Math.abs(Math.hypot(...state.orientation) - 1) < 1e-5);
        assert.equal(
          state.collided,
          false,
          `${seed} ${s.flight!.model} at ${time}`,
        );
        assert.ok(
          state.position[1] > 10 && state.position[1] < 300,
          `${seed} altitude ${state.position[1]}`,
        );
        assert.ok(Math.hypot(...state.velocity) < 60);
      }
  }
  assert.equal(seen.size, 9);
});
test("compiled replay is deterministic, frame-rate independent, and supports arbitrary seeks", () => {
  const s = createScenario("skyline", VARIATION_SEEDS[0], "guided", false, 3),
    a = compileFlight(s),
    b = compileFlight(s);
  assert.deepEqual(a.data, b.data);
  for (const hz of [30, 60, 144])
    for (let t = 0; t < 1; t += 1 / hz) sampleTrace(a, s.arrival + t, 0);
  assert.deepEqual(sampleTrace(a, 17.123, 2), sampleTrace(b, 17.123, 2));
  assert.deepEqual(sampleTrace(a, s.arrival - 0.1, 0).velocity, [0, 0, 0]);
  assert.deepEqual(sampleTrace(a, 100, 0), sampleTrace(a, 45, 0));
});
test("multirotors stabilize a hover, accelerate with tilt, brake after release and yaw independently", () => {
  for (const id of ["mini-4-pro", "matrice-350-rtk", "typhoon-h480"] as const) {
    const d = createFlightDefinition(1, "Single drone", flat, "calm", id),
      p = FLIGHT_PROFILES[id],
      b = createBody(p, d, 1),
      initial = [...b.raw.slice(0, 3)];
    for (let i = 0; i < PHYSICS_HZ * 5; i++) stepBody(b, NEUTRAL_INPUT);
    assert.ok(
      Math.hypot(...b.raw.slice(0, 3).map((v, i) => v - initial[i])) < 0.01,
    );
    for (let i = 0; i < PHYSICS_HZ * 3; i++)
      stepBody(b, { ...NEUTRAL_INPUT, forward: 1 });
    const moving = bodyState(b);
    assert.ok(Math.hypot(moving.velocity[0], moving.velocity[2]) > 4);
    assert.ok(
      Math.abs(moving.orientation[0]) + Math.abs(moving.orientation[2]) > 0.02,
    );
    for (let i = 0; i < PHYSICS_HZ * 6; i++) stepBody(b, NEUTRAL_INPUT);
    assert.ok(Math.hypot(...bodyState(b).velocity) < 0.35);
    const before = bodyState(b).orientation;
    for (let i = 0; i < PHYSICS_HZ * 2; i++)
      stepBody(b, { ...NEUTRAL_INPUT, yaw: 1 });
    assert.ok(Math.abs(bodyState(b).orientation[1] - before[1]) > 0.1);
    assert.equal(b.collided, false);
  }
});
test("density changes motor effort at altitude; wind stays deterministic and stalls need airspeed", () => {
  assert.ok(airDensity(4500) < airDensity(0) * 0.7);
  assert.deepEqual(
    windAt(99, "gusty", 12, [10, 20, 30]),
    windAt(99, "gusty", 12, [10, 20, 30]),
  );
  assert.deepEqual(windAt(99, "calm", 12, [10, 20, 30]), [0, 0, 0]);
  const high = flatTerrain(theatreById("tololing")),
    lowBody = createBody(
      FLIGHT_PROFILES["matrice-350-rtk"],
      createFlightDefinition(
        1,
        "Single drone",
        flat,
        "calm",
        "matrice-350-rtk",
      ),
      1,
    ),
    highBody = createBody(
      FLIGHT_PROFILES["matrice-350-rtk"],
      createFlightDefinition(
        1,
        "Single drone",
        high,
        "calm",
        "matrice-350-rtk",
      ),
      1,
    );
  assert.ok(bodyState(highBody).rotorRPM[0] > bodyState(lowBody).rotorRPM[0]);
  const plane = createBody(
    FLIGHT_PROFILES["rc-cessna"],
    createFlightDefinition(2, "Single drone", flat, "calm", "rc-cessna"),
    2,
  );
  plane.raw.splice(3, 3, 0, 0, 0);
  assert.equal(stepBody(plane, NEUTRAL_INPUT).stalled, true);
});
test("terrain snapshots interpolate, validate, and physically stop a collision", () => {
  const terrain = {
    ...flat,
    heights: flat.heights.map((_, i) => Math.floor(i / 65) * 2),
  };
  assert.equal(terrainHeight(terrain, 0, 0), 64);
  assert.equal(validTerrain(terrain), true);
  assert.equal(validTerrain({ ...terrain, heights: [NaN] }), false);
  assert.equal(validTerrain({ ...terrain, latitude: 123 }), false);
  const b = createBody(
    FLIGHT_PROFILES["matrice-350-rtk"],
    createFlightDefinition(1, "Single drone", flat, "calm", "matrice-350-rtk"),
    1,
  );
  b.raw[1] = 0.05;
  const crashed = stepBody(b, NEUTRAL_INPUT);
  assert.equal(crashed.collided, true);
  assert.deepEqual(stepBody(b, NEUTRAL_INPUT), crashed);
});
test("mountain routes follow a frozen heightfield and omit unsuitable aircraft profiles", () => {
  const terrain = flatTerrain(theatreById("tololing"));
  terrain.heights = terrain.heights.map(
    (_, i) => Math.sin(((i % 65) / 64) * Math.PI) * 180,
  );
  for (const seed of VARIATION_SEEDS.slice(0, 12)) {
    const s = createScenario(
      "passing",
      seed,
      "guided",
      false,
      3,
      {},
      { terrain },
    );
    assert.notEqual(s.flight!.model, "mini-4-pro");
    assert.notEqual(s.flight!.model, "typhoon-h480");
    const trace = compileFlight(s);
    for (let t = 5; t < 45; t += 2) {
      const state = sampleTrace(trace, t, 0);
      assert.equal(state.collided, false);
      assert.ok(
        state.position[1] >
          terrainHeight(terrain, state.position[0], state.position[2]) + 10,
      );
    }
  }
});
test("scene, sensor kinematics and radar share actual metre positions and velocity", () => {
  const s = createScenario("passing", 99, "guided", false, 3),
    time = 17.3,
    k = contactKinematics(s, time, 0);
  assert.deepEqual(k.position, contactPosition(s, time, 0));
  assert.ok(k.flight);
  assert.equal(contactReadout(s, time, 0).speed, k.speed);
  const target = new Group(),
    model = createFlightModel(s.flight!.model);
  poseContact(target, model, false, k, time, 0);
  assert.deepEqual(target.position.toArray(), k.position);
  assert.deepEqual(target.quaternion.toArray(), k.flight!.orientation);
  disposeModel(model);
});
test("pilot controls separate translation from fixed-wing axes and cancel opposing keys", () => {
  assert.equal(pilotInput(new Set(["KeyW", "KeyS"]), false).forward, 0);
  assert.equal(pilotInput(new Set(["KeyW"]), false).forward, 1);
  assert.equal(pilotInput(new Set(["KeyW"]), true).throttle, 1);
  assert.equal(pilotInput(new Set(["KeyD"]), true).roll, 1);
  assert.equal(pilotInput(new Set(["KeyR"]), false).climb, 1);
  assert.deepEqual(pilotInput(new Set(), false), NEUTRAL_INPUT);
});
test("articulated species have real-size silhouettes and exported shared rig nodes", () => {
  for (const bird of Object.values(BIRDS)) {
    const model = createFlightModel(bird.id),
      box = new Box3().setFromObject(model),
      span = box.max.x - box.min.x;
    assert.ok(
      Math.abs(span - bird.span) < bird.span * 0.04,
      `${bird.id} ${span}`,
    );
    for (const node of [
      "wing-left",
      "wing-right",
      "elbow-left",
      "elbow-right",
      "wrist-left",
      "wrist-right",
      "tail",
    ])
      assert.ok(model.getObjectByName(node));
    disposeModel(model);
  }
  for (const id of Object.keys(FLIGHT_PROFILES) as FlightModelId[]) {
    const bytes = readFileSync(
        new URL(`../public/models/v3-${id}.glb`, import.meta.url),
      ),
      size = bytes.readUInt32LE(12),
      json = JSON.parse(bytes.subarray(20, 20 + size).toString());
    assert.ok(json.nodes.length > 0);
    const names = new Set(json.nodes.map((n: { name: string }) => n.name));
    if (FLIGHT_PROFILES[id].kind === "bird") assert.ok(names.has("wrist-left"));
    else
      for (let i = 0; i < FLIGHT_PROFILES[id].motors.length; i++)
        assert.ok(names.has(`prop-${i}`));
  }
});
test("v3 sessions retain their terrain and physics profile while malformed definitions are rejected", () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
    configurable: true,
  });
  const scenario = createScenario("skyline", 22, "guided", false, 3),
    detection = scenario.arrival + 2;
  const s: Session = {
    version: 1,
    id: "v3",
    createdAt: "2026-10-11T12:00:00Z",
    scenario,
    theatre: "district",
    duration: 30,
    detection,
    answer: scenario.category,
    ...scoreSession(scenario, detection, scenario.category, 30),
    events: [],
  };
  assert.equal(saveSessions([s]), true);
  assert.deepEqual(readSessions(), [s]);
  for (const mutate of [
    (s: Session) => {
      s.scenario.flight!.model = "rc-cessna";
    },
    (s: Session) => {
      s.scenario.flight!.waypoints[0][0] += 1;
    },
    (s: Session) => {
      s.scenario.flight!.terrain.heights = [0];
    },
    (s: Session) => {
      s.theatre = "tololing";
    },
  ]) {
    const copy = structuredClone(s);
    mutate(copy);
    values.set(STORAGE_KEY, JSON.stringify([copy]));
    assert.deepEqual(readSessions(), []);
  }
});
