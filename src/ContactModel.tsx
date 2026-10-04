import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { createBirdModel, createDroneModel, disposeModel, poseContact, type ContactPalette } from './contactGeometry';
import { contactKinematics } from './kinematics';
import type { Scenario } from './simulation';

type Props = {
  scenario: Scenario; time: MutableRefObject<number>; index: number; palette?: ContactPalette;
  /** Multiplies trajectory coordinates; models stay at real size. Earth geometry uses eight metres per unit. */
  metresPerUnit?: number; onSelect?: () => void; children?: ReactNode;
};

/** One airframe following the shared trajectory with trajectory-derived attitude. */
export default function ContactModel({ scenario, time, index, palette = 'visible', metresPerUnit = 1, onSelect, children }: Props) {
  const bird = scenario.category === 'Bird';
  // Livery is a deterministic function of the variation so repeats look identical.
  const livery = (scenario.seed + index) % 3 === 0 ? 'white' : 'graphite';
  const dusk = scenario.dusk;
  const model = useMemo(() => bird ? createBirdModel({ palette }) : createDroneModel({ palette, livery, dusk }), [bird, palette, livery, dusk]);
  useEffect(() => () => disposeModel(model), [model]);
  const ref = useRef<Group>(null);
  useFrame(() => {
    const target = ref.current; if (!target) return;
    const t = time.current;
    target.visible = t >= scenario.arrival;
    const k = contactKinematics(scenario, t, index);
    poseContact(target, model, bird, k, t, index);
    if (metresPerUnit !== 1) target.position.multiplyScalar(metresPerUnit);
  });
  return <group ref={ref}>
    <primitive object={model} />
    {onSelect && <mesh onClick={event => { event.stopPropagation(); onSelect(); }} onPointerOver={() => { document.body.style.cursor = 'crosshair'; }} onPointerOut={() => { document.body.style.cursor = 'auto'; }}>
      {/* Generous invisible pick volume: a real-size airframe is only a few pixels wide at range. */}
      <sphereGeometry args={[1.6, 12, 8]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>}
    {children}
  </group>;
}
