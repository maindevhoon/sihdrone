import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decisionRows} from './reviewEvidence';
import {contactCategory, createScenario, emptyTrackDecisions, scoreSession, scoreTracks, type Session} from './simulation';

function session(): Session {
  const scenario = createScenario('mixed', 42, 'guided', false, 3);
  const tracks = emptyTrackDecisions(scenario);
  tracks[0] = {id:0, detection:scenario.arrival + 1, answer:contactCategory(scenario,0)};
  tracks[1] = {id:1, detection:scenario.arrival + 2, answer:''};
  return {version:2, id:'review', createdAt:'2026-10-17T12:00:00Z', scenario, tracks, duration:30,
    detection:tracks[0].detection, answer:'', ...scoreTracks(scenario,tracks,30), events:[
      {time:tracks[0].detection!,type:'observation',trackId:0,label:'Observed'},
      {time:8,type:'classification',trackId:0,answer:'Bird',label:'Initial answer'},
      {time:12,type:'classification',trackId:0,answer:tracks[0].answer || undefined,label:'Corrected answer'},
      {time:tracks[1].detection!,type:'observation',trackId:1,label:'Observed'},
    ].sort((a,b)=>a.time-b.time) as Session['events']};
}

test('review outcomes distinguish missed, unclassified, incorrect and correct decisions', () => {
  const saved = session();
  const before = JSON.stringify(saved);
  const rows = decisionRows(saved);
  assert.equal(rows[0].outcome,'correct');
  assert.equal(rows[1].outcome,'unclassified');
  assert.ok(rows.slice(2).every(row=>row.outcome==='missed'));
  saved.tracks![0].answer='Bird';
  assert.equal(decisionRows(saved)[0].outcome,'incorrect');
  saved.tracks![0].answer=contactCategory(saved.scenario,0);
  assert.equal(JSON.stringify(saved),before);
});

test('checkpoint targets use the final classification, observation, or arrival as appropriate', () => {
  const saved=session();
  const before=JSON.stringify(saved);
  const rows=decisionRows(saved);
  assert.equal(rows[0].replayTime,12);
  assert.equal(rows[1].replayTime,saved.tracks![1].detection);
  assert.equal(rows[2].replayTime,saved.scenario.arrival);
  assert.ok(rows.every(row=>row.canReplayContact));
  assert.equal(JSON.stringify(saved),before);
});

test('sessions that end before arrival cannot replay a future contact', () => {
  const saved=session();
  saved.duration=saved.scenario.arrival-1;
  const rows=decisionRows(saved);
  assert.ok(rows.every(row=>row.replayTime<=saved.duration&&!row.canReplayContact));
  assert.ok(rows.every(row=>row.outcome==='missed'));
});

test('legacy encounter reviews retain their original score and ignore events after the recorded end', () => {
  const scenario=createScenario('passing',17,'guided',false,1);
  const saved:Session={version:1,id:'legacy',createdAt:'2026-10-01T12:00:00Z',scenario,duration:15,
    detection:scenario.arrival+1,answer:'Single drone',...scoreSession(scenario,scenario.arrival+1,'Single drone',15),
    events:[{time:10,type:'classification',label:'Classified'},{time:20,type:'classification',label:'Out of recording'}]};
  const before=JSON.stringify(saved);
  const rows=decisionRows(saved);
  assert.equal(rows.length,1);assert.equal(rows[0].score,saved.score);
  assert.equal(rows[0].replayTime,10);assert.equal(rows[0].outcome,'correct');
  assert.equal(JSON.stringify(saved),before);
});
