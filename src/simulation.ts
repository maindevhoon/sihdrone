import { contactCategory } from './contactCategory';
import type { Environment } from './environment';
import { theatreById, type TheatreId } from './theatres';
import type { FlightDefinition, FlightModelId, TerrainSnapshot, WindPreset } from './flightTypes';
import { createFlightDefinition } from './flightScenario';
import { flatTerrain } from './flightTerrain';
import { sampleFlight } from './flightRuntime';
export type Category = 'Single drone' | 'Drone group' | 'Bird';
export type Difficulty = 'guided' | 'challenge';
export type ExerciseId = 'skyline' | 'passing' | 'mixed';
export type CameraView = 'overview' | 'rooftop' | 'street';
export type Position = [number, number, number];
export type FlightPattern = 'orbit' | 'crossing' | 'figure-eight' | 'weave' | 'approach';
export type ScenarioVersion = 1 | 2 | 3 | 4;
export type Scenario = Environment & { flight?: FlightDefinition; birdFlight?: FlightDefinition; version: ScenarioVersion; pattern?: FlightPattern; heading?: number; spread?: number; radius?: number; phase?: number; exercise: ExerciseId; seed: number; difficulty: Difficulty; dusk: boolean; duration: number; category: Category; count: number; arrival: number; speed: number; altitude: number; shift: number };
export type TrackDecision = { id: number; detection: number | null; answer: Category | '' };
export type SessionEvent = { time: number; type: 'start' | 'observation' | 'classification' | 'pause' | 'resume' | 'finish'; label: string; trackId?: number; answer?: Category };
export type Session = { version: 1 | 2; id: string; createdAt: string; scenario: Scenario; duration: number; detection: number | null; answer: Category | ''; score: number; detectionScore: number; classificationScore: number; observationValid: boolean; events: SessionEvent[]; tracks?: TrackDecision[];
  /** Theatre the exercise was flown in; absent on results saved before it was recorded. */
  theatre?: TheatreId };
