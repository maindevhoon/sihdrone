import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, type MutableRefObject } from "react";
import type { Scenario } from "./simulation";
import { sampleFlight } from "./flightRuntime";
import { add, rotate, scale } from "./flightMath";
import { Vector3 } from "three";
export default function FlightCamera({
  scenario,
  time,
  mode,
  onFree,
  onBearing,
}: {
  scenario: Scenario;
  time: MutableRefObject<number>;
  mode: "chase" | "fpv";
  onFree?: () => void;
  onBearing: (bearing: number) => void;
}) {
  const { camera, gl } = useThree();
  useEffect(() => {
    const free = () => onFree?.();
    gl.domElement.addEventListener("pointerdown", free);
    gl.domElement.addEventListener("wheel", free);
    return () => {
      gl.domElement.removeEventListener("pointerdown", free);
      gl.domElement.removeEventListener("wheel", free);
    };
  }, [gl, onFree]);
  useFrame((_, dt) => {
    const s = sampleFlight(scenario, time.current, 0),
      forward = rotate(s.orientation, [0, 0, 1]),
      up = rotate(s.orientation, [0, 1, 0]);
    const eye = add(
      s.position,
      add(
        scale(forward, mode === "fpv" ? 0.7 : -10),
        scale(up, mode === "fpv" ? 0.35 : 4),
      ),
    );
    camera.position.lerp(
      new Vector3(...eye),
      mode === "fpv" ? 1 : 1 - Math.exp(-dt * 8),
    );
    camera.up.set(
      ...(mode === "fpv" ? up : ([0, 1, 0] as [number, number, number])),
    );
    camera.lookAt(
      new Vector3(...add(s.position, scale(forward, mode === "fpv" ? 100 : 2))),
    );
    camera.near = 0.05;
    camera.updateProjectionMatrix();
    onBearing(
      Math.round(
        ((Math.atan2(forward[0], -forward[2]) * 180) / Math.PI + 360) % 360,
      ),
    );
  });
  return null;
}
