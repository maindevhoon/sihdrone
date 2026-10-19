import type { WireMessage } from "./protocol";
export function connectPhone(
  room: string,
  role: "host" | "phone",
  hostKey: string | undefined,
  receive: (message: WireMessage) => void,
  status: (connected: boolean) => void,
) {
  let socket: WebSocket | undefined,
    retry: ReturnType<typeof setTimeout> | undefined,
    closed = false;
  let delay = 500;
  function open() {
    const url = new URL("/api/phone/socket", location.origin);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    url.search = new URLSearchParams({
      room,
      role,
      ...(hostKey ? { key: hostKey } : {}),
    }).toString();
    socket = new WebSocket(url);
    socket.onopen = () => {
      delay = 500;
      status(true);
    };
    socket.onmessage = (event) => {
      try {
        receive(JSON.parse(event.data));
      } catch {
        /* Invalid packet is never a UI action. */
      }
    };
    socket.onerror = () => socket?.close();
    socket.onclose = (event) => {
      status(false);
      if (
        !closed &&
        event.code !== 4003 &&
        event.code !== 4004 &&
        event.code !== 4009
      ) {
        retry = setTimeout(open, delay);
        delay = Math.min(delay * 2, 5000);
      }
    };
  }
  const heartbeat = setInterval(() => {
    send({ type: "ping", at: performance.now() });
  }, 2000);
  function send(message: WireMessage) {
    if (
      socket?.readyState === WebSocket.OPEN &&
      socket.bufferedAmount < 256_000
    )
      socket.send(JSON.stringify(message));
  }
  open();
  return {
    send,
    close() {
      closed = true;
      clearTimeout(retry);
      clearInterval(heartbeat);
      socket?.close();
    },
  };
}
