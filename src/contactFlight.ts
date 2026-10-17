import type { Scenario } from './simulation';

/** Frozen definition for this contact, shared by geometry, physics and replay. */
export function flightForContact(scenario: Pick<Scenario, 'flight' | 'birdFlight' | 'count'>, index = 0) {
  return scenario.birdFlight && index >= scenario.count - 2 ? scenario.birdFlight : scenario.flight;
}
export function formationIndex(scenario: Pick<Scenario, 'birdFlight' | 'count'>, index: number) {
  return scenario.birdFlight && index >= scenario.count - 2 ? index - (scenario.count - 2) : index;
}
