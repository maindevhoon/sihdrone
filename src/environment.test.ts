import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIGHTING_OPTIONS, lightingOf, visibilityLabel } from './environment';
import { createScenario, contactPosition, scoreSession } from './simulation';
import { VARIATION_SEEDS } from './variations';

test('older records resolve their original day/dusk and haze without new fields', () => {
  assert.equal(lightingOf({ dusk: false }), 'day');
  assert.equal(lightingOf({ dusk: true }), 'dusk');
  assert.equal(visibilityLabel({ difficulty: 'guided' }), 'Light urban haze');
  assert.equal(visibilityLabel({ difficulty: 'challenge' }), 'Dense urban haze');
  assert.equal(visibilityLabel({ difficulty: 'guided', fog: true }), 'Fog');
});

test('all lighting/fog combinations preserve generated encounters, both motion versions and scoring', () => {
  for (const version of [1, 2] as const) for (const seed of VARIATION_SEEDS) {
    const original = createScenario('mixed', seed, 'challenge', false, version);
    for (const lighting of LIGHTING_OPTIONS) for (const fog of [false, true]) {
      const scenario = createScenario('mixed', seed, 'challenge', false, version, { lighting, fog });
      const { lighting: _lighting, fog: _fog, ...base } = scenario;
      assert.deepEqual({ ...base, dusk: false }, original);
      assert.equal(lightingOf(scenario), lighting);
      for (const time of [0, 10, 25, 45]) for (let index = 0; index < original.count; index++) {
        assert.deepEqual(contactPosition(scenario, time, index), contactPosition(original, time, index));
      }
      const detection = original.arrival + 3;
      assert.deepEqual(scoreSession(scenario, detection, scenario.category, 45), scoreSession(original, detection, original.category, 45));
    }
  }
});
