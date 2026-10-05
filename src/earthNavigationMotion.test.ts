import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMotion, consumeMotion, emptyMotion, hasMotion, type NavigationMotion } from './earthNavigationMotion';

function settle(initial: NavigationMotion, fps: number) {
  let pending = initial, total = emptyMotion(), frames = 0;
  while (hasMotion(pending) && frames < fps * 2) {
    const { step, remaining } = consumeMotion(pending, 1 / fps);
    for (const key of Object.keys(total) as (keyof NavigationMotion)[]) total[key] += step[key];
    pending = remaining; frames++;
  }
  assert.ok(!hasMotion(pending), 'motion must settle instead of drifting forever');
  return { total, frames };
}
test('scroll bursts ease across multiple frames while preserving modest intended travel', () => {
  const pending = addMotion(addMotion(emptyMotion(), {kind:'orbit',x:12,y:0}), {kind:'orbit',x:8,y:0});
  const first = consumeMotion(pending, 1/60);
  assert.ok(first.step.orbitX > 0 && first.step.orbitX < pending.orbitX);
  assert.ok(first.remaining.orbitX > 0);
  for (const fps of [30, 60, 120]) {
    const result = settle(pending, fps);
    assert.ok(Math.abs(result.total.orbitX - 20) < 1e-10);
    assert.ok(result.frames > 1 && result.frames < fps);
  }
});
test('the same small gesture has the same easing at different display frame rates', () => {
  const initial = { ...emptyMotion(), panX:10, orbitY:12, zoom:.04 };
  const remaining = (fps:number) => {
    let pending = initial;
    for (let frame=0;frame<fps/5;frame++) pending=consumeMotion(pending,1/fps).remaining;
    return pending;
  };
  const a=remaining(60),b=remaining(120);
  for (const key of Object.keys(a) as (keyof NavigationMotion)[]) assert.ok(Math.abs(a[key]-b[key])<1e-10);
});
test('large momentum and stalled frames cannot create a single large camera jump', () => {
  let pending=emptyMotion();
  for(let i=0;i<100;i++){
    pending=addMotion(pending,{kind:'pan',x:160,y:-160});
    pending=addMotion(pending,{kind:'zoom',logScale:.6});
  }
  assert.equal(pending.panX,120);assert.equal(pending.panY,-120);assert.equal(pending.zoom,.45);
  const {step}=consumeMotion(pending,4);
  assert.ok(Math.abs(step.panX)<=12);assert.ok(Math.abs(step.panY)<=12);assert.ok(Math.abs(step.zoom)<=.075+1e-12);
  const settled=settle(pending,60);
  assert.ok(Math.abs(settled.total.zoom-.45)<1e-10);
});
test('gesture reversal cancels momentum immediately and invalid input cannot move the camera', () => {
  const pending=addMotion(emptyMotion(),{kind:'pan',x:40,y:20});
  const reversed=addMotion(pending,{kind:'pan',x:-2,y:0});
  assert.equal(reversed.panX,-2);assert.equal(reversed.panY,20);
  assert.ok(consumeMotion(reversed,1/60).step.panX<0);
  assert.deepEqual(addMotion(pending,{kind:'zoom',logScale:NaN}),pending);
  for(const delta of [0,-1,NaN,Infinity]){
    assert.deepEqual(consumeMotion(pending,delta).step,emptyMotion());
    assert.deepEqual(consumeMotion(pending,delta).remaining,pending);
  }
  assert.ok(!hasMotion(emptyMotion()));
});
