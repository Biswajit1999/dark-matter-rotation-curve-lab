'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const cosmology = require('../cosmologyPhysics.js');

const reference = { omegaRadiation: 9e-5, omegaBaryon: 0.0493, omegaDarkMatter: 0.264, omegaDarkEnergy: 0.68661 };

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
