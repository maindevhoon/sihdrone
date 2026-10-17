import { categories, createScenario, decisionsAt, scoreSession, scoreTracks, type Session, type SessionEvent } from './simulation';
import { THEATRES } from './theatres';
export const STORAGE_KEY = 'aeron-sessions-v1';
const eventTypes = ['start','observation','classification','pause','resume','finish'];
function validEvent(value: unknown): value is SessionEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as SessionEvent;
  return Number.isFinite(event.time) && event.time >= 0 && event.time <= 45 && eventTypes.includes(event.type) && typeof event.label === 'string';
}
function validSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const s = value as Session;
  const c = s.scenario;
  if ((s.version !== 1 && s.version !== 2) || typeof s.id !== 'string' || typeof s.createdAt !== 'string' || !Number.isFinite(Date.parse(s.createdAt)) || !c || !['skyline','passing','mixed'].includes(c.exercise) || !['guided','challenge'].includes(c.difficulty) || !Number.isInteger(c.seed) || c.seed < 0 || typeof c.dusk !== 'boolean' || !Number.isFinite(s.duration) || s.duration < 0 || s.duration > 45 || !(s.detection === null || Number.isFinite(s.detection)) || !['','Single drone','Drone group','Bird'].includes(s.answer) || !Array.isArray(s.events) || !s.events.every(validEvent)) return false;
  if(c.version!==1&&c.version!==2&&c.version!==3)return false;
  if((s.version===2)!==(c.version===3))return false;
  // Optional and additive: older results without a theatre stay valid; unknown ids are rejected.
  if(s.theatre!==undefined&&!THEATRES.some(t=>t.id===s.theatre))return false;
  const expected = createScenario(c.exercise,c.seed,c.difficulty,c.dusk,c.version);
  if (!Object.entries(expected).every(([key,value])=>c[key as keyof typeof c]===value)) return false;
  if(s.version===2){
    if(!Array.isArray(s.tracks)||s.tracks.length!==c.count||s.answer!=='')return false;
    for(let id=0;id<c.count;id++){
      const track=s.tracks[id];
      if(!track||track.id!==id||!['',...categories].includes(track.answer))return false;
      if(track.detection===null){if(track.answer!=='')return false;}
      else if(!Number.isFinite(track.detection)||track.detection<c.arrival||track.detection>s.duration)return false;
    }
    const first=s.tracks.reduce<number|null>((value,track)=>track.detection===null?value:value===null?track.detection:Math.min(value,track.detection),null);
    if(s.detection!==first)return false;
    let previous=0;
    for(const event of s.events){
      if(event.time<previous||event.time>s.duration)return false;
      previous=event.time;
      if(event.type==='observation'||event.type==='classification'){
        if(!Number.isInteger(event.trackId)||event.trackId!<0||event.trackId!>=c.count||event.time<c.arrival)return false;
        if(event.type==='classification'&&(!categories.includes(event.answer!)||!s.events.some(observation=>observation.type==='observation'&&observation.trackId===event.trackId&&observation.time<=event.time)))return false;
      }
    }
    const reconstructed=decisionsAt(s,s.duration);
    if(!s.tracks.every((track,id)=>track.detection===reconstructed[id].detection&&track.answer===reconstructed[id].answer))return false;
  }else if(s.tracks!==undefined)return false;
  const scored=s.version===2?scoreTracks(c,s.tracks!,s.duration):scoreSession(c,s.detection,s.answer,s.duration);
  return scored.score === s.score && scored.detectionScore === s.detectionScore && scored.classificationScore === s.classificationScore && scored.observationValid === s.observationValid;
}
export function readSessions(): Session[] {
  try {const raw:unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');return Array.isArray(raw) ? raw.filter(validSession).slice(0,20) : [];} catch {return [];}
}
export function saveSessions(sessions: Session[]) {try {localStorage.setItem(STORAGE_KEY,JSON.stringify(sessions.slice(0,20)));return true;}catch{return false;}}
// Trainee identity for printed reports and exports. Stored separately so the session schema is unchanged.
export type Profile = { name: string; unit: string };
export const PROFILE_KEY = 'aeron-profile-v1';
const clean = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 60) : '';
export function readProfile(): Profile {
  try {const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') as Partial<Profile> | null;return {name: clean(raw?.name), unit: clean(raw?.unit)};} catch {return {name: '', unit: ''};}
}
export function saveProfile(profile: Profile) {try {localStorage.setItem(PROFILE_KEY, JSON.stringify({name: clean(profile.name), unit: clean(profile.unit)}));return true;} catch {return false;}}
