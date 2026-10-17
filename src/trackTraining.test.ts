import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactCategory, contactPosition, createScenario, decisionsAt, emptyTrackDecisions, scoreTracks, visibleContacts, type Session } from './simulation';
import { airframeFor, contactSpan } from './airframes';
import { contactKinematics } from './kinematics';
import { projectContact, SCOPE_CENTER, SCOPE_RADIUS } from './radarMath';
import { VARIATION_SEEDS } from './variations';
import { assessmentRows, historyCsv, summarize } from './analytics';
import { readSessions, STORAGE_KEY } from './storage';

function recorded(): Session {
  const scenario = createScenario('mixed', VARIATION_SEEDS[0], 'guided', false, 3);
  const tracks = emptyTrackDecisions(scenario).map(track => ({...track, detection: scenario.arrival + track.id, answer: contactCategory(scenario, track.id)}));
  const events: Session['events'] = tracks.flatMap(track => [
    {time: track.detection, type: 'observation' as const, trackId: track.id, label: 'Observed'},
    {time: track.detection + .1, type: 'classification' as const, trackId: track.id, answer: track.answer, label: 'Classified'},
  ]);
  return {version: 2, id: 'tracks', createdAt: '2026-10-17T10:00:00Z', scenario, duration: 40,
    detection: scenario.arrival, answer: '', tracks, events, ...scoreTracks(scenario, tracks, 40)};
}

test('all 200 new mixed encounters contain independently moving birds and drones within the default radar', () => {
  for (const seed of VARIATION_SEEDS) for (const difficulty of ['guided', 'challenge'] as const) {
    const scenario = createScenario('mixed', seed, difficulty, true, 3);
    assert.deepEqual(scenario, createScenario('mixed', seed, difficulty, true, 3));
    assert.equal(visibleContacts(scenario, scenario.arrival - .01).length, 0);
    assert.equal(visibleContacts(scenario, scenario.arrival).length, scenario.count);
    assert.equal(contactCategory(scenario, scenario.count - 1), 'Bird');
    assert.notEqual(contactCategory(scenario, 0), 'Bird');
    assert.equal(airframeFor(scenario, scenario.count - 1), null);
    assert.equal(contactSpan(scenario, scenario.count - 1), 1.5);
    assert.ok(airframeFor(scenario, 0));
    for (let time = scenario.arrival; time <= 45; time += 3) {
      for (let id = 0; id < scenario.count; id++) {
        const position = contactPosition(scenario, time, id);
        assert.deepEqual(contactKinematics(scenario, time, id).position, position);
        assert.ok(position.every(Number.isFinite));
        const [x, y] = projectContact(position, 60);
        assert.ok(Math.hypot(x - SCOPE_CENTER, y - SCOPE_CENTER) < SCOPE_RADIUS);
      }
    }
  }
});

test('per-track scoring includes missed tracks and requires each individual observation', () => {
  const scenario = recorded().scenario;
  const tracks = emptyTrackDecisions(scenario);
  assert.equal(scoreTracks(scenario, tracks, 40).score, 0);
  const complete = tracks.map(track => ({...track, detection: scenario.arrival, answer: contactCategory(scenario, track.id)}));
  assert.equal(scoreTracks(scenario, complete, 40).score, 100);
  const partial = complete.map((track, id) => id ? {...track, detection: null} : track);
  const score = scoreTracks(scenario, partial, 40);
  assert.equal(score.detectionScore, Math.round(40 / scenario.count));
  assert.equal(score.classificationScore, Math.round(60 / scenario.count));
  for (const detection of [scenario.arrival - .01, 41, NaN, Infinity]) {
    assert.equal(scoreTracks(scenario, complete.map(track=>({...track,detection})),40).score, 0);
  }
  assert.equal(scoreTracks(scenario, complete, scenario.arrival - .01).score, 0);
});

