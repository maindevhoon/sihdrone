import { categories, exercises, type Category, type Session } from './simulation';
import { THEATRES, theatreById } from './theatres';

// Training analytics computed from the stored session history. Pure functions, no storage.
export type Answer = Category | 'None';
export type ReadinessLevel = 'Not started' | 'In training' | 'Proficient' | 'Ready';
export type Criterion = { label: string; met: boolean; detail: string };

const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0)/values.length : null;
export const isCorrect = (s: Session) => s.classificationScore > 0;
/** Seconds from contact arrival to a valid observation, or null when no valid observation was made. */
export function responseTime(s: Session) {
  return s.observationValid && s.detection !== null ? s.detection - s.scenario.arrival : null;
}
const times = (sessions: Session[]) => sessions.map(responseTime).filter((v): v is number => v !== null);
const chronological = (history: Session[]) => [...history].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

export function summarize(history: Session[]) {
  const ordered = chronological(history);
  const confusion = Object.fromEntries(categories.map(actual => [actual, Object.fromEntries([...categories, 'None'].map(answer => [answer, 0]))])) as Record<Category, Record<Answer, number>>;
  for (const s of history) confusion[s.scenario.category][s.answer || 'None']++;
  const byCategory = categories.map(category => {
    const sessions = history.filter(s => s.scenario.category === category);
    return { category, sessions: sessions.length, accuracy: sessions.length ? sessions.filter(isCorrect).length/sessions.length : null, meanResponse: mean(times(sessions)) };
  });
  const byCondition = (['guided', 'challenge'] as const).flatMap(difficulty => [false, true].map(dusk => {
    const sessions = history.filter(s => s.scenario.difficulty === difficulty && s.scenario.dusk === dusk);
    return { difficulty, dusk, sessions: sessions.length, meanScore: mean(sessions.map(s => s.score)), accuracy: sessions.length ? sessions.filter(isCorrect).length/sessions.length : null };
  }));
  // Sessions saved before theatres were recorded are grouped as 'Not recorded'.
  const byTheatre = THEATRES.map(t => ({ id: t.id as string, name: t.kind === 'synthetic' ? 'Training district' : t.name, list: history.filter(s => s.theatre === t.id) }))
    .concat([{ id: 'unrecorded', name: 'Not recorded', list: history.filter(s => !s.theatre) }])
    .filter(row => row.list.length)
    .map(({ id, name, list }) => ({ id, name, sessions: list.length, meanScore: mean(list.map(s => s.score)), accuracy: list.filter(isCorrect).length/list.length }));
  const recent = ordered.slice(-5), recentMean = mean(recent.map(s => s.score));
  const correctPerCategory = categories.map(category => history.filter(s => s.scenario.category === category && isCorrect(s)).length);
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
    accuracy: history.length ? history.filter(isCorrect).length/history.length : null,
    observationRate: history.length ? history.filter(s => s.observationValid).length/history.length : null,
    meanResponse: mean(times(history)),
    trend: ordered.map(s => ({ id: s.id, createdAt: s.createdAt, score: s.score, category: s.scenario.category, correct: isCorrect(s) })),
    confusion, byCategory, byCondition, byTheatre, readiness: { level, criteria, met },
  };
}
export type Summary = ReturnType<typeof summarize>;

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
/** One row per session, oldest first, for instructors' spreadsheets. */
export function historyCsv(history: Session[]) {
  const header = ['Date (UTC)', 'Theatre', 'Exercise', 'Difficulty', 'Lighting', 'Seed', 'Scenario version', 'Present', 'Answer', 'Time to observe (s)', 'Observation points', 'Classification points', 'Score'];
  const rows = chronological(history).map(s => {
    const response = responseTime(s);
    return [s.createdAt, s.theatre ? theatreById(s.theatre).name : '', exercises.find(e => e.id === s.scenario.exercise)?.short ?? s.scenario.exercise, s.scenario.difficulty, s.scenario.dusk ? 'Dusk' : 'Day', s.scenario.seed, s.scenario.version,
      s.scenario.category, s.answer || 'None', response === null ? '' : response.toFixed(2), s.detectionScore, s.classificationScore, s.score];
  });
  return [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
}
