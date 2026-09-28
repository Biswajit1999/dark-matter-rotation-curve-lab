'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const futures = require('../futuresPhysics.js');

test('flux and illustrative event scale obey dimensional monotonicity', () => {
  const flux = futures.fluxCm2Second(0.4, 100, 220);
  assert.ok(flux > 80000 && flux < 100000);
  assert.equal(futures.fluxCm2Second(0.4, 50, 220), flux * 2);
  const rate = futures.illustrativeEventsPerKgDay(0.4, 100, 220, 1e-46, 0.5);
  assert.ok(Number.isFinite(rate) && rate > 0);
  assert.equal(futures.illustrativeEventsPerKgDay(0.4, 100, 220, 2e-46, 0.5), rate * 2);
});

test('spacing and de Broglie wavelength stay finite across representative masses', () => {
  for (const mass of [1e-6, 1, 1e6]) {
    assert.ok(futures.meanSpacingAu(0.4, mass) > 0);
    assert.ok(futures.deBroglieWavelengthMetres(mass, 220) > 0);
  }
  assert.ok(futures.deBroglieWavelengthMetres(1e-6, 220) > futures.deBroglieWavelengthMetres(1e6, 220));
});

test('frontier records label confidence and decisive tests', () => {
  const frontier = JSON.parse(fs.readFileSync('data/research_frontier.json', 'utf8'));
  assert.ok(frontier.scale_milestones.length >= 8);
  assert.ok(frontier.frontiers.length >= 6);
  assert.ok(frontier.timeline.length >= 6);
  assert.ok(frontier.frontiers.every(item => item.known && item.unknown && item.decisive));
  assert.ok(frontier.timeline.every(item => ['active', 'planned', 'conditional', 'speculative', 'unknown'].includes(item.certainty)));
});
