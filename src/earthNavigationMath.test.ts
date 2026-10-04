import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wheelIntent,zoomRange,orbitAngles,safariGestureDelta,MIN_EARTH_RANGE,MAX_EARTH_RANGE,MIN_EARTH_PITCH,MAX_EARTH_PITCH} from './earthNavigationMath';
const wheel={deltaX:0,deltaY:20,deltaMode:0,ctrlKey:false,metaKey:false,shiftKey:false};
test('trackpad scrolling pans both axes and mouse wheel zooms',()=>{
  assert.deepEqual(wheelIntent({...wheel,deltaX:12},'trackpad',600),{kind:'pan',x:12,y:20});
  assert.deepEqual(wheelIntent(wheel,'mouse',600),{kind:'zoom',logScale:.05});
});
test('pinch is zoom in either device mode and takes priority over Shift',()=>{
  for(const input of ['trackpad','mouse'] as const){
    assert.deepEqual(wheelIntent({...wheel,ctrlKey:true,shiftKey:true},input,600),{kind:'zoom',logScale:.18});
    assert.deepEqual(wheelIntent({...wheel,metaKey:true},input,600),{kind:'zoom',logScale:.18});
  }
});
test('Shift-scroll orbits instead of panning or zooming',()=>{
  assert.deepEqual(wheelIntent({...wheel,deltaX:7,shiftKey:true},'trackpad',600),{kind:'orbit',x:7,y:20});
});
test('line/page delta units are normalized and huge momentum is bounded',()=>{
  assert.deepEqual(wheelIntent({...wheel,deltaY:2,deltaMode:1},'trackpad',600),{kind:'pan',x:0,y:32});
  assert.deepEqual(wheelIntent({...wheel,deltaY:1,deltaMode:2},'trackpad',600),{kind:'pan',x:0,y:160});
  assert.equal(wheelIntent({...wheel,deltaY:NaN},'trackpad',600),null);
  assert.equal(wheelIntent({...wheel,deltaY:0},'trackpad',600),null);
});
test('pinch distance and tilt cannot cross camera limits',()=>{
  assert.ok(zoomRange(1000,-.2)<1000);assert.ok(zoomRange(1000,.2)>1000);
  assert.equal(zoomRange(MIN_EARTH_RANGE,-500),MIN_EARTH_RANGE);
  assert.equal(zoomRange(MAX_EARTH_RANGE,500),MAX_EARTH_RANGE);
  assert.equal(orbitAngles(0,MIN_EARTH_PITCH,0,-1000).pitch,MIN_EARTH_PITCH);
  assert.equal(orbitAngles(0,MAX_EARTH_PITCH,0,1000).pitch,MAX_EARTH_PITCH);
  const orbit=orbitAngles(.1,-.5,100,0);assert.ok(orbit.heading>=0&&orbit.heading<Math.PI*2);
});
test('Safari gesture changes use incremental scale and rotation, avoiding cumulative jumps',()=>{
  const first=safariGestureDelta({scale:1,rotation:0},{scale:1.2,rotation:10})!;
  const second=safariGestureDelta({scale:1.2,rotation:10},{scale:1.44,rotation:15})!;
  assert.ok(Math.abs(first.logScale-second.logScale)<1e-12);assert.equal(first.rotation,10);assert.equal(second.rotation,5);
  assert.equal(safariGestureDelta({scale:1,rotation:0},{scale:0,rotation:10}),null);
});
