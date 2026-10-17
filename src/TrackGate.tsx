import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { contactPosition, trackLabel, type Scenario } from './simulation';

/** A projected DOM annotation with explicit cleanup; no nested React root inside the renderer. */
export default function TrackGate({scenario, time, index}: {scenario: Scenario; time: MutableRefObject<number>; index: number}) {
  const {gl, camera, size} = useThree();
  const element = useRef<HTMLDivElement | null>(null);
  const projected = useMemo(() => new Vector3(), []);
  useEffect(() => {
    const gate = document.createElement('div');
    gate.className = 'track-gate';
    gate.setAttribute('aria-hidden', 'true');
    Object.assign(gate.style, {position: 'absolute', top: '0', left: '0', pointerEvents: 'none', zIndex: '2'});
    const label = document.createElement('span');
    label.textContent = trackLabel(index);
    gate.appendChild(label);
    gl.domElement.parentElement?.appendChild(gate);
    element.current = gate;
    return () => {element.current = null; gate.remove();};
  }, [gl, index]);
  useFrame(() => {
    const gate = element.current;
    if (!gate) return;
    projected.set(...contactPosition(scenario, time.current, index)).project(camera);
    gate.hidden = time.current < scenario.arrival || projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
    if (!gate.hidden) gate.style.transform = `translate(${(projected.x + 1) * size.width / 2}px, ${(1 - projected.y) * size.height / 2}px) translate(-50%, -50%)`;
  });
  return null;
}
