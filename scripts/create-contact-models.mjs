// Regenerates the Earth-view contact models from the shared builders in src/contactGeometry.ts.
// Run with: node --import tsx scripts/create-contact-models.mjs
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFileSync } from 'node:fs';
import { createBirdModel, createDroneModel } from '../src/contactGeometry.ts';
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result=value; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value => { this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.(); }); }
};
// Point lights are omitted: Cesium draws its own minimum-size silhouette at Earth-view ranges.
const models = { drone: createDroneModel({ lights: false }), bird: createBirdModel() };
for (const [name, group] of Object.entries(models)) {
  const buffer = await new GLTFExporter().parseAsync(group, { binary: true });
  writeFileSync(new URL(`../public/models/${name}.glb`, import.meta.url), Buffer.from(buffer));
  console.log(`public/models/${name}.glb ${(buffer.byteLength/1024).toFixed(1)} KiB`);
}
