import { AIRFRAMES } from './airframes';
import { BIRDS } from './birds';
import type { FlightModelId, Vec3 } from './flightTypes';

export type RecognitionEntry = {
  id: FlightModelId;
  name: string;
  family: 'Bird' | 'Multirotor' | 'Fixed-wing';
  subtitle: string;
  description: string;
  cues: string[];
  motion: string;
  landmarks: {label: string; position: Vec3}[];
  span: number;
  published: {label: string; value: string}[];
  source: string;
  sourceLabel: string;
  note: string;
};

const birdDescriptions = {
  'black-kite': {
    subtitle: 'Milvus migrans · Raptor',
    description: 'A broad-winged raptor with dark brown plumage, separated outer primaries and a shallow fork in the tail.',
    cues: ['Fingered outer wing feathers', 'Shallow forked tail', 'Brown mantle and a lighter head'],
    motion: 'In this simulation: slow flapping bursts alternate with extended glides and banking turns.',
    labels: ['Fingered primaries', 'Forked tail', 'Hooked bill'],
  },
  'house-crow': {
    subtitle: 'Corvus splendens · Corvid',
    description: 'A slender crow with a dark head and wings, a grey neck and breast, and a prominent bill.',
    cues: ['Grey neck and breast', 'Black head, wings and tail', 'Long, substantial bill'],
    motion: 'In this simulation: regular wingbeats, short glides and articulated turns.',
    labels: ['Grey collar', 'Fan-shaped tail', 'Long bill'],
  },
  'rock-pigeon': {
    subtitle: 'Columba livia · Pigeon',
    description: 'The model represents the common blue-grey form: a rounded breast, iridescent neck and dark wing bars. Real plumage varies.',
    cues: ['Two dark bars across each wing', 'Green-purple neck sheen', 'Broad dark band near the tail tip'],
    motion: 'In this simulation: faster wingbeats with a compact body and pointed outer wings.',
    labels: ['Iridescent neck', 'Banded tail', 'Pale bill cere'],
  },
} as const;

const droneCues: Record<string, string[]> = {
  'mavic-3': ['Four folding arms', 'Compact graphite fuselage', 'Suspended camera beneath the nose'],
  'mini-4-pro': ['Small grey folding body', 'Front obstacle-sensor pair', 'Short landing feet'],
  'phantom-4-pro': ['White body and four rigid arms', 'Twin landing skids', 'Underslung gimbal camera'],
  'matrice-350-rtk': ['Large enterprise frame', 'Tall landing gear', 'Top antenna assembly and downward gimbal'],
  'typhoon-h480': ['Six arms and six rotors', 'Dark central body', 'Tall landing skids'],
  'rc-cessna': ['Rigid wings and vertical tail', 'Nose propeller', 'Ailerons, elevator and rudder'],
};

export const RECOGNITION_LIBRARY: RecognitionEntry[] = [
  ...Object.values(BIRDS).map(b => {
    const text = birdDescriptions[b.id];
    return {
      id: b.id, name: b.name.split(' (')[0], family: 'Bird' as const,
      subtitle: text.subtitle, description: text.description, cues: [...text.cues], motion: text.motion,
      landmarks: [
        {label: text.labels[0], position: (b.id === 'black-kite' ? [b.span * .38, .02, -.025] : [0, b.length * .14, b.length * .24]) as Vec3},
        {label: text.labels[1], position: [0, 0, -b.length * .39] as Vec3},
        {label: text.labels[2], position: [0, b.length * .09, b.length * .44] as Vec3},
      ],
      span: b.span, published: b.published, source: b.source, sourceLabel: 'Species reference',
      note: b.id === 'house-crow'
        ? 'Original reference-inspired geometry. The 0.85 m modelled wingspan and internal proportions are estimates; the published reference gives body length.'
        : 'Original reference-inspired geometry. Internal proportions and feather detail are illustrative; this is not a scanned specimen.',
    };
  }),
  ...Object.values(AIRFRAMES).map(a => ({
    id: a.id, name: a.name, family: a.fixedWing ? 'Fixed-wing' as const : 'Multirotor' as const,
    subtitle: a.role,
    description: a.fixedWing
      ? 'An original electric trainer-style aircraft based on the project’s PX4 simulation reference. This is an estimated airframe, not a commercial product replica.'
      : `Study the ${a.name} reference model from any angle: its silhouette, rotor layout, landing gear and camera arrangement.`,
    cues: droneCues[a.id],
    motion: a.fixedWing
      ? 'In this simulation: a forward propeller and movable control surfaces; sustained flight needs airspeed.'
      : 'In this simulation: independent rotor joints, a rigid body and no wingbeat; multirotors can hover.',
    landmarks: a.fixedWing ? [
      {label: 'Nose propeller', position: [0, 0, .69] as Vec3},
      {label: 'Aileron', position: [.7, .05, -.16] as Vec3},
      {label: 'Tail surfaces', position: [0, .12, -.54] as Vec3},
    ] : [
      {label: 'Motor and propeller', position: a.motors[0] as Vec3},
      {label: 'Camera gimbal', position: [0, -a.body.height / 2, a.body.z + a.body.length * .35] as Vec3},
      {label: 'Battery housing', position: [0, a.body.height / 2, a.body.z - a.body.length * .12] as Vec3},
    ],
    span: a.span, published: a.published, source: a.source, sourceLabel: a.fixedWing ? 'Simulation reference' : 'Manufacturer reference',
    note: a.fixedWing
      ? 'Reference mass is published for the simulation model. Geometry, wingspan and aerodynamic coefficients are estimates.'
      : 'Original procedural model guided by published dimensions. Surface detail, internal proportions and sensor appearance are approximations; not manufacturer CAD.',
  })),
];

export const recognitionEntry = (id: FlightModelId) => RECOGNITION_LIBRARY.find(entry => entry.id === id)!;

/** Comparable envelopes in model metres, never a normalized visual size. */
export function comparisonLayout(ids: FlightModelId[]) {
  const entries = ids.map(recognitionEntry);
  if (entries.length === 1) return {positions: [0], width: entries[0].span * 1.5};
  const gap = Math.max(...entries.map(entry => entry.span)) * .3;
  const width = entries[0].span + entries[1].span + gap;
  return {positions: [-(entries[1].span + gap) / 2, (entries[0].span + gap) / 2], width};
}