export const categories: Category[] = ['Single drone', 'Drone group', 'Bird'];
export const exercises: { id: ExerciseId; title: string; description: string; short: string }[] = [
  { id: 'skyline', title: 'Eyes on the horizon', description: 'Observe the Delhi skyline. Identify the aerial objects as they enter the district.', short: 'Skyline watch' },
  { id: 'passing', title: 'A passing silhouette', description: 'A brief movement above the rooftops. Practice noticing and identifying a single aerial contact.', short: 'Passing contact' },
  { id: 'mixed', title: 'Expect the unexpected', description: 'Birds and drones share the airspace. Inspect each radar track and classify it independently.', short: 'Mixed recognition' },
];
export function seededRandom(seed: number) { let state = seed >>> 0; return () => {state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296;}; }
export function createScenario(exercise: ExerciseId, seed: number, difficulty: Difficulty, dusk: boolean, version: ScenarioVersion = 2, environment: Environment = {}, flightOptions: {terrain?: TerrainSnapshot; wind?: WindPreset; model?: FlightModelId} = {}): Scenario {
  if (environment.lighting !== undefined) dusk = environment.lighting === 'dusk';
  const conditions: Environment = {};
  if (environment.lighting !== undefined) conditions.lighting = environment.lighting;
  if (environment.fog !== undefined) conditions.fog = environment.fog;
  if (version === 4) {
    const base = createScenario(exercise, seed, difficulty, dusk, 3, environment);
    const terrain = flightOptions.terrain ?? flatTerrain(theatreById('district'));
    return {...base, version: 4, flight: createFlightDefinition(seed, base.category, terrain, flightOptions.wind, flightOptions.model),
      ...(exercise === 'mixed' ? {birdFlight: createFlightDefinition((seed ^ 0x3c6ef372) >>> 0, 'Bird', terrain, flightOptions.wind)} : {})};
  }
  if (version === 3) {
    const base = createScenario(exercise, seed, difficulty, dusk, 2, environment);
    // Separate random stream leaves the numbered seeds and older generators unchanged.
    const drones = 1 + Math.floor(seededRandom((seed ^ 0x7e31a4b9) >>> 0)() * 3);
    return {...base, version: 3, ...(exercise === 'mixed' ? {category: drones === 1 ? 'Single drone' as const : 'Drone group' as const, count: drones + 2} : {})};
  }
  const random = seededRandom(seed);
  const category: Category = exercise === 'skyline' ? 'Drone group' : exercise === 'passing' ? 'Single drone' : categories[Math.floor(random()*categories.length)];
  const legacy:Scenario = { ...conditions, version: 1, exercise, seed: seed >>> 0, difficulty, dusk, duration: 45, category,
    count: category === 'Drone group' ? 3 + Math.floor(random()*2) : category === 'Bird' ? 2 : 1,
    arrival: difficulty === 'challenge' ? 5 + random()*2 : 2 + random(),
    speed: (difficulty === 'challenge' ? 1.25 : .8) + random()*.15,
    altitude: (difficulty === 'challenge' ? 18 : 14) + random()*2,
    shift: random()*5 - 2.5,
  };
  if(version===1)return legacy;
  const patterns:FlightPattern[]=['orbit','crossing','figure-eight','weave','approach'];
  const modern: Scenario = {...legacy, version:2, pattern:patterns[Math.floor(random()*patterns.length)],heading:random()*Math.PI*2,spread:1.8+random()*2.8,radius:12+random()*9,phase:random()*Math.PI*2,
    count:category==='Drone group'?3+Math.floor(random()*3):category==='Bird'?2+Math.floor(random()*3):1,
    speed:(difficulty==='challenge'?1.15:.65)+random()*.65,altitude:(difficulty==='challenge'?21:17)+random()*6,shift:random()*8-4};
  return modern;
}
export function contactPosition(scenario: Scenario, time: number, index: number): Position {
  if (scenario.version === 4) return sampleFlight(scenario, time, index).position;
  if (scenario.version === 3) {
    const drones = scenario.exercise === 'mixed' ? scenario.count - 2 : scenario.count;
    const bird = scenario.exercise === 'mixed' && index >= drones;
    const route: Scenario = {...scenario, version: 2, category: contactCategory(scenario, index), count: bird ? 2 : drones,
      heading: (scenario.heading ?? 0) + (bird ? 1.9 : 0), phase: (scenario.phase ?? 0) + (bird ? 2.1 : 0),
      altitude: scenario.altitude + (bird ? 4 : 0), speed: scenario.speed * (bird ? 1.2 : 1)};
    return contactPosition(route, time, bird ? index - drones : index);
  }
  const t = Math.max(0, time - scenario.arrival) * scenario.speed;
  const offset = index - (scenario.count - 1)/2;
  const bird = scenario.category === 'Bird';
  if(scenario.version===2){
    const angle=t*.11+(scenario.phase??0),radius=scenario.radius??16;
    let x=0,z=0;
    switch(scenario.pattern){
      case 'crossing': x=Math.sin(angle*.55)*radius;z=Math.cos(angle*.55)*3;break;
      case 'figure-eight': x=Math.sin(angle)*radius;z=Math.sin(angle*2)*radius*.45;break;
      case 'weave': x=Math.sin(angle*.7)*radius;z=Math.cos(angle*2.2)*5;break;
      case 'approach': x=Math.sin(angle)*4;z=Math.cos(angle*.7)*radius*.7;break;
      default: x=Math.sin(angle)*radius;z=Math.cos(angle)*radius*.55;
    }
    const h=scenario.heading??0,spread=scenario.spread??2.6;
    return [x*Math.cos(h)-z*Math.sin(h)+offset*spread,
      scenario.altitude+Math.sin(t*(bird?1.1:.4)+index)*(bird?1.2:.7)+offset*.45,
      -12+x*Math.sin(h)+z*Math.cos(h)+offset*spread*.4];
  }
  return [Math.sin(t*.115 + scenario.shift*.08)*12 + offset*(bird ? 3.2 : 2.6),
    scenario.altitude + Math.sin(t*(bird ? 1.1 : .65) + index)* (bird ? 1.2 : .3) + offset*.45,
    -8 + Math.cos(t*.1)*5 + offset*1.3];
}
export { contactCategory } from './contactCategory';
export const emptyTrackDecisions = (scenario: Scenario): TrackDecision[] => Array.from({length: scenario.count}, (_, id) => ({id, detection: null, answer: ''}));
export const trackLabel = (id: number) => `T${(id + 1).toString().padStart(2, '0')}`;

