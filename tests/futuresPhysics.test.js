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

test('local halo engineering upper bounds reproduce dimensional reference values', () => {
  const rho = futures.massDensityKgM3(0.4);
  assert.ok(Math.abs(rho / 7.13064768e-22 - 1) < 1e-10);
  const massFlux = futures.massFluxKgM2Second(0.4, 220);
  assert.ok(massFlux > 1.5e-16 && massFlux < 1.7e-16);
  const kinetic = futures.kineticPowerFluxWm2(0.4, 220);
  assert.ok(kinetic > 3.5e-6 && kinetic < 4.1e-6);
  const pressure = futures.momentumFluxPa(0.4, 220, 1);
  assert.ok(pressure > 3.3e-11 && pressure < 3.6e-11);
  const rest = futures.restMassPowerFluxWm2(0.4, 220, 1, 1);
  assert.ok(rest > 13 && rest < 15);
});

test('interaction probability is bounded and approaches optical-depth limit', () => {
  const tiny = futures.interactionProbabilityFromColumn(1e-46, 1e30);
  assert.ok(tiny > 0 && tiny < 1e-15);
  const thick = futures.interactionProbabilityFromColumn(1e-20, 1e25);
  assert.ok(thick > 0.9999 && thick <= 1);
});

test('engine scenario exposes why ambient dark matter is not automatically useful propulsion', () => {
  const ideal = futures.engineScenario({
    localDensityGevCm3: 0.4,
    speedKms: 220,
    collectorAreaM2: 1e6,
    spacecraftMassKg: 1e5,
    captureEfficiency: 1,
    conversionEfficiency: 1,
    momentumTransferFactor: 1,
    crossSectionCm2: 1,
    targetColumnPerCm2: 1e30
  });
  assert.ok(ideal.thrustN > 3e-5 && ideal.thrustN < 4e-5);
  assert.ok(ideal.restMassPowerW > 1.3e7 && ideal.restMassPowerW < 1.5e7);
  const weak = futures.engineScenario({ crossSectionCm2: 1e-46, targetColumnPerCm2: 1e30 });
  assert.ok(weak.interactionProbability < 1e-15);
  assert.ok(weak.thrustN < ideal.thrustN * 1e-15);
});

test('frontier records label confidence and decisive tests', () => {
  const frontier = JSON.parse(fs.readFileSync('data/research_frontier.json', 'utf8'));
  assert.ok(frontier.scale_milestones.length >= 8);
  assert.ok(frontier.frontiers.length >= 6);
  assert.ok(frontier.timeline.length >= 6);
  assert.ok(frontier.frontiers.every(item => item.known && item.unknown && item.decisive));
  assert.ok(frontier.timeline.every(item => ['active', 'planned', 'conditional', 'speculative', 'unknown'].includes(item.certainty)));
});
