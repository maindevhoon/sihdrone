import {
  BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial,
  MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3, type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Airframe } from './airframes';
import type { ContactPalette } from './contactGeometry';

/** Rounded cross-sections taper toward the nose and battery end, rather than a generic box. */
function bodyShell(width: number, height: number, length: number, enterprise: boolean, white: boolean) {
  const rings = [
    [-.5, .04, .04], [-.46, .6, .55], [-.3, .94, .9], [0, 1, 1],
    [.25, white ? .93 : .88, .9], [.42, .65, .65], [.5, .08, .12],
  ];
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [], sides = 24;
  const exponent = enterprise ? .45 : white ? 1 : .7;
  rings.forEach(([z, w, h]) => {
    for (let j = 0; j <= sides; j++) {
      const angle = j / sides * Math.PI * 2, x = Math.cos(angle), y = Math.sin(angle);
      positions.push(Math.sign(x) * Math.abs(x) ** exponent * width * w / 2,
        Math.sign(y) * Math.abs(y) ** exponent * height * h / 2, z * length);
      uvs.push(j / sides, z + .5);
    }
  });
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const back = positions.length / 3, front = back + 1;
  positions.push(0, 0, -length / 2, 0, 0, length / 2); uvs.push(.5, 0, .5, 1);
  for (let j = 0; j < sides; j++) {
    const end = (rings.length - 1) * (sides + 1) + j;
    indices.push(back, j + 1, j, front, end, end + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

/** Inspection details stay inside the original envelope; legacy builders remain unchanged. */
export function addAirframeDetail(root: Group, a: Airframe, palette: ContactPalette, detailed: boolean) {
  const B = a.body, hb = B.height / 2, white = a.livery === 'white', enterprise = a.id === 'matrice-350-rtk';
  const mat = (color: number, roughness = .45, metalness = .1, hot = false): Material => palette === 'thermal'
    ? new MeshBasicMaterial({color: hot ? 0xf4f4f4 : 0x7b7b7b})
    : new MeshStandardMaterial({color, roughness, metalness});
  const shell = mat(white ? 0xe5e8e8 : a.livery === 'grey' ? 0x7f898d : 0x424a4c, .34, .16);
  const rubber = mat(0x151a1d, .82, .05), alloy = mat(0x6c757a, .29, .75), sensor = mat(0x182730, .2, .6);
  const optics = palette === 'visible'
    ? new MeshPhysicalMaterial({color: 0x10202a, metalness: .35, roughness: .08, clearcoat: 1, clearcoatRoughness: .04})
    : mat(0x8d8d8d);
  const add = (geometry: BufferGeometry, material: Material, x: number, y: number, z: number, name: string) => {
    const mesh = new Mesh(geometry, material); mesh.position.set(x, y, z); mesh.name = name; mesh.castShadow = true;
    root.add(mesh); return mesh;
  };
  if (a.fixedWing) {
    for (const side of [-1, 1]) {
      add(new BoxGeometry(.12, .002, .3), mat(0xd3783e), side * .7, .052, -.015, 'wing-identification-stripe');
      add(new BoxGeometry(.035, .002, .36), rubber, side * .79, .052, -.015, 'wing-tip-trim');
    }
    for (let i = 0; detailed && i < 5; i++) add(new BoxGeometry(.001, .002, .26), alloy, (i - 2) * .22, .065, -.025, 'wing-rib');
    return;
  }
  // Consumer aircraft have a rounded moulded body; the enterprise frame has a boxier equipment bay.
  for (const name of ['fuselage', 'canopy']) {
    const mesh = root.getObjectByName(name) as Mesh | undefined;
    if (!mesh) continue;
    const canopy = name === 'canopy';
    const geometry = bodyShell(B.width * (canopy ? .91 : 1), B.height * (canopy ? .35 : .88), B.length * (canopy ? .86 : 1), enterprise, white);
    mesh.geometry.dispose(); mesh.geometry = geometry; mesh.scale.setScalar(1);
    mesh.position.set(0, canopy ? hb * .52 : -.01 * B.height, B.z - (canopy ? B.length * .025 : 0));
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => m.dispose());
    mesh.material = shell;
  }
  const bodyPoint = new Vector3(), motorPoint = new Vector3(), direction = new Vector3();
  for (const [x, y, z] of a.motors) {
    bodyPoint.set(Math.sign(x) * B.width * .37, 0, B.z + Math.sign(z) * B.length * .22);
    motorPoint.set(x, y, z); direction.copy(motorPoint).sub(bodyPoint);
    const arm = add(new RoundedBoxGeometry(a.motorRadius * (white ? 1.7 : 1.25), a.motorRadius * .9, direction.length(), 2, a.motorRadius * .3), shell, 0, 0, 0, 'arm-fairing');
    arm.position.copy(bodyPoint).add(motorPoint).multiplyScalar(.5);
    arm.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), direction.normalize());
  }
  root.traverse(object => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return;
    if (object.material.transparent && object.material.opacity > .4 && object.material.opacity < .5) object.material.opacity = .9;
  });
  // Separate rubber battery seam, top release latch and compact status indicator.
  add(new RoundedBoxGeometry(B.width * .63, .0015, B.length * .5, 2, .001), rubber, 0, hb * .91, B.z - B.length * .12, 'battery-seam');
  add(new RoundedBoxGeometry(B.width * .59, .002, B.length * .46, 2, .001), shell, 0, hb * .95, B.z - B.length * .12, 'battery-lid');
  add(new BoxGeometry(B.width * .18, .002, B.length * .04), alloy, 0, hb * .99, B.z - B.length * .32, 'battery-release');
  for (const side of [-1, 1]) {
    const z = B.z + B.length * .33;
    const eye = add(new CylinderGeometry(B.width * .07, B.width * .075, .004, 20), rubber, side * B.width * .3, hb * .18, z, 'obstacle-sensor-housing');
    eye.rotation.x = Math.PI / 2;
    const lens = add(new CylinderGeometry(B.width * .049, B.width * .05, .0045, 20), optics, side * B.width * .3, hb * .18, z + .001, 'obstacle-sensor-optic');
    lens.rotation.x = Math.PI / 2;
    for (const fore of [-1, 1]) {
      const hinge = add(new CylinderGeometry(B.width * .11, B.width * .11, B.height * .24, 20), shell, side * B.width * .42, -hb * .1, B.z + fore * B.length * .3, 'folding-arm-hinge');
      hinge.rotation.z = Math.PI / 2;
    }
  }
  const g = Math.min(.06, B.width * .2), gy = Math.max(-hb - g * .9, -a.gear.depth + g + .002);
  const nose = B.z + B.length / 2, face = nose - B.length * .12 + g * .8;
  const lenses = a.id === 'mavic-3' ? [[-.35, .2, .19], [.25, -.1, .29]] : [[0, 0, .32]];
  for (const [x, y, radius] of lenses) {
    const rim = add(new TorusGeometry(g * radius, g * .05, 8, 24), alloy, x * g, gy + y * g, face, 'camera-lens-ring');
    rim.rotation.set(0, 0, 0);
    const lens = add(new CylinderGeometry(g * radius * .91, g * radius * .91, g * .035, 24), optics, x * g, gy + y * g, face, 'camera-lens');
    lens.rotation.x = Math.PI / 2;
    const reflection = add(new SphereGeometry(g * .055, 10, 8), sensor, x * g - g * .07, gy + y * g + g * .07, face + g * .025, 'optic-coating');
    reflection.scale.z = .15;
  }
  if (!detailed) return;
  for (let i = 0; i < 6; i++) for (const side of [-1, 1]) {
    add(new BoxGeometry(.001, B.height * .09, B.length * .017), rubber, side * B.width * .49, -hb * .17, B.z + (i - 2.5) * B.length * .055, 'cooling-vent');
  }
  for (const [x, y, z] of a.motors) {
    const collar = add(new TorusGeometry(a.motorRadius * .94, a.motorRadius * .065, 6, 24), alloy, x, y + a.motorRadius * .8, z, 'motor-collar');
    collar.rotation.x = Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const theta = i * Math.PI / 4;
      const slot = add(new BoxGeometry(a.motorRadius * .1, a.motorRadius * .4, a.motorRadius * .22), rubber, x + Math.cos(theta) * a.motorRadius * .92, y + a.motorRadius * .9, z + Math.sin(theta) * a.motorRadius * .92, 'motor-vent');
      slot.rotation.y = -theta;
    }
  }
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    const screw = add(new CylinderGeometry(.0018, .0018, .0012, 12), alloy, side * B.width * .32, hb * .87, B.z + end * B.length * .33, 'fastener');
    screw.rotation.y = Math.PI / 4;
    add(new BoxGeometry(.0019, .0002, .0004), rubber, side * B.width * .32, hb * .87 + .0007, B.z + end * B.length * .33, 'fastener-slot');
  }
}
