import {test} from 'node:test';
import assert from 'node:assert/strict';
import {historyCsv,responseTime,summarize} from './analytics';
import {createScenario,scoreSession,type Category,type Session} from './simulation';
import {VARIATION_SEEDS} from './variations';

function session(index:number,{exercise='mixed',difficulty='guided',dusk=false,answer,delay=1.5}:{exercise?:'skyline'|'passing'|'mixed';difficulty?:'guided'|'challenge';dusk?:boolean;answer?:Category|'';delay?:number|null}={}):Session {
  const scenario=createScenario(exercise,VARIATION_SEEDS[index],difficulty,dusk);
  const detection=delay===null?null:scenario.arrival+delay,chosen=answer===undefined?scenario.category:answer;
  return {version:1,id:`s${index}`,createdAt:new Date(Date.UTC(2026,9,1,8,index)).toISOString(),scenario,duration:45,detection,answer:detection===null?'':chosen,...scoreSession(scenario,detection,detection===null?'':chosen,45),events:[]};
}

test('an empty history has no metrics and has not started readiness',()=>{
  const s=summarize([]);
  assert.equal(s.sessions,0);assert.equal(s.meanScore,null);assert.equal(s.accuracy,null);assert.equal(s.readiness.level,'Not started');
  assert.equal(historyCsv([]).split('\n').length,1);
});
test('confusion matrix counts actual against answered categories, including no answer',()=>{
  const s=summarize([session(1,{exercise:'skyline',answer:'Bird'}),session(2,{exercise:'passing',delay:null}),session(3,{exercise:'skyline'})]);
  assert.equal(s.confusion['Drone group'].Bird,1);
  assert.equal(s.confusion['Drone group']['Drone group'],1);
  assert.equal(s.confusion['Single drone'].None,1);
  assert.equal(Object.values(s.confusion).reduce((n,row)=>n+Object.values(row).reduce((a,b)=>a+b,0),0),3);
});
test('response time is measured from arrival and only for valid observations',()=>{
  assert.ok(Math.abs((responseTime(session(4,{delay:2.25})) ?? 0)-2.25)<1e-9);
  assert.equal(responseTime(session(5,{delay:null})),null);
  assert.ok(Math.abs((summarize([session(6,{delay:1}),session(7,{delay:3}),session(8,{delay:null})]).meanResponse ?? 0)-2)<1e-9);
});
test('trend is chronological regardless of storage order',()=>{
  const items=[session(3),session(1),session(2)];
  assert.deepEqual(summarize(items).trend.map(t=>t.id),['s1','s2','s3']);
});
test('readiness reaches Ready only when every milestone is met',()=>{
  // Variations 2 and 4 are bird encounters in mixed recognition.
  const items=[session(0,{exercise:'skyline',difficulty:'challenge'}),session(1,{difficulty:'challenge'}),session(2,{exercise:'passing',difficulty:'challenge'}),
    session(3,{dusk:true}),session(4,{exercise:'skyline'}),session(5,{exercise:'passing'}),session(6,{exercise:'skyline'}),session(7,{exercise:'passing'})];
  assert.equal(summarize(items).readiness.level,'Ready');
  assert.equal(summarize(items.slice(0,7)).readiness.level,'Proficient');
  assert.equal(summarize(items.slice(0,2)).readiness.level,'In training');
});
test('CSV escapes values and lists sessions oldest first',()=>{
  const csv=historyCsv([session(2),session(1)]).split('\n');
  assert.equal(csv.length,3);
  assert.ok(csv[0].startsWith('Date (UTC),Theatre,Exercise'));
  assert.ok(csv[1].startsWith('2026-10-01T08:01'));
  assert.ok(csv[1].includes(',Mixed recognition,guided,Day,'));
});
test('results group by theatre, with older sessions under Not recorded, and the CSV names the theatre',()=>{
  const items=[{...session(1),theatre:'tololing' as const},{...session(2),theatre:'tololing' as const},session(3)];
  const rows=summarize(items).byTheatre;
  assert.deepEqual(rows.map(r=>[r.name,r.sessions]),[['Tololing',2],['Not recorded',1]]);
  assert.ok(historyCsv(items).split('\n')[1].includes(',Tololing,'));
});

test('night is reported separately from day and dusk, and fog appears in the CSV',()=>{
  const night=session(1);night.scenario={...night.scenario,lighting:'night',fog:true,dusk:false};
  const day=session(2),dusk=session(3,{dusk:true});
  const rows=summarize([night,day,dusk]).byCondition.filter(c=>c.difficulty==='guided');
  assert.deepEqual(rows.map(c=>[c.lighting,c.sessions]),[['day',1],['dusk',1],['night',1]]);
  const csv=historyCsv([night]).split('\n');
  assert.ok(csv[0].endsWith(',Visibility'));assert.ok(csv[1].includes(',Night,'));assert.ok(csv[1].endsWith(',Fog'));
  assert.equal(summarize([night]).readiness.criteria.at(-1)?.met,false);
});
