'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const lensing = require('../lensingPhysics.js');

test('cosmological distances are finite and geometrically ordered', () => {
  const lens = lensing.angularDiameterDistanceMpc(0.296);
  const source = lensing.angularDiameterDistanceMpc(1);
  const between = lensing.angularDiameterDistanceBetweenMpc(0.296, 1);
  assert.ok(lens > 800 && lens < 1100);
  assert.ok(source > lens);
  assert.ok(between > 0 && between < source);
  assert.equal(lensing.angularDiameterDistanceBetweenMpc(1, 0.5), 0);
});

test('Bullet Cluster lens geometry produces plausible finite observables', () => {
  const sigmaCritical = lensing.criticalSurfaceDensity(0.296, 1);
  const thetaEinstein = lensing.einsteinRadiusArcsec(1150, 0.296, 1);
  const scale = lensing.angularScaleKpcPerArcsec(0.296);
  assert.ok(sigmaCritical > 1000 && sigmaCritical < 10000);
  assert.ok(thetaEinstein > 10 && thetaEinstein < 100);
  assert.ok(scale > 3 && scale < 6);
});

test('cluster-system records preserve observation versus schematic distinctions', () => {
  const catalog = JSON.parse(fs.readFileSync('data/cluster_systems.json', 'utf8'));
  assert.equal(catalog.systems.length, 3);
  for (const system of catalog.systems) {
    assert.ok(system.redshift > 0);
    assert.ok(system.source_redshift > system.redshift);
    assert.ok(system.mass_peaks.length >= 2);
    assert.match(system.caution, /(schematic|geometry|reconstruction|disputed)/i);
    assert.match(system.reference_url, /^https:\/\//);
  }
});
