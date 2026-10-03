import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactPosition, createScenario, scoreSession, visibleContacts } from './simulation';
import {projectContact,SCOPE_CENTER,SCOPE_RADIUS} from './radarMath';

test('a stored variation reproduces scenario parameters and positions',()=>{
  const a=createScenario('mixed',981,'challenge',true),b=createScenario('mixed',981,'challenge',true);
  assert.deepEqual(a,b);
  for(const time of [0,7,15,29,45])for(let i=0;i<a.count;i++)assert.deepEqual(contactPosition(a,time,i),contactPosition(b,time,i));
});
test('mixed variations cover all supported categories',()=>{
  const scenarios=Array.from({length:100},(_,seed)=>createScenario('mixed',seed,'guided',false));
  assert.equal(new Set(scenarios.map(s=>s.category)).size,3);
  assert.equal(new Set(scenarios.map(s=>s.shift)).size,100);
});
test('contacts appear only when their scripted arrival occurs',()=>{
  const scenario=createScenario('skyline',247,'guided',false);
  assert.deepEqual(visibleContacts(scenario,scenario.arrival-.001),[]);
  assert.equal(visibleContacts(scenario,scenario.arrival).length,scenario.count);
});
test('a correct immediate observation receives 100, independent of arrival delay',()=>{
  for(const difficulty of ['guided','challenge'] as const){const scenario=createScenario('passing',11,difficulty,true);assert.equal(scoreSession(scenario,scenario.arrival,'Single drone',45).score,100);}
});
test('detection timing is measured after arrival and decreases with delay',()=>{
  const s=createScenario('skyline',247,'guided',false);
  const early=scoreSession(s,s.arrival+2,'Drone group',45),late=scoreSession(s,s.arrival+12,'Drone group',45);
  assert.equal(early.classificationScore,60);assert.equal(early.detectionScore,38);assert.ok(late.detectionScore<early.detectionScore);
});
test('a premature or missing observation earns no classification credit',()=>{
  const s=createScenario('skyline',247,'guided',false);
  for(const detection of [null,s.arrival-.01,NaN,Infinity,46])assert.equal(scoreSession(s,detection,'Drone group',45).score,0);
});
test('an observation after the actual session ended earns no credit',()=>{
  const s=createScenario('passing',10,'guided',false);
  assert.equal(scoreSession(s,12,'Single drone',8).score,0);
});
test('a wrong category preserves timing credit but earns zero classification points',()=>{
  const s=createScenario('passing',52,'guided',false),score=scoreSession(s,s.arrival+.1,'Bird',45);
  assert.equal(score.detectionScore,40);assert.equal(score.classificationScore,0);assert.equal(score.score,40);
});
test('radar contact positions use exactly the same simulation function as the scene',()=>{
  const s=createScenario('skyline',67,'challenge',true);
  for(const time of [s.arrival,20,45])visibleContacts(s,time).forEach(c=>assert.deepEqual(c.position,contactPosition(s,time,c.id)));
});
test('all visible contacts remain inside the mini-radar bounds',()=>{
  for(let seed=0;seed<30;seed++){const s=createScenario('mixed',seed,'challenge',false);for(let time=8;time<=45;time+=2)visibleContacts(s,time).forEach(({position})=>{const [x,y]=projectContact(position,60);assert.ok(Math.hypot(x-SCOPE_CENTER,y-SCOPE_CENTER)<SCOPE_RADIUS);});}
});
