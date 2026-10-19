import type { EventEmitter } from "node:events";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { validAction, validControl, validPose } from "../../src/phone/protocol";

type Room = {
  key: string;
  expires: number;
  host?: WebSocket;
  phone?: WebSocket;
};
function equal(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
/** Ephemeral, bounded demo relay. Invitations grant phone access; host capabilities stay off the QR. */
export function attachPhoneRelay(
  server: EventEmitter,
  publicOrigin: () => string = () => "",
) {
  const rooms = new Map<string, Room>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512_000 });
  const send = (ws: WebSocket | undefined, data: unknown) => {
    if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 512_000)
      ws.send(JSON.stringify(data));
  };
  function remove(id: string) {
    const room = rooms.get(id);
    rooms.delete(id);
    room?.host?.close(4004, "Pairing ended");
    room?.phone?.close(4004, "Pairing ended");
  }
  function sameOrigin(req: IncomingMessage) {
    const origin = req.headers.origin;
    if (!origin) return true; // CLI and same-origin GETs may omit Origin.
    try {
      return (
        new URL(origin).host === req.headers.host || origin === publicOrigin()
      );
    } catch {
      return false;
    }
  }
  function middleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) {
    const url = new URL(req.url || "/", "http://localhost");
    if (!url.pathname.startsWith("/api/phone/")) {
      next();
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    const reply = (status: number, data: unknown) => {
      res.statusCode = status;
      res.end(JSON.stringify(data));
    };
    if (!sameOrigin(req))
      return reply(403, { error: "Open the pairing page on this server." });
    if (url.pathname === "/api/phone/status" && req.method === "GET")
      return reply(200, { available: true, publicOrigin: publicOrigin() });
    if (url.pathname === "/api/phone/rooms" && req.method === "POST") {
      if (rooms.size >= 32)
        return reply(429, {
          error: "Pairing capacity reached. End an existing room.",
        });
      const room = randomBytes(16).toString("hex"),
        key = randomBytes(24).toString("hex");
      rooms.set(room, { key, expires: Date.now() + 2 * 60 * 60_000 });
      return reply(201, { room, key });
    }
    const match = url.pathname.match(/^\/api\/phone\/rooms\/([a-f0-9]{32})$/);
    if (match && req.method === "DELETE") {
      const room = rooms.get(match[1]);
      if (!room || !equal(String(req.headers["x-host-key"] || ""), room.key))
        return reply(403, { error: "Unknown host." });
      remove(match[1]);
      return reply(200, { ended: true });
    }
    reply(404, { error: "Unknown pairing endpoint." });
  }
  const upgrade = (
    req: IncomingMessage,
    socket: import("node:stream").Duplex,
    head: Buffer,
  ) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname !== "/api/phone/socket") return;
    const room = rooms.get(url.searchParams.get("room") || ""),
      role = url.searchParams.get("role");
    if (
      !room ||
      room.expires < Date.now() ||
      !sameOrigin(req) ||
      (role !== "host" && role !== "phone") ||
      (role === "host" && !equal(url.searchParams.get("key") || "", room.key))
    ) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (room[role]?.readyState === WebSocket.OPEN) {
        ws.close(4009, "This role is already connected");
        return;
      }
      room[role] = ws;
      send(room.host, {
        type: "peer",
        connected: room.phone?.readyState === WebSocket.OPEN,
      });
      send(room.phone, {
        type: "peer",
        connected: room.host?.readyState === WebSocket.OPEN,
      });
      let windowStart = Date.now(),
        packets = 0;
      ws.on("message", (raw) => {
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
          if (message.type === "ping" && Number.isFinite(message.at)) {
            send(ws, { type: "pong", at: message.at });
            return;
          }
          const permitted =
            role === "host"
              ? ["snapshot", "tick"].includes(message.type) &&
                message.state &&
                typeof message.state === "object"
              : validAction(message) ||
                validControl(message) ||
                (message.type === "pose" && validPose(message.pose)) ||
                (message.type === "ready" &&
                  Number.isSafeInteger(message.epoch)) ||
                message.type === "hold";
          if (permitted)
            send(role === "host" ? room.phone : room.host, message);
        } catch {
          /* Malformed input cannot become a command. */
        }
      });
      ws.on("error", () => ws.close());
      ws.on("close", () => {
        if (room[role] === ws) room[role] = undefined;
        send(role === "host" ? room.phone : room.host, {
          type: "peer",
          connected: false,
        });
      });
    });
  };
  server.on("upgrade", upgrade);
  const cleanup = setInterval(() => {
    for (const [id, room] of rooms) if (room.expires < Date.now()) remove(id);
  }, 30_000);
  cleanup.unref();
  return {
    middleware,
    close() {
      clearInterval(cleanup);
      server.off("upgrade", upgrade);
      for (const id of rooms.keys()) remove(id);
      wss.close();
    },
  };
}
