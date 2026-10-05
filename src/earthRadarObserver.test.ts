import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cartesian3, Matrix4, Transforms } from 'cesium';
import { earthRadarObserver } from './earthRadarObserver';
import { DEFAULT_RADAR_OBSERVER } from './radarMath';

const close = (actual: number[] | null, expected: number[]) => {
  assert.ok(actual);
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-6, `${value} ≠ ${expected[i]}`));
};
test('Earth map panning converts east/north metres to the shared scaled observer', () => {
  for (const [lon, lat, height] of [[77.2295, 28.6129, 200], [75.945, 34.428, 4000]]) {
    const frame = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(lon, lat, height));
    const inverse = Matrix4.inverseTransformation(frame, new Matrix4());
    const position = Matrix4.multiplyByPoint(frame, new Cartesian3(160, -640, 420), new Cartesian3());
    const direction = Matrix4.multiplyByPointAsVector(frame, new Cartesian3(0, 1, -1), new Cartesian3());
    close(earthRadarObserver(inverse, position, direction, 100), [20, 0, 52]);
  }
});
test('zoom and orbit around the airspace reticle retain its observer', () => {
  for (const heading of [0, .7, 2.4]) for (const range of [100, 1000, 2600]) {
    const target = new Cartesian3(0, 0, 120);
    const position = new Cartesian3(Math.sin(heading) * range, Math.cos(heading) * range, 120 + range);
    const direction = Cartesian3.subtract(target, position, new Cartesian3());
    close(earthRadarObserver(Matrix4.IDENTITY, position, direction, 120), DEFAULT_RADAR_OBSERVER);
  }
});
test('an upward or parallel map view keeps the last valid observer rather than jumping', () => {
  const position = new Cartesian3(10, 20, 500);
  assert.equal(earthRadarObserver(Matrix4.IDENTITY, position, new Cartesian3(0, 1, 0), 120), null);
  assert.equal(earthRadarObserver(Matrix4.IDENTITY, position, new Cartesian3(0, 1, 1), 120), null);
  assert.equal(earthRadarObserver(Matrix4.IDENTITY, new Cartesian3(0, 0, 10), new Cartesian3(0, 0, -1), 120), null);
});
