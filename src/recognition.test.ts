import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Box3, Mesh, Vector3} from 'three';
import {BIRDS} from './birds';
import {AIRFRAMES} from './airframes';
import {createFlightModel, disposeModel, poseFlightRig} from './contactGeometry';
import {FLIGHT_PROFILES} from './flightProfiles';
import {comparisonLayout, RECOGNITION_LIBRARY} from './recognition';
import type {FlightState} from './flightTypes';

test('the recognition catalogue covers each supported model once with published references', () => {
  const expected = Object.keys(FLIGHT_PROFILES).sort();
  assert.deepEqual(RECOGNITION_LIBRARY.map(entry => entry.id).sort(), expected);
  assert.equal(new Set(RECOGNITION_LIBRARY.map(entry => entry.id)).size, expected.length);
  for (const entry of RECOGNITION_LIBRARY) {
    assert.ok(entry.source.startsWith('https://'));
    assert.deepEqual(entry.published, entry.id in BIRDS ? BIRDS[entry.id as keyof typeof BIRDS].published : AIRFRAMES[entry.id as keyof typeof AIRFRAMES].published);
    assert.ok(entry.cues.length >= 3);
    assert.ok(entry.landmarks.every(point => point.position.every(Number.isFinite)));
  }
});

test('comparison leaves a gap at true model scale, including large and small specimens', () => {
  for (const a of RECOGNITION_LIBRARY) for (const b of RECOGNITION_LIBRARY) {
    const {positions, width} = comparisonLayout([a.id, b.id]);
    assert.ok(positions[0] + a.span / 2 < positions[1] - b.span / 2);
    assert.ok(Math.abs(positions[0] - a.span / 2 + width / 2) < 1e-9);
    assert.ok(Math.abs(positions[1] + b.span / 2 - width / 2) < 1e-9);
  }
});

test('bird anatomy keeps its modelled span and length across high/low details and finite animation', () => {
  for (const bird of Object.values(BIRDS)) for (const detail of ['high', 'low'] as const) {
    const model = createFlightModel(bird.id, 'visible', false, false, detail);
    const size = new Box3().setFromObject(model).getSize(new Vector3());
    assert.ok(Math.abs(size.x - bird.span) / bird.span < .02, `${bird.id} span`);
    assert.ok(Math.abs(size.z - bird.length) / bird.length < .02, `${bird.id} length`);
    for (const joint of ['wing-left', 'wing-right', 'elbow-left', 'elbow-right', 'wrist-left', 'wrist-right', 'tail']) assert.ok(model.getObjectByName(joint), joint);
    const state: FlightState = {
      position:[0,0,0], velocity:[0,0,0], orientation:[0,0,0,1], angularVelocity:[0,.2,0], rotorRPM:[], rotorAngles:[],
      wing:{shoulder:.4, elbow:.2, wrist:-.1, tail:.05, flapping:true}, surfaces:[0,0,0], airspeed:8, collided:false, stalled:false,
    };
    poseFlightRig(model, state, 4, 0);
    assert.equal(model.getObjectByName('wing-left')!.rotation.z, .4);
    assert.equal(model.getObjectByName('wing-right')!.rotation.z, -.4);
    model.updateMatrixWorld(true);
    model.traverse(object => assert.ok(object.matrixWorld.elements.every(Number.isFinite)));
    disposeModel(model);
  }
});

test('all inspection models have finite surfaces and bounded geometry in both render palettes', t => {
  const errors=t.mock.method(console, 'error', () => {});
  for (const entry of RECOGNITION_LIBRARY) for (const palette of ['visible', 'thermal'] as const) {
    const model = createFlightModel(entry.id, palette, false, false);
    let triangles = 0;
    model.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const geometry = object.geometry, positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
      assert.ok(positions && normals);
      assert.ok(Array.from(positions.array).every(Number.isFinite));
      assert.ok(Array.from(normals.array).every(Number.isFinite));
      triangles += (geometry.index?.count ?? positions.count) / 3;
    });
    assert.ok(triangles > 500 && triangles < 45000, `${entry.id}: ${triangles} triangles`);
    disposeModel(model);
  }
  assert.equal(errors.mock.callCount(), 0, 'Shared geometry must merge without renderer errors');
});

test('exported contact models retain their animation joints and match provenance hashes', () => {
  const credits = JSON.parse(readFileSync(new URL('../public/models/credits.json', import.meta.url), 'utf8')) as {assets:{file:string;sha256:string}[]};
  for (const entry of RECOGNITION_LIBRARY) for (const lod of ['', '-low']) {
    const file = `v3-${entry.id}${lod}.glb`;
    const asset = readFileSync(new URL(`../public/models/${file}`, import.meta.url));
    assert.equal(createHash('sha256').update(asset).digest('hex'), credits.assets.find(item => item.file === file)?.sha256);
    const json = JSON.parse(asset.subarray(20, 20 + asset.readUInt32LE(12)).toString()) as {nodes:{name?:string}[]};
    const joints = json.nodes.map(node => node.name);
    if (entry.family === 'Bird') {
      for (const name of ['wing-left', 'wing-right', 'elbow-left', 'wrist-right', 'tail']) assert.ok(joints.includes(name), `${file} ${name}`);
    } else for (let i = 0; i < FLIGHT_PROFILES[entry.id].motors.length; i++) assert.ok(joints.includes(`prop-${i}`), `${file} rotor ${i}`);
  }
});
