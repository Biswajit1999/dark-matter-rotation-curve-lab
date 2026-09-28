import fs from 'node:fs';

const failures = [];
const reference = JSON.parse(fs.readFileSync('data/reference.json', 'utf8'));
const catalog = JSON.parse(fs.readFileSync('data/galaxies.json', 'utf8'));
const physics = fs.readFileSync('rotationPhysics.js', 'utf8');
const worker = fs.readFileSync('physicsWorker.js', 'utf8');
const application = fs.readFileSync('app.js', 'utf8');
const lensing = fs.readFileSync('lensingPhysics.js', 'utf8');
const clusters = JSON.parse(fs.readFileSync('data/cluster_systems.json', 'utf8'));
const cosmology = fs.readFileSync('cosmologyPhysics.js', 'utf8');
const candidates = JSON.parse(fs.readFileSync('data/dark_matter_candidates.json', 'utf8'));
const futures = fs.readFileSync('futuresPhysics.js', 'utf8');
const frontier = JSON.parse(fs.readFileSync('data/research_frontier.json', 'utf8'));
const evidence = JSON.parse(fs.readFileSync('data/evidence_graph.json', 'utf8'));

for (const functionName of ['pseudoIsothermalVelocity', 'nfwVelocity', 'burkertVelocity', 'weightedStatistics', 'gridFit', 'posteriorPredictive', 'samplePosterior', 'rarAcceleration', 'simpleMondAcceleration', 'phenomenologicalVelocity']) {
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
if (!application.includes('renderChallenge') || !application.includes('exportChallenge')) failures.push('alternative-hypothesis workspace or export is missing');
for (const functionName of ['criticalSurfaceDensity', 'einsteinRadiusArcsec', 'angularScaleKpcPerArcsec']) {
  if (!lensing.includes(`function ${functionName}`)) failures.push(`lensing contract missing ${functionName}`);
}
if (clusters.systems?.length < 3 || clusters.systems.some(system => system.source_redshift <= system.redshift)) failures.push('colliding-cluster catalogue is incomplete or geometrically invalid');
if (!application.includes('renderLensing') || !application.includes('drawClusterMap')) failures.push('quantitative lensing workspace is missing');
for (const functionName of ['componentFractions', 'equalityRedshift', 'baryonFractionOfMatter']) {
  if (!cosmology.includes(`function ${functionName}`)) failures.push(`cosmology contract missing ${functionName}`);
}
if (candidates.candidates?.length < 8 || candidates.experiments?.length < 7) failures.push('candidate or experiment landscape is incomplete');
if (!application.includes('renderCosmology') || !application.includes('renderCandidates')) failures.push('cosmology or candidate workspace is missing');
for (const functionName of ['fluxCm2Second', 'illustrativeEventsPerKgDay', 'deBroglieWavelengthMetres']) {
  if (!futures.includes(`function ${functionName}`)) failures.push(`future-sandbox contract missing ${functionName}`);
}
if (frontier.frontiers?.length < 6 || frontier.timeline?.length < 6) failures.push('research-frontier or future timeline is incomplete');
if (!application.includes('renderFutures') || !application.includes('nearestScaleMilestone')) failures.push('scale or future workspace is missing');
if (evidence.nodes?.length < 12 || evidence.edges?.length < 11) failures.push('evidence graph is incomplete');
if (!application.includes('renderEvidenceGraph') || !application.includes('applyMode') || !application.includes('exportWorkspace')) failures.push('evidence modes or workspace export are missing');
for (const galaxy of catalog.galaxies || []) {
  if (galaxy.points.some(point => !Object.hasOwn(point, 'v_gas') || !Object.hasOwn(point, 'v_disk'))) failures.push(`${galaxy.galaxy_id} baryonic components are missing`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Dark Matter Evidence Lab: research contracts passed for galaxy dynamics, posterior checks and quantitative multi-cluster lensing.');
