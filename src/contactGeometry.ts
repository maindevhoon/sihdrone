import { createDetailedBird } from './birdGeometry';
import { addAirframeDetail } from './airframeDetail';
import {
  CanvasTexture, CircleGeometry, Color, FrontSide, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Points, PointsMaterial, BufferGeometry, Shape, ShapeGeometry, SphereGeometry, SRGBColorSpace,
  Vector2, Vector3, ExtrudeGeometry, BoxGeometry, type Material, type Side, type Object3D,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { birdAttitude, droneAttitude, strobeOn, wingBeat, type Kinematics } from './kinematics';
import { AIRFRAMES, type Airframe } from './airframes';
import { BIRDS } from './birds';
import type { FlightModelId, FlightState } from './flightTypes';

// Contact models in real-world metres (one local training unit), nose along +Z and up along +Y.
// The same builders feed the training scene, the EO/IR sensor feed and the exported Earth-view GLBs.
export type ContactPalette = 'visible' | 'thermal';
type Swatch = { color: number; metalness?: number; roughness?: number; opacity?: number; side?: Side };
type Rig = { props: Object3D[]; wings: Object3D[]; elbows?:Object3D[]; wrists?:Object3D[]; surfaces?:Object3D[]; tail?: Object3D; strobe?: Object3D };
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
 * Quadcopter built to a reference airframe's published dimensions: motor layout, propeller
 * diameter, fuselage and landing gear all come from `airframes.ts`.
 */
export function createDroneModel({ airframe = AIRFRAMES['matrice-350-rtk'], palette = 'visible', lights = true, dusk = false }: { airframe?: Airframe; palette?: ContactPalette; lights?: boolean; dusk?: boolean } = {}) {
  const a = airframe, root = new Group(); root.name = `drone-${a.id}`;
  const white = a.livery === 'white', grey = a.livery === 'grey';
  const bloom = dusk ? 1.8 : 1; // Navigation lights read larger against a dusk sky.
  const m = {
    shell: material(palette, { color: white ? 0xe4e6e8 : grey ? 0x7b8086 : 0x2c3135, metalness: .12, roughness: .38 }, .4),
    top: material(palette, { color: white ? 0xf3f4f5 : grey ? 0x8e9399 : 0x3a4045, metalness: .1, roughness: .32 }, .5),
    arm: material(palette, { color: white ? 0xc8ccd0 : grey ? 0x6b7076 : 0x23272a, metalness: .2, roughness: .45 }, .38),
    carbon: material(palette, { color: 0x17191c, metalness: .3, roughness: .55 }, .34),
    motor: material(palette, { color: 0x9aa0a6, metalness: .85, roughness: .28 }, 1),
    battery: material(palette, { color: white ? 0xd2d6d9 : 0x1d2124, roughness: .6 }, .8),
    glass: material(palette, { color: 0x0a0f15, metalness: .7, roughness: .1 }, .55),
    gimbal: material(palette, { color: 0x1f2327, metalness: .45, roughness: .38 }, .6),
    blade: material(palette, { color: 0x121416, roughness: .5, opacity: .42, side: DoubleSide }, .3),
    disc: material(palette, { color: 0x24282c, roughness: .9, opacity: .14, side: DoubleSide }, .28),
  };
  const B = a.body, hb = B.height/2, nose = B.z + B.length/2;
  const shell = add(root, new SphereGeometry(1, 28, 16), m.shell, [0, 0, B.z], 'fuselage'); shell.scale.set(B.width/2, hb, B.length/2);
  const top = add(root, new SphereGeometry(1, 28, 10, 0, Math.PI*2, 0, Math.PI/2), m.top, [0, hb*.15, B.z - B.length*.02], 'canopy'); top.scale.set(B.width*.47, hb*.85, B.length*.47);
  const sensor = add(root, new SphereGeometry(1, 16, 8), m.glass, [0, hb*.1, nose - .012], 'forward-sensors'); sensor.scale.set(B.width*.28, hb*.3, .01);
  if (a.mast > 0) {
    // Top-mounted RTK module: a short mast carrying two antenna domes.
    add(root, new CylinderGeometry(.012, .016, a.mast*.6, 10), m.carbon, [0, hb + a.mast*.3, B.z - B.length*.1]);
    for (const side of [-1, 1]) add(root, new SphereGeometry(.03, 16, 10), m.battery, [side*.07, hb + a.mast - .03, B.z - B.length*.1]);
    add(root, new RoundedBoxGeometry(.2, .03, .06, 2, .01), m.battery, [0, hb + a.mast*.62, B.z - B.length*.1]);
  }
  const rig: Rig = { props: [], wings: [] };
  const radius = a.propDiameter/2, r = a.motorRadius;
  const bladeGeometry = new ShapeGeometry(new Shape([[.012,-.01],[.06,-.017],[.12,-.013],[.158,-.006],[.165,0],[.16,.006],[.12,.01],[.06,.014],[.012,.009]].map(([x,y]) => new Vector2(x*radius/.165, y*radius/.165))), 6).rotateX(-Math.PI/2);
  a.motors.forEach(([mx, my, mz], index) => {
    const sx = Math.sign(mx), sz = Math.sign(mz), motor = new Vector3(mx, my, mz);
    const rootPoint = new Vector3(sx*B.width*.38, 0, B.z + sz*B.length*.22);
    strut(root, rootPoint, motor, r*.45, m.arm);
    add(root, new CylinderGeometry(r*.9, r, r*1.1, 16), m.carbon, [mx, my, mz]);
    add(root, new CylinderGeometry(r, r, r*.8, 16), m.motor, [mx, my + r*.9, mz], 'motor');
    // Front-left and rear-right spin one way, the other diagonal the other way.
    const prop = new Group(); prop.name = `prop-${index}`; prop.position.set(mx, my + r*1.6, mz);
    prop.userData.spin = sx*sz; root.add(prop); rig.props.push(prop);
    add(prop, new CylinderGeometry(r*.4, r*.45, r*.4, 12), m.carbon);
    for (const turn of [0, Math.PI]) { const b = add(prop, bladeGeometry, m.blade); b.rotation.set(.12*sx, turn, 0); }
    const disc = add(prop, new CircleGeometry(radius, 32).rotateX(-Math.PI/2), m.disc, [0, .002, 0], 'prop-disc'); disc.castShadow = false;
    if (a.gear.type === 'feet') {
      // Folding airframes stand on short legs under the arms.
      strut(root, new Vector3(mx*.92, my - r*.5, mz*.92), new Vector3(mx*.92, -a.gear.depth + .004, mz*.92), .0035, m.carbon);
      add(root, new SphereGeometry(.004, 8, 6), m.carbon, [mx*.92, -a.gear.depth + .004, mz*.92]);
    }
  });
  if (a.gear.type === 'skid') {
    const tube = a.gear.width > .4 ? .012 : .007, x = a.gear.width/2 - tube, y = -a.gear.depth + tube;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) strut(root, new Vector3(sx*B.width*.3, -hb*.6, B.z + sz*B.length*.22), new Vector3(sx*x, y, sz*a.gear.length*.3), tube*.8, m.carbon);
      const skid = add(root, new CylinderGeometry(tube, tube, a.gear.length, 10), m.carbon, [sx*x, y, 0]); skid.rotation.x = Math.PI/2;
    }
  }
  // Gimbal camera under the nose, sized to the airframe and kept above the landing gear.
  const g = Math.min(.06, B.width*.2), gy = Math.max(-hb - g*.9, -a.gear.depth + g + .002);
  add(root, new RoundedBoxGeometry(g*1.1, g*.9, g*.45, 2, g*.12), m.gimbal, [0, Math.max(-hb - g*.2, gy + g*.5), nose - B.length*.16]);
  add(root, new SphereGeometry(g, 16, 12), m.gimbal, [0, gy, nose - B.length*.12 - g*.2], 'gimbal');
  const lens = add(root, new CylinderGeometry(g*.5, g*.55, g*.45, 18), m.glass, [0, gy, nose - B.length*.12 + g*.55]); lens.rotation.x = Math.PI/2;
  if (lights && palette === 'visible') {
    // Port red, starboard green, rear white: the arrangement used on lit commercial airframes.
    const [fl, fr, rl, rr] = a.motors, under = (p: number[]) => [p[0], p[1] - r*.6, p[2]];
    root.add(lightPoints('nav-red', under(fl), 0xff3b30, 4*bloom));
    root.add(lightPoints('nav-green', under(fr), 0x38ff7a, 4*bloom));
    root.add(lightPoints('nav-white', [...under(rl), ...under(rr)], 0xfff4e0, 3*bloom));
    const strobe = lightPoints('strobe', [0, hb + a.mast + .004, B.z - B.length*.15], 0xffffff, 9*bloom); root.add(strobe); rig.strobe = strobe;
  }
  rigs.set(root, rig);
  return root;
}

