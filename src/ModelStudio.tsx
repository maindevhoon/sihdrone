import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { Color, DoubleSide, Mesh, MeshBasicMaterial, PMREMGenerator, Vector3, type Material } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { createFlightModel, disposeModel, poseFlightRig } from './contactGeometry';
import { FLIGHT_PROFILES } from './flightProfiles';
import type { FlightModelId, FlightState } from './flightTypes';
import { comparisonLayout, recognitionEntry } from './recognition';

export type StudioBand = 'colour' | 'silhouette' | 'ir';
export type StudioView = 'perspective' | 'front' | 'side' | 'top';
type Props = {ids: FlightModelId[]; playing: boolean; band: StudioBand; view: StudioView; reset: number; labels: boolean; onTime: (time: number) => void};

/** A self-contained inspection clock; it never reads or writes an exercise or saved session. */
function Specimen({id, band, clock, playing}: {id: FlightModelId; band: StudioBand; clock: {current: number}; playing: boolean}) {
  const {model, originals} = useMemo(() => {
    const model = createFlightModel(id, band === 'colour' ? 'visible' : 'thermal', false, false);
    const originals = new Set<Material>();
    if (band === 'silhouette') {
      const ink = new MeshBasicMaterial({color: 0x11151a,side:DoubleSide});
      model.traverse(object => {
        if (!(object instanceof Mesh)) return;
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => originals.add(m));
        object.material = ink;
      });
    }
    return {model, originals};
  }, [id, band]);
  useEffect(() => () => {disposeModel(model); originals.forEach(m => m.dispose());}, [model, originals]);
  const profile = FLIGHT_PROFILES[id];
  const state = useMemo<FlightState>(() => ({
    position: [0, 0, 0], velocity: [0, 0, 0], orientation: [0, 0, 0, 1], angularVelocity: [0, 0, 0],
    rotorRPM: profile.motors.map(() => 2200), rotorAngles: profile.motors.map(() => 0),
    wing: {shoulder: 0, elbow: 0, wrist: 0, tail: 0, flapping: false}, surfaces: [0, 0, 0], airspeed: 0, stalled: false, collided: false,
  }), [profile]);
  useFrame(() => {
    const t = clock.current;
    const flapping = t % profile.flapPeriod < profile.flapPeriod * profile.flapDuty;
    const cycle = Math.sin(t * Math.PI * 2 * profile.flapHz);
    state.wing.shoulder = flapping ? cycle * .36 : .035;
    state.wing.elbow = flapping ? Math.max(0, -cycle) * .18 : .025;
    state.wing.wrist = flapping ? cycle * .12 : -.025;
    state.wing.tail = Math.sin(t * .7) * .025;
    state.wing.flapping = flapping;
    state.rotorRPM.fill(playing ? 2200 : 0);
    state.rotorAngles.forEach((_, i) => {state.rotorAngles[i] = t * 110 + i * .8;});
    poseFlightRig(model, state, t, 0);
  });
  return <primitive object={model} />;
}

function Lighting({band}: {band: StudioBand}) {
  const {gl, scene} = useThree();
  useEffect(() => {
    const previous = scene.environment;
    const room = new RoomEnvironment();
    const generator = new PMREMGenerator(gl);
    const environment = generator.fromScene(room, .04);
    scene.environment = environment.texture;
    const previousIntensity=scene.environmentIntensity;scene.environmentIntensity=.5;
    room.dispose(); generator.dispose();
    return () => {scene.environment = previous;scene.environmentIntensity=previousIntensity; environment.dispose();};
  }, [gl, scene]);
  return <>
    <color attach="background" args={[band === 'silhouette' ? '#d5dce1' : band === 'ir' ? '#101317' : '#1c2228']} />
    <hemisphereLight args={['#e9f3ff', '#3e444c', .65]} />
    <directionalLight position={[4, 7, 5]} intensity={1.7} color="#fff2df" />
    <directionalLight position={[-4, 2, -5]} intensity={.8} color="#b4d1f3" />
  </>;
}

function InspectionScene({ids, playing, band, view, reset, labels, onTime}: Props) {
  const clock = useRef(0), notified = useRef(-1);
  const controls = useRef<OrbitControlsImpl>(null);
  const {camera, size} = useThree();
  const layout = useMemo(() => comparisonLayout(ids), [ids]);
  const span = Math.max(...ids.map(id => recognitionEntry(id).span));
  useFrame((_, delta) => {
    if (playing && !document.hidden) clock.current += Math.min(delta, .05);
    const seconds = Math.floor(clock.current * 5) / 5;
    if (seconds !== notified.current) {notified.current = seconds; onTime(seconds);}
  }, -1);
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const distance = Math.max(span * 1.2, layout.width * 1.7 / Math.max(.65, aspect));
    const direction = new Vector3(...(view === 'front' ? [0, .1, 1] : view === 'side' ? [1, .1, .01] : view === 'top' ? [0, 1, .001] : [1, .65, 1.4]) as [number, number, number]).normalize();
    camera.position.copy(direction.multiplyScalar(distance));
    camera.up.set(...(view === 'top' ? [0, 0, -1] : [0, 1, 0]) as [number, number, number]);
    camera.near = Math.max(.001, span * .002); camera.far = Math.max(50, distance * 10);
    camera.updateProjectionMatrix();
    controls.current?.target.set(0, 0, 0); controls.current?.update();
  }, [camera, layout.width, span, view, reset, size.width, size.height]);
  return <>
    <Lighting band={band} />
    {ids.map((id, i) => <group key={`${i}-${id}`} position={[layout.positions[i], 0, 0]}>
      <Specimen id={id} band={band} clock={clock} playing={playing} />
      {labels && ids.length === 1 && recognitionEntry(id).landmarks.map((landmark, j) => <Html key={landmark.label} position={landmark.position} center zIndexRange={[5, 1]}>
        <span className="model-callout"><b>{j + 1}</b>{landmark.label}</span>
      </Html>)}
      {ids.length > 1 && <Html position={[0, -span * .35, 0]} center zIndexRange={[4, 1]}><span className="specimen-label">{recognitionEntry(id).name}</span></Html>}
    </group>)}
    <gridHelper position={[0, -span * .48, 0]} args={[layout.width * 3, 30, new Color('#53606a'), new Color('#303b43')]} />
    <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={span * .25} maxDistance={layout.width * 7} enableDamping dampingFactor={.08} />
  </>;
}

export default function ModelStudio(props: Props) {
  return <Canvas dpr={[1, 1.5]} gl={{antialias: true, powerPreference: 'low-power'}} camera={{fov: 34, near: .005, far: 100}} aria-label="Interactive bird and aircraft models" fallback={<div className="studio-fallback">Enable WebGL to inspect the models. Recognition cues and reference figures remain available below.</div>}>
    <InspectionScene {...props} />
  </Canvas>;
}
