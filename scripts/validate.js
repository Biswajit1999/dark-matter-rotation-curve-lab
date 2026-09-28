'use strict';

const fs = require('node:fs');

const required = [
  'README.md',
  'RESEARCH_QUALITY.md',
  'CITATION.cff',
  'index.html',
  'styles.css',
  'app.js',
  'physicsWorker.js',
  'rotationPhysics.js',
  'lensingPhysics.js',
  'cosmologyPhysics.js',
  'data/galaxies.json',
  'data/reference.json',
  'data/cluster_systems.json',
  'data/dark_matter_candidates.json',
  'scripts/import_sparc.mjs',
  'tests/rotationPhysics.test.js',
  'tests/lensingPhysics.test.js',
  'tests/cosmologyPhysics.test.js'
];
const failures = [];

for (const file of required) {
  if (!fs.existsSync(file)) failures.push(`${file} is missing`);
}
for (const image of [
  'assets/observations/hubble-m51.webp',
  'assets/observations/bullet-cluster-lensing.jpg',
  'assets/observations/planck-cmb.jpg',
  'assets/observations/rubin-lsst-camera.jpg'
]) {
  if (!fs.existsSync(image) || fs.statSync(image).size < 10_000) failures.push(`${image} is missing or invalid`);
}

if (failures.length === 0) {
  const reference = JSON.parse(fs.readFileSync('data/reference.json', 'utf8'));
  const catalog = JSON.parse(fs.readFileSync('data/galaxies.json', 'utf8'));
  const packageMetadata = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  if (reference.schema_version !== '3.0.0') failures.push('reference schema_version must be 3.0.0');
  if (reference.galaxy !== 'NGC 3198') failures.push('reference galaxy must be NGC 3198');
  if (reference.n_points !== 43 || reference.points?.length !== 43) failures.push('reference data must contain exactly 43 NGC 3198 points');
  if (!/^https:\/\/astroweb\.case\.edu\/SPARC\//.test(reference.source_url)) failures.push('reference source must resolve to the SPARC archive');
  if (!/^[a-f0-9]{64}$/.test(reference.provenance?.upstream_sha256 || '')) failures.push('reference provenance needs a SHA-256 checksum');
  if (catalog.selection_count !== 175 || catalog.galaxies?.length !== 175) failures.push('catalogue must contain all 175 SPARC galaxies');
  if (catalog.total_points !== 3391) failures.push('catalogue must contain 3,391 observations');
  if (new Set(catalog.galaxies?.map(galaxy => galaxy.galaxy_id)).size !== 175) failures.push('catalogue galaxy identifiers must be unique');
  if (!/^[a-f0-9]{64}$/.test(catalog.provenance?.source_checksums?.galaxy_sample || '')) failures.push('catalogue sample-table checksum is missing');

  const numericColumns = ['x', 'y', 'y_err', 'v_gas', 'v_disk', 'v_bulge', 'sb_disk', 'sb_bulge'];
  for (const galaxy of catalog.galaxies || []) {
    if (galaxy.n_points !== galaxy.points?.length || galaxy.n_points < 3) failures.push(`${galaxy.galaxy_id} has an invalid point count`);
    if (!galaxy.morphology || ![1, 2, 3].includes(galaxy.quality_flag)) failures.push(`${galaxy.galaxy_id} has invalid catalogue metadata`);
    for (const [index, point] of (galaxy.points || []).entries()) {
      for (const key of numericColumns) {
        if (!Number.isFinite(point[key])) failures.push(`${galaxy.galaxy_id} point ${index} has non-finite ${key}`);
      }
      if (point.y_err <= 0) failures.push(`${galaxy.galaxy_id} point ${index} has non-positive uncertainty`);
      if (index > 0 && point.x <= galaxy.points[index - 1].x) failures.push(`${galaxy.galaxy_id} radius is not strictly increasing at point ${index}`);
    }
  }

  const readme = fs.readFileSync('README.md', 'utf8');
  for (const citation of reference.requiredCitations || []) {
    const family = citation.split(',')[0];
    if (!readme.includes(family)) failures.push(`README is missing citation family ${family}`);
  }
  for (const requiredPhrase of ['weighted likelihood', 'pseudo-isothermal', 'NFW', 'Burkert', 'inclination']) {
    if (!readme.toLowerCase().includes(requiredPhrase.toLowerCase())) failures.push(`README is missing scientific contract: ${requiredPhrase}`);
  }

  const html = fs.readFileSync('index.html', 'utf8');
  for (const pattern of ['class="skip-link"', '<table>', 'aria-describedby="curveSummary"', 'id="galaxySelect"', 'id="populationSearch"', 'id="btfrCanvas"', 'id="rarCanvas"', 'id="challengeRelation"', 'id="challengeCurveCanvas"', 'id="challengeResidualCanvas"', 'id="challengeRows"', 'id="clusterSelect"', 'id="clusterCanvas"', 'id="clusterRows"', 'Schematic, not a dark-matter photograph', 'id="cosmologyCanvas"', 'id="candidateFamily"', 'id="candidateGrid"', 'id="experimentRows"', 'id="priorForm"', 'id="posteriorRows"', 'id="predictiveRows"', 'id="exportPredictive"', 'prefers-reduced-motion']) {
    const source = pattern === 'prefers-reduced-motion' ? fs.readFileSync('styles.css', 'utf8') : html;
    if (!source.includes(pattern)) failures.push(`accessibility contract missing: ${pattern}`);
  }
  const application = fs.readFileSync('app.js', 'utf8');
  const worker = fs.readFileSync('physicsWorker.js', 'utf8');
  const version = packageMetadata.version;
  for (const asset of [`styles.css?v=${version}`, `app.js?v=${version}`]) {
    if (!html.includes(asset)) failures.push(`HTML asset version is not pinned: ${asset}`);
  }
  if (!application.includes(`const BUILD_VERSION = '${version}'`)) failures.push('application build version does not match package version');
  if (!worker.includes(`rotationPhysics.js?v=${version}`)) failures.push('worker physics asset version does not match package version');

  const combined = required.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  const banned = ['TO' + 'DO', 'insert ' + 'logic', 'coming ' + 'soon', 'solar_residual_kms', 'Milky-Way-like anchors'];
  for (const token of banned) {
    if (combined.toLowerCase().includes(token.toLowerCase())) failures.push(`unfinished or stale token: ${token}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Dark Matter Evidence Lab: schema, provenance, citation and accessibility contracts passed.');