/** Black kite (Milvus migrans): about 1.5 m wingspan and 0.58 m long, fingered primaries and a shallow forked tail. */
export function createBirdModel({ palette = 'visible' }: { palette?: ContactPalette } = {}) {
  const root = new Group(); root.name = 'bird';
  const m = {
    plumage: material(palette, { color: 0x4b3b2d, roughness: .92, side: DoubleSide }, .78),
    wing: material(palette, { color: 0x3a2d23, roughness: .95, side: DoubleSide }, .7),
    head: material(palette, { color: 0x7a6853, roughness: .85 }, .95),
    body: material(palette, { color: 0x56432f, roughness: .9 }, .92),
    beak: material(palette, { color: 0xcdb45c, roughness: .55 }, .6),
  };
  const body = add(root, new SphereGeometry(1, 28, 18), m.body, [0, 0, 0], 'body'); body.scale.set(.07, .068, .19);
  const head = add(root, new SphereGeometry(.046, 22, 16), m.head, [0, .025, .18], 'head'); head.scale.set(1, .95, 1.15);
  const beak = add(root, new CylinderGeometry(0, .014, .045, 10), m.beak, [0, .016, .23]); beak.rotation.x = Math.PI/2 + .25;
  const wingShape = new Shape([[0,.11],[.18,.15],[.36,.15],[.52,.11],[.66,.05],[.74,-.01],[.73,-.05],[.68,-.04],[.7,-.09],[.63,-.08],[.64,-.13],[.56,-.12],[.55,-.16],[.42,-.17],[.25,-.18],[.08,-.15],[0,-.12]].map(([x,y]) => new Vector2(x*.95, y)));
  const wingGeometry = new ShapeGeometry(wingShape, 4).rotateX(Math.PI/2);
  const rig: Rig = { props: [], wings: [] };
  for (const side of [1, -1]) {
    const wing = new Group(); wing.name = side > 0 ? 'wing-left' : 'wing-right'; wing.position.set(side*.05, .03, .04);
    add(wing, side > 0 ? wingGeometry : wingGeometry.clone().scale(-1, 1, 1), m.wing);
    root.add(wing); rig.wings.push(wing);
  }
  const tail = new Group(); tail.name = 'tail'; tail.position.set(0, .01, -.15); root.add(tail); rig.tail = tail;
  add(tail, new ShapeGeometry(new Shape([[-.05,0],[.05,0],[.1,-.18],[.045,-.155],[0,-.14],[-.045,-.155],[-.1,-.18]].map(([x,y]) => new Vector2(x, y)))).rotateX(Math.PI/2), m.plumage);
  rigs.set(root, rig);
  return root;
}

