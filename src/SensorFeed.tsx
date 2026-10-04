import { useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { BackSide, Color, PerspectiveCamera, ShaderMaterial, SRGBColorSpace, Vector3, type Mesh } from 'three';
import ContactModel from './ContactModel';
import { contactKinematics } from './kinematics';
import { contactSpan } from './airframes';
import type { Scenario } from './simulation';

export type SensorMode = 'eo' | 'ir';
export type SensorTelemetry = { azimuth: number; elevation: number; range: number; fov: number; span: number };
type Props = {
  scenario: Scenario; time: MutableRefObject<number>; track: number; metresPerUnit: number;
  mode: SensorMode; zoom: number; onTelemetry: (telemetry: SensorTelemetry) => void;
};
// Sensor head on a 3 m mast at the radar observer position ([0, 0, 12] in training units).
const SENSOR_HEIGHT = 3;
type Sky = { zenith: number[]; horizon: number[]; ground: number[]; sun: number[] };
const skies: Record<'day' | 'dusk' | 'ir', Sky> = {
  day: { zenith: [.44, .59, .75], horizon: [.84, .85, .82], ground: [.44, .42, .37], sun: [1, .96, .86] },
  dusk: { zenith: [.2, .25, .4], horizon: [.92, .63, .43], ground: [.2, .18, .18], sun: [1, .74, .45] },
  ir: { zenith: [.07, .07, .07], horizon: [.2, .2, .2], ground: [.34, .34, .34], sun: [0, 0, 0] },
};
const sunDirection = (dusk: boolean) => new Vector3(...(dusk ? [-70, 3, -80] : [-60, 22, -90])).normalize();

/** Camera-centred gradient sky with horizon haze and a sun glow; colours are written as display values. */
function SkyDome({ sky, dusk }: { sky: Sky; dusk: boolean }) {
  const ref = useRef<Mesh>(null);
  const material = useMemo(() => new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false,
    uniforms: { zenith: { value: sky.zenith }, horizon: { value: sky.horizon }, ground: { value: sky.ground }, sunColor: { value: sky.sun }, sunDir: { value: sunDirection(dusk) } },
    vertexShader: 'varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform vec3 zenith,horizon,ground,sunColor,sunDir;varying vec3 vDir;
      void main(){float h=vDir.y;vec3 c=h>0.?mix(horizon,zenith,pow(min(h*1.35,1.),.6)):mix(horizon*.9,ground,min(-h*8.,1.));
      float s=max(dot(normalize(vDir),sunDir),0.);c+=sunColor*(pow(s,220.)*.85+pow(s,9.)*.14);gl_FragColor=vec4(c,1.);}`,
  }), [sky, dusk]);
  useFrame(({ camera }) => ref.current?.position.copy(camera.position));
  return <mesh ref={ref} material={material} renderOrder={-1} frustumCulled={false}><sphereGeometry args={[3000, 32, 16]} /></mesh>;
}

function Gimbal({ scenario, time, track, metresPerUnit, zoom, onTelemetry }: Omit<Props, 'mode'>) {
  const camera = useThree(state => state.camera) as PerspectiveCamera;
  const size = useThree(state => state.size);
  const scratch = useMemo(() => ({ target: new Vector3(), origin: new Vector3(0, SENSOR_HEIGHT, 12*metresPerUnit), right: new Vector3(), up: new Vector3(0, 1, 0), last: 0, key: '' }), [metresPerUnit]);
  useFrame(() => {
    const t = time.current, id = Math.min(track, scenario.count - 1);
    const [x, y, z] = contactKinematics(scenario, t, id).position;
    const { target, origin, right, up } = scratch;
    target.set(x*metresPerUnit, y*metresPerUnit, z*metresPerUnit);
    const offset = target.clone().sub(origin), range = offset.length();
    // Frame the airframe at about a third of the image width, widened by the operator's zoom setting.
    const span = contactSpan(scenario), fieldWidth = span*3*zoom;
    const aspect = size.width/Math.max(1, size.height);
    const vertical = 2*Math.atan(fieldWidth/aspect/2/range);
    camera.fov = Math.min(30, Math.max(.25, vertical*180/Math.PI));
    camera.aspect = aspect;
    camera.near = Math.max(.05, range*.02); camera.far = 6000;
    camera.updateProjectionMatrix();
    // Small deterministic tracking error, as a real gimbal hunts around a moving target.
    right.copy(offset).cross(up).normalize();
    const wander = fieldWidth*.025;
    target.addScaledVector(right, Math.sin(t*1.3 + id)*wander).addScaledVector(up, Math.sin(t*1.7 + 1)*wander*.8);
    camera.position.copy(origin);
    camera.lookAt(target);
    // Throttled while time runs; immediate when the track or zoom changes, including on a frozen clock.
    const key = `${id}/${zoom}/${size.width}x${size.height}`;
    if (t - scratch.last > .12 || t < scratch.last || key !== scratch.key) {
      scratch.last = t; scratch.key = key;
      onTelemetry({
        azimuth: (Math.atan2(offset.x, -offset.z)*180/Math.PI + 360) % 360,
        elevation: Math.atan2(offset.y, Math.hypot(offset.x, offset.z))*180/Math.PI,
        range, fov: 2*Math.atan(Math.tan(vertical/2)*aspect)*180/Math.PI,
        // A tracker estimates size from angular extent and range; a few percent of deterministic error.
        span: span*(1 + .04*Math.sin(t*.7 + id*1.3)),
      });
    }
  });
  return null;
}

/** Narrow-field EO (daylight TV) or white-hot IR view slewed to one radar track. */
export default function SensorFeed(props: Props) {
  const { scenario, mode } = props;
  const sky = mode === 'ir' ? skies.ir : scenario.dusk ? skies.dusk : skies.day;
  const haze = useMemo(() => new Color().setRGB(sky.horizon[0], sky.horizon[1], sky.horizon[2], SRGBColorSpace), [sky]);
  // Exponential haze per metre; Earth-view contacts sit eight times farther away and haze accordingly.
  const density = mode === 'ir' ? .0009 : scenario.difficulty === 'challenge' ? .0042 : .0019;
  return <Canvas dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'low-power' }} camera={{ fov: 4, near: .1, far: 6000 }} aria-hidden>
    <fogExp2 attach="fog" args={[haze, density]} />
    <SkyDome sky={sky} dusk={scenario.dusk} />
    {mode === 'eo' && <>
      <hemisphereLight args={[scenario.dusk ? '#c9b6c4' : '#dfe8f2', '#6d6253', scenario.dusk ? 1.1 : 1.6]} />
      <directionalLight position={sunDirection(scenario.dusk).multiplyScalar(100)} intensity={scenario.dusk ? 1.6 : 3} color={scenario.dusk ? '#ffbf83' : '#fff0d3'} />
    </>}
    {Array.from({ length: scenario.count }, (_, index) => <ContactModel key={`${mode}-${index}`} scenario={scenario} time={props.time} index={index} palette={mode === 'ir' ? 'thermal' : 'visible'} metresPerUnit={props.metresPerUnit} />)}
    <Gimbal {...props} />
  </Canvas>;
}
