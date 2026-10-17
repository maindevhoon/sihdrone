import { BIRDS } from './birds';
import { flightForContact } from './contactFlight';
import type { Scenario } from './simulation';
import { contactCategory } from './contactCategory';
import { flightRandom as seededRandom } from './flightMath';

// Reference airframes built to manufacturers' published dimensions (metres; length along the nose,
// width across, height including landing gear). Only published figures are shown to trainees;
// internal proportions are modelled to match them.
export type AirframeId = 'mavic-3' | 'phantom-4-pro' | 'matrice-350-rtk' | 'mini-4-pro' | 'typhoon-h480' | 'rc-cessna';
export type Livery = 'graphite' | 'white' | 'grey';
type Vec3 = [number, number, number];
export type Airframe = {
  id: AirframeId; name: string; role: string; livery: Livery;
  /** Motor centres, front-left, front-right, rear-left, rear-right (+X is the aircraft's left). */
  motors: Vec3[]; motorRadius: number; propDiameter: number;
  fixedWing?: boolean;
  body: { length: number; width: number; height: number; z: number };
  gear: { type: 'feet' | 'skid'; depth: number; width: number; length: number };
  /** Height of a top-mounted antenna or RTK module above the fuselage. */
  mast: number;
  /** Published envelope the model must match; `withProps` says whether propellers are included. */
  envelope?: { length: number; width: number; height: number; withProps: boolean };
  /** Published motor-to-motor diagonal, where the manufacturer states one. */
  diagonal?: number;
  /** Tip-to-tip span including propellers, used for sensor framing. */
  span: number;
  /** Blade-pass fundamental in hover (Hz) and relative loudness; illustrative acoustic values. */
  bladePassHz: number; loudness: number;
  published: { label: string; value: string }[];
  source: string;
};

const quad = (front: [number, number], rear: [number, number], y: [number, number] = [0, 0]): Airframe['motors'] =>
  [[front[0], y[0], front[1]], [-front[0], y[0], front[1]], [rear[0], y[1], -rear[1]], [-rear[0], y[1], -rear[1]]];

