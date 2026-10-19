import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera, Quaternion, StereoCamera, Vector3 } from "three";
import {
  Smartphone,
  RotateCcw,
  Maximize2,
  Crosshair,
  Wifi,
  Eye,
} from "lucide-react";
import { categories, formatTime, trackLabel } from "../simulation";
import { useFlightPreparation } from "../useFlightPreparation";
import { connectPhone } from "./connection";
import { usePhoneSensors } from "./usePhoneSensors";
import {
  remoteTime,
  type PhoneAction,
  type PhoneSnapshot,
  type WireMessage,
} from "./protocol";
import "./phone.css";
const DelhiScene = lazy(() => import("../DelhiScene"));
class ViewBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p className="phone-warning">
        The phone renderer could not start. Enable hardware acceleration and
        reload in Chrome.
      </p>
    ) : (
      this.props.children
    );
  }
}
function Clock({
  state,
  received,
  time,
  live,
  ready,
}: {
  state: MutableRefObject<PhoneSnapshot | null>;
  received: MutableRefObject<number>;
  time: MutableRefObject<number>;
  live: MutableRefObject<boolean>;
  ready: boolean;
}) {
  useFrame(() => {
    const value = state.current;
    if (!value || !ready || document.hidden) return;
    const age = performance.now() - received.current;
    if (age <= 500) time.current = remoteTime(value, age, live.current);
  }, -2);
  return null;
}
function StereoPreview() {
  const { gl, scene, camera, size } = useThree();
  const stereo = useRef(new StereoCamera());
  useFrame(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    stereo.current.aspect = 0.5;
    stereo.current.eyeSep = 0.064;
    camera.updateMatrixWorld();
    stereo.current.update(camera);
    gl.setScissorTest(true);
    const w = Math.floor(size.width / 2),
      h = size.height;
    gl.setViewport(0, 0, w, h);
    gl.setScissor(0, 0, w, h);
    gl.render(scene, stereo.current.cameraL);
    gl.setViewport(w, 0, size.width - w, h);
    gl.setScissor(w, 0, size.width - w, h);
    gl.render(scene, stereo.current.cameraR);
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
  }, 1);
  return null;
}
export default function PhoneView() {
  const room = new URLSearchParams(location.hash.slice(1)).get("pair") || "";
  const validRoom = /^[a-f0-9]{32}$/.test(room);
  const [snapshot, setSnapshot] = useState<PhoneSnapshot | null>(null),
    latest = useRef<PhoneSnapshot | null>(null);
  const received = useRef(0),
    time = useRef(0),
    live = useRef(false);
  const [connected, setConnected] = useState(false),
    [host, setHost] = useState(false),
    [rtt, setRtt] = useState<number | null>(null);
  const [fresh, setFresh] = useState(false),
    [stereo, setStereo] = useState(false),
    [gaze, setGaze] = useState<number | null>(null);
  const [notice, setNotice] = useState(""),
    [manual, setManual] = useState(false),
    [held, setHeld] = useState(document.hidden);
  const connection = useRef<ReturnType<typeof connectPhone> | null>(null);
  const sensors = usePhoneSensors();
  const sensorRef = useRef(sensors);
  sensorRef.current = sensors;
  useEffect(() => {
    if (!validRoom) return;
    const receive = (message: WireMessage) => {
      if (message.type === "peer") {
        setHost(message.connected);
        live.current = message.connected;
      }
      if (message.type === "pong")
        setRtt(Math.round(performance.now() - message.at));
      if (
        message.type === "snapshot" ||
        (message.type === "tick" && latest.current)
      ) {
        const next =
          message.type === "snapshot"
            ? message.state
            : { ...message.state, scenario: latest.current!.scenario };
        if (latest.current?.epoch !== next.epoch && message.type !== "snapshot")
          return;
        latest.current = next;
        received.current = performance.now();
        time.current = next.time;
        setSnapshot(next);
      }
    };
    const channel = connectPhone(room, "phone", undefined, receive, (open) => {
      setConnected(open);
      if (!open) {
        live.current = false;
        setHost(false);
      }
    });
    connection.current = channel;
    const poseTick = setInterval(() => {
      if (!document.hidden)
        channel.send({
          type: "pose",
          pose: sensorRef.current.pose.current,
          telemetry: sensorRef.current.telemetry.current,
        });
      setFresh(performance.now() - received.current < 500);
    }, 50);
    const visibility = () => {
      setHeld(document.hidden);
      if (document.hidden) channel.send({ type: "hold" });
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(poseTick);
      document.removeEventListener("visibilitychange", visibility);
      channel.close();
      connection.current = null;
    };
  }, [room, validRoom]);
  const preparation = useFlightPreparation(snapshot?.scenario || emptyScenario);
  const usable = connected && host && fresh && preparation.ready && !held;
  useEffect(() => {
    if (!snapshot || !preparation.ready || !connected || !host || held) return;
    const send = () =>
      connection.current?.send({ type: "ready", epoch: snapshot.epoch });
    send();
    const interval = setInterval(send, 750);
    return () => clearInterval(interval);
  }, [snapshot?.epoch, preparation.ready, connected, host, held]);
  const canDecide = usable && snapshot?.phase === "running" && snapshot.playing;
  const decision = snapshot?.decisions?.find((item) => item.id === gaze);
  const assessment = snapshot?.decisions?.find(
    (item) => item.id === snapshot.selectedTrack,
  );
  function action(message: PhoneAction) {
    if (!canDecide) return;
    connection.current?.send(message);
    navigator.vibrate?.(30);
    setNotice(
      message.type === "observe"
        ? "Observation sent to console"
        : `${message.answer} sent to console`,
    );
  }
  const actionRef = useRef({ canDecide, gaze, snapshot, action });
  actionRef.current = { canDecide, gaze, snapshot, action };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        (event.target as HTMLElement).closest("input,textarea,select")
      )
        return;
      const p = actionRef.current;
      if (!p.canDecide || !p.snapshot) return;
      if (
        p.gaze !== null &&
        (event.key.toLowerCase() === "o" || event.key === "AudioVolumeUp")
      ) {
        event.preventDefault();
        p.action({ type: "observe", track: p.gaze, epoch: p.snapshot.epoch });
      }
      if (["1", "2", "3"].includes(event.key))
        p.action({
          type: "classify",
          track: p.snapshot.selectedTrack,
          epoch: p.snapshot.epoch,
          answer: categories[Number(event.key) - 1],
        });
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!sensors.enabled && !manual) return;
    let lock: WakeLockSentinel | undefined,
      cancelled = false;
    const acquire = async () => {
      if (document.hidden) return;
      try {
        const next = await navigator.wakeLock?.request("screen");
        if (cancelled) void next?.release();
        else lock = next;
      } catch {
        /* Optional enhancement. */
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, [sensors.enabled, manual]);
  const pointer = useRef<{
      x: number;
      y: number;
      yaw: number;
      pitch: number;
    } | null>(null),
    angles = useRef({ yaw: 0, pitch: 0 });
  const onGaze = useCallback((id: number | null) => setGaze(id), []);
  async function fullscreen() {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      setNotice("Fullscreen unavailable. Landscape still works.");
    }
  }
  if (!validRoom)
    return (
      <main className="phone-entry">
        <Smartphone size={42} />
        <h1>Connect to Trinetra</h1>
        <p>
          On the laptop, choose the 3D training district and open{" "}
          <b>Phone view</b>. Scan its QR code to join the exercise.
        </p>
      </main>
    );
  return (
    <main className={`phone-view ${stereo ? "split-eye" : ""}`}>
      <header className="phone-top">
        <div>
          <span className="phone-eyebrow">TRINETRA · PHONE OBSERVER</span>
          <strong>
            <Wifi size={14} />
            {!connected
              ? "Connecting / reconnecting…"
              : !host
                ? "Waiting for laptop"
                : !fresh
                  ? "Connection held"
                  : snapshot?.phase === "running"
                    ? "LIVE EXERCISE"
                    : snapshot?.phase === "paused"
                      ? "EXERCISE HELD"
                      : "UNSCORED PREVIEW"}
          </strong>
        </div>
        <span>
          {snapshot ? formatTime(snapshot.time) : "—"}
          {rtt !== null && <small>{rtt} ms relay</small>}
        </span>
      </header>
      <section
        className="phone-world"
        aria-label="Motion-controlled training view"
        onPointerDown={(e) => {
          if (sensors.enabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          pointer.current = { x: e.clientX, y: e.clientY, ...angles.current };
          setManual(true);
        }}
        onPointerMove={(e) => {
          if (!pointer.current) return;
          const p = pointer.current;
          angles.current = {
            yaw: p.yaw - (e.clientX - p.x) * 0.004,
            pitch: Math.max(
              -1.2,
              Math.min(1.2, p.pitch - (e.clientY - p.y) * 0.004),
            ),
          };
          const q = new Quaternion()
            .setFromAxisAngle(new Vector3(0, 1, 0), angles.current.yaw)
            .multiply(
              new Quaternion().setFromAxisAngle(
                new Vector3(1, 0, 0),
                angles.current.pitch,
              ),
            );
          sensors.pose.current = q.toArray() as [
            number,
            number,
            number,
            number,
          ];
        }}
        onPointerUp={() => {
          pointer.current = null;
        }}
        onPointerCancel={() => {
          pointer.current = null;
        }}
      >
        {snapshot ? (
          <ViewBoundary>
            <Suspense fallback={<p>Loading the training district…</p>}>
              <Canvas
                camera={{ position: [0, 3, 12], fov: 65, near: 0.2, far: 600 }}
                dpr={[1, 1.25]}
                gl={{ antialias: true, powerPreference: "high-performance" }}
              >
                <Clock
                  state={latest}
                  received={received}
                  live={live}
                  time={time}
                  ready={preparation.ready}
                />
                <DelhiScene
                  scenario={snapshot.scenario}
                  time={time}
                  selected={gaze !== null}
                  highlightedTrack={gaze ?? undefined}
                  onSelect={(id) => setGaze(id)}
                  cameraView="street"
                  onBearingChange={() => {}}
                  highQuality={false}
                  phonePose={sensors.pose}
                  phoneGaze={onGaze}
                />
                {stereo && <StereoPreview />}
              </Canvas>
            </Suspense>
          </ViewBoundary>
        ) : (
          <div className="phone-await">
            <Smartphone size={40} />
            <h1>Connecting to your console</h1>
            <p>
              Keep the laptop pairing room open. If it has ended or another
              phone joined, scan a fresh QR.
            </p>
          </div>
        )}
        <div
          className={`phone-crosshair ${gaze !== null ? "acquired" : ""}`}
          aria-hidden
        >
          <i />
          <i />
        </div>
        <div className="phone-gaze" role="status">
          {gaze !== null
            ? `${trackLabel(gaze)} · ${decision?.answer || "Contact under reticle"}`
            : "Turn slowly to scan · centre a contact"}
        </div>
        {snapshot && !preparation.ready && (
          <div className="phone-await">
            <p>{preparation.error || "Preparing the shared flight…"}</p>
            {preparation.error && (
              <button onClick={preparation.retry}>Retry flight</button>
            )}
          </div>
        )}
        {snapshot && !usable && preparation.ready && (
          <div className="phone-held">
            {!connected || !host || !fresh
              ? "Connection held · laptop clock remains authoritative"
              : "View held"}
          </div>
        )}
      </section>
      <section className="phone-controls">
        <div className="phone-toolbar">
          <button onClick={() => void sensors.enable()}>
            <Smartphone size={16} />
            {sensors.enabled ? "Retry motion" : "Enable motion"}
          </button>
          <button
            onClick={() => {
              sensors.recenter();
              angles.current = { yaw: 0, pitch: 0 };
              setNotice("View recentered");
            }}
          >
            <RotateCcw size={16} />
            Recenter
          </button>
          <button aria-pressed={stereo} onClick={() => setStereo((v) => !v)}>
            <Eye size={16} />
            {stereo ? "Single view" : "Split-eye preview"}
          </button>
          <button
            aria-label="Fullscreen phone view"
            onClick={() => void fullscreen()}
          >
            <Maximize2 size={17} />
          </button>
        </div>
        {assessment?.detection != null && (
          <p className="phone-assessment">
            Classify {trackLabel(assessment.id)} · observation recorded
          </p>
        )}
        <div className="phone-decisions">
          <button
            className="phone-observe"
            disabled={!canDecide || gaze === null}
            onClick={() => {
              if (snapshot && gaze !== null)
                action({ type: "observe", track: gaze, epoch: snapshot.epoch });
            }}
          >
            <Crosshair size={20} />
            {decision?.detection != null ? "Observed" : "Observe contact"}
          </button>
          <div className="phone-classify">
            {categories.map((answer) => (
              <button
                key={answer}
                disabled={!canDecide || assessment?.detection == null}
                aria-pressed={assessment?.answer === answer}
                onClick={() => {
                  if (snapshot && assessment)
                    action({
                      type: "classify",
                      track: assessment.id,
                      answer,
                      epoch: snapshot.epoch,
                    });
                }}
              >
                {answer}
              </button>
            ))}
          </div>
        </div>
        <div className="phone-sensors">
          <span>
            Orientation{" "}
            {sensors.display.orientation ? "● receiving" : "○ waiting"}
          </span>
          <span>
            Motion{" "}
            {sensors.display.motion ? "● receiving" : "○ unavailable / waiting"}
          </span>
          <span>
            {sensors.display.acceleration === null
              ? "Acceleration —"
              : `${sensors.display.acceleration.toFixed(1)} m/s²`}
          </span>
          <span>
            {sensors.display.rotationRate === null
              ? "Rotation —"
              : `${sensors.display.rotationRate.toFixed(0)}°/s`}
          </span>
        </div>
        <p className="phone-small" role="status">
          {sensors.error ||
            notice ||
            "Hold in landscape, tap Enable motion, then Recenter. Drag works without sensors. Start / resume on the laptop."}
        </p>
        {stereo && (
          <p className="phone-small">
            Experimental stereo preview · headset optics are not calibrated. Use
            Single view while holding the phone.
          </p>
        )}
      </section>
    </main>
  );
}
// A legacy no-contact placeholder prepares no physics and is never shown as an exercise.
import type { Scenario } from "../simulation";
const emptyScenario = { version: 1, count: 0 } as Scenario;
