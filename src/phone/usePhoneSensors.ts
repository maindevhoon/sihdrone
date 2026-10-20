import { useCallback, useEffect, useRef, useState } from "react";
import { Quaternion } from "three";
import {
  eventQuaternion,
  sensorQuaternion,
  SensorStream,
  type SensorSource,
} from "./sensorStream";
import type { PhoneTelemetry, Pose } from "./protocol";

type PermissionAPI = { requestPermission?: () => Promise<string> };
type RelativeSensor = EventTarget & {
  quaternion: number[] | null;
  start(): void;
  stop(): void;
};
type SensorConstructor = new (options: {
  frequency: number;
  referenceFrame: "device";
}) => RelativeSensor;
export function usePhoneSensors() {
  const pose = useRef<Pose>([0, 0, 0, 1]);
  const stream = useRef(new SensorStream());
  const telemetry = useRef<PhoneTelemetry>({
    orientation: false,
    motion: false,
    acceleration: null,
    rotationRate: null,
    screen: 0,
  });
  const [enabled, setEnabled] = useState(false),
    [attempt, setAttempt] = useState(0),
    [error, setError] = useState("");
  const [health, setHealth] = useState<
    "off" | "starting" | "active" | "recovering"
  >("off");
  const [source, setSource] = useState<SensorSource | null>(null);
  const [display, setDisplay] = useState(telemetry.current);
  const recenter = useCallback(() => {
    pose.current = stream.current.recenter();
  }, []);
  async function enable() {
    setError("");
    if (!window.isSecureContext) {
      setError("Gyro control needs HTTPS or USB-forwarded localhost.");
      return false;
    }
    if (
      !("DeviceOrientationEvent" in window) &&
      !("RelativeOrientationSensor" in window)
    ) {
      setError(
        "This browser has no orientation API. Drag to look is available.",
      );
      return false;
    }
    try {
      const orientation = (
        window as unknown as { DeviceOrientationEvent?: PermissionAPI }
      ).DeviceOrientationEvent;
      const motion = (
        window as unknown as { DeviceMotionEvent?: PermissionAPI }
      ).DeviceMotionEvent;
      const [o] = await Promise.all([
        orientation?.requestPermission?.() || "granted",
        Promise.resolve()
          .then(() => motion?.requestPermission?.() || "granted")
          .catch(() => "denied"),
      ]);
      if (o !== "granted")
        throw new Error(
          "Motion permission was denied. Allow sensors in Chrome site settings, or use Drag to look.",
        );
      stream.current.rebase();
      setHealth("starting");
      setEnabled(true);
      setAttempt((value) => value + 1);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not start the gyro.",
      );
      return false;
    }
  }
  useEffect(() => {
    if (!enabled) return;
    let sensor: RelativeSensor | undefined,
      stopped = false,
      recovering = false,
      lastRestart = performance.now(),
      lastAlpha = 0;
    let relativeSeen = -Infinity,
      eventSeen = -Infinity;
    const angle = () =>
      screen.orientation?.angle ??
      (window as unknown as { orientation?: number }).orientation ??
      0;
    const receive = (q: Quaternion | null, origin: SensorSource) => {
      if (!q || document.hidden || stopped) return;
      const now = performance.now();
      if (origin !== "relative" && now - relativeSeen < 800) return;
      if (origin === "absolute" && now - eventSeen < 800) return;
      const result = stream.current.update(q, origin, angle(), now);
      if (!result) return;
      if (origin === "relative") relativeSeen = now;
      if (origin === "orientation") eventSeen = now;
      pose.current = result;
      telemetry.current = {
        ...telemetry.current,
        orientation: true,
        screen: angle(),
      };
      setHealth("active");
      setSource(origin);
      setError("");
      recovering = false;
    };
    const receiveEvent = (
      reading: DeviceOrientationEvent,
      origin: SensorSource,
    ) => {
      if (reading.alpha !== null && Number.isFinite(reading.alpha))
        lastAlpha = reading.alpha;
      receive(
        eventQuaternion(
          reading.alpha,
          reading.beta,
          reading.gamma,
          angle(),
          lastAlpha,
        ),
        origin,
      );
    };
    const orientation = (event: DeviceOrientationEvent) =>
      receiveEvent(event, "orientation");
    const absolute = (event: DeviceOrientationEvent) =>
      receiveEvent(event, "absolute");
    const startRelative = () => {
      sensor?.stop();
      sensor = undefined;
      const Constructor = (
        window as unknown as { RelativeOrientationSensor?: SensorConstructor }
      ).RelativeOrientationSensor;
      if (!Constructor || document.hidden) return;
      try {
        const next = new Constructor({
          frequency: 60,
          referenceFrame: "device",
        });
        sensor = next;
        next.addEventListener("reading", () => {
          if (sensor === next && next.quaternion?.length === 4)
            receive(sensorQuaternion(next.quaternion, angle()), "relative");
        });
        next.addEventListener("error", () => {
          if (sensor !== next) return;
          next.stop();
          sensor = undefined;
          relativeSeen = -Infinity;
          stream.current.rebase();
        });
        next.start();
      } catch {
        sensor?.stop();
        sensor = undefined;
      }
    };
    const magnitude = (values: (number | null | undefined)[]) =>
      values.every((n) => typeof n === "number" && Number.isFinite(n))
        ? Math.hypot(...(values as number[]))
        : null;
    const motion = (event: DeviceMotionEvent) => {
      telemetry.current = {
        ...telemetry.current,
        motion: !!event.acceleration || !!event.rotationRate,
        acceleration: magnitude([
          event.acceleration?.x,
          event.acceleration?.y,
          event.acceleration?.z,
        ]),
        rotationRate: magnitude([
          event.rotationRate?.alpha,
          event.rotationRate?.beta,
          event.rotationRate?.gamma,
        ]),
      };
    };
    const bindEvents = () => {
      window.removeEventListener("deviceorientation", orientation);
      window.removeEventListener("deviceorientationabsolute", absolute);
      window.addEventListener("deviceorientation", orientation);
      window.addEventListener("deviceorientationabsolute", absolute);
    };
    const restart = () => {
      if (document.hidden || stopped) return;
      stream.current.rebase();
      bindEvents();
      startRelative();
      lastRestart = performance.now();
    };
    const visibility = () => {
      if (document.hidden) {
        sensor?.stop();
        telemetry.current.orientation = false;
      } else restart();
    };
    const rotate = () => {
      stream.current.rebase();
      telemetry.current.screen = angle();
    };
    bindEvents();
    window.addEventListener("devicemotion", motion);
    document.addEventListener("visibilitychange", visibility);
    screen.orientation?.addEventListener("change", rotate);
    startRelative();
    const poll = setInterval(() => {
      const now = performance.now(),
        age = stream.current.age(now);
      telemetry.current.orientation = !document.hidden && age < 1500;
      setDisplay({ ...telemetry.current });
      if (!document.hidden && age > 1500) {
        setHealth("recovering");
        if (!recovering) {
          recovering = true;
          stream.current.rebase();
        }
        if (now - lastRestart > 3000) restart();
        if (now - lastRestart > 1500)
          setError(
            "Gyro readings interrupted. Recovering automatically; Drag to look remains available. The camera holds its last direction.",
          );
      }
    }, 250);
    return () => {
      stopped = true;
      clearInterval(poll);
      sensor?.stop();
      window.removeEventListener("deviceorientation", orientation);
      window.removeEventListener("deviceorientationabsolute", absolute);
      window.removeEventListener("devicemotion", motion);
      document.removeEventListener("visibilitychange", visibility);
      screen.orientation?.removeEventListener("change", rotate);
    };
  }, [enabled, attempt]);
  return {
    pose,
    telemetry,
    display,
    enabled,
    health,
    source,
    error,
    enable,
    recenter,
  };
}
