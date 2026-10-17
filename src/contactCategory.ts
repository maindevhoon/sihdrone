import type { Scenario, Category } from './simulation';

/** Ground truth is used by rendering/scoring only; radar identities use operator decisions. */
export function contactCategory(scenario: Pick<Scenario, 'version' | 'exercise' | 'count' | 'category'>, index: number): Category {
  return scenario.version >= 3 && scenario.exercise === 'mixed' && index >= scenario.count - 2 ? 'Bird' : scenario.category;
}
