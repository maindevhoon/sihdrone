import { test } from "node:test";
import assert from "node:assert/strict";
import { connectPhone } from "./phone/connection";

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: URL) {
    FakeSocket.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  send(_text: string) {}
  close() {
    this.readyState = 3;
  } // A failed mobile network may never deliver onclose.
}
test("silent OPEN sockets reconnect with the same client identity; late callbacks cannot break the replacement", (t) => {
  const originalSocket = globalThis.WebSocket;
  const originalLocation = Object.getOwnPropertyDescriptor(
    globalThis,
    "location",
  );
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    writable: true,
    value: FakeSocket,
  });
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { origin: "https://demo.example", protocol: "https:" },
  });
  t.after(() => {
    globalThis.WebSocket = originalSocket;
    if (originalLocation)
      Object.defineProperty(globalThis, "location", originalLocation);
    else Reflect.deleteProperty(globalThis, "location");
  });
  FakeSocket.instances = [];
  let now = 0;
  t.mock.method(performance, "now", () => now);
  t.mock.method(Math, "random", () => 0);
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const statuses: boolean[] = [];
  const received: unknown[] = [];
  const connection = connectPhone(
    "room",
    "phone",
    undefined,
    (m) => received.push(m),
    (open) => statuses.push(open),
  );
  const first = FakeSocket.instances[0];
  first.open();
  const oldClose = first.onclose!;
  now = 9000;
  t.mock.timers.tick(9000);
  t.mock.timers.tick(500);
  assert.equal(FakeSocket.instances.length, 2);
  const next = FakeSocket.instances[1];
  assert.equal(first.readyState, 3);
  assert.equal(
    new URL(first.url).searchParams.get("client"),
    new URL(next.url).searchParams.get("client"),
  );
  next.open();
  oldClose({ code: 1006 });
  first.onmessage?.({
    data: JSON.stringify({ type: "peer", connected: false }),
  });
  assert.deepEqual(statuses, [true, false, true]);
  assert.deepEqual(received, []);
  next.onmessage?.({ data: JSON.stringify({ type: "peer", connected: true }) });
  assert.equal(received.length, 1);
  connection.close();
  now = 30000;
  t.mock.timers.tick(30000);
  assert.equal(FakeSocket.instances.length, 2);
});
