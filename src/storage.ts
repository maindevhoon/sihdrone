import { createScenario, scoreSession, type Session, type SessionEvent } from './simulation';
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
  if (s.version !== 1 || typeof s.id !== 'string' || typeof s.createdAt !== 'string' || !Number.isFinite(Date.parse(s.createdAt)) || !c || !['skyline','passing','mixed'].includes(c.exercise) || !['guided','challenge'].includes(c.difficulty) || !Number.isInteger(c.seed) || c.seed < 0 || typeof c.dusk !== 'boolean' || !Number.isFinite(s.duration) || s.duration < 0 || s.duration > 45 || !(s.detection === null || Number.isFinite(s.detection)) || !['','Single drone','Drone group','Bird'].includes(s.answer) || !Array.isArray(s.events) || !s.events.every(validEvent)) return false;
  if(c.version!==1&&c.version!==2)return false;
  const expected = createScenario(c.exercise,c.seed,c.difficulty,c.dusk,c.version);
  if (!Object.entries(expected).every(([key,value])=>c[key as keyof typeof c]===value)) return false;
  const scored=scoreSession(c,s.detection,s.answer,s.duration);
  return scored.score === s.score && scored.detectionScore === s.detectionScore && scored.classificationScore === s.classificationScore && scored.observationValid === s.observationValid;
}
export function readSessions(): Session[] {
  try {const raw:unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');return Array.isArray(raw) ? raw.filter(validSession).slice(0,20) : [];} catch {return [];}
}
export function saveSessions(sessions: Session[]) {try {localStorage.setItem(STORAGE_KEY,JSON.stringify(sessions.slice(0,20)));return true;}catch{return false;}}
