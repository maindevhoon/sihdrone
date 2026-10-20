import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Smartphone, X } from "lucide-react";
import { connectPhone } from "./connection";
import {
  acceptsAction,
  validAction,
  validControl,
  type PhoneControl,
  type PhoneControls,
  validPose,
  type PhoneAction,
  type PhoneSnapshot,
  type Pose,
  type WireMessage,
} from "./protocol";
import { phoneContacts } from "./hostTelemetry";
import type { Position, Scenario, TrackDecision } from "../simulation";

type Props = {
  scenario: Scenario;
  time: MutableRefObject<number>;
  phase: PhoneSnapshot["phase"];
  playing: boolean;
  decisions?: TrackDecision[];
  selectedTrack: number;
  theatre?: string;
  prepared?: boolean;
  aimedTrack?: number | null;
  bearing?: number;
  status?: string;
  observer?: Position;
  metresPerUnit?: number;
  onConnected?: () => void;
  onControl?: (control: PhoneControl) => void;
  onHold: () => void;
  onAction: (action: PhoneAction) => void;
};
type Room = { room: string; key: string };
export function usePhoneHost(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const [dialog, setDialog] = useState(false),
    [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState(""),
    [origin, setOrigin] = useState("");
  const [connected, setConnected] = useState(false),
    [tracking, setTracking] = useState(false);
  const [rtt, setRtt] = useState<number | null>(null);
  const pose = useRef<Pose>([0, 0, 0, 1]);
  const controls = useRef<PhoneControls>({ revision: 0, queue: [] });
  const busy = useRef(false),
    mounted = useRef(true);
  const end = () => {
    latest.current.onHold();
    setRoom(null);
    setConnected(false);
    setTracking(false);
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function open() {
    setDialog(true);
    if (room || busy.current) return;
    busy.current = true;
    setError("");
    try {
      const statusResponse = await fetch("/api/phone/status", {
        signal: AbortSignal.timeout(15000),
      });
      const status = await statusResponse.json();
      if (!statusResponse.ok || !status.available)
        throw new Error(
          status.error ||
            "Phone pairing is unavailable. Retry shortly or use npm run phone:wireless on the laptop.",
        );
      const response = await fetch("/api/phone/rooms", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not create a pairing room.");
      if (!mounted.current) {
        void fetch(`/api/phone/rooms/${result.room}`, {
          method: "DELETE",
          headers: { "X-Host-Key": result.key },
        });
        return;
      }
      setOrigin(status.publicOrigin || location.origin);
      setRoom(result);
    } catch (cause) {
      if (mounted.current) {
        const detail =
          cause instanceof Error ? cause.message : "Connection failed";
        setError(
          `${detail}. Retry online pairing, or run npm run phone:wireless on your laptop and open its local URL. USB is available with npm run phone:demo.`,
        );
      }
    } finally {
      busy.current = false;
    }
  }
  useEffect(() => {
    if (!room) return;
    let ready = false,
      peer = false,
      socketOpen = false,
      lastSeen = 0;
    let epoch = 0,
      previous: Scenario | undefined,
      previousTheatre: string | undefined,
      sent: Scenario | undefined;
    const snapshot = (): PhoneSnapshot => {
      const p = latest.current;
      if (previous !== p.scenario || previousTheatre !== p.theatre) {
        previousTheatre = p.theatre;
        sent = undefined;
        controls.current.revision++;
        controls.current.queue = [];
        previous = p.scenario;
        epoch++;
        ready = false;
        setTracking(false);
      }
      return {
        scenario: p.scenario,
        epoch,
        time: p.time.current,
        phase: p.phase,
        playing: p.playing,
        decisions: p.decisions,
        selectedTrack: p.selectedTrack,
        theatre: p.theatre,
        prepared: p.prepared,
        aimedTrack: p.aimedTrack,
        bearing: p.bearing,
        status: p.status,
        contacts: phoneContacts(
          p.scenario,
          p.time.current,
          p.prepared !== false,
          p.metresPerUnit,
          p.observer,
        ),
      };
    };
    const receive = (message: WireMessage) => {
      if (message.type === "peer") {
        peer = message.connected;
        lastSeen = performance.now();
        sent = undefined;
        setConnected(peer);
        ready = false;
        setTracking(false);
        if (!peer) latest.current.onHold();
        else {
          setDialog(false);
          latest.current.onConnected?.();
        }
      } else if (message.type === "pose" && validPose(message.pose)) {
        pose.current = message.pose;
        lastSeen = performance.now();
        if (ready) setTracking(true);
      } else if (
        message.type === "ready" &&
        message.epoch === snapshot().epoch
      ) {
        ready = true;
        lastSeen = performance.now();
      } else if (
        validControl(message) &&
        peer &&
        ready &&
        message.epoch === snapshot().epoch
      ) {
        if (message.control === "recenter") {
          pose.current = [0, 0, 0, 1];
          controls.current.revision++;
        } else if (message.control === "hold") latest.current.onHold();
        else if (
          message.control === "next-track" ||
          message.control === "select-track"
        )
          latest.current.onControl?.(message);
        else if (controls.current.queue.length < 32)
          controls.current.queue.push(message);
      } else if (message.type === "hold") {
        latest.current.onHold();
      } else if (message.type === "pong")
        setRtt(Math.round(performance.now() - message.at));
      else if (
        validAction(message) &&
        acceptsAction(message, snapshot(), ready) &&
        peer &&
        performance.now() - lastSeen < 1500
      )
        latest.current.onAction(message);
    };
    const connection = connectPhone(
      room.room,
      "host",
      room.key,
      receive,
      (open) => {
        socketOpen = open;
        if (!open) {
          setConnected(false);
          setTracking(false);
          ready = false;
          peer = false;
          latest.current.onHold();
        }
      },
    );
    const interval = setInterval(() => {
      if (!socketOpen || !peer) return;
      const state = snapshot();
      if (sent !== state.scenario) {
        connection.send({ type: "snapshot", state });
        sent = state.scenario;
      } else {
        const { scenario: _scenario, ...tick } = state;
        connection.send({ type: "tick", state: tick });
      }
      if (ready && performance.now() - lastSeen > 1500) {
        ready = false;
        setTracking(false);
        latest.current.onHold();
      }
    }, 100);
    return () => {
      clearInterval(interval);
      connection.close();
      setConnected(false);
      setTracking(false);
      void fetch(`/api/phone/rooms/${room.room}`, {
        method: "DELETE",
        headers: { "X-Host-Key": room.key },
        keepalive: true,
      }).catch(() => {});
    };
  }, [room]);
  return {
    dialog,
    close: () => setDialog(false),
    open,
    end,
    room,
    origin,
    setOrigin,
    error,
    connected,
    tracking,
    pose,
    controls,
    rtt,
  };
}
export function PhonePairDialog({
  phone,
}: {
  phone: ReturnType<typeof usePhoneHost>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [qr, setQr] = useState(""),
    [qrError, setQrError] = useState("");
  let url = "";
  try {
    const target = new URL("/phone", phone.origin);
    target.hash = new URLSearchParams({
      pair: phone.room?.room || "",
    }).toString();
    if (["https:", "http:"].includes(target.protocol)) url = target.toString();
  } catch {
    /* Show an actionable invalid-URL state. */
  }
  useEffect(() => {
    if (phone.dialog) dialog.current?.showModal();
    else dialog.current?.close();
  }, [phone.dialog]);
  useEffect(() => {
    let active = true;
    setQr("");
    setQrError("");
    if (url && phone.room)
      void import("qrcode")
        .then((module) =>
          module.toDataURL(url, {
            width: 256,
            margin: 2,
            errorCorrectionLevel: "M",
          }),
        )
        .then(
          (data) => {
            if (active) setQr(data);
          },
          () => {
            if (active)
              setQrError(
                "QR unavailable. Open the invitation link on your phone.",
              );
          },
        );
    return () => {
      active = false;
    };
  }, [url, phone.room]);
  const insecure =
    url &&
    !url.startsWith("https:") &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(url);
  return (
    <dialog
      ref={dialog}
      className="phone-pair"
      aria-labelledby="phone-pair-title"
      onCancel={phone.close}
      onClose={phone.close}
    >
      <header>
        <div>
          <span className="phone-eyebrow">CONNECTED OBSERVATION</span>
          <h2 id="phone-pair-title">
            <Smartphone size={22} />
            Phone controller
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close phone pairing"
          onClick={phone.close}
        >
          <X size={20} />
        </button>
      </header>
      <p>
        Scan on your OnePlus to control the laptop view. Turn the phone to look
        around; swipe to pan and pinch to zoom across valleys and mountains.
      </p>
      {phone.error ? (
        <div className="phone-warning" role="alert">
          {phone.error}
          <button onClick={phone.open}>Retry connection</button>
        </div>
      ) : phone.room ? (
        <>
          <div className="phone-pair-grid">
            <div className="phone-qr">
              {qr ? (
                <img
                  src={qr}
                  alt="Scan to connect this phone to the exercise"
                />
              ) : (
                <span>{qrError || "Preparing QR…"}</span>
              )}
            </div>
            <div>
              <span
                className={`phone-status ${phone.connected ? "online" : ""}`}
              >
                {phone.connected
                  ? phone.tracking
                    ? "Phone tracking active"
                    : "Phone connected · enable motion / recenter"
                  : "Waiting for phone"}
              </span>
              <ol>
                <li>Open the QR link in Chrome on your phone.</li>
                <li>
                  Tap <b>Enable gyro</b> and face the screen forward.
                </li>
                <li>
                  Recenter, look at a contact and tap <b>Tag contact</b>.
                </li>
              </ol>
              <p className="phone-small">
                The laptop controls the clock. Disconnecting or hiding the phone
                holds a live exercise.
              </p>
            </div>
          </div>
          <label className="phone-url">
            Invitation base URL
            <input
              type="url"
              value={phone.origin}
              onChange={(e) => phone.setOrigin(e.target.value)}
              spellCheck={false}
            />
          </label>
          {url && (
            <a
              className="phone-link"
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              Open phone invitation ↗
            </a>
          )}
          {insecure && (
            <p className="phone-warning">
              Motion sensors require HTTPS. Use the wireless tunnel URL, or
              localhost with USB forwarding.
            </p>
          )}
          {url.includes("localhost") && (
            <p className="phone-small">
              This localhost invitation works on Android after{" "}
              <code>
                adb reverse tcp:{location.port || 4173} tcp:
                {location.port || 4173}
              </code>
              . For wireless, run <code>npm run phone:wireless</code> and use
              its HTTPS URL.
            </p>
          )}
          <details>
            <summary>Wireless, USB and headset preview</summary>
            <p>
              Only scenario, clock and sensor messages cross the connection. The
              laptop renders the scene; the phone sends controls. USB uses the
              same protocol through Android USB debugging and ADB forwarding.
              Split-eye mode is an experimental preview; headset lens
              calibration is still required. Browser volume buttons are
              device-dependent; use the on-screen controls or a keyboard.
            </p>
          </details>
          <footer>
            <button
              onClick={() => {
                phone.end();
                phone.close();
              }}
            >
              End pairing
            </button>
            <button className="primary-button" onClick={phone.close}>
              Return to console
            </button>
          </footer>
        </>
      ) : (
        <p role="status">Starting secure pairing…</p>
      )}
    </dialog>
  );
}
