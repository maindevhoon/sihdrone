import {
  CanvasTexture, CircleGeometry, Color, FrontSide, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Points, PointsMaterial, BufferGeometry, Shape, ShapeGeometry, SphereGeometry, SRGBColorSpace,
  Vector2, Vector3, type Material, type Side, type Object3D,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { birdAttitude, droneAttitude, strobeOn, wingBeat, type Kinematics } from './kinematics';

// Contact models in real-world metres (one local training unit), nose along +Z and up along +Y.
// The same builders feed the training scene, the EO/IR sensor feed and the exported Earth-view GLBs.
export type ContactPalette = 'visible' | 'thermal';
export type DroneLivery = 'graphite' | 'white';
type Swatch = { color: number; metalness?: number; roughness?: number; opacity?: number; side?: Side };
type Rig = { props: Object3D[]; wings: Object3D[]; tail?: Object3D; strobe?: Object3D };
const rigs = new WeakMap<Object3D, Rig>();

/** Visible-band PBR material, or a flat grey level for the white-hot thermal palette (heat 0 cold → 1 hot). */
function material(palette: ContactPalette, swatch: Swatch, heat: number): Material {
  const transparent = swatch.opacity !== undefined;
  if (palette === 'thermal') {
    const level = .16 + heat*.84;
    return new MeshBasicMaterial({ color: new Color().setRGB(level, level, level, SRGBColorSpace), transparent, opacity: swatch.opacity ?? 1, depthWrite: !transparent, side: swatch.side ?? FrontSide });
  }
  return new MeshStandardMaterial({ color: swatch.color, metalness: swatch.metalness ?? 0, roughness: swatch.roughness ?? .7, transparent, opacity: swatch.opacity ?? 1, depthWrite: !transparent, side: swatch.side ?? FrontSide });
}
function add(parent: Object3D, geometry: BufferGeometry, mat: Material, position: [number, number, number] = [0, 0, 0], name = '') {
  const mesh = new Mesh(geometry, mat);
  mesh.position.set(...position); mesh.name = name; mesh.castShadow = true;
  parent.add(mesh); return mesh;
}
/** A cylinder spanning two points, used for arms and landing-gear tubes. */
function strut(parent: Object3D, from: Vector3, to: Vector3, radius: number, mat: Material) {
  const direction = to.clone().sub(from), mesh = add(parent, new CylinderGeometry(radius, radius, direction.length(), 8), mat);
  mesh.position.copy(from).add(to).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
  return mesh;
}
// Soft round sprite for lights. Shared and never disposed; absent outside the browser.
let glow: CanvasTexture | null | undefined;
function glowTexture() {
  if (glow !== undefined) return glow;
  if (typeof document === 'undefined') return glow = null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d')!, gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, '#fff'); gradient.addColorStop(.3, 'rgba(255,255,255,.9)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 32, 32);
  return glow = new CanvasTexture(canvas);
}
function lightPoints(name: string, positions: number[], color: number, size: number) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const points = new Points(geometry, new PointsMaterial({ color, size, map: glowTexture(), sizeAttenuation: false, transparent: true, depthWrite: false }));
  points.name = name; return points;
}

/**
 * Enterprise-class quadcopter: 0.71 m motor wheelbase, 0.33 m two-blade propellers
 * (about 1.04 m tip to tip), skid landing gear and a nose gimbal camera.
 */
