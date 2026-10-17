/** Presentation conditions; these never alter encounter generation, motion or scoring. */
export type Lighting = 'day' | 'dusk' | 'night';
export type Environment = { lighting?: Lighting; fog?: boolean };
export const LIGHTING_OPTIONS: Lighting[] = ['day', 'dusk', 'night'];
export const lightingLabels: Record<Lighting, string> = { day: 'Day', dusk: 'Dusk', night: 'Night' };

/** Results saved before these options existed only carry the dusk flag. */
export function lightingOf(scenario: Environment & { dusk: boolean }): Lighting {
  return scenario.lighting ?? (scenario.dusk ? 'dusk' : 'day');
}

export function visibilityLabel(scenario: Environment & { difficulty: 'guided' | 'challenge' }) {
  return scenario.fog ? 'Fog' : scenario.difficulty === 'challenge' ? 'Dense urban haze' : 'Light urban haze';
}
