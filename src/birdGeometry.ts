import {
  Box3, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute,
  Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial,
  SphereGeometry, Vector3, type Material, type Object3D,
} from 'three';
import { BIRDS } from './birds';
import type { BirdId } from './flightTypes';
import type { ContactPalette } from './contactGeometry';

type Point = [number, number, number];
const add = (parent: Object3D, geometry: BufferGeometry, material: Material, position: Point, name: string) => {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(...position); mesh.name = name; mesh.castShadow = true;
  parent.add(mesh); return mesh;
};

/** Cambered, asymmetric feather vanes. Colour bands are geometry attributes, not external textures. */
function feather(from: Point, to: Point, width: number, color: number, seed: number, barred = false, detail = true) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const rows = detail ? 8 : 5, columns = detail ? 4 : 2;
  const start = new Vector3(...from), axis = new Vector3(...to).sub(start);
  const perpendicular = new Vector3(-axis.z, 0, axis.x).normalize();
  const base = new Color(color), ink = new Color(0x23282d), tint = new Color();
  for (let row = 0; row <= rows; row++) {
    const u = row / rows;
    const outline = Math.pow(Math.sin(Math.PI * (.06 + .88 * u)), .55) * (1 - u * .18);
    for (let col = 0; col <= columns; col++) {
      const v = col / columns * 2 - 1;
      const edge = outline * width * v * (v < 0 ? .42 : .58);
      const bend = Math.sin(u * Math.PI) * axis.length() * .025;
      const p = start.clone().addScaledVector(axis, u).addScaledVector(perpendicular, edge);
      p.y += bend * (1 - v * v) + Math.sin(u * 36 + seed) * Math.abs(v) * width * .018;
      positions.push(p.x, p.y, p.z);
      const variation = .9 + .12 * Math.sin(seed * 1.71 + u * 2.4) + .04 * Math.cos(col * 1.9 + row * .8);
      tint.copy(base).multiplyScalar(variation);
      if (barred && u > .72 && u < .93) tint.lerp(ink, .85);
      // A fine central rachis and pale worn edges give a readable layered surface at close range.
      if (Math.abs(v) < .08) tint.multiplyScalar(1.15);
      if (Math.abs(v) > .95) tint.multiplyScalar(1.08);
      colors.push(tint.r, tint.g, tint.b);
    }
  }
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const a = row * (columns + 1) + col, b = a + columns + 1;
    indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i < normals.count; i++) {
    if (Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) < .001) normals.setXYZ(i, 0, 1, 0);
  }
  return geometry;
}

function wingEdges(u: number, id: BirdId): [number, number] {
  const leading = id === 'black-kite' ? [.15, .18, .13, .08, .015, -.08]
    : id === 'house-crow' ? [.13, .18, .13, .035, -.09, -.22] : [.12, .16, .12, .025, -.1, -.25];
  const trailing = id === 'black-kite' ? [-.15, -.27, -.32, -.34, -.3, -.09]
    : id === 'house-crow' ? [-.17, -.29, -.34, -.34, -.3, -.23] : [-.16, -.27, -.31, -.32, -.3, -.255];
  const f = Math.min(4.999, u * 5), i = Math.floor(f), t = f - i;
  return [leading[i] * (1 - t) + leading[i + 1] * t, trailing[i] * (1 - t) + trailing[i + 1] * t];
}

/** A smooth, cambered leading edge covers feather roots; the separate vanes form the trailing edge. */
function wingCover(start: number, width: number, total: number, side: number, length: number, id: BirdId) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const x = width * i / 12, [front, rear] = wingEdges((start + x) / total, id);
    for (let j = 0; j <= 4; j++) {
      const chord = j / 4 * .63;
      positions.push(side * x, length * (.012 + Math.sin(chord * Math.PI) * .025), length * (front * (1 - chord) + rear * chord));
      uvs.push(i / 12, j / 4);
    }
  }
  for (let i = 0; i < 12; i++) for (let j = 0; j < 4; j++) {
    const a = i * 5 + j, b = a + 5;
    indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new Float32BufferAttribute(positions.map(() => 1), 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function pigeonBar(start: number, width: number, total: number, side: number, length: number, chord: number) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const x = width * i / 12, [front, rear] = wingEdges((start + x) / total, 'rock-pigeon');
    for (const edge of [-1, 1]) {
      positions.push(side * x, length * .052, length * (front * (1 - chord) + rear * chord + edge * .012));
      uvs.push(i / 12, (edge + 1) / 2);
    }
  }
  for (let i = 0; i < 12; i++) {const a = i * 2; indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);}
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function contourSurface(geometry: SphereGeometry) {
  const uv = geometry.getAttribute('uv'), colors: number[] = [];
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    const shade = .89 + .09 * Math.sin(u * 130 + Math.sin(v * 90) * 2) + .025 * Math.cos(v * 250);
    colors.push(shade, shade, shade);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3)); return geometry;
}

