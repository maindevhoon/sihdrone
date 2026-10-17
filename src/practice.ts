import { assessmentRows } from './analytics';
import { categories, type Category, type Difficulty, type ExerciseId, type Session } from './simulation';
import { VARIATION_SEEDS } from './variations';

export type PracticePlan = {
  focus: Category | 'Baseline' | 'Challenge';
  exercise: ExerciseId;
  difficulty: Difficulty;
  dusk: boolean;
  seed: number;
  reason: string;
  evidence: string;
};

/** Explainable practice selection. Uses only recorded decisions, never a learned capability claim. */
export function planPractice(history: Session[], currentSeed?: number): PracticePlan {
  const used = new Set(history.map(session => session.scenario.seed));
  if (currentSeed !== undefined) used.add(currentSeed);
  const seed = VARIATION_SEEDS.find(value => !used.has(value)) ?? VARIATION_SEEDS.find(value => value !== currentSeed)!;
  const rows = history.flatMap(session => assessmentRows(session).map(row => ({...row, dusk: session.scenario.dusk})));
  const base = {seed, exercise: 'mixed' as ExerciseId, difficulty: 'guided' as Difficulty, dusk: false};
  if (!rows.length) return {...base, focus: 'Baseline', reason: 'Start with a guided mixed encounter to establish a baseline.', evidence: 'No saved decisions yet. This is a practice suggestion, not a proficiency assessment.'};

  const performance = categories.map(category => {
    const items = rows.filter(row => row.category === category);
    const errors = items.filter(row => row.classificationScore === 0);
    return {category, items, errors, rate: items.length ? errors.length / items.length : 0};
  });
  const weakest = [...performance].sort((a, b) => b.rate - a.rate || b.errors.length - a.errors.length)[0];
  const unpractised = performance.find(item => !item.items.length);
  const target = weakest.errors.length ? weakest : unpractised;
  if (!target) return {...base, focus: 'Challenge', difficulty: 'challenge',
    reason: 'Every recorded category has been identified correctly. Try a fresh mixed encounter in challenge mode.',
    evidence: `${rows.length} recorded decisions across all three categories. Faster, hazier practice tests transfer to a new variation; it does not establish operational readiness.`};

  const duskErrors = target.errors.filter(row => row.dusk).length;
  const dayErrors = target.errors.length - duskErrors;
  const missed = target.items.filter(row => !row.observationValid).length;
  const exercise: ExerciseId = target.category === 'Single drone' ? 'passing' : target.category === 'Drone group' ? 'skyline' : 'mixed';
  return {...base, focus: target.category, exercise, dusk: duskErrors > dayErrors,
    reason: target.items.length
      ? `${target.category}: ${target.errors.length} of ${target.items.length} recorded decisions were missed, unclassified or incorrect. ${missed ? 'Practise observing every track before identifying it.' : 'Compare silhouette and motion before choosing a category.'}`
      : `No recorded decisions for ${target.category.toLowerCase()} yet. Broaden your practice with a fresh encounter.`,
    evidence: `${target.items.length} decisions from ${history.length} saved session(s); ${missed} missed observations. ${target.items.length < 5 ? 'Limited evidence: this suggestion can change quickly with more practice.' : 'Based on browser-local history, not a validated ability estimate.'}`};
}
