import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { validAction, validControl, validPose } from "../../src/phone/protocol";
import type { Lease, PairingStore, Role } from "./store";

export function permittedMessage(role: Role, message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const m = message as Record<string, unknown>;
  return role === "host"
    ? ["snapshot", "tick"].includes(m.type as string) &&
        !!m.state &&
        typeof m.state === "object"
    : validAction(m) ||
        validControl(m) ||
        (m.type === "pose" && validPose(m.pose)) ||
        (m.type === "ready" && Number.isSafeInteger(m.epoch)) ||
        m.type === "hold";
}
function sameOrigin(req: IncomingMessage) {
  if (!req.headers.origin) return true;
  try {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    return new URL(req.headers.origin).host === host;
  } catch {
    return false;
  }
}
function path(req: IncomingMessage) {
  const url = new URL(req.url || "/", "http://localhost");
  const route = url.searchParams.get("route");
  return { url, pathname: route ? `/api/phone/${route}` : url.pathname };
}
const opposite = (role: Role): Role => (role === "host" ? "phone" : "host");
const send = (ws: WebSocket, message: unknown) => {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount >= 512_000) {
    ws.close(1013, "Connection too slow");
    return;
  }
  ws.send(JSON.stringify(message));
};

/** Distributed relay: WebSockets belong to Functions; rooms/leases/pubsub belong to Redis. */
export function createCloudRelay(store: PairingStore | null) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512_000 });
  const server = createServer((req, res) => {
    void handle(req, res);
  });
  async function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    const reply = (status: number, data: unknown) => {
      res.statusCode = status;
      res.end(JSON.stringify(data));
    };
    if (!sameOrigin(req))
      return reply(403, { error: "Open pairing on this website." });
    if (!store)
      return reply(503, {
        available: false,
        error:
          "Online phone pairing is not configured. Connect the pairing Redis store and redeploy, or use the local phone demo.",
      });
    try {
      const { pathname } = path(req);
      if (pathname === "/api/phone/status" && req.method === "GET") {
        await store.health();
        return reply(200, { available: true, mode: "cloud", publicOrigin: "" });
      }
      if (pathname === "/api/phone/rooms" && req.method === "POST") {
        // Vercel overwrites this header. Locally use the actual peer address.
        const address =
          req.headers["x-vercel-forwarded-for"]?.toString().split(",")[0] ||
          req.socket.remoteAddress ||
          "unknown";
        const room = await store.create(address);
        return room
          ? reply(201, room)
          : reply(429, {
              error:
                "Pairing limit reached. End an existing room or try later.",
            });
      }
      const match = pathname.match(/^\/api\/phone\/rooms\/([a-f0-9]{32})$/);
      if (match && req.method === "DELETE") {
        const ended = await store.end(
          match[1],
          String(req.headers["x-host-key"] || ""),
        );
        return ended
          ? reply(200, { ended: true })
          : reply(403, { error: "Unknown host." });
      }
      return reply(404, { error: "Unknown pairing endpoint." });
    } catch {
      return reply(503, {
        available: false,
        error:
          "Phone pairing is temporarily unavailable. Retry shortly, or use the local USB demo.",
      });
    }
  }
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const reject = (status: number) => {
      if (!socket.destroyed)
        socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);
    };
    const { url, pathname } = path(req);
    const room = url.searchParams.get("room") || "",
      role = url.searchParams.get("role"),
      client = url.searchParams.get("client") || "",
      key = url.searchParams.get("key") || "";
    if (
      pathname !== "/api/phone/socket" ||
      !sameOrigin(req) ||
      !/^[a-f0-9]{32}$/.test(room) ||
      !/^[a-f0-9]{32}$/.test(client) ||
      (role !== "host" && role !== "phone")
    )
      return reject(403);
    if (!store) return reject(503);
    void (async () => {
      let lease: Lease | null = null;
      try {
        lease = await store.claim(room, role, key, client);
        if (!lease) return reject(403);
        if (socket.destroyed) {
          await store.release(lease);
          return;
        }
        const granted = lease;
        wss.handleUpgrade(req, socket, head, (ws) => {
          void attach(ws, granted);
        });
      } catch {
        if (lease) void store.release(lease).catch(() => {});
        reject(503);
      }
    })();
  });
  async function attach(ws: WebSocket, lease: Lease) {
    const { room, role } = lease;
    let stopWatching: (() => void) | undefined,
      timer: ReturnType<typeof setInterval> | undefined;
    let closed = false,
      refreshing = false,
      lastPong = Date.now(),
      peer: boolean | undefined;
    const fail = () => ws.close(1013, "Pairing connection interrupted");
    const updatePeer = (connected: boolean) => {
      if (peer === connected) return;
      peer = connected;
      send(ws, { type: "peer", connected });
    };
    ws.on("error", () => ws.close());
    ws.on("pong", () => {
      lastPong = Date.now();
    });
    ws.on("close", () => {
      closed = true;
      clearInterval(timer);
      stopWatching?.();
      void store!.release(lease).catch(() => {});
    });
    let windowStart = Date.now(),
      packets = 0,
      inFlight = 0;
    ws.pause();
    try {
      stopWatching = await store!.watch(
        room,
        (event) => {
          if (closed) return;
          if (event.type === "ended") {
            ws.close(4004, "Pairing ended");
            return;
          }
          if (event.type === "presence") {
            if (
              event.role === role &&
              event.connected &&
              event.lease !== lease.value
            ) {
              ws.close(4009, "Connection replaced");
            } else if (event.role !== role) updatePeer(event.connected);
          } else if (
            event.type === "data" &&
            event.role !== role &&
            Date.now() - event.at < 1500
          ) {
            send(ws, event.message);
          }
        },
        fail,
      );
      if (closed) {
        stopWatching();
        return;
      }
      await store!.publish(room, {
        type: "presence",
        role,
        connected: true,
        lease: lease.value,
      });
      updatePeer(await store!.present(room, opposite(role)));
      const refresh = async () => {
        if (closed || refreshing) return;
        refreshing = true;
        try {
          if (Date.now() >= lease.expires) {
            ws.close(4004, "Pairing expired");
            return;
          }
          if (Date.now() - lastPong > 12_000) {
            ws.terminate();
            return;
          }
          if (!(await store!.renew(lease))) {
            ws.close(4004, "Pairing ended");
            return;
          }
          updatePeer(await store!.present(room, opposite(role)));
          ws.ping();
        } catch {
          fail();
        } finally {
          refreshing = false;
        }
      };
      // Rotate before the 300-second Function lifetime. The client's identity survives reconnects.
      timer = setInterval(() => {
        if (Date.now() - started >= 270_000)
          ws.close(1012, "Reconnect pairing");
        else void refresh();
      }, 4000);
      timer.unref();
      const started = Date.now();
      ws.on("message", (raw) => {
        if (closed) return;
        if (Date.now() >= lease.expires) {
          ws.close(4004, "Pairing expired");
          return;
        }
        if (Date.now() - windowStart > 1000) {
          windowStart = Date.now();
          packets = 0;
        }
        if (++packets > 120) {
          ws.close(4003, "Too many messages");
          return;
        }
        try {
          const message = JSON.parse(raw.toString());
          if (message?.type === "ping" && Number.isFinite(message.at)) {
            send(ws, { type: "pong", at: message.at });
            return;
          }
          if (!permittedMessage(role, message)) return;
          if (inFlight >= 16) {
            fail();
            return;
          }
          inFlight++;
          void store!
            .publish(room, { type: "data", role, at: Date.now(), message })
            .catch(fail)
            .finally(() => {
              inFlight--;
            });
        } catch {
          /* Malformed packets never become commands. */
        }
      });
      ws.resume();
    } catch {
      stopWatching?.();
      fail();
    }
  }
  return {
    server,
    close() {
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
