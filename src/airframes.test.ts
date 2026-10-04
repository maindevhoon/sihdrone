import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Box3, Mesh, type Object3D} from 'three';
import {AIRFRAMES,BLACK_KITE,airframeFor,contactSpan} from './airframes';
import {createBirdModel,createDroneModel} from './contactGeometry';
import {createScenario} from './simulation';
import {VARIATION_SEEDS} from './variations';

/** World-space extent of the airframe's meshes; propellers are included only when asked. */
function measure(root:Object3D,withProps:boolean){
  root.updateMatrixWorld(true);
  const box=new Box3();
  const visit=(object:Object3D)=>{
    if(!withProps&&object.name.startsWith('prop-'))return;
    const mesh=object as Mesh;
    if(mesh.isMesh){mesh.geometry.computeBoundingBox();box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));}
    object.children.forEach(visit);
  };
  visit(root);
  return {length:box.max.z-box.min.z,width:box.max.x-box.min.x,height:box.max.y-box.min.y};
}
const near=(actual:number,expected:number,tolerance=.02)=>Math.abs(actual-expected)<=expected*tolerance;

test('each airframe matches its published length, width and height within 2%',()=>{
  for(const airframe of Object.values(AIRFRAMES)){
    if(!airframe.envelope)continue;
    const {length,width,height,withProps}=airframe.envelope,size=measure(createDroneModel({airframe,lights:false}),withProps);
    assert.ok(near(size.length,length),`${airframe.name} length ${size.length.toFixed(4)} vs ${length}`);
    assert.ok(near(size.width,width),`${airframe.name} width ${size.width.toFixed(4)} vs ${width}`);
    assert.ok(near(size.height,height),`${airframe.name} height ${size.height.toFixed(4)} vs ${height}`);
  }
});
test('motor layouts reproduce the published diagonal within 1%',()=>{
  for(const airframe of Object.values(AIRFRAMES)){
    if(!airframe.diagonal)continue;
    const [fl,,,rr]=airframe.motors;
    assert.ok(near(Math.hypot(fl[0]-rr[0],fl[2]-rr[2]),airframe.diagonal,.01),airframe.name);
  }
});
test('the black kite model has the published wingspan and length',()=>{
  const size=measure(createBirdModel(),true);
  assert.ok(near(size.width,BLACK_KITE.span,.03),`span ${size.width}`);
  assert.ok(size.length>=.5&&size.length<=.6,`length ${size.length}`);
});
test('airframe choice is deterministic, uniform within a group, and absent for birds',()=>{
  const seen=new Set<string>();
  for(const seed of VARIATION_SEEDS){
    const single=createScenario('passing',seed,'guided',false),group=createScenario('skyline',seed,'guided',false);
    assert.equal(airframeFor(single),airframeFor(createScenario('passing',seed,'challenge',true)));
    seen.add(airframeFor(single)!.id);
    assert.notEqual(airframeFor(group)!.id,'matrice-350-rtk');
  }
  assert.equal(seen.size,4);
  const bird={seed:1,category:'Bird' as const};
  assert.equal(airframeFor(bird),null);assert.equal(contactSpan(bird),BLACK_KITE.span);
});
