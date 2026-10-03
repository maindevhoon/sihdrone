import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFileSync } from 'node:fs';
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result=value; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value => { this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.(); }); }
};
const dark=new THREE.MeshStandardMaterial({color:0x313b42,metalness:.6,roughness:.36});
const rubber=new THREE.MeshStandardMaterial({color:0x111820,roughness:.8});
function mesh(group,geo,mat,pos=[0,0,0],rot=[0,0,0]){const m=new THREE.Mesh(geo,mat);m.position.set(...pos);m.rotation.set(...rot);group.add(m);return m;}
const drone=new THREE.Group();
mesh(drone,new THREE.BoxGeometry(.62,.22,.85),dark);
mesh(drone,new THREE.SphereGeometry(.12,16,12),rubber,[0,-.21,.27]);
for(const x of [-1,1])for(const z of [-1,1]){
 mesh(drone,new THREE.BoxGeometry(.12,.09,1.1),dark,[x*.4,0,z*.4],[0,x*z*Math.PI/4,0]);
 mesh(drone,new THREE.CylinderGeometry(.13,.13,.18,16),dark,[x*.77,0,z*.77]);
 mesh(drone,new THREE.BoxGeometry(1.08,.02,.09),rubber,[x*.77,.12,z*.77]);
 mesh(drone,new THREE.CylinderGeometry(.025,.025,.5,8),dark,[x*.5,-.26,z*.5]);
 const light=new THREE.MeshStandardMaterial({color:x>0?0x70ffc5:0xff744e,emissive:x>0?0x70ffc5:0xff744e});
 mesh(drone,new THREE.SphereGeometry(.04,8,8),light,[x*.77,-.12,z*.77]);
}
const bird=new THREE.Group();
mesh(bird,new THREE.SphereGeometry(1,16,12),dark).scale.set(.13,.15,.4);
mesh(bird,new THREE.SphereGeometry(.13,16,12),dark,[0,.08,.36]);
for(const x of [-1,1])mesh(bird,new THREE.SphereGeometry(1,16,8),dark,[x*.43,0,-.06],[0,x*.22,x*.14]).scale.set(.5,.025,.22);
mesh(bird,new THREE.ConeGeometry(.1,.23,8),new THREE.MeshStandardMaterial({color:0xc4a46b}),[0,.06,.51],[Math.PI/2,0,0]);
for(const [name,group] of [['drone',drone],['bird',bird]]){
 const buffer=await new GLTFExporter().parseAsync(group,{binary:true});
 writeFileSync(new URL(`../public/models/${name}.glb`,import.meta.url),Buffer.from(buffer));
}