/** Original articulated assets. The v1/v2 builders above stay frozen for old replays. */
export function createFlightModel(id:FlightModelId,palette:ContactPalette='visible',lowLight=false,lights=true,detail:'high'|'low'='high'):Group {
  if(id in BIRDS){const bird=createArticulatedBird(id as keyof typeof BIRDS,palette,detail==='high');mergeStaticMeshes(bird);return bird;}
  const a=AIRFRAMES[id as keyof typeof AIRFRAMES];
  if(a.fixedWing){const plane=createPlaneModel(palette);addAirframeDetail(plane,a,palette,detail==='high');mergeStaticMeshes(plane);return plane;}
  const root=createDroneModel({airframe:a,palette,dusk:lowLight,lights});
  addAirframeDetail(root,a,palette,detail==='high');
  if(a.motors.length===6)rigs.get(root)?.props.forEach((p,i)=>{p.userData.spin=i%2?1:-1;});
  mergeStaticMeshes(root);return root;
}
/** Merge only static meshes within a joint, preserving every animation group and material. */
function mergeStaticMeshes(root:Object3D){
  const groups:Object3D[]=[];root.traverse(o=>{if(o.type==='Group')groups.push(o);});
  for(const group of groups){
    const buckets=new Map<Material,Mesh[]>();
    for(const child of group.children){const mesh=child as Mesh;if(!mesh.isMesh||Array.isArray(mesh.material))continue;const bucket=buckets.get(mesh.material)??[];bucket.push(mesh);buckets.set(mesh.material,bucket);}
    for(const [mat,meshes] of buckets){
      if(meshes.length<2)continue;
      const copies=meshes.map(m=>{m.updateMatrix();const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();return g.applyMatrix4(m.matrix);});
      const merged=mergeGeometries(copies,false);copies.forEach(g=>g.dispose());if(!merged)continue;
      const mesh=add(group,merged,mat,[0,0,0],'surface-detail');
      mesh.castShadow=meshes.some(m=>m.castShadow);meshes.forEach(m=>{group.remove(m);});
      const geometries=new Set(meshes.map(m=>m.geometry));geometries.forEach(g=>g.dispose());
    }
  }
}
function createArticulatedBird(id:keyof typeof BIRDS,palette:ContactPalette,detailed=true){
  const {root,rig}=createDetailedBird(id,palette,detailed);
  rigs.set(root,rig);return root;
}