export function createDroneModel({ livery = 'graphite', palette = 'visible', lights = true, dusk = false }: { livery?: DroneLivery; palette?: ContactPalette; lights?: boolean; dusk?: boolean } = {}) {
  const white = livery === 'white', root = new Group(); root.name = 'drone';
  const bloom = dusk ? 1.8 : 1; // Navigation lights read larger against a dusk sky.
  const m = {
    shell: material(palette, { color: white ? 0xe4e6e8 : 0x2c3135, metalness: .12, roughness: .38 }, .4),
    top: material(palette, { color: white ? 0xf3f4f5 : 0x3a4045, metalness: .1, roughness: .32 }, .46),
    arm: material(palette, { color: white ? 0xc8ccd0 : 0x23272a, metalness: .2, roughness: .45 }, .38),
    carbon: material(palette, { color: 0x17191c, metalness: .3, roughness: .55 }, .34),
    motor: material(palette, { color: 0x9aa0a6, metalness: .85, roughness: .28 }, 1),
    battery: material(palette, { color: white ? 0xd2d6d9 : 0x1d2124, roughness: .6 }, .8),
    glass: material(palette, { color: 0x0a0f15, metalness: .7, roughness: .1 }, .55),
    gimbal: material(palette, { color: 0x1f2327, metalness: .45, roughness: .38 }, .6),
    blade: material(palette, { color: 0x121416, roughness: .5, opacity: .42, side: DoubleSide }, .3),
    disc: material(palette, { color: 0x24282c, roughness: .9, opacity: .14, side: DoubleSide }, .28),
  };
  const shell = add(root, new SphereGeometry(1, 28, 16), m.shell, [0, 0, 0], 'fuselage'); shell.scale.set(.11, .052, .2);
  const top = add(root, new SphereGeometry(1, 28, 10, 0, Math.PI*2, 0, Math.PI/2), m.top, [0, .01, -.005], 'canopy'); top.scale.set(.104, .048, .19);
  const sensor = add(root, new SphereGeometry(1, 20, 10), m.glass, [0, .004, .196], 'forward-sensors'); sensor.scale.set(.055, .018, .012);
  add(root, new RoundedBoxGeometry(.105, .038, .15, 3, .012), m.battery, [0, .062, -.035], 'battery');
  const rig: Rig = { props: [], wings: [] };
  const blade = new Shape([[.012,-.01],[.06,-.017],[.12,-.013],[.158,-.006],[.165,0],[.16,.006],[.12,.01],[.06,.014],[.012,.009]].map(([x,y]) => new Vector2(x, y)));
  const bladeGeometry = new ShapeGeometry(blade, 6).rotateX(-Math.PI/2);
  [[1,1],[-1,1],[1,-1],[-1,-1]].forEach(([sx, sz], index) => {
    const motor = new Vector3(sx*.25, .012, sz*.25);
    add(root, new RoundedBoxGeometry(.05, .032, .055, 2, .01), m.shell, [sx*.07, 0, sz*.095]);
    strut(root, new Vector3(sx*.07, 0, sz*.095), motor, .013, m.arm);
    add(root, new CylinderGeometry(.027, .031, .034, 16), m.carbon, [motor.x, motor.y, motor.z]);
    add(root, new CylinderGeometry(.03, .03, .022, 16), m.motor, [motor.x, motor.y + .028, motor.z], 'motor');
    const prop = new Group(); prop.name = `prop-${index}`; prop.position.set(motor.x, motor.y + .05, motor.z);
    prop.userData.spin = sx*sz; root.add(prop); rig.props.push(prop);
    add(prop, new CylinderGeometry(.012, .014, .012, 12), m.carbon);
    for (const turn of [0, Math.PI]) { const b = add(prop, bladeGeometry, m.blade); b.rotation.set(.12*sx, turn, 0); }
    const disc = add(prop, new CircleGeometry(.165, 32).rotateX(-Math.PI/2), m.disc, [0, .002, 0], 'prop-disc'); disc.castShadow = false;
  });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) strut(root, new Vector3(sx*.055, -.035, sz*.055), new Vector3(sx*.1, -.15, sz*.07), .006, m.carbon);
    const skid = add(root, new CylinderGeometry(.008, .008, .3, 10), m.carbon, [sx*.1, -.15, 0]); skid.rotation.x = Math.PI/2;
  }
  add(root, new RoundedBoxGeometry(.034, .036, .014, 2, .005), m.gimbal, [0, -.062, .13]);
  add(root, new SphereGeometry(.031, 16, 12), m.gimbal, [0, -.092, .138], 'gimbal');
  const lens = add(root, new CylinderGeometry(.015, .017, .014, 18), m.glass, [0, -.092, .168]); lens.rotation.x = Math.PI/2;
  if (lights && palette === 'visible') {
    // Port red, starboard green, rear white: the arrangement used on lit commercial airframes.
    root.add(lightPoints('nav-red', [.25, -.012, .25], 0xff3b30, 4*bloom));
    root.add(lightPoints('nav-green', [-.25, -.012, .25], 0x38ff7a, 4*bloom));
    root.add(lightPoints('nav-white', [.25, -.012, -.25, -.25, -.012, -.25], 0xfff4e0, 3*bloom));
    const strobe = lightPoints('strobe', [0, .09, -.03], 0xffffff, 9*bloom); root.add(strobe); rig.strobe = strobe;
  }
  rigs.set(root, rig);
  return root;
}

