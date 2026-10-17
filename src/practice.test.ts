import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPractice } from './practice';
import { contactCategory, createScenario, emptyTrackDecisions, scoreTracks, type Session } from './simulation';
import { VARIATION_SEEDS } from './variations';

function record(dusk = false): Session {
  const scenario = createScenario('mixed', VARIATION_SEEDS[1], 'guided', dusk, 3);
  const tracks = emptyTrackDecisions(scenario).map(track=>({...track,detection:scenario.arrival,answer:contactCategory(scenario,track.id)}));
  return {version:2,id:'practice',createdAt:'2026-10-17T10:00:00Z',scenario,tracks,detection:scenario.arrival,answer:'',duration:45,events:[],...scoreTracks(scenario,tracks,45)};
}

test('empty history starts a guided baseline and excludes the current variation', () => {
  const plan = planPractice([], VARIATION_SEEDS[0]);
  assert.equal(plan.focus, 'Baseline');
  assert.equal(plan.difficulty, 'guided');
  assert.notEqual(plan.seed, VARIATION_SEEDS[0]);
});

test('bird confusion at dusk selects guided mixed practice and explains the limited evidence', () => {
  const session = record(true);
  for (const track of session.tracks!) if (contactCategory(session.scenario,track.id)==='Bird') track.answer='Single drone';
  const original = JSON.stringify(session);
  const plan = planPractice([session]);
  assert.equal(plan.focus, 'Bird');assert.equal(plan.exercise,'mixed');assert.equal(plan.dusk,true);
  assert.equal(plan.difficulty,'guided');assert.match(plan.reason,/2 of 2/);assert.match(plan.evidence,/Limited evidence/);
  assert.notEqual(plan.seed,session.scenario.seed);
  assert.equal(JSON.stringify(session),original);
  assert.deepEqual(planPractice([session]),plan);
});

test('missed observations drive practice even when another track is correct', () => {
  const session=record();
  session.tracks![0].detection=null;session.tracks![0].answer='';
  const plan=planPractice([session]);
  assert.equal(plan.focus,contactCategory(session.scenario,0));
  assert.match(plan.reason,/observing every track/);
  assert.match(plan.evidence,/1 missed observations/);
});

test('challenge practice requires recorded success for every category; otherwise cover the missing category', () => {
  const session=record();
  const first=planPractice([session]);
  assert.notEqual(first.focus,'Challenge');
  const missing=first.focus;
  const scenario=createScenario(missing==='Single drone'?'passing':'skyline',VARIATION_SEEDS[2],'guided',false,3);
  const tracks=emptyTrackDecisions(scenario).map(track=>({...track,detection:scenario.arrival,answer:contactCategory(scenario,track.id)}));
  const additional:Session={...session,id:'additional',scenario,tracks,detection:scenario.arrival,...scoreTracks(scenario,tracks,45)};
  assert.equal(planPractice([session,additional]).focus,'Challenge');
  assert.equal(planPractice([session,additional]).difficulty,'challenge');
});
