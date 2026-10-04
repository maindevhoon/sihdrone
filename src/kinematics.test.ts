import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group, Vector3} from 'three';
import {birdAttitude,contactKinematics,droneAttitude,strobeOn,wingBeat} from './kinematics';
import {createBirdModel,createDroneModel,poseContact} from './contactGeometry';
import {contactPosition,createScenario} from './simulation';
import {VARIATION_SEEDS} from './variations';

test('kinematics are deterministic and positions match the shared trajectory',()=>{
  const s=createScenario('mixed',VARIATION_SEEDS[41],'challenge',true);
  for(const time of [s.arrival,s.arrival+3.3,20,44.9])for(let i=0;i<s.count;i++){
    const k=contactKinematics(s,time,i);
    assert.deepEqual(k,contactKinematics(s,time,i));
    assert.deepEqual(k.position,contactPosition(s,time,i));
  }
});
test('heading points along horizontal travel, clockwise from north',()=>{
  for(const seed of VARIATION_SEEDS.slice(0,40)){
    const s=createScenario('mixed',seed,'guided',false),k=contactKinematics(s,s.arrival+9,0);
    if(k.speed<.05)continue;
    assert.ok(Math.abs(Math.sin(k.heading)-k.velocity[0]/k.speed)<1e-9);
    assert.ok(Math.abs(-Math.cos(k.heading)-k.velocity[2]/k.speed)<1e-9);
  }
});
test('attitude stays finite and bounded for every variation and both versions',()=>{
  for(const seed of VARIATION_SEEDS)for(const version of [1,2] as const){
    const s=createScenario('mixed',seed,'challenge',false,version);
    for(let time=s.arrival;time<=45;time+=1.5)for(let i=0;i<s.count;i++){
      const k=contactKinematics(s,time,i);
      for(const value of [k.speed,k.heading,k.forwardAccel,k.lateralAccel,...k.velocity])assert.ok(Number.isFinite(value));
      const a=s.category==='Bird'?birdAttitude(k):droneAttitude(k);
      assert.ok(Math.abs(a.pitch)<=.42&&Math.abs(a.roll)<=.7);
    }
  }
});
test('a stationary contact before arrival keeps the nominal heading',()=>{
  const s=createScenario('passing',VARIATION_SEEDS[3],'guided',false),k=contactKinematics(s,0,0);
  assert.equal(k.speed,0);assert.equal(k.heading,s.heading);
});
test('posed models face their direction of travel',()=>{
  const s=createScenario('skyline',VARIATION_SEEDS[7],'guided',false);
  for(const [model,bird] of [[createDroneModel(),false],[createBirdModel(),true]] as const){
    const target=new Group(),k=contactKinematics(s,s.arrival+12,1);
    poseContact(target,model,bird,k,s.arrival+12,1);
    const nose=new Vector3(0,0,1).applyEuler(target.rotation);
    const horizontal=Math.hypot(nose.x,nose.z);
    assert.ok(Math.abs(nose.x/horizontal-Math.sin(k.heading))<1e-9);
    assert.ok(Math.abs(nose.z/horizontal+Math.cos(k.heading))<1e-9);
    assert.deepEqual(target.position.toArray(),k.position);
  }
});
test('wingbeats alternate between flapping bursts and glides; the strobe flashes briefly',()=>{
  const samples=Array.from({length:600},(_,i)=>wingBeat(i*.05,0));
  assert.ok(samples.some(s=>s.flapping)&&samples.some(s=>!s.flapping));
  assert.ok(samples.every(s=>Math.abs(s.angle)<.8));
  const flashes=Array.from({length:1100},(_,i)=>strobeOn(i*.01,0)).filter(Boolean).length;
  assert.ok(flashes>0&&flashes<120);
});
