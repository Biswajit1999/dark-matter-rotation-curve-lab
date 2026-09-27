'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const physics = require('../rotationPhysics.js');

const reference = JSON.parse(fs.readFileSync('data/reference.json', 'utf8'));
const defaultParams = {
  haloModel: 'piso',
  massToLightDisk: 0.5,
  massToLightBulge: 0.7,
  haloVelocity: 150,
  haloScale: 5
};

test('pseudo-isothermal velocity is finite at the origin and asymptotes to v infinity', () => {
  assert.ok(Number.isFinite(physics.pseudoIsothermalVelocity(0, 180, 4)));
  assert.ok(physics.pseudoIsothermalVelocity(0, 180, 4) < 0.01);
  assert.ok(Math.abs(physics.pseudoIsothermalVelocity(1e6, 180, 4) - 180) < 0.01);
});

test('NFW and Burkert profiles remain finite and positive', () => {
  for (const model of [physics.nfwVelocity, physics.burkertVelocity]) {
    for (const radius of [0, 0.1, 1, 10, 100]) {
      const velocity = model(radius, 200, 8);
      assert.ok(Number.isFinite(velocity));
      assert.ok(velocity >= 0);
    }
  }
});

test('SPARC component evaluation uses mass-to-light scaling and published gas values', () => {
  const low = physics.componentsAt({ ...defaultParams, massToLightDisk: 0.25 }, reference.points, 10.04);
  const high = physics.componentsAt({ ...defaultParams, massToLightDisk: 1 }, reference.points, 10.04);
  assert.ok(Math.abs(high.disk / low.disk - 2) < 1e-10);
  assert.equal(high.gas, 23.68);
});

test('weighted likelihood returns one residual per observation', () => {
  const stats = physics.weightedStatistics(defaultParams, reference.points);
  assert.equal(stats.residuals.length, 43);
  assert.ok(Number.isFinite(stats.chiSquared));
  assert.ok(stats.chiSquared > 0);
  assert.equal(stats.degreesOfFreedom, 40);
});

test('all three halo models produce complete, finite evaluations', () => {
  for (const haloModel of ['piso', 'nfw', 'burkert']) {
    const result = physics.evaluate({ ...defaultParams, haloModel }, reference, false);
    assert.equal(result.series.length, 4);
    assert.equal(result.observed.length, 43);
    assert.ok(result.series.every(series => series.y.every(Number.isFinite)));
    assert.ok(Number.isFinite(result.metrics.reduced_chi_squared));
  }
});
