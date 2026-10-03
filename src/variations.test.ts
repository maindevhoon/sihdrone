import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createVariationDeck,VARIATION_SEEDS} from './variations';
import {contactPosition,createScenario,seededRandom} from './simulation';
test('the library contains 200 unique unsigned seeds and distinct reproducible routes',()=>{
  assert.equal(VARIATION_SEEDS.length,200);
  assert.equal(new Set(VARIATION_SEEDS).size,200);
  const scenes=VARIATION_SEEDS.map(seed=>createScenario('mixed',seed,'guided',false));
  assert.equal(new Set(scenes.map(s=>JSON.stringify(contactPosition(s,15,0)))).size,200);
  assert.equal(new Set(scenes.map(s=>s.pattern)).size,5);
  for(const scene of scenes)assert.deepEqual(scene,createScenario('mixed',scene.seed,'guided',false));
});
test('shuffle visits every seed exactly once per cycle and avoids adjacent repeats',()=>{
  const deck=createVariationDeck(seededRandom(19));
  let previous:number|undefined;
  for(let cycle=0;cycle<4;cycle++){
    const values=[];
    for(let i=0;i<200;i++){const value=deck.next(previous);assert.notEqual(value,previous);values.push(value);previous=value;}
    assert.equal(new Set(values).size,200);
    assert.deepEqual([...values].sort((a,b)=>a-b),[...VARIATION_SEEDS].sort((a,b)=>a-b));
  }
});