/** Original reference-inspired anatomy; internal proportions are illustrative, not scanned anatomy. */
export function createDetailedBird(id: BirdId, palette: ContactPalette, detailed: boolean) {
  const spec = BIRDS[id], L = spec.length, half = spec.span / 2;
  const pigeon = id === 'rock-pigeon', crow = id === 'house-crow', kite = id === 'black-kite';
  const root = new Group(); root.name = `bird-${id}`;
  const surface = (color: number, heat: number, roughness = .85, vertexColors = false): Material => palette === 'thermal'
    ? new MeshBasicMaterial({color: new Color().setScalar(.16 + heat * .84), side: DoubleSide})
    : new MeshStandardMaterial({color, roughness, side: DoubleSide, vertexColors});
  const vane = surface(0xffffff, .74, .9, true);
  const bodyMaterial = surface(spec.colors[0], .9), wingMaterial = surface(spec.colors[1], .74);
  const neckMaterial = pigeon && palette === 'visible'
    ? new MeshPhysicalMaterial({color: 0x35484a, roughness: .42, metalness: .18, iridescence: .9, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 440]})
    : surface(spec.colors[2], .92, crow ? .65 : .9);
  const dark = surface(0x14181c, .6, .55), bill = surface(kite ? 0x615c48 : 0x34363a, .6, .38);
  const iris = surface(pigeon ? 0xa65b23 : kite ? 0x756339 : 0x34302b, .85, .4);
  const glass = palette === 'visible'
    ? new MeshPhysicalMaterial({color: 0x040607, roughness: .08, clearcoat: 1, clearcoatRoughness: .06})
    : surface(0x333333, .9);
  if (palette === 'visible') {
    (bodyMaterial as MeshStandardMaterial).vertexColors = true;
    (wingMaterial as MeshStandardMaterial).vertexColors = true;
  }
  const segments = detailed ? 48 : 20;
  const body = add(root, contourSurface(new SphereGeometry(1, segments, segments / 2)), bodyMaterial, [0, 0, 0], 'breast');
  body.scale.set(L * (pigeon ? .145 : .115), L * (pigeon ? .145 : .108), L * .265);
  body.rotation.x = -.09;
  const mantle = add(root, contourSurface(new SphereGeometry(1, segments, 16)), wingMaterial, [0, L * .035, -L * .035], 'mantle');
  mantle.scale.set(L * .12, L * .08, L * .245);
  const neck = add(root, new SphereGeometry(1, segments, 16), neckMaterial, [0, L * .055, L * .22], 'neck');
  neck.scale.set(L * (pigeon ? .09 : .075), L * .105, L * .14);
  const headMaterial = crow ? dark : pigeon ? surface(0x626f7d, .94, .7) : surface(0x65513b, .94);
  const head = add(root, new SphereGeometry(1, segments, 16), headMaterial, [0, L * .105, L * .335], 'head');
  const headWidth = L * (kite ? .052 : crow ? .062 : .064);
  head.scale.set(headWidth, L * (kite ? .062 : .072), L * .078);
  // Tapered upper bill and a separate lower mandible; the kite's hook curves down at the tip.
  const beak = add(root, new SphereGeometry(1, 20, 12), bill, [0, L * .084, L * .428], 'upper-bill');
  beak.scale.set(L * (crow ? .03 : .022), L * .026, L * (crow ? .07 : .045));
  if (kite) {
    const hook = add(root, new SphereGeometry(1, 12, 10), bill, [0, L * .065, L * .465], 'hooked-bill');
    hook.scale.set(L * .013, L * .035, L * .019); hook.rotation.x = -.3;
  }
  const jaw = add(root, new SphereGeometry(1, 16, 10), dark, [0, L * .064, L * .426], 'lower-mandible');
  jaw.scale.set(L * .019, L * .009, L * (crow ? .06 : .04));
  if (pigeon) {
    const cere = add(root, new SphereGeometry(1, 16, 10), surface(0xbeb9af, .85), [0, L * .109, L * .421], 'pale-cere');
    cere.scale.set(L * .025, L * .018, L * .026);
  }
  for (const side of [-1, 1]) {
    const eye = add(root, new SphereGeometry(L * .009, 16, 12), iris, [side * headWidth * .92, L * .123, L * .36], 'iris');
    eye.scale.set(.45, 1, 1);
    const pupil = add(root, new SphereGeometry(L * .0055, 16, 10), glass, [side * headWidth * 1.01, L * .123, L * .363], 'eye');
    pupil.scale.x = .5;
    const nostril = add(root, new SphereGeometry(L * .006, 8, 6), dark, [side * L * .022, L * .096, L * .439], 'nostril');
    nostril.scale.set(.3, .65, 1);
  }
  const wings: Object3D[] = [], elbows: Object3D[] = [], wrists: Object3D[] = [];
  const widths = [(half - .025) * .4, (half - .025) * .34, (half - .025) * .26];
  for (const side of [1, -1]) {
    const suffix = side > 0 ? 'left' : 'right';
    const shoulder = new Group(); shoulder.name = `wing-${suffix}`;
    shoulder.position.set(side * .025, L * .045, L * .035); root.add(shoulder); wings.push(shoulder);
    let parent = shoulder;
    let traversed = 0;
    widths.forEach((width, joint) => {
      if (joint) {
        const hinge = new Group(); hinge.name = `${joint === 1 ? 'elbow' : 'wrist'}-${suffix}`;
        hinge.position.x = side * widths[joint - 1]; parent.add(hinge); parent = hinge;
        (joint === 1 ? elbows : wrists).push(hinge);
      }
      const total = half - .025;
      add(parent, wingCover(traversed, width, total, side, L, id), wingMaterial, [0, 0, 0], 'leading-edge-cover');
      const count = joint === 2 ? (kite ? 7 : crow ? 8 : 10) : detailed ? 12 : 7;
      for (let i = 0; i < count; i++) {
        const u = (i + 1) / count, primary = joint === 2;
        const endX = width * u;
        const startX = primary ? Math.max(0, endX - width * .32) : endX - width * .025;
        const [front, rear] = wingEdges((traversed + endX) / total, id);
        const [rootFront, rootRear] = wingEdges((traversed + startX) / total, id);
        const startZ = L * (rootFront * .7 + rootRear * .3);
        const endZ = L * rear - (primary && kite ? L * .025 * Math.sin(i * .8) : 0);
        add(parent, feather([side * startX, L * .006, startZ], [side * endX, -L * .006, endZ], width / count * (primary && kite ? 1.05 : 1.75), spec.colors[primary ? 1 : 0], i + joint * 17, false, detailed), vane, [0, 0, 0], 'flight-feather');
      }
      const rows = detailed ? 3 : 1, coverts = detailed ? 10 : 6;
      for (let row = 0; row < rows; row++) for (let i = 0; i < coverts; i++) {
        const u = (i + .5) / coverts, x = width * u;
        const [front, rear] = wingEdges((traversed + x) / total, id);
        const start = row * .16 + .02, end = start + .29;
        const startZ = L * (front * (1 - start) + rear * start);
        const endZ = L * (front * (1 - end) + rear * end);
        add(parent, feather([side * x, L * (.047 - row * .001), startZ], [side * x, L * (.043 - row * .001), endZ], width / coverts * 1.75, spec.colors[joint === 2 ? 1 : 0], i + row * 13, false, detailed), vane, [0, 0, 0], 'covert-feather');
      }
      if (pigeon && joint < 2) for (const chord of [.35, .65]) add(parent, pigeonBar(traversed, width, total, side, L, chord), dark, [0, 0, 0], 'wing-bar');
      traversed += width;
    });
  }
  const tail = new Group(); tail.name = 'tail'; tail.position.set(0, -L * .015, -L * .18); root.add(tail);
  const tailCount = kite ? 12 : 10;
  for (let i = 0; i < tailCount; i++) {
    const u = i / (tailCount - 1) * 2 - 1;
    const end = kite ? -.25 - Math.abs(u) * .095 : -.29 + Math.abs(u) * .035;
    add(tail, feather([u * L * .025, 0, 0], [u * L * (kite ? .17 : .135), 0, L * end], L * .055, spec.colors[1], i, pigeon, detailed), vane, [0, 0, 0], 'tail-feather');
  }
  // Fine contour variation is baked into torso vertex colours, keeping close-up plumage
  // legible without hundreds of floating scales or an external texture download.
  const feet = surface(pigeon ? 0x9e594c : kite ? 0x9b8450 : 0x373536, .7, .75);
  for (const side of [-1, 1]) {
    const leg = add(root, new CylinderGeometry(L * .007, L * .009, L * .11, 10), feet, [side * L * .043, -L * .095, -L * .11], 'tucked-leg');
    leg.rotation.x = -.7;
    for (let toe = -1; toe <= 1; toe++) {
      const claw = add(root, new SphereGeometry(1, 10, 6), feet, [side * L * .043 + toe * L * .012, -L * .132, -L * .155], 'tucked-toe');
      claw.scale.set(L * .005, L * .006, L * .045); claw.rotation.y = toe * .2;
    }
  }
  root.updateMatrixWorld(true);
  const size = new Box3().setFromObject(root).getSize(new Vector3());
  root.scale.set(spec.span / size.x, 1, spec.length / size.z);
  return {root, rig: {props: [], wings, elbows, wrists, tail}};
}
