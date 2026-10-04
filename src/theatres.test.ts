import {test} from 'node:test';
import assert from 'node:assert/strict';
import {THEATRES,cameraFraming,cameraLabels,groundSamplePoints,isGeographic,theatreById} from './theatres';

const metres=([lon1,lat1]:[number,number],[lon2,lat2]:[number,number])=>{
  const R=6371000,toRad=Math.PI/180,dLat=(lat2-lat1)*toRad,dLon=(lon2-lon1)*toRad;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*toRad)*Math.cos(lat2*toRad)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
};
test('theatre ids are unique and unknown ids fall back to the synthetic district',()=>{
  assert.equal(new Set(THEATRES.map(t=>t.id)).size,THEATRES.length);
  assert.equal(theatreById('nowhere').id,'district');
  assert.equal(theatreById('tololing').name,'Tololing');
});
test('every geographic theatre has coordinates inside India-administered latitude/longitude bounds and camera framing',()=>{
  for(const t of THEATRES.filter(isGeographic)){
    assert.ok(t.latitude!>6&&t.latitude!<37&&t.longitude!>68&&t.longitude!<98,t.id);
    assert.ok(Number.isFinite(t.elevation),t.id);
    for(const view of ['overview','rooftop','street'] as const){assert.ok(t.kind!=='synthetic'&&cameraFraming[t.kind][view].range>0);assert.ok(cameraLabels[t.kind][view]);}
  }
});
test('ground samples ring the site at about 150 m and 320 m, also at high latitude',()=>{
  for(const id of ['tololing','tawang','longewala'] as const){
    const t=theatreById(id),[centre,...ring]=groundSamplePoints(t);
    assert.equal(ring.length,16);
    ring.forEach((p,i)=>{const expected=i<8?150:320;assert.ok(Math.abs(metres(centre,p)-expected)<2,`${id} ${metres(centre,p)}`);});
  }
});