/** Every generated track has equal weight. Missed and unclassified tracks stay in the denominator. */
export function scoreTracks(scenario: Scenario, tracks: TrackDecision[], duration: number) {
  const results = emptyTrackDecisions(scenario).map(track => {
    const decision = tracks.find(item => item.id === track.id) ?? track;
    return scoreSession({...scenario, category: contactCategory(scenario, track.id)}, decision.detection, decision.answer, duration);
  });
  const detectionScore = Math.round(results.reduce((sum, result) => sum + result.detectionScore, 0) / scenario.count);
  const classificationScore = Math.round(results.reduce((sum, result) => sum + result.classificationScore, 0) / scenario.count);
  return {score: detectionScore + classificationScore, detectionScore, classificationScore, observationValid: results.some(result => result.observationValid)};
}

/** Reconstruct decisions at a replay time, including corrections rather than just the final answer. */
export function decisionsAt(session: Session, time: number): TrackDecision[] {
  const tracks = emptyTrackDecisions(session.scenario);
  for (const event of session.events) {
    if (event.time > time || event.trackId === undefined) continue;
    const track = tracks[event.trackId];
    if (!track) continue;
    if (event.type === 'observation' && track.detection === null) track.detection = event.time;
    if (event.type === 'classification' && event.answer && track.detection !== null) track.answer = event.answer;
  }
  return tracks;
}
export function visibleContacts(scenario: Scenario, time: number): { id: number; position: Position }[] {
  if (time < scenario.arrival) return [];
  return Array.from({length: scenario.count},(_,id)=>({id,position:contactPosition(scenario,time,id)}));
}
export function scoreSession(scenario: Scenario, detection: number | null, answer: Category | '', duration: number) {
  const observationValid = detection !== null && Number.isFinite(detection) && detection >= scenario.arrival && detection <= duration;
  const responseTime = observationValid ? detection! - scenario.arrival : null;
  const detectionScore = responseTime === null ? 0 : Math.max(5, 40 - Math.floor(responseTime*1.2));
  const classificationScore = observationValid && answer === scenario.category ? 60 : 0;
  return {score:detectionScore+classificationScore,detectionScore,classificationScore,observationValid};
}
export const formatTime = (time: number) => `${Math.floor(time/60).toString().padStart(2,'0')}:${Math.floor(time%60).toString().padStart(2,'0')}`;
export function recommendation(session: Session) {
  if (session.version === 2 && session.tracks) {
    const missed = session.tracks.filter(track => track.detection === null).length;
    const wrong = session.tracks.filter(track => track.detection !== null && track.answer !== contactCategory(session.scenario, track.id)).length;
    if (missed) return `${missed} track(s) were not observed. Repeat this variation and scan every radar return before classifying.`;
    if (wrong) return `${wrong} observed track(s) need another look. Compare each silhouette and movement in EO/IR before classifying.`;
    return session.detectionScore < 25 ? 'All tracks were identified. Repeat this variation to practise observing each track sooner.' : 'All tracks were identified. Try a new variation or challenge mode.';
  }
  if (!session.observationValid) return 'Let the objects enter the district before recording an observation. Try skyline watch in guided mode.';
  if (session.answer !== session.scenario.category) return `The encounter was ${session.scenario.category.toLowerCase()}. Repeat this variation and compare the silhouette and movement before choosing a category.`;
  if (session.detectionScore < 25) return 'Your classification was correct. Repeat the variation and practice noticing the objects sooner after they enter the scene.';
  return session.scenario.difficulty === 'guided' ? 'Try challenge mode: faster motion, more distant objects, and denser urban haze.' : 'Try a new mixed-recognition variation to practice without knowing which category will appear.';
}
