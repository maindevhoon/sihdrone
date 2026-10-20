import { useEffect, useRef, useState } from "react";
import { Euler, Quaternion } from "three";
import {
  Crosshair,
  Minus,
  Plus,
  RotateCcw,
  Smartphone,
  Compass,
  Home,
  Pause,
  Radio,
  Check,
  Tag,
  Bird,
  Plane,
  Layers,
  Activity,
  ChevronRight,
} from "lucide-react";
import { categories, formatTime, trackLabel } from "../simulation";
import { theatreById, isGeographic } from "../theatres";
import { PHONE_FRESH_MS } from "./reliability";
import { connectPhone } from "./connection";
import { usePhoneSensors } from "./usePhoneSensors";
import {
  controllerTarget,
  tagConfirmed,
  nextUntaggedTrack,
  type PendingTag,
} from "./controllerState";
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
  const [targetSource, setTargetSource] = useState<"reticle" | "track">(
    "reticle",
  );
  const [requestedTrack, setRequestedTrack] = useState<{
    epoch: number;
    id: number;
  } | null>(null);
  const [autoNext, setAutoNext] = useState(true);
  const [assessmentTrack, setAssessmentTrack] = useState<number | null>(null);
  const [pendingTag, setPendingTag] = useState<PendingTag | null>(null);
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
    snapshot.time >= snapshot.scenario.arrival &&
    snapshot.time < snapshot.scenario.duration;
  const selectionWaiting =
    !!requestedTrack &&
    requestedTrack.epoch === snapshot?.epoch &&
    requestedTrack.id !== snapshot.selectedTrack;
  const candidate = selectionWaiting
    ? requestedTrack.id
    : controllerTarget(snapshot, targetSource);
  const candidateDecision = snapshot?.decisions?.find(
    (track) => track.id === candidate,
  );
  const assessmentId = assessmentTrack ?? candidate;
  const assessmentDecision = snapshot?.decisions?.find(
    (track) => track.id === assessmentId,
  );
  const contact = snapshot?.contacts?.find((track) => track.id === candidate);
  const tagged =
    snapshot?.decisions?.filter((track) => track.detection != null).length || 0;
  const identified =
    snapshot?.decisions?.filter(
      (track) => track.detection != null && track.answer,
    ).length || 0;
  const canTag = live && candidate !== null && !selectionWaiting && !pendingTag;
  const canClassify =
    live &&
    assessmentId !== null &&
    assessmentDecision?.detection != null &&
    !pendingTag;
  const phaseLabel =
    snapshot?.phase === "running"
      ? "LIVE"
      : snapshot?.phase === "paused"
        ? "ON HOLD"
        : snapshot?.phase === "replay"
          ? "REPLAY"
          : "PREVIEW";
  const bearing =
    snapshot?.bearing == null
      ? "—"
      : String(Math.round(snapshot.bearing) % 360).padStart(3, "0");
  const sendControl = (command: WithoutEpoch<PhoneControl>) => {
    const state = current.current;
    if (state && usable)
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
      setFresh(performance.now() - received.current < PHONE_FRESH_MS);
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
  async function enableGyro() {
    if (await sensors.enable()) {
      setMode("pan");
      if (mode !== "pan") sendControl({ control: "recenter" });
    }
  }
  function recenter() {
    sensors.recenter();
    manualPose.current = [0, 0, 0, 1];
    angles.current = { yaw: 0, pitch: 0 };
    sendControl({ control: "recenter" });
    setNotice("Reference reset. The laptop keeps its current map position.");
  }
  function chooseTrack(id: number) {
    if (!usable || !snapshot) return;
    setTargetSource("track");
    setRequestedTrack({ epoch: snapshot.epoch, id });
    if (snapshot.decisions?.find((track) => track.id === id)?.detection != null)
      setAssessmentTrack(id);
    sendControl({ control: "select-track", track: id });
  }
  function observe() {
    if (
      !canTag ||
      !snapshot ||
      candidate === null ||
      candidateDecision?.detection != null
    )
      return;
    const action = { epoch: snapshot.epoch, track: candidate };
    channel.current?.send({ type: "observe", ...action });
    setPendingTag(action);
    setTargetSource("track");
    setRequestedTrack({ epoch: snapshot.epoch, id: candidate });
    navigator.vibrate?.(25);
    setNotice(`Sending ${trackLabel(candidate)} tag to the laptop…`);
  }
  function classify(answer: (typeof categories)[number]) {
    if (
      !canClassify ||
      !snapshot ||
      assessmentId === null ||
      assessmentDecision?.detection == null
    )
      return;
    const action = { epoch: snapshot.epoch, track: assessmentId, answer };
    channel.current?.send({ type: "classify", ...action });
    setPendingTag(action);
    setNotice(`Sending ${trackLabel(assessmentId)} · ${answer}…`);
  }
  useEffect(() => {
    if (!pendingTag || !snapshot) return;
    if (tagConfirmed(pendingTag, snapshot)) {
      setNotice(
        `${trackLabel(pendingTag.track)} · ${pendingTag.answer || "Observation tagged"} · confirmed by laptop`,
      );
      if (pendingTag.answer === undefined) {
        setAssessmentTrack(pendingTag.track);
        const next =
          autoNext && snapshot.phase === "running" && snapshot.playing
            ? nextUntaggedTrack(snapshot, pendingTag.track)
            : null;
        if (next !== null) {
          chooseTrack(next);
          setNotice(
            `${trackLabel(pendingTag.track)} tagged · now cueing ${trackLabel(next)}. Identity controls below still apply to ${trackLabel(pendingTag.track)}.`,
          );
        } else if (
          autoNext &&
          nextUntaggedTrack(snapshot, pendingTag.track) === null
        ) {
          setNotice(
            `All ${snapshot.scenario.count} contacts tagged. You can still finish their identity labels.`,
          );
        }
      }
      setPendingTag(null);
      navigator.vibrate?.([15, 40, 15]);
    } else if (
      snapshot.epoch !== pendingTag.epoch ||
      !usable ||
      snapshot.phase !== "running"
    ) {
      setNotice("Tag not confirmed. Check the laptop before trying again.");
      setPendingTag(null);
    }
  }, [snapshot, pendingTag, usable, autoNext]);
  useEffect(() => {
    if (!pendingTag) return;
    const timeout = setTimeout(() => {
      setPendingTag(null);
      setNotice(
        "No confirmation yet. Check the laptop's track register before retrying.",
      );
    }, 3000);
    return () => clearTimeout(timeout);
  }, [pendingTag]);
  useEffect(() => {
    setRequestedTrack(null);
    setTargetSource("reticle");
    setAssessmentTrack(null);
    setNotice("");
  }, [snapshot?.epoch]);
  useEffect(() => {
    if (
      requestedTrack?.epoch === snapshot?.epoch &&
      requestedTrack?.id === snapshot?.selectedTrack
    )
      setRequestedTrack(null);
  }, [snapshot?.epoch, snapshot?.selectedTrack, requestedTrack]);
  const actions = useRef({ observe, classify });
  actions.current = { observe, classify };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        (event.target instanceof HTMLElement &&
          event.target.closest("input,select,textarea"))
      )
        return;
      if (event.key.toLowerCase() === "o" || event.key === "AudioVolumeUp") {
        event.preventDefault();
        actions.current.observe();
      }
      if (["1", "2", "3"].includes(event.key))
        actions.current.classify(categories[Number(event.key) - 1]);
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
        <div className="controller-brand">
          <span className="controller-logo">
            <Radio size={20} />
          </span>
          <div>
            <span className="phone-eyebrow">TRINETRA</span>
            <span className="controller-subbrand">REMOTE OBSERVER</span>
          </div>
        </div>
        <span className={`controller-link ${usable ? "online" : ""}`}>
          <i />
          {!connected
            ? "Connecting"
            : !host
              ? "Laptop offline"
              : snapshot?.prepared === false
                ? "Preparing"
                : !usable
                  ? "Syncing laptop"
                  : "Connected"}
          <small>{rtt === null ? "—" : `${rtt} ms`}</small>
        </span>
      </header>
      <section className="controller-mission" aria-label="Exercise status">
        <div className="mission-title">
          <span className={`controller-phase ${live ? "live" : ""}`}>
            {phaseLabel}
          </span>
          <h1>{theatre.name}</h1>
          <span className="mission-seed">
            {snapshot ? `SEED ${snapshot.scenario.seed}` : "AWAITING SESSION"}
          </span>
        </div>
        <div className="controller-metrics">
          <div>
            <span>EXERCISE</span>
            <strong>
              {snapshot ? formatTime(snapshot.time) : "00:00"}
              <small>
                {" "}
                / {snapshot ? formatTime(snapshot.scenario.duration) : "—"}
              </small>
            </strong>
          </div>
          <div>
            <span>TAGGED</span>
            <strong>
              {tagged}
              <small> / {snapshot?.scenario.count ?? "—"}</small>
            </strong>
          </div>
          <div>
            <span>IDENTIFIED</span>
            <strong>
              {identified}
              <small> tracks</small>
            </strong>
          </div>
        </div>
        <div
          className="mission-progress"
          role="progressbar"
          aria-label="Exercise elapsed"
          aria-valuemin={0}
          aria-valuemax={snapshot?.scenario.duration || 1}
          aria-valuenow={snapshot?.time || 0}
        >
          <i
            style={{
              width: `${snapshot ? Math.min(100, (snapshot.time / snapshot.scenario.duration) * 100) : 0}%`,
            }}
          />
        </div>
      </section>
      <div className="controller-workspace">
        <section className="controller-contact" aria-label="Contact tagging">
          <div className="controller-section-title">
            <span className="phone-eyebrow">01 / CONTACT & TAG</span>
            <span className="synthetic-label">SYNTHETIC</span>
          </div>
          <div
            className="controller-target-tabs"
            aria-label="Tag target source"
          >
            <button
              aria-pressed={targetSource === "reticle"}
              onClick={() => {
                setTargetSource("reticle");
                setRequestedTrack(null);
              }}
            >
              <Crosshair size={14} />
              Reticle
            </button>
            <button
              aria-pressed={targetSource === "track"}
              onClick={() => setTargetSource("track")}
            >
              <Radio size={14} />
              Selected track
            </button>
          </div>
          <header className="controller-target-heading">
            <div>
              <span className="phone-eyebrow">
                {targetSource === "reticle" && snapshot?.aimedTrack != null
                  ? "UNDER LAPTOP RETICLE"
                  : "RADAR-CUED CONTACT"}
              </span>
              <h2>
                {candidate === null ? "—" : trackLabel(candidate)}
                <span
                  className={
                    candidateDecision?.detection != null
                      ? "tag-state tagged"
                      : "tag-state"
                  }
                >
                  {candidateDecision?.detection != null ? (
                    <>
                      <Check size={12} />
                      Tagged
                    </>
                  ) : (
                    "Untagged"
                  )}
                </span>
              </h2>
            </div>
            <span className="target-symbol" aria-hidden="true">
              <Crosshair size={32} />
            </span>
          </header>
          <dl className="controller-readouts">
            <div>
              <dt>RANGE</dt>
              <dd>
                {contact ? Math.round(contact.range).toLocaleString() : "—"}
                <small>m</small>
              </dd>
            </div>
            <div>
              <dt>BEARING</dt>
              <dd>
                {contact
                  ? String(Math.round(contact.bearing) % 360).padStart(3, "0")
                  : "—"}
                <small>°</small>
              </dd>
            </div>
            <div>
              <dt>REL ALT</dt>
              <dd>
                {contact ? Math.round(contact.altitude) : "—"}
                <small>m</small>
              </dd>
            </div>
            <div>
              <dt>GROUND SPEED</dt>
              <dd>
                {contact ? contact.speed.toFixed(1) : "—"}
                <small>m/s</small>
              </dd>
            </div>
          </dl>
          <div className="controller-tag-label">
            <span>
              IDENTITY ·{" "}
              {assessmentId === null ? "—" : trackLabel(assessmentId)}
            </span>
            <span>{assessmentDecision?.answer || "Unclassified"}</span>
          </div>
          <div className="controller-category-tags">
            {categories.map((answer, index) => {
              const Icon = [Plane, Layers, Bird][index];
              return (
                <button
                  key={answer}
                  disabled={!canClassify}
                  aria-pressed={assessmentDecision?.answer === answer}
                  onClick={() => classify(answer)}
                >
                  <Icon size={18} />
                  <span>{answer}</span>
                  {assessmentDecision?.answer === answer && <Check size={12} />}
                </button>
              );
            })}
          </div>
          <p className="controller-target-help">
            {selectionWaiting
              ? "Selecting this track on the laptop…"
              : !usable
                ? "Waiting for a fresh laptop connection."
                : snapshot?.prepared === false
                  ? "Preparing the laptop's flight traces."
                  : snapshot?.phase === "paused"
                    ? snapshot.holdReason ||
                      "Exercise held. Resume on the laptop to tag."
                    : snapshot?.phase === "replay"
                      ? "Replay is read-only. Tags cannot change results."
                      : snapshot?.phase === "preview"
                        ? "Explore freely. Start the exercise on the laptop to tag."
                        : !live
                          ? `Contacts arrive at ${formatTime(snapshot?.scenario.arrival || 0)}.`
                          : assessmentId !== candidate &&
                              assessmentDecision?.detection != null
                            ? `Tag ${candidate === null ? "the next contact" : trackLabel(candidate)} next. Identity labels above apply to ${trackLabel(assessmentId!)}.`
                            : candidateDecision?.detection != null
                              ? `Tagged at ${formatTime(candidateDecision.detection)}. Choose an identity above.`
                              : "Tag the contact, then choose its identity."}
          </p>
          <div className="controller-tracks-title">
            <span>TRACK REGISTER</span>
            <button
              className="controller-auto-next"
              aria-pressed={autoNext}
              onClick={() => setAutoNext((value) => !value)}
            >
              Auto next {autoNext ? "on" : "off"}
            </button>
            <span>{snapshot?.contacts?.length ?? 0} returns</span>
          </div>
          <div
            className="controller-track-list"
            role="group"
            aria-label="Choose a contact"
          >
            {Array.from({ length: snapshot?.scenario.count || 0 }, (_, id) => {
              const decision = snapshot?.decisions?.find(
                (track) => track.id === id,
              );
              return (
                <button
                  key={id}
                  disabled={!usable || !!pendingTag}
                  aria-label={`Select ${trackLabel(id)}, ${decision?.answer || (decision?.detection != null ? "tagged" : "untagged")}`}
                  aria-pressed={candidate === id}
                  className={decision?.detection != null ? "is-tagged" : ""}
                  onClick={() => chooseTrack(id)}
                >
                  {decision?.detection != null ? <Check size={11} /> : <i />}
                  {trackLabel(id)}
                </button>
              );
            })}
          </div>
        </section>
        <section
          className="controller-pad-section"
          aria-label="Camera controls"
        >
          <div className="controller-section-title">
            <span className="phone-eyebrow">02 / CAMERA CONTROL</span>
            <span className="camera-heading">HDG {bearing}°</span>
          </div>
          <div className="controller-motion">
            <Smartphone size={19} />
            <div>
              <strong>
                {sensors.health === "active"
                  ? "Gyro active"
                  : sensors.enabled
                    ? "Gyro recovering"
                    : "Touch control"}
              </strong>
              <span>
                {sensors.enabled
                  ? "Turn & tilt to aim the laptop"
                  : "Enable your phone's motion sensors"}
              </span>
            </div>
            <button onClick={() => void enableGyro()}>
              {sensors.enabled ? "Retry gyro" : "Enable gyro"}
            </button>
          </div>
          <div className="controller-pad-heading">
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
                Drag to look
              </button>
              <button
                aria-pressed={mode === "pan"}
                disabled={!map && !sensors.enabled}
                onClick={() => {
                  setMode("pan");
                  sendControl({ control: "recenter" });
                }}
              >
                Swipe to pan
              </button>
            </div>
            <button
              className="controller-recenter"
              onClick={recenter}
              aria-label="Recenter phone"
            >
              <RotateCcw size={15} />
            </button>
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
                    new Euler(
                      angles.current.pitch,
                      angles.current.yaw,
                      0,
                      "YXZ",
                    ),
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
            <div className="pad-reticle" aria-hidden="true">
              <i />
              <i />
              <Compass size={24} />
            </div>
            <span>
              {bearing}
              <em>°</em>
            </span>
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
              <Plus size={17} />
              Zoom in
            </button>
            <button
              disabled={!usable || !map}
              aria-label="Zoom out map"
              onClick={() => sendControl({ control: "zoom", amount: 0.18 })}
            >
              <Minus size={17} />
              Zoom out
            </button>
            <button
              disabled={!usable || !map}
              onClick={() => sendControl({ control: "north" })}
            >
              <Compass size={15} />
              North
            </button>
            <button
              disabled={!usable || !map}
              onClick={() => sendControl({ control: "home" })}
            >
              <Home size={15} />
              Site
            </button>
          </div>
          <details className="controller-diagnostics">
            <summary>
              <Activity size={13} />
              Sensors & gestures
              <ChevronRight size={13} />
            </summary>
            <p>
              Turn / tilt: look with gyro. Drag: look with touch. Swipe in pan
              mode: move across terrain. Pinch: zoom. Recenter: reset your phone
              reference.
            </p>
            <dl>
              <div>
                <dt>Orientation</dt>
                <dd>{sensors.display.orientation ? "Receiving" : "Waiting"}</dd>
              </div>
              <div>
                <dt>Motion</dt>
                <dd>{sensors.display.motion ? "Receiving" : "Waiting"}</dd>
              </div>
              <div>
                <dt>Rotation rate</dt>
                <dd>{sensors.display.rotationRate?.toFixed(0) ?? "—"} °/s</dd>
              </div>
              <div>
                <dt>Acceleration</dt>
                <dd>{sensors.display.acceleration?.toFixed(1) ?? "—"} m/s²</dd>
              </div>
            </dl>
            <p>
              Acceleration is diagnostic only. Volume-up tags only when Chrome
              delivers the key; touch controls are reliable.
            </p>
          </details>
        </section>
      </div>
      <div className="controller-feedback" role="status" aria-live="polite">
        <span className={pendingTag ? "receipt-pending" : ""}>
          {(snapshot?.phase === "paused" && snapshot.holdReason) ||
            sensors.error ||
            notice ||
            "Laptop is the display. Your phone controls the view and tags contacts."}
        </span>
      </div>
      <footer className="controller-dock">
        <button
          className="controller-tag-button"
          disabled={!canTag || candidateDecision?.detection != null}
          onClick={observe}
        >
          {candidateDecision?.detection != null && !pendingTag ? (
            <Check size={20} />
          ) : (
            <Tag size={20} />
          )}
          <span>
            {pendingTag
              ? `Sending ${trackLabel(pendingTag.track)}…`
              : candidateDecision?.detection != null
                ? `${candidate === null ? "Contact" : trackLabel(candidate)} tagged`
                : `Tag ${candidate === null ? "contact" : trackLabel(candidate)}`}
            <small>
              {candidateDecision?.detection != null
                ? "Observation recorded by laptop"
                : "Record an observation"}
            </small>
          </span>
        </button>
        <button
          className="controller-hold-button"
          disabled={!usable || snapshot?.phase !== "running"}
          onClick={() => sendControl({ control: "hold" })}
        >
          <Pause size={17} />
          <span>Hold</span>
        </button>
      </footer>
      <p className="controller-provenance">
        Synthetic training returns · altitude relative to observer · results
        saved on laptop
      </p>
    </main>
  );
}
