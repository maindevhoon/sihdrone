import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advancePreview } from './previewClock';
import { createScenario, visibleContacts } from './simulation';
import { contactReadout, contactTrail, projectContact } from './radarMath';

test('preview time advances contacts, trails and readouts on the shared trajectory', () => {
  const scenario = createScenario('skyline', 123, 'guided', false);
  const start = scenario.arrival + 6, next = advancePreview(start, 1, scenario.duration);
  const before = visibleContacts(scenario, start)[0], after = visibleContacts(scenario, next)[0];
  assert.notDeepEqual(before.position, after.position);
  assert.notDeepEqual(contactReadout(scenario, start, 0), contactReadout(scenario, next, 0));
  assert.deepEqual(contactTrail(scenario, next, 0, 60, 0).at(-1), projectContact(after.position, 60));
});
test('looping preview restarts arrival and clears the preceding cycle trails', () => {
  const scenario = createScenario('skyline', 123, 'guided', false);
  const time = advancePreview(scenario.duration - .1, .2, scenario.duration);
  assert.ok(Math.abs(time - .1) < 1e-9);
  assert.deepEqual(visibleContacts(scenario, time), []);
  assert.deepEqual(contactTrail(scenario, time, 0, 60, 0), []);
});
test('a held preview cannot advance and invalid deltas are ignored', () => {
  for (const delta of [0, -1, NaN, Infinity]) assert.equal(advancePreview(12, delta, 45), 12);
  assert.equal(advancePreview(12, 1, 0), 12);
});
