import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contactReadout,contactTrail,pickRadarContact,projectContact,SCOPE_CENTER,SCOPE_RADIUS} from './radarMath';
import {createScenario,visibleContacts} from './simulation';
import {VARIATION_SEEDS} from './variations';
test('north-up projection puts east right, north up and observer at centre',()=>{
  assert.deepEqual(projectContact([0,5,12],60),[120,120]);
  assert.deepEqual(projectContact([60,5,12],60),[208,120]);
  assert.deepEqual(projectContact([0,5,-48],60),[120,32]);
});
test('heading-up rotation preserves range and puts camera-forward contact at twelve oclock',()=>{
  const [x,y]=projectContact([60,5,12],60,90);
  assert.ok(Math.abs(x-120)<1e-10);assert.ok(Math.abs(y-32)<1e-10);
  for(const heading of [0,45,90,179,270]){const p=projectContact([14,7,-3],60,heading);assert.ok(Math.abs(Math.hypot(p[0]-120,p[1]-120)-Math.hypot(14,-15)*88/60)<1e-10);}
});
test('all 200 variations fit the default scope across the exercise',()=>{
  for(const seed of VARIATION_SEEDS)for(const exercise of ['skyline','passing','mixed'] as const){const s=createScenario(exercise,seed,'challenge',false);for(let t=s.arrival;t<=45;t+=2)for(const {position} of visibleContacts(s,t)){const [x,y]=projectContact(position,60);assert.ok(Math.hypot(x-SCOPE_CENTER,y-SCOPE_CENTER)<=SCOPE_RADIUS);}}
});
test('readouts scale units consistently and trails contain no pre-arrival contacts',()=>{
  const s=createScenario('mixed',100,'guided',false),t=s.arrival+1;
  const metric=contactReadout(s,t,0,8),local=contactReadout(s,t,0,1);
  assert.equal(metric.range,local.range*8);assert.equal(metric.altitude,local.altitude*8);assert.equal(metric.speed,local.speed*8);assert.equal(metric.bearing,local.bearing);
  const trail=contactTrail(s,t,0,60,0);assert.equal(trail.length,2);assert.deepEqual(trail.at(-1),projectContact(visibleContacts(s,t)[0].position,60));
});
test('clustered returns choose the closest contact, independent of stacking order',()=>{
  const contacts=[{id:0,position:[1,12,-12] as [number,number,number]},{id:1,position:[3,12,-12] as [number,number,number]}];
  const point=projectContact(contacts[0].position,60);
  assert.equal(pickRadarContact(contacts,point,60),0);
  assert.equal(pickRadarContact([...contacts].reverse(),point,60),0);
  assert.equal(pickRadarContact(contacts,[32,120],60),null);
});
test('scope inspection follows heading and excludes returns outside the selected range',()=>{
  const contacts=[{id:0,position:[60,12,12] as [number,number,number]}];
  assert.equal(pickRadarContact(contacts,[120,32],60,90),0);
  assert.equal(pickRadarContact(contacts,[120,32],30,90),null);
  assert.equal(pickRadarContact([], [120,32],60),null);
});
