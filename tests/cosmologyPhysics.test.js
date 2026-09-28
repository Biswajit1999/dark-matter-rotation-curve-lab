'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const cosmology = require('../cosmologyPhysics.js');

const reference = { omegaRadiation: 9e-5, omegaBaryon: 0.0493, omegaDarkMatter: 0.264, omegaDarkEnergy: 0.68661, w0: -1, wa: 0 };

test('cosmological component fractions close and evolve in the expected order', () => {
  for (const scaleFactor of [1e-6, 1e-4, 1e-3, 0.1, 1]) {
    const fractions = cosmology.componentFractions(scaleFactor, reference);
    const total = Object.values(fractions).reduce((sum, value) => sum + value, 0);
    assert.ok(Math.abs(total - 1) < 1e-12);
  }
  assert.ok(cosmology.componentFractions(1e-6, reference).radiation > 0.99);
  assert.ok(cosmology.componentFractions(1, reference).darkEnergy > 0.68);
});

test('matter-radiation equality and baryon share are finite', () => {
  assert.ok(cosmology.equalityRedshift(reference) > 3000 && cosmology.equalityRedshift(reference) < 4000);
  assert.ok(cosmology.baryonFractionOfMatter(reference) > 0.15 && cosmology.baryonFractionOfMatter(reference) < 0.17);
});

test('CPL dark-energy factor reduces exactly to a cosmological constant at w0=-1 wa=0', () => {
  for (const a of [0.1, 0.5, 1]) assert.ok(Math.abs(cosmology.darkEnergyDensityFactor(a, -1, 0) - 1) < 1e-14);
  assert.equal(cosmology.darkEnergyDensityFactor(1, -0.8, 0.5), 1);
});

test('Hubble and distance helpers have physically ordered behaviour', () => {
  assert.ok(Math.abs(cosmology.dimensionlessHubble(0, reference) - 1) < 1e-6);
  assert.ok(cosmology.hubbleKmSPerMpc(1, 67.4, reference) > 100);
  const d05 = cosmology.comovingDistanceMpc(0.5, 67.4, reference, 400);
  const d10 = cosmology.comovingDistanceMpc(1.0, 67.4, reference, 400);
  assert.ok(d05 > 1500 && d05 < 2300);
  assert.ok(d10 > d05 && d10 < 4000);
});

test('BAO distance summary stays finite and positive', () => {
  const result = cosmology.baoDistances(0.8, 67.4, reference, 147.09);
  for (const key of ['hubbleKmSPerMpc','dhMpc','dmMpc','dvMpc','dhOverRd','dmOverRd','dvOverRd']) assert.ok(Number.isFinite(result[key]) && result[key] > 0);
});

test('candidate atlas records explicit status and source links', () => {
  const atlas = JSON.parse(fs.readFileSync('data/dark_matter_candidates.json', 'utf8'));
  assert.ok(atlas.candidates.length >= 8);
  assert.ok(atlas.experiments.length >= 7);
  for (const candidate of atlas.candidates) {
    assert.match(candidate.source, /^https:\/\//);
    assert.ok(candidate.methods.length > 0);
    assert.match(candidate.status, /(remain|constrain|disputed|dependent|open|scan)/i);
  }
});
