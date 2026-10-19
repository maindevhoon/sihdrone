import { useEffect, useRef, useState } from "react";
import { Euler, Quaternion } from "three";
import {
  Crosshair,
  Minus,
  Plus,
  RotateCcw,
  Smartphone,
  Move,
  Compass,
  Home,
  SkipForward,
  Pause,
} from "lucide-react";
import { categories, formatTime, trackLabel } from "../simulation";
import { theatreById, isGeographic } from "../theatres";
import { connectPhone } from "./connection";
import { usePhoneSensors } from "./usePhoneSensors";
import type {
  PhoneControl,
  PhoneSnapshot,
  Pose,
  WireMessage,
} from "./protocol";
import "./phone.css";

type WithoutEpoch<T> = T extends unknown ? Omit<T, "epoch" | "type"> : never;
type PadMode = "look" | "pan";
const bound = (value: number, max: number) =>
  Math.max(-max, Math.min(max, value));
export default function PhoneController() {
  const room = new URLSearchParams(location.hash.slice(1)).get("pair") || "";
  const [snapshot, setSnapshot] = useState<PhoneSnapshot | null>(null),
    current = useRef<PhoneSnapshot | null>(null);
  const [connected, setConnected] = useState(false),
    [host, setHost] = useState(false),
    [fresh, setFresh] = useState(false);
  const [rtt, setRtt] = useState<number | null>(null),
    [notice, setNotice] = useState("");
  const [mode, setMode] = useState<PadMode>("look"),
    [hidden, setHidden] = useState(document.hidden);
  const sensors = usePhoneSensors(),
    latestSensors = useRef(sensors);
  latestSensors.current = sensors;
  const channel = useRef<ReturnType<typeof connectPhone> | null>(null),
    received = useRef(0);
  const manualPose = useRef<Pose>([0, 0, 0, 1]),
    angles = useRef({ yaw: 0, pitch: 0 }),
    modeRef = useRef(mode);
  modeRef.current = mode;
  const points = useRef(new Map<number, { x: number; y: number }>()),
    pinch = useRef<number | null>(null);
  const pending = useRef({ x: 0, y: 0, zoom: 0, at: 0 });
  const validRoom = /^[a-f0-9]{32}$/.test(room);
  const theatre = theatreById(snapshot?.theatre || "district"),
    map = isGeographic(theatre);
  const usable =
    connected && host && fresh && !hidden && snapshot?.prepared !== false;
  const live =
    usable &&
    snapshot?.phase === "running" &&
    snapshot.playing &&
    snapshot.time >= snapshot.scenario.arrival;
  const candidate = snapshot?.aimedTrack ?? snapshot?.selectedTrack ?? 0;
  const selected = snapshot?.decisions?.find(
    (track) => track.id === snapshot.selectedTrack,
  );
  const candidateDecision = snapshot?.decisions?.find(
    (track) => track.id === candidate,
  );
  const sendControl = (command: WithoutEpoch<PhoneControl>) => {
    const state = current.current;
    if (state)
      channel.current?.send({
        ...command,
        type: "control",
        epoch: state.epoch,
      } as PhoneControl);
  };
  const controlRef = useRef(sendControl);
  controlRef.current = sendControl;
  useEffect(() => {
    if (!validRoom) return;
    const receive = (message: WireMessage) => {
      if (message.type === "peer") setHost(message.connected);
      if (message.type === "pong")
        setRtt(Math.round(performance.now() - message.at));
      if (
        message.type === "snapshot" ||
        (message.type === "tick" && current.current)
      ) {
        const next =
          message.type === "snapshot"
            ? message.state
            : { ...message.state, scenario: current.current!.scenario };
        if (message.type === "tick" && current.current?.epoch !== next.epoch)
          return;
        current.current = next;
        received.current = performance.now();
        setSnapshot(next);
      }
    };
    const connection = connectPhone(
      room,
      "phone",
      undefined,
      receive,
      (open) => {
        setConnected(open);
        if (!open) setHost(false);
      },
    );
    channel.current = connection;
    const pulse = setInterval(() => {
      if (!document.hidden)
        connection.send({
          type: "pose",
          pose:
            modeRef.current === "look"
              ? manualPose.current
              : latestSensors.current.pose.current,
          telemetry: latestSensors.current.telemetry.current,
        });
      setFresh(performance.now() - received.current < 1200);
    }, 50);
    const visibility = () => {
      setHidden(document.hidden);
      if (document.hidden) connection.send({ type: "hold" });
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(pulse);
      document.removeEventListener("visibilitychange", visibility);
      connection.close();
      channel.current = null;
    };
  }, [room, validRoom]);
  useEffect(() => {
    if (
      !snapshot ||
      snapshot.prepared === false ||
      !connected ||
      !host ||
      hidden
    )
      return;
    const send = () =>
      channel.current?.send({ type: "ready", epoch: snapshot.epoch });
    send();
    const interval = setInterval(send, 750);
    return () => clearInterval(interval);
  }, [snapshot?.epoch, snapshot?.prepared, connected, host, hidden]);
  useEffect(() => {
    if (sensors.enabled) {
      setMode("pan");
      controlRef.current({ control: "recenter" });
    }
  }, [sensors.enabled]);
  useEffect(() => {
    controlRef.current({ control: "recenter" });
  }, [sensors.display.screen]);
  useEffect(() => {
    if (!connected) return;
    let cancelled = false,
      lock: WakeLockSentinel | undefined;
    const acquire = async () => {
      if (document.hidden) return;
      try {
        const next = await navigator.wakeLock?.request("screen");
        if (cancelled) void next?.release();
        else lock = next;
      } catch {
        /* Optional. */
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, [connected]);
  function recenter() {
    sensors.recenter();
    manualPose.current = [0, 0, 0, 1];
    angles.current = { yaw: 0, pitch: 0 };
    sendControl({ control: "recenter" });
    setNotice("Reference reset. The laptop keeps its current map position.");
  }
  function observe() {
    if (!live || !snapshot) return;
    channel.current?.send({
      type: "observe",
      track: candidate,
      epoch: snapshot.epoch,
    });
    navigator.vibrate?.(25);
    setNotice(`${trackLabel(candidate)} observation sent`);
  }
  const actions = useRef({ observe, snapshot, live });
  actions.current = { observe, snapshot, live };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const p = actions.current;
      if (!p.live || !p.snapshot) return;
      if (event.key.toLowerCase() === "o" || event.key === "AudioVolumeUp") {
        event.preventDefault();
        p.observe();
      }
      if (["1", "2", "3"].includes(event.key))
        channel.current?.send({
          type: "classify",
          track: p.snapshot.selectedTrack,
          epoch: p.snapshot.epoch,
          answer: categories[Number(event.key) - 1],
        });
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  if (!validRoom)
    return (
      <main className="phone-entry">
        <Smartphone size={42} />
        <h1>Phone controller</h1>
        <p>
          Open Phone view on the laptop and scan its QR. The laptop displays the
          terrain; your phone controls it.
        </p>
      </main>
    );
  return (
    <main className="phone-controller">
      <header className="controller-header">
        <div>
          <span className="phone-eyebrow">TRINETRA · WIRELESS CONTROLLER</span>
          <h1>{theatre.name}</h1>
          <p>{theatre.terrainLabel} · laptop display</p>
        </div>
        <span className={`phone-status ${usable ? "online" : ""}`}>
          {!connected
            ? "Connecting…"
            : !host
              ? "Waiting for laptop"
              : !fresh
                ? "Link held"
                : snapshot?.prepared === false
                  ? "Preparing flight"
                  : "Connected"}
          {rtt !== null && <small>{rtt} ms relay</small>}
        </span>
      </header>
      <section className="controller-motion">
        <div>
          <Smartphone size={24} />
          <h2>Move the phone. Watch the laptop.</h2>
          <p>
            {sensors.enabled
              ? "Turn to look left / right. Tilt to look up / down."
              : "Enable motion for gyro control, or drag the pad to look around."}
          </p>
        </div>
        <div className="controller-primary">
          <button onClick={() => void sensors.enable()}>
            {sensors.enabled ? "Retry motion" : "Enable motion"}
          </button>
          <button onClick={recenter}>
            <RotateCcw size={17} />
            Recenter
          </button>
        </div>
      </section>
      <section className="controller-pad-section">
        <div className="controller-pad-heading">
          <span>
            {mode === "look" ? "DRAG TO LOOK" : "SWIPE TO PAN · PINCH TO ZOOM"}
          </span>
          <div>
            <button
              aria-pressed={mode === "look"}
              onClick={() => {
                setMode("look");
                manualPose.current = [0, 0, 0, 1];
                angles.current = { yaw: 0, pitch: 0 };
                sendControl({ control: "recenter" });
              }}
            >
              Drag look
            </button>
            <button
              aria-pressed={mode === "pan"}
              disabled={!map && !sensors.enabled}
              onClick={() => {
                setMode("pan");
                sendControl({ control: "recenter" });
              }}
            >
              Motion / pan
            </button>
          </div>
        </div>
        <div
          className="controller-pad"
          aria-label="Phone navigation pad"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            points.current.set(event.pointerId, {
              x: event.clientX,
              y: event.clientY,
            });
            pinch.current = null;
          }}
          onPointerMove={(event) => {
            const old = points.current.get(event.pointerId);
            if (!old) return;
            const dx = event.clientX - old.x,
              dy = event.clientY - old.y;
            points.current.set(event.pointerId, {
              x: event.clientX,
              y: event.clientY,
            });
            const fingers = [...points.current.values()];
            if (fingers.length === 2 && map) {
              const distance = Math.hypot(
                fingers[0].x - fingers[1].x,
                fingers[0].y - fingers[1].y,
              );
              if (pinch.current && distance > 4)
                pending.current.zoom += Math.log(pinch.current / distance);
              pinch.current = distance;
            } else if (mode === "look") {
              angles.current.yaw -= bound(dx, 40) * 0.004;
              angles.current.pitch = Math.max(
                -1.25,
                Math.min(1.25, angles.current.pitch - bound(dy, 40) * 0.004),
              );
              manualPose.current = new Quaternion()
                .setFromEuler(
                  new Euler(angles.current.pitch, angles.current.yaw, 0, "YXZ"),
                )
                .toArray() as Pose;
            } else if (map) {
              pending.current.x -= dx * 0.7;
              pending.current.y -= dy * 0.7;
            }
            const now = performance.now(),
              p = pending.current;
            if (now - p.at < 40) return;
            p.at = now;
            if (p.zoom) {
              sendControl({ control: "zoom", amount: bound(p.zoom, 0.25) });
              p.zoom = 0;
            }
            if (p.x || p.y) {
              sendControl({
                control: "pan",
                x: bound(p.x, 80),
                y: bound(p.y, 80),
              });
              p.x = 0;
              p.y = 0;
            }
          }}
          onPointerUp={(event) => {
            points.current.delete(event.pointerId);
            pinch.current = null;
          }}
          onPointerCancel={(event) => {
            points.current.delete(event.pointerId);
            pinch.current = null;
          }}
        >
          <Move size={32} />
          <span>{snapshot?.bearing?.toString().padStart(3, "0") ?? "—"}°</span>
          <small>
            {mode === "look"
              ? "Drag this pad to turn the laptop camera"
              : map
                ? "Swipe to move across the terrain"
                : "Motion controls the district camera"}
          </small>
        </div>
        <div className="controller-map-buttons">
          <button
            disabled={!usable || !map}
            aria-label="Zoom in map"
            onClick={() => sendControl({ control: "zoom", amount: -0.18 })}
          >
            <Plus size={19} />
            Zoom in
          </button>
          <button
            disabled={!usable || !map}
            aria-label="Zoom out map"
            onClick={() => sendControl({ control: "zoom", amount: 0.18 })}
          >
            <Minus size={19} />
            Zoom out
          </button>
          <button
            disabled={!usable || !map}
            onClick={() => sendControl({ control: "north" })}
          >
            <Compass size={17} />
            North
          </button>
          <button
            disabled={!usable || !map}
            onClick={() => sendControl({ control: "home" })}
          >
            <Home size={17} />
            Site
          </button>
        </div>
      </section>
      <section className="controller-contact">
        <header>
          <div>
            <span className="phone-eyebrow">
              {snapshot?.aimedTrack != null
                ? "LAPTOP RETICLE"
                : "RADAR-CUED TRACK"}
            </span>
            <h2>
              {snapshot ? trackLabel(candidate) : "—"}{" "}
              <small>
                {candidateDecision?.detection != null
                  ? "Observed"
                  : "Unobserved"}
              </small>
            </h2>
          </div>
          <span>
            {snapshot ? formatTime(snapshot.time) : "—"} ·{" "}
            {snapshot?.phase === "running"
              ? "LIVE"
              : snapshot?.phase === "paused"
                ? "HOLD"
                : "PREVIEW"}
          </span>
        </header>
        <div className="controller-contact-actions">
          <button
            className="controller-observe"
            disabled={!live}
            onClick={observe}
          >
            <Crosshair size={20} />
            Observe {snapshot ? trackLabel(candidate) : "contact"}
          </button>
          <button
            disabled={!usable}
            onClick={() => sendControl({ control: "next-track" })}
          >
            <SkipForward size={18} />
            Next track
          </button>
          <button
            disabled={!usable || snapshot?.phase !== "running"}
            onClick={() => sendControl({ control: "hold" })}
          >
            <Pause size={17} />
            Hold
          </button>
        </div>
        <p className="phone-small">
          Assessment {snapshot ? trackLabel(snapshot.selectedTrack) : "—"} ·{" "}
          {selected?.detection != null
            ? "Observation recorded. Choose a category."
            : "Observe before classifying. Next track cues the laptop EO/IR feed."}
        </p>
        <div className="phone-classify">
          {categories.map((answer) => (
            <button
              key={answer}
              disabled={!live || selected?.detection == null}
              aria-pressed={selected?.answer === answer}
              onClick={() => {
                if (snapshot)
                  channel.current?.send({
                    type: "classify",
                    track: snapshot.selectedTrack,
                    epoch: snapshot.epoch,
                    answer,
                  });
              }}
            >
              {answer}
            </button>
          ))}
        </div>
      </section>
      <footer className="controller-footer">
        <div className="phone-sensors">
          <span>
            Orientation{" "}
            {sensors.display.orientation ? "● receiving" : "○ waiting"}
          </span>
          <span>
            Motion {sensors.display.motion ? "● receiving" : "○ waiting"}
          </span>
          <span>
            Rotation {sensors.display.rotationRate?.toFixed(0) ?? "—"}°/s
          </span>
        </div>
        <p role="status">
          {sensors.error ||
            notice ||
            "The laptop preview stays visible while paired, including on hold. Start / resume the exercise on the laptop."}
        </p>
        <small>{snapshot?.status}</small>
      </footer>
    </main>
  );
}