test('replay reconstructs per-track answers and corrections without modifying the saved result', () => {
  const session = recorded();
  session.events.push({time: 20, type: 'classification', trackId: 0, answer: 'Bird', label: 'Correction'});
  const original = JSON.stringify(session);
  assert.ok(decisionsAt(session, 0).every(track=>track.detection===null&&track.answer===''));
  assert.equal(decisionsAt(session, 19)[0].answer, contactCategory(session.scenario, 0));
  assert.equal(decisionsAt(session, 20)[0].answer, 'Bird');
  assert.equal(decisionsAt(session, 19)[0].answer, contactCategory(session.scenario, 0));
  assert.equal(JSON.stringify(session), original);
});

test('storage accepts new records alongside legacy records and rejects damaged track decisions and events', () => {
  const session = recorded();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let items: unknown[] = [session];
  Object.defineProperty(globalThis, 'localStorage', {configurable:true,value:{getItem:(key:string)=>key===STORAGE_KEY?JSON.stringify(items):null}});
  try {
    assert.deepEqual(readSessions(), [session]);
    const mutations: ((s: Session) => void)[] = [
      s => {s.tracks!.pop();},
      s => {s.tracks![1].id = 0;},
      s => {s.tracks![0].detection = s.scenario.arrival - 1;},
      s => {s.tracks![0].detection = 41;},
      s => {s.tracks![0].answer = 'Bird';},
      s => {s.events[0].trackId = 99;},
      s => {s.events[1].answer = 'Bird';},
      s => {s.events[1].time = 41;},
      s => {s.score++;},
      s => {s.version = 1;},
      s => {s.scenario.count++;},
    ];
    for (const mutate of mutations) {
      const damaged = structuredClone(session); mutate(damaged);
      items = [damaged, session];
      assert.deepEqual(readSessions(), [session]);
    }
    const oldScenario = createScenario('mixed', 42, 'guided', false, 1);
    const legacy: Session = {...session, version:1, tracks:undefined, scenario:oldScenario, detection:null, answer:'', events:[], score:0, detectionScore:0, classificationScore:0, observationValid:false};
    delete legacy.tracks;
    items = [session, legacy];
    assert.deepEqual(readSessions(), [session, legacy]);
  } finally {
    if(previous)Object.defineProperty(globalThis,'localStorage',previous);
    else Reflect.deleteProperty(globalThis,'localStorage');
  }
});

test('analytics and CSV count every track, including missed birds, rather than treating a mixed scene as one drone', () => {
  const session = recorded();
  const summary = summarize([session]);
  assert.equal(summary.accuracy, 1);
  assert.equal(summary.confusion.Bird.Bird, 2);
  assert.equal(summary.sessions, 1);
  assert.equal(assessmentRows(session).length, session.scenario.count);
  assert.equal(historyCsv([session]).split('\n').length, session.scenario.count + 1);
  assert.ok(historyCsv([session]).includes('T01'));
  session.tracks!.at(-1)!.detection = null;
  session.tracks!.at(-1)!.answer = '';
  assert.equal(summarize([session]).confusion.Bird.None, 1);
  assert.equal(summarize([session]).accuracy, (session.scenario.count - 1) / session.scenario.count);
});

test('legacy routes match fixtures captured from the previous committed generator', () => {
  const fixtures = [
    {version:1 as const,count:3,arrival:2.85246579349041,position:[9.12238951749879,13.727360140610264,-9.166369515966688]},
    {version:2 as const,count:5,arrival:2.85246579349041,position:[-19.6670948519818,18.640252563876114,-24.644509521197122]},
  ];
  for(const fixture of fixtures){
    const scenario=createScenario('mixed',42,'guided',false,fixture.version);
    assert.equal(scenario.count,fixture.count);
    assert.equal(scenario.arrival,fixture.arrival);
    contactPosition(scenario,20,0).forEach((value,index)=>assert.ok(Math.abs(value-fixture.position[index])<1e-10));
  }
});
