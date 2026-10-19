import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import { smoothing, pickGaze } from "./orientation";
import type { Pose } from "./protocol";
import { visibleContacts, type Scenario } from "../simulation";

export default function PhoneCamera({
  pose,
  onBearing,
  scenario,
  time,
  onGaze,
}: {
  pose: MutableRefObject<Pose>;
  onBearing?: (bearing: number) => void;
  scenario?: Scenario;
  time?: MutableRefObject<number>;
  onGaze?: (id: number | null) => void;
}) {
  const { camera } = useThree();
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const fov = camera.fov;
    camera.fov = 65;
    camera.updateProjectionMatrix();
    return () => {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    };
  }, [camera]);
  const previous = useRef<number | null>(null),
    lastBearing = useRef(-1);
  const math = useMemo(
    () => ({
      base: new Quaternion(),
      target: new Quaternion(),
      direction: new Vector3(),
    }),
    [],
  );
  useFrame((_, delta) => {
    camera.position.set(0, 3, 12);
    math.target.copy(math.base).multiply(new Quaternion(...pose.current));
    camera.quaternion.slerp(math.target, smoothing(delta));
    camera.getWorldDirection(math.direction);
    const bearing =
      Math.round(
        ((Math.atan2(math.direction.x, -math.direction.z) * 180) / Math.PI +
          360) %
          360,
      ) % 360;
    if (bearing !== lastBearing.current) {
      lastBearing.current = bearing;
      onBearing?.(bearing);
    }
    if (scenario && time && onGaze) {
      const id = pickGaze(
        camera.position,
        math.direction,
        visibleContacts(scenario, time.current),
      );
      if (id !== previous.current) {
        previous.current = id;
        onGaze(id);
      }
    }
  });
  return null;
}
