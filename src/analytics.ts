import { categories, contactCategory, exercises, scoreSession, trackLabel, type Category, type Session } from './simulation';
import { THEATRES, theatreById } from './theatres';

// Training analytics computed from the stored session history. Pure functions, no storage.
export type Answer = Category | 'None';
export type ReadinessLevel = 'Not started' | 'In training' | 'Proficient' | 'Ready';
export type Criterion = { label: string; met: boolean; detail: string };

const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0)/values.length : null;
export const isCorrect = (s: Session) => s.version === 2 ? s.classificationScore === 60 : s.classificationScore > 0;
/** Legacy records represent one encounter; new records contribute one decision per track. */
export function assessmentRows(session: Session) {
  const decisions = session.version === 2 ? session.tracks ?? [] : [{id: 0, detection: session.detection, answer: session.answer}];
  return decisions.map(track => {
    const category = session.version === 2 ? contactCategory(session.scenario, track.id) : session.scenario.category;
    const scored = scoreSession({...session.scenario, category}, track.detection, track.answer, session.duration);
    return {...track, category, ...scored, response: scored.observationValid ? track.detection! - session.scenario.arrival : null};
  });
}
const identificationRate = (sessions: Session[]) => {
  const rows = sessions.flatMap(assessmentRows);
  return rows.length ? rows.filter(row => row.classificationScore > 0).length / rows.length : null;
};
/** Seconds from contact arrival to a valid observation, or null when no valid observation was made. */
export function responseTime(s: Session) {
  return mean(assessmentRows(s).map(row=>row.response).filter((value):value is number=>value!==null));
}
const times = (sessions: Session[]) => sessions.flatMap(assessmentRows).map(row=>row.response).filter((v): v is number => v !== null);
const chronological = (history: Session[]) => [...history].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

export function summarize(history: Session[]) {
  const ordered = chronological(history);
  const confusion = Object.fromEntries(categories.map(actual => [actual, Object.fromEntries([...categories, 'None'].map(answer => [answer, 0]))])) as Record<Category, Record<Answer, number>>;
  const rows=history.flatMap(assessmentRows);
  for (const row of rows) confusion[row.category][row.answer || 'None']++;
  const byCategory = categories.map(category => {
    const items = rows.filter(row => row.category === category);
    return { category, sessions: items.length, accuracy: items.length ? items.filter(row=>row.classificationScore>0).length/items.length : null, meanResponse: mean(items.map(row=>row.response).filter((value):value is number=>value!==null)) };
  });
  const byCondition = (['guided', 'challenge'] as const).flatMap(difficulty => [false, true].map(dusk => {
    const sessions = history.filter(s => s.scenario.difficulty === difficulty && s.scenario.dusk === dusk);
    return { difficulty, dusk, sessions: sessions.length, meanScore: mean(sessions.map(s => s.score)), accuracy: identificationRate(sessions) };
  }));
  // Sessions saved before theatres were recorded are grouped as 'Not recorded'.
  const byTheatre = THEATRES.map(t => ({ id: t.id as string, name: t.kind === 'synthetic' ? 'Training district' : t.name, list: history.filter(s => s.theatre === t.id) }))
    .concat([{ id: 'unrecorded', name: 'Not recorded', list: history.filter(s => !s.theatre) }])
    .filter(row => row.list.length)
    .map(({ id, name, list }) => ({ id, name, sessions: list.length, meanScore: mean(list.map(s => s.score)), accuracy: identificationRate(list) ?? 0 }));
  const recent = ordered.slice(-5), recentMean = mean(recent.map(s => s.score));
  const correctPerCategory = categories.map(category => history.filter(s => assessmentRows(s).some(row=>row.category===category&&row.classificationScore>0)).length);
  const strongChallenge = history.filter(s => s.scenario.difficulty === 'challenge' && s.score >= 70).length;
  // Illustrative practice milestones, not an operational qualification standard.
  const criteria: Criterion[] = [
    { label: 'Eight or more completed sessions', met: history.length >= 8, detail: `${history.length} of 8` },
    { label: 'Average of 80+ over the last five sessions', met: recent.length >= 5 && (recentMean ?? 0) >= 80, detail: recentMean === null ? 'No sessions yet' : `${Math.round(recentMean)} over ${recent.length}` },
    { label: 'Each category identified correctly twice', met: correctPerCategory.every(n => n >= 2), detail: categories.map((c, i) => `${c}: ${correctPerCategory[i]}`).join(' · ') },
    { label: 'Three challenge-mode sessions scoring 70+', met: strongChallenge >= 3, detail: `${strongChallenge} of 3` },
    { label: 'A correct identification at dusk', met: history.some(s => s.scenario.dusk && isCorrect(s)), detail: history.some(s => s.scenario.dusk) ? 'Dusk practised' : 'No dusk sessions yet' },
  ];
  const met = criteria.filter(c => c.met).length;
  const level: ReadinessLevel = !history.length ? 'Not started' : met === criteria.length ? 'Ready' : met >= 3 ? 'Proficient' : 'In training';
  return {
    sessions: history.length,
    meanScore: mean(history.map(s => s.score)),
    bestScore: history.length ? Math.max(...history.map(s => s.score)) : null,
    accuracy: identificationRate(history),
    observationRate: rows.length ? rows.filter(row=>row.observationValid).length/rows.length : null,
    meanResponse: mean(times(history)),
    trend: ordered.map(s => ({ id: s.id, createdAt: s.createdAt, score: s.score, category: s.scenario.version===3&&s.scenario.exercise==='mixed'?'Birds + drones':s.scenario.category, correct: isCorrect(s) })),
    confusion, byCategory, byCondition, byTheatre, readiness: { level, criteria, met },
  };
}
export type Summary = ReturnType<typeof summarize>;

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
/** One row per track (or legacy encounter), oldest sessions first. */
export function historyCsv(history: Session[]) {
  const header = ['Date (UTC)', 'Theatre', 'Exercise', 'Difficulty', 'Lighting', 'Seed', 'Scenario version', 'Present', 'Answer', 'Time to observe (s)', 'Observation points', 'Classification points', 'Score', 'Track'];
  const rows = chronological(history).flatMap(s => assessmentRows(s).map(row => [
    s.createdAt, s.theatre ? theatreById(s.theatre).name : '', exercises.find(e => e.id === s.scenario.exercise)?.short ?? s.scenario.exercise,
    s.scenario.difficulty, s.scenario.dusk ? 'Dusk' : 'Day', s.scenario.seed, s.scenario.version,
    row.category, row.answer || 'None', row.response === null ? '' : row.response.toFixed(2),
    row.detectionScore, row.classificationScore, row.score, s.version===2?trackLabel(row.id):'Encounter',
  ]));
  return [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
}