function createPlaneModel(palette:ContactPalette){
  const root=new Group();root.name='drone-rc-cessna';
  const shell=material(palette,{color:0xdbe2e7,metalness:.12,roughness:.4},.5),carbon=material(palette,{color:0x222a32,roughness:.45},.45),glass=material(palette,{color:0x1c3544,metalness:.6,roughness:.15},.6);
  const body=add(root,new SphereGeometry(1,28,16),shell,[0,0,0],'fuselage');body.scale.set(.07,.09,.675);
  const cabin=add(root,new SphereGeometry(1,20,12),glass,[0,.065,.21]);cabin.scale.set(.063,.05,.15);
  const rig:Rig={props:[],wings:[],surfaces:[]};
  for(const side of [-1,1]){
    const wingShape=new Shape([[side*.06,.25],[side*.9,.08],[side*.9,-.17],[side*.06,-.22]].map(([x,y])=>new Vector2(x,y)));
    add(root,new ExtrudeGeometry(wingShape,{depth:.025,bevelEnabled:false}).rotateX(Math.PI/2),shell,[0,.05,0],'main-wing');
    const aileron=new Group();aileron.name=side>0?'aileron-left':'aileron-right';aileron.position.set(side*.63,.048,-.16);root.add(aileron);
    add(aileron,new BoxGeometry(.48,.018,.09),carbon,[0,0,-.035]);rig.surfaces!.push(aileron);
  }
  const elevator=new Group();elevator.name='elevator';elevator.position.set(0,.03,-.51);root.add(elevator);add(elevator,new BoxGeometry(.6,.018,.17),shell,[0,0,-.04]);rig.surfaces!.push(elevator);
  const fin=add(root,new BoxGeometry(.015,.24,.17),shell,[0,.1,-.54],'vertical-fin');fin.rotation.x=-.18;
  const rudder=new Group();rudder.name='rudder';rudder.position.set(0,.12,-.59);root.add(rudder);add(rudder,new BoxGeometry(.015,.21,.07),carbon,[0,0,-.03]);rig.surfaces!.push(rudder);
  const prop=new Group();prop.name='prop-0';prop.position.z=.69;prop.userData.spin=1;root.add(prop);rig.props.push(prop);
  add(prop,new BoxGeometry(.28,.014,.01),carbon);const disc=add(prop,new CircleGeometry(.14,24),material(palette,{color:0x222a32,opacity:.15,side:DoubleSide},.5));disc.castShadow=false;
  rigs.set(root,rig);return root;
}
export function poseFlightRig(model:Object3D,flight:FlightState,time:number,index:number){
  const rig=rigs.get(model);if(!rig)return;
  rig.props.forEach((p,i)=>{
    const angle=(flight.rotorAngles[i]??0)*(p.userData.spin as number);
    if(model.name==='drone-rc-cessna')p.rotation.z=angle;else p.rotation.y=angle;
    const disc=p.getObjectByName('prop-disc') as Mesh|undefined;
    if(disc){disc.visible=(flight.rotorRPM[i]??0)>300;}
  });
  rig.wings.forEach((w,i)=>{w.rotation.z=(i? -1:1)*flight.wing.shoulder;});
  rig.elbows?.forEach((w,i)=>{w.rotation.z=(i?-1:1)*flight.wing.elbow;});
  rig.wrists?.forEach((w,i)=>{w.rotation.z=(i?-1:1)*flight.wing.wrist;});
  if(rig.tail){rig.tail.rotation.x=flight.wing.tail;rig.tail.rotation.y=flight.angularVelocity[1]*.06;}
  rig.surfaces?.forEach((s,i)=>{if(i<2)s.rotation.x=(i?-1:1)*flight.surfaces[2]*.3;else if(i===2)s.rotation.x=flight.surfaces[0]*.3;else s.rotation.y=flight.surfaces[1]*.3;});
  if(rig.strobe)rig.strobe.visible=strobeOn(time,index);
}
/**
 * Orients a contact along its trajectory and animates propellers, strobe or wings.
 * `target` carries the position/attitude; `model` is the built airframe inside it.
 */
export function poseContact(target: Object3D, model: Object3D, bird: boolean, k: Kinematics, time: number, index: number) {
  if(k.flight){target.position.set(...k.flight.position);target.quaternion.set(...k.flight.orientation);poseFlightRig(model,k.flight,time,index);return;}
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
  const geometries=new Set<BufferGeometry>(),materials=new Set<Material>();
  object.traverse(child => {
    const item = child as Mesh;
    if(item.geometry)geometries.add(item.geometry);
    const entries = item.material ? (Array.isArray(item.material) ? item.material : [item.material]) : [];
    entries.forEach(entry=>materials.add(entry));
  });
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}
