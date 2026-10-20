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
    closed = false,
    lastIncoming = 0,
    delay = 500;
  const client = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  function schedule() {
    if (closed || retry) return;
    retry = setTimeout(
      () => {
        retry = undefined;
        open();
      },
      delay + Math.random() * 250,
    );
    delay = Math.min(delay * 2, 5000);
  }
  function open() {
    if (closed) return;
    const url = new URL("/api/phone/socket", location.origin);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    url.search = new URLSearchParams({
      room,
      role,
      client,
      ...(hostKey ? { key: hostKey } : {}),
    }).toString();
    const active = new WebSocket(url);
    socket = active;
    active.onopen = () => {
      if (closed || socket !== active) {
        active.close();
        return;
      }
      delay = 500;
      lastIncoming = performance.now();
      status(true);
    };
    active.onmessage = (event) => {
      if (closed || socket !== active) return;
      lastIncoming = performance.now();
      try {
        receive(JSON.parse(event.data));
      } catch {
        /* Invalid input never becomes a command. */
      }
    };
    active.onerror = () => {
      if (socket === active) active.close();
    };
    active.onclose = (event) => {
      if (closed || socket !== active) return;
      socket = undefined;
      status(false);
      if (![4003, 4004, 4009].includes(event.code)) schedule();
    };
  }
  const heartbeat = setInterval(() => {
    const active = socket;
    if (
      active?.readyState === WebSocket.OPEN &&
      performance.now() - lastIncoming > 8000
    ) {
      // A mobile connection can appear OPEN after its network has disappeared. Replace it
      // rather than waiting indefinitely for a close handshake; reuse our own role lease.
      socket = undefined;
      active.onclose = null;
      active.close();
      status(false);
      schedule();
      return;
    }
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
