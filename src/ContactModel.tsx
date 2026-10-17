import { flightForContact } from './contactFlight';
import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { createBirdModel, createDroneModel, createFlightModel, disposeModel, poseContact, type ContactPalette } from './contactGeometry';
import { lightingOf } from './environment';
import { contactKinematics } from './kinematics';
import { airframeFor } from './airframes';
import { contactCategory, type Scenario } from './simulation';

type Props = {
  scenario: Scenario; time: MutableRefObject<number>; index: number; palette?: ContactPalette;
  /** Multiplies trajectory coordinates; models stay at real size. Earth geometry uses eight metres per unit. */
  metresPerUnit?: number; onSelect?: (id: number) => void; children?: ReactNode;
};

/** One airframe following the shared trajectory with trajectory-derived attitude. */
export default function ContactModel({ scenario, time, index, palette = 'visible', metresPerUnit = 1, onSelect, children }: Props) {
  const bird = contactCategory(scenario, index) === 'Bird';
  // The airframe type is a deterministic function of the variation, so repeats look identical.
  const airframe = airframeFor(scenario, index);
  const dusk = scenario.dusk;
  const modelId=flightForContact(scenario,index)?.model,lowLight=lightingOf(scenario)!=='day';
  const model = useMemo(() => modelId?createFlightModel(modelId,palette,lowLight):bird || !airframe ? createBirdModel({ palette }) : createDroneModel({ palette, airframe, dusk }), [bird, palette, airframe, dusk,modelId,lowLight]);
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
  // Marked so scene-wide material swaps (thermal view) leave the airframe's own palette alone.
  return <group ref={ref} userData={{ contact: true }}>
    <primitive object={model} />
    {onSelect && <mesh onClick={event => { event.stopPropagation(); onSelect(index); }} onPointerOver={() => { document.body.style.cursor = 'crosshair'; }} onPointerOut={() => { document.body.style.cursor = 'auto'; }}>
      {/* Generous invisible pick volume: a real-size airframe is only a few pixels wide at range. */}
      <sphereGeometry args={[1.6, 12, 8]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>}
    {children}
  </group>;
}