export const AIRFRAMES: Record<AirframeId, Airframe> = {
  'typhoon-h480': {
    id:'typhoon-h480',name:'Yuneec Typhoon H480',role:'Six-rotor camera aircraft',livery:'graphite',
    motors:Array.from({length:6},(_,i)=>[Math.cos(i*Math.PI/3)*.24,.02,Math.sin(i*Math.PI/3)*.24] as Vec3),motorRadius:.023,propDiameter:.254,
    body:{length:.22,width:.15,height:.1,z:0},gear:{type:'skid',depth:.24,width:.265,length:.185},mast:.01,span:.734,
    bladePassHz:180,loudness:1.1,published:[{label:'Diagonal wheelbase',value:'480 mm'},{label:'Take-off weight',value:'1980 g'}],
    source:'https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/YUNTYH-Manual-EN.pdf',
  },
  'rc-cessna': {
    id:'rc-cessna',name:'PX4 electric fixed-wing reference',role:'Synthetic survey aircraft; estimated geometry',livery:'white',fixedWing:true,
    motors:[[0,0,.65]],motorRadius:.025,propDiameter:.28,body:{length:1.35,width:.14,height:.18,z:0},gear:{type:'feet',depth:.15,width:0,length:0},mast:0,span:1.8,
    bladePassHz:160,loudness:.75,published:[{label:'Reference body mass (simulation)',value:'1.5 kg'}],
    source:'https://github.com/PX4/PX4-gazebo-models/blob/main/models/rc_cessna/model.sdf',
  },
  'mavic-3': {
    id: 'mavic-3', name: 'DJI Mavic 3', role: 'Consumer folding quadcopter', livery: 'graphite',
    // Folding arms: the front pair sits wider and higher than the rear pair.
    motors: quad([.128, .136], [.105, .165], [.012, -.004]), motorRadius: .014, propDiameter: .239,
    body: { length: .2885, width: .095, height: .075, z: .024 }, gear: { type: 'feet', depth: .0702, width: 0, length: 0 }, mast: 0,
    envelope: { length: .3475, width: .283, height: .1077, withProps: false }, diagonal: .3801, span: .62,
    bladePassHz: 230, loudness: .9,
    published: [{ label: 'Size (unfolded, no props)', value: '347.5 × 283 × 107.7 mm' }, { label: 'Diagonal', value: '380.1 mm' }, { label: 'Take-off weight', value: '895 g' }],
    source: 'https://www.dji.com/support/product/mavic-3',
  },
  'phantom-4-pro': {
    id: 'phantom-4-pro', name: 'DJI Phantom 4 Pro V2.0', role: 'Consumer quadcopter', livery: 'white',
    motors: quad([.1237, .1237], [.1237, .1237], [.02, .02]), motorRadius: .017, propDiameter: .24,
    body: { length: .25, width: .2, height: .11, z: 0 }, gear: { type: 'skid', depth: .14, width: .17, length: .22 }, mast: 0,
    diagonal: .35, span: .59,
    bladePassHz: 210, loudness: 1,
    published: [{ label: 'Diagonal (no props)', value: '350 mm' }, { label: 'Weight', value: '1375 g' }],
    source: 'https://www.dji.com/support/product/phantom-4-pro-v2',
  },
  'matrice-350-rtk': {
    id: 'matrice-350-rtk', name: 'DJI Matrice 350 RTK', role: 'Enterprise quadcopter', livery: 'graphite',
    // 895 mm diagonal wheelbase with a longer fore-aft spacing; gear legs set the overall width.
    motors: quad([.2589, .365], [.2589, .365], [.03, .03]), motorRadius: .04, propDiameter: .533,
    body: { length: .35, width: .22, height: .13, z: 0 }, gear: { type: 'skid', depth: .295, width: .67, length: .5 }, mast: .07,
    envelope: { length: .81, width: .67, height: .43, withProps: false }, diagonal: .895, span: 1.43,
    bladePassHz: 110, loudness: 1.3,
    published: [{ label: 'Size (unfolded, no props)', value: '810 × 670 × 430 mm' }, { label: 'Diagonal wheelbase', value: '895 mm' }, { label: 'Weight (two batteries)', value: '6.47 kg' }, { label: 'Max take-off weight', value: '9.2 kg' }],
    source: 'https://enterprise.dji.com/matrice-350-rtk/specs',
  },
  'mini-4-pro': {
    id: 'mini-4-pro', name: 'DJI Mini 4 Pro', role: 'Sub-250 g consumer quadcopter', livery: 'grey',
    motors: quad([.1105, .073], [.1105, .073], [.006, .006]), motorRadius: .011, propDiameter: .152,
    body: { length: .148, width: .07, height: .06, z: 0 }, gear: { type: 'feet', depth: .071, width: 0, length: 0 }, mast: 0,
    envelope: { length: .298, width: .373, height: .101, withProps: true }, span: .42,
    bladePassHz: 330, loudness: .65,
    published: [{ label: 'Size (unfolded, with props)', value: '298 × 373 × 101 mm' }, { label: 'Take-off weight', value: '< 249 g' }],
    source: 'https://www.dji.com/mini-4-pro/specs',
  },
};
export const BLACK_KITE = {
  name: 'Black kite (Milvus migrans)', span: 1.5, length: .58,
  published: [{ label: 'Wingspan', value: '≈ 150 cm' }, { label: 'Length', value: '50–60 cm' }, { label: 'Weight', value: '≈ 735 g (average)' }],
};

const singles: AirframeId[] = ['mavic-3', 'phantom-4-pro', 'matrice-350-rtk', 'mini-4-pro'];
const groups: AirframeId[] = ['mavic-3', 'mini-4-pro', 'phantom-4-pro'];
/**
 * The airframe flown in a drone encounter. A pure function of the seed on its own random stream,
 * so scenario generation, saved sessions and replay are unaffected. Groups fly one type.
 */
export function airframeFor(scenario: Pick<Scenario, 'seed' | 'category'> & Partial<Pick<Scenario, 'version' | 'exercise' | 'count' | 'flight' | 'birdFlight'>>, index = 0): Airframe | null {
  const category = scenario.version && scenario.version >= 3 ? contactCategory(scenario as Scenario, index) : scenario.category;
  if (category === 'Bird') return null;
  if (scenario.flight) return AIRFRAMES[flightForContact(scenario as Scenario, index)!.model as AirframeId] ?? null;
  const pool = category === 'Drone group' ? groups : singles;
  return AIRFRAMES[pool[Math.floor(seededRandom((scenario.seed ^ 0x5bd1e995) >>> 0)()*pool.length)]];
}
/** Span of a contact for sensor framing and size estimates. */
export const birdFor = (scenario: Parameters<typeof airframeFor>[0], index = 0) => BIRDS[flightForContact(scenario as Scenario, index)?.model as keyof typeof BIRDS] ?? BIRDS['black-kite'];
export const contactSpan = (scenario: Parameters<typeof airframeFor>[0], index = 0) => airframeFor(scenario, index)?.span ?? birdFor(scenario, index).span;
