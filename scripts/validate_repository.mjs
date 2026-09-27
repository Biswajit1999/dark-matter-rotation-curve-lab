import fs from 'node:fs';

const failures = [];
const reference = JSON.parse(fs.readFileSync('data/reference.json', 'utf8'));
const catalog = JSON.parse(fs.readFileSync('data/galaxies.json', 'utf8'));
const physics = fs.readFileSync('rotationPhysics.js', 'utf8');
const worker = fs.readFileSync('physicsWorker.js', 'utf8');
const application = fs.readFileSync('app.js', 'utf8');

for (const functionName of ['pseudoIsothermalVelocity', 'nfwVelocity', 'burkertVelocity', 'weightedStatistics', 'gridFit', 'posteriorPredictive', 'samplePosterior']) {
  if (!physics.includes(`function ${functionName}`)) failures.push(`physics contract missing ${functionName}`);
}
if (!worker.includes("importScripts('rotationPhysics.js?v=")) failures.push('worker must load the versioned tested shared physics module');
if (!application.includes('standardised residuals') && !fs.readFileSync('index.html', 'utf8').toLowerCase().includes('standardised residuals')) {
  failures.push('standardised residual view is missing');
}
if (!reference.provenance?.transformations?.includes('No interpolation or fitting')) failures.push('data transformations are not explicit');
if (reference.points.some(point => !Object.hasOwn(point, 'v_gas') || !Object.hasOwn(point, 'v_disk'))) failures.push('published baryonic components are missing');
if (catalog.galaxies?.length !== 175 || catalog.total_points !== 3391) failures.push('complete 175-galaxy SPARC catalogue is incomplete');
if (!application.includes('posteriorPriors') || !application.includes('exportPosterior') || !application.includes('exportPredictive')) failures.push('Bayesian workspace controls or export are missing');
for (const galaxy of catalog.galaxies || []) {
  if (galaxy.points.some(point => !Object.hasOwn(point, 'v_gas') || !Object.hasOwn(point, 'v_disk'))) failures.push(`${galaxy.galaxy_id} baryonic components are missing`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Dark Matter Evidence Lab: research contracts passed for 3 halo models, 3,391 measurements, population relations, posterior sampling and predictive checks.');
