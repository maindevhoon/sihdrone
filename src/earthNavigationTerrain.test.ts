import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cartesian3, Cartographic } from 'cesium';
import { limitTerrainMotion, zoomDestination } from './earthNavigationTerrain';
import { MIN_EARTH_RANGE } from './earthNavigationMath';

const site = (height: number, longitude = 75.7952) => Cartesian3.fromDegrees(longitude, 34.4709, height);
const height = (point: Cartesian3) => Cartographic.fromCartesian(point).height;
const close = (actual: number, expected: number, tolerance = .01) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('mountain zoom follows the actual 4300 m surface ray and reverses without drift', () => {
  const target = site(4300), position = site(5500, 75.7829);
  const closer = zoomDestination(position, target, -.3);
  close(Cartesian3.distance(closer, target) / Cartesian3.distance(position, target), Math.exp(-.3), 1e-9);
  const before = Cartesian3.normalize(Cartesian3.subtract(target, position, new Cartesian3()), new Cartesian3());
  const after = Cartesian3.normalize(Cartesian3.subtract(target, closer, new Cartesian3()), new Cartesian3());
  close(Cartesian3.dot(before, after), 1, 1e-12);
  close(Cartesian3.distance(zoomDestination(closer, target, .3), position), 0);
});

test('zoom stops above a high-altitude surface instead of using ellipsoid height', () => {
  for (const elevation of [215, 4300, 6000]) {
    const from = site(elevation + 100), target = site(elevation);
    let position = from;
    for (let i = 0; i < 30; i++) {
      position = limitTerrainMotion(position, zoomDestination(position, target, -.5), () => elevation);
      assert.ok(height(position) >= elevation + MIN_EARTH_RANGE - .001);
    }
    close(height(position), elevation + MIN_EARTH_RANGE);
    assert.ok(height(limitTerrainMotion(position, zoomDestination(position, target, .3), () => elevation)) > height(position));
  }
});

test('a ridge along the zoom path blocks travel even when the destination is clear', () => {
  const from = site(4700, 75.78), to = site(4600, 75.80);
  const ridge = (position: Cartographic) => {
    const longitude = position.longitude * 180 / Math.PI;
    return longitude > 75.787 && longitude < 75.794 ? 4800 : 4300;
  };
  const limited = limitTerrainMotion(from, to, ridge);
  const longitude = Cartographic.fromCartesian(limited).longitude * 180 / Math.PI;
  assert.ok(longitude > 75.78 && longitude <= 75.787);
  assert.ok(height(limited) >= ridge(Cartographic.fromCartesian(limited)) + MIN_EARTH_RANGE);
});

test('sloping terrain limits zoom on its original ray, keeping an off-centre cursor anchor', () => {
  const from = site(4600, 75.78), target = site(4300, 75.7952);
  const to = zoomDestination(from, target, -.6);
  const slope = (position: Cartographic) => 4200 + (position.longitude * 180 / Math.PI - 75.78) * 40000;
  const limited = limitTerrainMotion(from, to, slope);
  assert.ok(Cartesian3.distance(from, limited) < Cartesian3.distance(from, to));
  close(height(limited) - slope(Cartographic.fromCartesian(limited)), MIN_EARTH_RANGE, .05);
  const a = Cartesian3.normalize(Cartesian3.subtract(target, from, new Cartesian3()), new Cartesian3());
  const b = Cartesian3.normalize(Cartesian3.subtract(target, limited, new Cartesian3()), new Cartesian3());
  close(Cartesian3.dot(a, b), 1, 1e-12);
});

test('newly loaded terrain does not trap zoom-out beneath a slope', () => {
  const from = site(4350), target = site(4300);
  const outward = limitTerrainMotion(from, zoomDestination(from, target, .5), () => 4360);
  assert.ok(height(outward) > height(from));
  const inward = limitTerrainMotion(from, zoomDestination(from, target, -.5), () => 4360);
  close(Cartesian3.distance(inward, from), 0);
});

test('missing terrain retains ellipsoid clearance and invalid input never moves the camera', () => {
  const from = site(60), target = site(0);
  const destination = limitTerrainMotion(from, zoomDestination(from, target, -.6), () => undefined);
  close(height(destination), MIN_EARTH_RANGE);
  assert.deepEqual(zoomDestination(from, target, NaN), from);
  assert.deepEqual(zoomDestination(from, from, -.3), from);
});
