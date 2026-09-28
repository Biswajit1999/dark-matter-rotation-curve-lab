'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const physics = require('../rotationPhysics.js');

const reference = JSON.parse(fs.readFileSync('data/reference.json', 'utf8'));
const catalog = JSON.parse(fs.readFileSync('data/galaxies.json', 'utf8'));
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
  assert.ok(Number.isFinite(stats.bic));
  assert.ok(stats.bic > stats.aic);
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

test('all 175 SPARC galaxies produce finite evaluations for every halo family', () => {
  assert.equal(catalog.galaxies.length, 175);
  assert.equal(catalog.total_points, 3391);
  for (const galaxy of catalog.galaxies) {
    for (const haloModel of ['piso', 'nfw', 'burkert']) {
      const result = physics.evaluate({ ...defaultParams, haloModel }, galaxy, false);
      assert.equal(result.observed.length, galaxy.n_points);
      assert.ok(result.series.every(series => series.y.every(Number.isFinite)), `${galaxy.galaxy_id} ${haloModel}`);
      assert.ok(Number.isFinite(result.metrics.reduced_chi_squared));
    }
  }
});

test('deterministic posterior sampling respects priors and reports diagnostics', () => {
  const posterior = physics.samplePosterior(defaultParams, reference, {
    priors: {
      massToLightDisk: [0.2, 0.9],
      haloVelocity: [80, 220],
      haloScale: [0.5, 12]
    },
    chainCount: 4,
    iterations: 1200,
    burnIn: 400,
    thin: 2,
    seed: 42
  }).posterior;
  assert.equal(posterior.chains.length, 4);
  assert.equal(posterior.samples.length, 1600);
  assert.ok(posterior.samples.every(sample => sample.massToLightDisk >= 0.2 && sample.massToLightDisk <= 0.9));
  assert.ok(posterior.samples.every(sample => sample.haloVelocity >= 80 && sample.haloVelocity <= 220));
  assert.ok(posterior.samples.every(sample => sample.haloScale >= 0.5 && sample.haloScale <= 12));
  assert.ok(Number.isFinite(posterior.diagnostics.maxRhat));
  assert.ok(Number.isFinite(posterior.diagnostics.minEss));
  assert.ok(posterior.diagnostics.meanAcceptance > 0 && posterior.diagnostics.meanAcceptance < 1);
  assert.equal(posterior.predictive.intervals.length, reference.points.length);
  assert.ok(posterior.predictive.intervals.every(interval => (
    interval.predictiveQ16 <= interval.predictiveMedian && interval.predictiveMedian <= interval.predictiveQ84
  )));
  assert.ok(posterior.predictive.coverage68 >= 0 && posterior.predictive.coverage68 <= 1);
  assert.ok(posterior.predictive.bayesianPValue >= 0 && posterior.predictive.bayesianPValue <= 1);
});

test('population metadata and acceleration transforms are finite and traceable', () => {
  const accelerationFactor = 3.240779289e-14;
  for (const galaxy of catalog.galaxies) {
    assert.match(galaxy.morphology, /\S/);
    assert.ok([1, 2, 3].includes(galaxy.quality_flag));
    assert.ok(Number.isFinite(galaxy.derived.gas_fraction_at_ml_0p5));
    assert.ok(galaxy.original_columns.Galaxy === galaxy.galaxy_id);
    for (const point of galaxy.points) {
      const baryonicVelocitySquared = point.v_gas * Math.abs(point.v_gas) + 0.5 * point.v_disk ** 2 + 0.7 * point.v_bulge ** 2;
      const observedAcceleration = point.y ** 2 / point.x * accelerationFactor;
      assert.ok(Number.isFinite(observedAcceleration) && observedAcceleration > 0);
      assert.ok(Number.isFinite(baryonicVelocitySquared));
    }
  }
});

test('RAR and simple-nu phenomenology recover Newtonian and deep-acceleration limits', () => {
  const scale = 1.2e-10;
  const high = 1e-7;
  const low = 1e-14;
  assert.ok(Math.abs(physics.rarAcceleration(high, scale) / high - 1) < 0.01);
  assert.ok(Math.abs(physics.simpleMondAcceleration(high, scale) / high - 1) < 0.01);
  const deepLimit = Math.sqrt(low * scale);
  assert.ok(Math.abs(physics.rarAcceleration(low, scale) / deepLimit - 1) < 0.01);
  assert.ok(Math.abs(physics.simpleMondAcceleration(low, scale) / deepLimit - 1) < 0.01);
  const point = reference.points[10];
  for (const relation of ['rar', 'mond-simple']) {
    const velocity = physics.phenomenologicalVelocity(point, relation, 0.5, 0.7, scale);
    assert.ok(Number.isFinite(velocity) && velocity > 0);
  }
});

test('synthetic known-truth galaxy is recovered within two posterior interval widths', () => {
  const truth = {
    ...defaultParams,
    massToLightDisk: 0.55,
    haloVelocity: 180,
    haloScale: 6
  };
  let randomState = 24680;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) * Math.cos(2 * Math.PI * random());
  const points = reference.points.map(point => ({ ...point, y_err: 7 }));
  points.forEach(point => {
    point.y = physics.componentsAt(truth, points, point.x).total + point.y_err * normal();
  });
  const synthetic = { ...reference, galaxy: 'Synthetic known-truth fixture', n_points: points.length, points };
  const posterior = physics.samplePosterior(
    { ...truth, massToLightDisk: 0.45, haloVelocity: 165, haloScale: 5 },
    synthetic,
    {
      priors: {
        massToLightDisk: [0.2, 0.9],
        haloVelocity: [120, 240],
        haloScale: [2, 12]
      },
      chainCount: 4,
      iterations: 1800,
      burnIn: 600,
      thin: 2,
      seed: 731
    }
  ).posterior;

  for (const key of posterior.parameterKeys) {
    const summary = posterior.summaries[key];
    const halfWidth68 = Math.max(1e-12, (summary.q84 - summary.q16) / 2);
    assert.ok(Math.abs(summary.median - truth[key]) <= 2 * halfWidth68, `${key} truth was not recovered`);
  }
  assert.ok(posterior.diagnostics.maxRhat < 1.05);
  assert.ok(posterior.predictive.coverage68 > 0.5 && posterior.predictive.coverage68 < 0.9);
  assert.ok(posterior.predictive.bayesianPValue > 0.1 && posterior.predictive.bayesianPValue < 0.9);
});
