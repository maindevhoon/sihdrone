import { assessmentRows } from './analytics';
import type { Session } from './simulation';

export type DecisionOutcome = 'missed' | 'unclassified' | 'incorrect' | 'correct';
export type ReplayCheckpoint = {track: number; time: number; sequence: number};

/** Derived review evidence only; never changes the session or its scoring. */
export function decisionRows(session: Session) {
  return assessmentRows(session).map(row => {
    const outcome: DecisionOutcome = !row.observationValid ? 'missed'
      : !row.answer ? 'unclassified'
      : row.classificationScore > 0 ? 'correct' : 'incorrect';
    const lastClassification = session.events.filter(event => event.type === 'classification'
      && (session.version === 1 || event.trackId === row.id)
      && event.time <= session.duration).at(-1);
    const replayTime = Math.max(0, Math.min(session.duration,
      lastClassification?.time ?? row.detection ?? session.scenario.arrival));
    return {...row, outcome, replayTime, canReplayContact: session.duration >= session.scenario.arrival};
  });
}
