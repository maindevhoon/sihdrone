import { test } from "node:test";
import assert from "node:assert/strict";
import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import { deviceQuaternion } from "./phone/orientation";
import {
  eventQuaternion,
  sensorQuaternion,
  SensorStream,
} from "./phone/sensorStream";
import { PhoneSignal, PHONE_TIMEOUT_MS } from "./phone/reliability";
import { nextUntaggedTrack } from "./phone/controllerState";
import { createScenario, emptyTrackDecisions } from "./simulation";
import type { PhoneSnapshot, Pose } from "./phone/protocol";
const yaw = (angle: number) =>
  new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), angle);
const same = (a: Pose, b: Pose) =>
  assert.ok(new Quaternion(...a).angleTo(new Quaternion(...b)) < 1e-6);

test("relative sensor quaternions use the same camera coordinates as orientation events", () => {
  for (const alpha of [0, 25, 200, 359])
    for (const beta of [-20, 0, 80])
      for (const gamma of [-40, 0, 35])
        for (const screen of [0, 90, 180, 270]) {
          const raw = new Quaternion().setFromEuler(
            new Euler(
              MathUtils.degToRad(beta),
              MathUtils.degToRad(gamma),
              MathUtils.degToRad(alpha),
              "ZXY",
            ),
          );
          const converted = sensorQuaternion(raw.toArray(), screen);
          assert.ok(converted);
          assert.ok(
            converted.angleTo(deviceQuaternion(alpha, beta, gamma, screen)) <
              1e-6,
          );
        }
});
test("retry, fallback, screen rotation and delayed readings retain the current camera direction", () => {
  const stream = new SensorStream();
  stream.update(yaw(1), "relative", 0, 0);
  const moved = stream.update(yaw(1.4), "relative", 0, 100)!;
  assert.ok(new Quaternion(...moved).angleTo(new Quaternion()) > 0.39);
  stream.rebase(); // Retry creates a new sensor reference, without forcing the camera to north.
  same(stream.update(yaw(-2), "relative", 0, 200)!, moved);
  const continued = stream.update(yaw(-1.9), "relative", 0, 300)!;
  assert.ok(
    new Quaternion(...continued).angleTo(new Quaternion(...moved)) > 0.09,
  );
  same(stream.update(yaw(2.8), "orientation", 0, 400)!, continued);
  same(stream.update(yaw(-1.2), "orientation", 90, 500)!, continued);
  same(stream.update(yaw(0), "orientation", 90, 3000)!, continued);
  const next = stream.update(yaw(0.15), "orientation", 90, 3050)!;
  assert.ok(
    new Quaternion(...next).angleTo(new Quaternion(...continued)) > 0.14,
  );
  same(stream.recenter(), [0, 0, 0, 1]);
  same(stream.update(yaw(2), "relative", 90, 3100)!, [0, 0, 0, 1]);
});
test("bad readings and abrupt compass jumps do not rotate the camera", () => {
  const stream = new SensorStream();
  const original = stream.update(yaw(0), "orientation", 0, 0)!;
  assert.equal(
    stream.update(new Quaternion(NaN, 0, 0, 1), "orientation", 0, 50),
    null,
  );
  same(stream.update(yaw(3), "orientation", 0, 100)!, original);
  assert.ok(eventQuaternion(null, 90, 0, 0, 15));
  assert.equal(sensorQuaternion([0, 0, 0, 0], 0), null);
  assert.equal(eventQuaternion(0, null, 0, 0), null);
  assert.equal(eventQuaternion(0, 90, NaN, 0), null);
});
test("short wireless stalls do not hold an exercise; genuine loss holds once and requires explicit resume", () => {
  const signal = new PhoneSignal();
  signal.receive(0);
  assert.equal(signal.shouldHold(1600), false);
  assert.equal(signal.shouldHold(3000), false);
  signal.receive(3500); // Heartbeat/control receipt, even without a new gyro reading.
  assert.equal(signal.shouldHold(6000), false);
  assert.equal(signal.shouldHold(3500 + PHONE_TIMEOUT_MS + 1), true);
  assert.equal(signal.shouldHold(10000), false);
  signal.receive(11000);
  assert.equal(signal.recent(11000), true);
  assert.equal(signal.shouldHold(11000), false);
  assert.equal(signal.shouldHold(17000), true);
});
test("auto next moves T01 to T02, skips tagged contacts, wraps and handles the final tag", () => {
  const scenario = createScenario("mixed", 123, "guided", false, 3);
  const state: PhoneSnapshot = {
    scenario: { ...scenario, count: 27 },
    epoch: 1,
    time: 15,
    phase: "running",
    playing: true,
    selectedTrack: 0,
    decisions: emptyTrackDecisions({ ...scenario, count: 27 }),
  };
  state.decisions![0].detection = 10;
  assert.equal(nextUntaggedTrack(state, 0), 1);
  state.decisions![1].detection = 11;
  assert.equal(nextUntaggedTrack(state, 0), 2);
  assert.equal(nextUntaggedTrack(state, 26), 2);
  state.decisions = state.decisions!.map((track) => ({
    ...track,
    detection: 12,
  }));
  assert.equal(nextUntaggedTrack(state, 26), null);
});
