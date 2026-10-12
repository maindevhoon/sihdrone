// Regenerates the Earth-view contact models from the shared builders in src/contactGeometry.ts.
// Run with: node --import tsx scripts/create-contact-models.mjs
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createBirdModel, createDroneModel, createFlightModel } from '../src/contactGeometry.ts';
import { AIRFRAMES } from '../src/airframes.ts';
import { BIRDS } from '../src/birds.ts';
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result=value; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value => { this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.(); }); }
};
// Point lights are omitted: Cesium draws its own minimum-size silhouette at Earth-view ranges.
const models = {
  ...Object.fromEntries(Object.values(AIRFRAMES).filter(a=>!['rc-cessna','typhoon-h480'].includes(a.id)).map(airframe => [`drone-${airframe.id}`, createDroneModel({ airframe, lights: false })])),
  ...Object.fromEntries([...Object.keys(AIRFRAMES),...Object.keys(BIRDS)].map(id=>[`v3-${id}`,createFlightModel(id,'visible',false,false)])),
  ...Object.fromEntries([...Object.keys(AIRFRAMES),...Object.keys(BIRDS)].map(id=>[`v3-${id}-low`,createFlightModel(id,'visible',false,false,'low')])),
  bird: createBirdModel(),
};
const credits=[];
for (const [name, group] of Object.entries(models)) {
  const buffer = await new GLTFExporter().parseAsync(group, { binary: true });
  writeFileSync(new URL(`../public/models/${name}.glb`, import.meta.url), Buffer.from(buffer));
  console.log(`public/models/${name}.glb ${(buffer.byteLength/1024).toFixed(1)} KiB`);
  if(name.startsWith('v3-')){const id=name.slice(3).replace(/-low$/,''),ref=AIRFRAMES[id]??BIRDS[id];credits.push({file:`${name}.glb`,author:'Trinetra project',geometry:'Original procedural geometry; no third-party model mesh',reference:ref.source,sha256:createHash('sha256').update(Buffer.from(buffer)).digest('hex')});}
}
writeFileSync(new URL('../public/models/credits.json',import.meta.url),JSON.stringify({description:'Original model assets. References document dimensions or species appearance; aerodynamic coefficients and fixed-wing geometry are estimates.',thirdPartyModels:[],assets:credits},null,2)+'\n');
