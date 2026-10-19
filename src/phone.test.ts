import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { Quaternion, Vector3 } from "three";
import { WebSocket } from "ws";
import { createScenario } from "./simulation";
import {
  acceptsAction,
  remoteTime,
  validAction,
  validPose,
  type PhoneSnapshot,
} from "./phone/protocol";
import {
  deviceQuaternion,
  pickGaze,
  relativePose,
  smoothing,
} from "./phone/orientation";
import { attachPhoneRelay } from "../scripts/phone/relay";

const state: PhoneSnapshot = {
  scenario: createScenario("mixed", 1234, "guided", false, 4),
  epoch: 3,
  time: 15,
  phase: "running",
  playing: true,
  selectedTrack: 0,
};
test("phone decisions require a live prepared current encounter and an arrived track", () => {
  const action = { type: "observe" as const, track: 0, epoch: 3 };
  assert.equal(acceptsAction(action, state, true), true);
  assert.equal(acceptsAction(action, state, false), false);
  assert.equal(
    acceptsAction(action, { ...state, phase: "paused" }, true),
    false,
  );
  assert.equal(
    acceptsAction(action, { ...state, phase: "preview" }, true),
    false,
  );
  assert.equal(
    acceptsAction(action, { ...state, phase: "replay" }, true),
    false,
  );
  assert.equal(acceptsAction(action, { ...state, epoch: 4 }, true), false);
  assert.equal(acceptsAction(action, { ...state, time: 0 }, true), false);
  assert.equal(
    acceptsAction(action, { ...state, time: state.scenario.duration }, true),
    false,
  );
  assert.equal(
    acceptsAction({ ...action, track: state.scenario.count }, state, true),
    false,
  );
});
test("phone packets reject malformed commands and non-unit poses", () => {
  assert.equal(validPose([0, 0, 0, 1]), true);
  for (const bad of [[0, 0, 0, 0], [NaN, 0, 0, 1], [0, 0, 0, 20], [0, 1], null])
    assert.equal(validPose(bad), false);
  assert.equal(
    validAction({ type: "classify", track: 0, epoch: 1, answer: "Bird" }),
    true,
  );
  for (const bad of [
    { type: "observe", track: -1, epoch: 1 },
    { type: "observe", track: 1.2, epoch: 1 },
    { type: "classify", track: 0, epoch: 1, answer: "enemy" },
    null,
  ])
    assert.equal(validAction(bad), false);
});
test("remote clock never independently advances a pause, replay hold or lost link", () => {
  assert.equal(remoteTime(state, 100, true), 15.1);
  assert.equal(remoteTime(state, 400, true), 15.2);
  assert.equal(remoteTime(state, 1000, true), 15);
  assert.equal(remoteTime(state, 100, false), 15);
  assert.equal(remoteTime({ ...state, playing: false }, 100, true), 15);
  assert.equal(
    remoteTime({ ...state, time: state.scenario.duration }, 100, true),
    state.scenario.duration,
  );
});
test("recenter, landscape correction and heading wrap remain smooth unit quaternions", () => {
  const reference = deviceQuaternion(359, 90, 0, 0),
    current = deviceQuaternion(1, 90, 0, 0);
  assert.deepEqual(relativePose(reference, reference), [0, 0, 0, 1]);
  const delta = new Quaternion(...relativePose(reference, current));
  assert.ok(delta.angleTo(new Quaternion()) < 0.04);
  assert.ok(Math.abs(deviceQuaternion(20, 60, -15, 90).length() - 1) < 1e-10);
  const portrait = deviceQuaternion(0, 90, 0, 0),
    landscape = deviceQuaternion(0, 90, 0, 90);
  assert.ok(Math.abs(portrait.angleTo(landscape) - Math.PI / 2) < 1e-10);
  assert.equal(smoothing(0), 0);
  assert.ok(smoothing(1 / 60) > 0 && smoothing(1 / 60) < 1);
});
test("gaze chooses closest angular contact and excludes objects behind the observer", () => {
  const origin = new Vector3(),
    direction = new Vector3(0, 0, -1);
  assert.equal(
    pickGaze(origin, direction, [{ id: 0, position: [0, 0, 50] }]),
    null,
  );
  assert.equal(
    pickGaze(origin, direction, [
      { id: 4, position: [1, 0, -50] },
      { id: 10, position: [0.1, 0, -100] },
    ]),
    10,
  );
  assert.equal(
    pickGaze(origin, direction, [{ id: 0, position: [15, 0, -50] }]),
    null,
  );
});
test("pairing relay isolates rooms, authenticates host and rejects handset state injection", async () => {
  const server = createServer((req, res) =>
    relay.middleware(req, res, () => res.writeHead(404).end()),
  );
  const relay = attachPhoneRelay(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port,
    base = `http://127.0.0.1:${port}`;
  const sockets: WebSocket[] = [];
  try {
    const room = (await (
      await fetch(`${base}/api/phone/rooms`, { method: "POST" })
    ).json()) as { room: string; key: string };
    const other = (await (
      await fetch(`${base}/api/phone/rooms`, { method: "POST" })
    ).json()) as { room: string; key: string };
    const connect = async (id: string, role: string, key = "") => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}/api/phone/socket?room=${id}&role=${role}&key=${key}`,
      );
      sockets.push(ws);
      const messages: Record<string, unknown>[] = [];
      ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
      await once(ws, "open");
      return { ws, messages };
    };
    const bad = new WebSocket(
      `ws://127.0.0.1:${port}/api/phone/socket?room=${room.room}&role=host&key=wrong`,
    );
    const [error] = await once(bad, "error");
    assert.match(error.message, /403/);
    const forbidden = await fetch(`${base}/api/phone/rooms`, {
      method: "POST",
      headers: { Origin: "https://unrelated.example" },
    });
    assert.equal(forbidden.status, 403);
    const host = await connect(room.room, "host", room.key),
      isolated = await connect(other.room, "host", other.key),
      phone = await connect(room.room, "phone");
    phone.ws.send(JSON.stringify({ type: "observe", track: 1, epoch: 3 }));
    phone.ws.send(JSON.stringify({ type: "snapshot", state }));
    phone.ws.send(JSON.stringify({ type: "pose", pose: [0, 0, 0, 20] }));
    host.ws.send(JSON.stringify({ type: "snapshot", state }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(host.messages.some((m) => m.type === "observe"));
    assert.ok(
      !host.messages.some((m) => m.type === "snapshot" || m.type === "pose"),
    );
    assert.ok(!isolated.messages.some((m) => m.type === "observe"));
    assert.ok(phone.messages.some((m) => m.type === "snapshot"));
    const wrongDelete = await fetch(`${base}/api/phone/rooms/${room.room}`, {
      method: "DELETE",
      headers: { "X-Host-Key": "wrong" },
    });
    assert.equal(wrongDelete.status, 403);
    const closed = once(phone.ws, "close");
    const deleted = await fetch(`${base}/api/phone/rooms/${room.room}`, {
      method: "DELETE",
      headers: { "X-Host-Key": room.key },
    });
    assert.equal(deleted.status, 200);
    await closed;
    assert.ok(
      host.messages.some((m) => m.type === "peer" && m.connected === true),
    );
  } finally {
    for (const ws of sockets) ws.terminate();
    relay.close();
    server.close();
    await once(server, "close");
  }
});

import { PhoneMapLook, angleDelta } from "./phone/mapLook";
import { validControl } from "./phone/protocol";
test("phone map control preserves geographic framing, wraps north and rebases after mouse navigation", () => {
  const rig = new PhoneMapLook();
  let view = { heading: (359 * Math.PI) / 180, pitch: (-30 * Math.PI) / 180 };
  const neutral: [number, number, number, number] = [0, 0, 0, 1];
  assert.ok(
    Math.abs(
      angleDelta(view.heading, rig.update(view, neutral, 1, 1 / 60).heading),
    ) < 1e-10,
  );
  const right = new Quaternion()
    .setFromAxisAngle(new Vector3(0, 1, 0), (-3 * Math.PI) / 180)
    .toArray() as [number, number, number, number];
  for (let i = 0; i < 60; i++) view = rig.update(view, right, 1, 1 / 60);
  assert.ok(Math.abs(view.heading - (2 * Math.PI) / 180) < 1e-6);
  const desktop = { heading: view.heading + 0.4, pitch: view.pitch - 0.1 };
  view = rig.update(desktop, right, 1, 1 / 60);
  assert.ok(Math.abs(view.heading - desktop.heading) < 1e-6);
  assert.ok(Math.abs(view.pitch - desktop.pitch) < 1e-6);
  const reset = rig.update(view, neutral, 2, 1 / 60);
  assert.ok(Math.abs(reset.heading - view.heading) < 1e-10);
  assert.ok(Math.abs(reset.pitch - view.pitch) < 1e-10);
});
test("phone map tilt is bounded and easing stays independent of frame rate", () => {
  function run(hz: number) {
    const rig = new PhoneMapLook();
    let view = { heading: 1, pitch: -0.5 };
    rig.update(view, [0, 0, 0, 1], 1, 1 / hz);
    const down = new Quaternion()
      .setFromAxisAngle(new Vector3(1, 0, 0), -1.3)
      .toArray() as [number, number, number, number];
    for (let i = 0; i < hz; i++) view = rig.update(view, down, 1, 1 / hz);
    return view;
  }
  const a = run(30),
    b = run(120);
  assert.ok(Math.abs(a.pitch - b.pitch) < 1e-8);
  assert.ok(a.pitch >= (-85 * Math.PI) / 180 - 1e-8);
});
test("controller navigation rejects unbounded or malformed pan and zoom commands", () => {
  assert.equal(
    validControl({ type: "control", epoch: 1, control: "pan", x: 40, y: -40 }),
    true,
  );
  assert.equal(
    validControl({ type: "control", epoch: 1, control: "zoom", amount: -0.18 }),
    true,
  );
  assert.equal(
    validControl({ type: "control", epoch: 1, control: "recenter" }),
    true,
  );
  assert.equal(
    validControl({
      type: "control",
      epoch: 1,
      control: "pan",
      x: Infinity,
      y: 0,
    }),
    false,
  );
  assert.equal(
    validControl({ type: "control", epoch: 1, control: "pan", x: 121, y: 0 }),
    false,
  );
  assert.equal(
    validControl({ type: "control", epoch: 1, control: "zoom", amount: 2 }),
    false,
  );
  assert.equal(
    validControl({ type: "control", epoch: 1, control: "delete" }),
    false,
  );
  assert.equal(
    acceptsAction(
      { type: "observe", track: 0, epoch: 3 },
      { ...state, prepared: false },
      true,
    ),
    false,
  );
});
