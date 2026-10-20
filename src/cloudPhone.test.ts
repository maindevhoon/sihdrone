import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { WebSocket } from "ws";
import { RedisPairingStore } from "../server/phone/store";
import { createCloudRelay, permittedMessage } from "../server/phone/relay";

const token = () => randomBytes(16).toString("hex");
const hasRedis = spawnSync("redis-server", ["--version"]).status === 0;
let process: ChildProcess | undefined,
  redisUrl = "";
before(async () => {
  if (!hasRedis) return;
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  process = spawn(
    "redis-server",
    [
      "--bind",
      "127.0.0.1",
      "--port",
      String(port),
      "--save",
      "",
      "--appendonly",
      "no",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Test Redis startup timeout")),
      5000,
    );
    process!.stdout!.on("data", (data) => {
      if (String(data).includes("Ready to accept connections")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    process!.once("error", reject);
  });
  redisUrl = `redis://127.0.0.1:${port}`;
});
after(() => {
  process?.kill("SIGTERM");
});

const integration = {
  skip:
    !hasRedis &&
    "Install redis-server to run distributed relay integration checks",
};
const waitFor = async (predicate: () => boolean) => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("Expected relay event was not delivered");
};
test("cloud relay rejects malformed, forged and wrong-direction packets", () => {
  for (const value of [
    null,
    [],
    { type: "observe", track: -1, epoch: 1 },
    { type: "pose", pose: [0, 0, 0, 50] },
    { type: "peer", connected: true },
    { type: "snapshot", state: {} },
  ])
    assert.equal(permittedMessage("phone", value), false);
  assert.equal(
    permittedMessage("phone", { type: "observe", track: 1, epoch: 2 }),
    true,
  );
  assert.equal(
    permittedMessage("host", { type: "observe", track: 1, epoch: 2 }),
    false,
  );
  assert.equal(permittedMessage("host", { type: "snapshot", state: {} }), true);
});
test("unconfigured cloud relay returns actionable no-store status instead of a working QR", async () => {
  const relay = createCloudRelay(null);
  relay.server.listen(0, "127.0.0.1");
  await once(relay.server, "listening");
  try {
    const port = (relay.server.address() as { port: number }).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/phone/status`);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    assert.equal((await res.json()).available, false);
  } finally {
    relay.close();
    await new Promise<void>((resolve) => relay.server.close(() => resolve()));
  }
});
test(
  "Redis leases allow Function reconnects but prevent role theft and stale disconnect removal",
  integration,
  async () => {
    const store = new RedisPairingStore(redisUrl, `test:${token()}`);
    try {
      const room = (await store.create("one"))!;
      assert.equal(
        await store.claim(room.room, "host", "wrong", token()),
        null,
      );
      const client = token();
      const old = (await store.claim(room.room, "host", room.key, client))!;
      assert.ok(old);
      assert.equal(
        await store.claim(room.room, "host", room.key, token()),
        null,
      );
      const renewed = (await store.claim(room.room, "host", room.key, client))!;
      assert.ok(renewed);
      assert.notEqual(old.value, renewed.value);
      await store.release(old);
      assert.equal(await store.renew(old), false);
      assert.equal(await store.renew(renewed), true);
      assert.equal(await store.present(room.room, "host"), true);
      assert.equal(await store.end(room.room, "bad"), false);
      assert.equal(await store.end(room.room, room.key), true);
      assert.equal(await store.renew(renewed), false);
      assert.equal(await store.claim(room.room, "phone", "", token()), null);
    } finally {
      store.close();
    }
  },
);
test(
  "Redis bounds room creation globally and rate limits each address",
  integration,
  async () => {
    const store = new RedisPairingStore(redisUrl, `test:${token()}`);
    try {
      for (let i = 0; i < 10; i++) assert.ok(await store.create("one"));
      assert.equal(await store.create("one"), null);
      for (let i = 10; i < 32; i++)
        assert.ok(await store.create(`address:${i}`));
      assert.equal(await store.create("another"), null);
    } finally {
      store.close();
    }
  },
);
test(
  "two Function instances relay ordered commands, isolate rooms and notify disconnect/end",
  integration,
  async () => {
    const namespace = `test:${token()}`;
    const stores = [
      new RedisPairingStore(redisUrl, namespace),
      new RedisPairingStore(redisUrl, namespace),
    ];
    const relays = stores.map((store) => createCloudRelay(store));
    const sockets: WebSocket[] = [];
    for (const relay of relays) {
      relay.server.listen(0, "127.0.0.1");
      await once(relay.server, "listening");
    }
    const bases = relays.map(
      (relay) =>
        `http://127.0.0.1:${(relay.server.address() as { port: number }).port}`,
    );
    const connect = async (
      instance: number,
      room: string,
      role: string,
      key = "",
      client = token(),
    ) => {
      const ws = new WebSocket(
        `${bases[instance].replace("http", "ws")}/api/phone?route=socket&${new URLSearchParams({ room, role, key, client })}`,
      );
      sockets.push(ws);
      const messages: Record<string, unknown>[] = [];
      ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
      await once(ws, "open");
      return { ws, messages, client };
    };
    try {
      // Test rewritten API paths as well as the direct local paths.
      const response = await fetch(`${bases[0]}/api/phone?route=rooms`, {
        method: "POST",
      });
      assert.equal(response.status, 201);
      const room = await response.json();
      const other = (await stores[0].create("other"))!;
      assert.equal(
        (
          await fetch(`${bases[0]}/api/phone/status`, {
            headers: { Origin: "https://unrelated.example" },
          })
        ).status,
        403,
      );
      const host = await connect(0, room.room, "host", room.key);
      const isolated = await connect(0, other.room, "host", other.key);
      const phone = await connect(1, room.room, "phone");
      await waitFor(() =>
        host.messages.some((m) => m.type === "peer" && m.connected),
      );
      phone.ws.send(JSON.stringify({ type: "snapshot", state: {} }));
      phone.ws.send(JSON.stringify({ type: "pose", pose: [0, 0, 0, 20] }));
      for (let track = 0; track < 5; track++)
        phone.ws.send(JSON.stringify({ type: "observe", epoch: 3, track }));
      host.ws.send(JSON.stringify({ type: "snapshot", state: { epoch: 3 } }));
      await waitFor(
        () =>
          host.messages.filter((m) => m.type === "observe").length === 5 &&
          phone.messages.some((m) => m.type === "snapshot"),
      );
      assert.deepEqual(
        host.messages.filter((m) => m.type === "observe").map((m) => m.track),
        [0, 1, 2, 3, 4],
      );
      assert.ok(
        !host.messages.some((m) => m.type === "snapshot" || m.type === "pose"),
      );
      assert.ok(!isolated.messages.some((m) => m.type === "observe"));
      const before = host.messages.length;
      phone.ws.close();
      await once(phone.ws, "close");
      await waitFor(() =>
        host.messages
          .slice(before)
          .some((m) => m.type === "peer" && m.connected === false),
      );
      const replacement = await connect(
        0,
        room.room,
        "phone",
        "",
        phone.client,
      );
      await waitFor(() =>
        replacement.messages.some((m) => m.type === "peer" && m.connected),
      );
      const closed = once(replacement.ws, "close");
      const ended = await fetch(`${bases[1]}/api/phone/rooms/${room.room}`, {
        method: "DELETE",
        headers: { "X-Host-Key": room.key },
      });
      assert.equal(ended.status, 200);
      assert.equal((await closed)[0], 4004);
    } finally {
      for (const ws of sockets) ws.terminate();
      for (const relay of relays) {
        relay.close();
        await new Promise<void>((resolve) =>
          relay.server.close(() => resolve()),
        );
      }
      for (const store of stores) store.close();
    }
  },
);
