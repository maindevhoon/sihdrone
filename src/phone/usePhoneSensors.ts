import { useCallback, useEffect, useRef, useState } from "react";
import { Quaternion } from "three";
import { deviceQuaternion, relativePose } from "./orientation";
import type { PhoneTelemetry, Pose } from "./protocol";

type PermissionAPI = { requestPermission?: () => Promise<string> };
export function usePhoneSensors() {
  const pose = useRef<Pose>([0, 0, 0, 1]);
  const raw = useRef<Quaternion | null>(null),
    reference = useRef<Quaternion | null>(null);
  const telemetry = useRef<PhoneTelemetry>({
    orientation: false,
    motion: false,
    acceleration: null,
    rotationRate: null,
    screen: 0,
  });
  const [enabled, setEnabled] = useState(false),
    [error, setError] = useState("");
  const [display, setDisplay] = useState(telemetry.current);
  const recenter = useCallback(() => {
    reference.current = raw.current?.clone() || null;
    pose.current = [0, 0, 0, 1];
  }, []);
  async function enable() {
    setError("");
    if (!window.isSecureContext) {
      setError(
        "Motion needs HTTPS or localhost over USB. Open the QR invitation from the laptop demo server.",
      );
      return;
    }
    if (!("DeviceOrientationEvent" in window)) {
      setError(
        "Orientation is unavailable in this browser. Drag the view instead.",
      );
      return;
    }
    try {
      // Both requests originate in the same user gesture; some browsers gate them separately.
      const orientation = DeviceOrientationEvent as unknown as PermissionAPI;
      const motion =
        typeof DeviceMotionEvent !== "undefined"
          ? (DeviceMotionEvent as unknown as PermissionAPI)
          : {};
      const [o, m] = await Promise.all([
        orientation.requestPermission?.() || "granted",
        motion.requestPermission?.() || "granted",
      ]);
      if (o !== "granted")
        throw new Error(
          "Motion permission was denied. Allow motion in site settings or drag the view.",
        );
      if (m !== "granted")
        setError(
          "Head tracking enabled; acceleration permission is unavailable.",
        );
      recenter();
      setEnabled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable motion.");
    }
  }
  useEffect(() => {
    if (!enabled) return;
    let seen = false;
    const angle = () => screen.orientation?.angle || 0;
    const orientation = (event: DeviceOrientationEvent) => {
      if (event.alpha === null || event.beta === null || event.gamma === null)
        return;
      if (![event.alpha, event.beta, event.gamma].every(Number.isFinite))
        return;
      const q = deviceQuaternion(event.alpha, event.beta, event.gamma, angle());
      raw.current = q;
      reference.current ||= q.clone();
      pose.current = relativePose(reference.current, q);
      telemetry.current = {
        ...telemetry.current,
        orientation: true,
        screen: angle(),
      };
      seen = true;
    };
    const magnitude = (values: (number | null | undefined)[]) =>
      values.every((n) => typeof n === "number" && Number.isFinite(n))
        ? Math.hypot(...(values as number[]))
        : null;
    const motion = (event: DeviceMotionEvent) => {
      const a = event.acceleration,
        r = event.rotationRate;
      telemetry.current = {
        ...telemetry.current,
        motion: !!a || !!r,
        acceleration: magnitude([a?.x, a?.y, a?.z]),
        rotationRate: magnitude([r?.alpha, r?.beta, r?.gamma]),
      };
    };
    const rotate = () => {
      reference.current = null;
      raw.current = null;
      pose.current = [0, 0, 0, 1];
    };
    window.addEventListener("deviceorientation", orientation);
    window.addEventListener("devicemotion", motion);
    screen.orientation?.addEventListener("change", rotate);
    const poll = setInterval(() => setDisplay({ ...telemetry.current }), 250);
    const timeout = setTimeout(() => {
      if (!seen)
        setError(
          "No orientation readings yet. Allow motion in Chrome site settings, then retry. Dragging still works.",
        );
    }, 5000);
    return () => {
      clearInterval(poll);
      clearTimeout(timeout);
      window.removeEventListener("deviceorientation", orientation);
      window.removeEventListener("devicemotion", motion);
      screen.orientation?.removeEventListener("change", rotate);
    };
  }, [enabled]);
  return { pose, telemetry, display, enabled, error, enable, recenter };
}