/** Black kite (Milvus migrans): about 1.55 m wingspan, fingered primaries and a shallow forked tail. */
export function createBirdModel({ palette = 'visible' }: { palette?: ContactPalette } = {}) {
  const root = new Group(); root.name = 'bird';
  const m = {
    plumage: material(palette, { color: 0x4b3b2d, roughness: .92, side: DoubleSide }, .78),
    wing: material(palette, { color: 0x3a2d23, roughness: .95, side: DoubleSide }, .7),
    head: material(palette, { color: 0x7a6853, roughness: .85 }, .95),
    body: material(palette, { color: 0x56432f, roughness: .9 }, .92),
    beak: material(palette, { color: 0xcdb45c, roughness: .55 }, .6),
  };
  const body = add(root, new SphereGeometry(1, 28, 18), m.body, [0, 0, 0], 'body'); body.scale.set(.072, .07, .25);
  const head = add(root, new SphereGeometry(.048, 22, 16), m.head, [0, .025, .235], 'head'); head.scale.set(1, .95, 1.15);
  const beak = add(root, new CylinderGeometry(0, .015, .05, 10), m.beak, [0, .016, .295]); beak.rotation.x = Math.PI/2 + .25;
  const wingShape = new Shape([[0,.11],[.18,.15],[.36,.15],[.52,.11],[.66,.05],[.74,-.01],[.73,-.05],[.68,-.04],[.7,-.09],[.63,-.08],[.64,-.13],[.56,-.12],[.55,-.16],[.42,-.17],[.25,-.18],[.08,-.15],[0,-.12]].map(([x,y]) => new Vector2(x, y)));
  const wingGeometry = new ShapeGeometry(wingShape, 4).rotateX(Math.PI/2);
  const rig: Rig = { props: [], wings: [] };
  for (const side of [1, -1]) {
    const wing = new Group(); wing.name = side > 0 ? 'wing-left' : 'wing-right'; wing.position.set(side*.05, .03, .04);
    add(wing, side > 0 ? wingGeometry : wingGeometry.clone().scale(-1, 1, 1), m.wing);
    root.add(wing); rig.wings.push(wing);
  }
  const tail = new Group(); tail.name = 'tail'; tail.position.set(0, .01, -.2); root.add(tail); rig.tail = tail;
  add(tail, new ShapeGeometry(new Shape([[-.05,0],[.05,0],[.11,-.25],[.05,-.21],[0,-.19],[-.05,-.21],[-.11,-.25]].map(([x,y]) => new Vector2(x, y)))).rotateX(Math.PI/2), m.plumage);
  rigs.set(root, rig);
  return root;
}

/**
 * Orients a contact along its trajectory and animates propellers, strobe or wings.
 * `target` carries the position/attitude; `model` is the built airframe inside it.
 */
export function poseContact(target: Object3D, model: Object3D, bird: boolean, k: Kinematics, time: number, index: number) {
  const attitude = bird ? birdAttitude(k) : droneAttitude(k);
  target.position.set(...k.position);
  target.rotation.set(attitude.pitch, Math.PI - k.heading, attitude.roll, 'YXZ');
  const rig = rigs.get(model); if (!rig) return;
  if (bird) {
    const { angle } = wingBeat(time, index);
    rig.wings[0].rotation.z = angle; rig.wings[1].rotation.z = -angle;
    if (rig.tail) rig.tail.rotation.z = -attitude.roll*.6;
  } else {
    // Displayed at a camera-like stroboscopic rate; the translucent disc carries the motion blur.
    rig.props.forEach(prop => { prop.rotation.y = time*31*(prop.userData.spin as number); });
    if (rig.strobe) rig.strobe.visible = strobeOn(time, index);
  }
}

export function disposeModel(object: Object3D) {
  object.traverse(child => {
    const item = child as Mesh;
    item.geometry?.dispose();
    const materials = item.material ? (Array.isArray(item.material) ? item.material : [item.material]) : [];
    materials.forEach(entry => entry.dispose());
  });
}
