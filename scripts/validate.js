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
  'data/reference.json',
  'scripts/import_sparc.mjs',
  'tests/rotationPhysics.test.js'
];
const failures = [];

for (const file of required) {
  if (!fs.existsSync(file)) failures.push(`${file} is missing`);
}

if (failures.length === 0) {
  const reference = JSON.parse(fs.readFileSync('data/reference.json', 'utf8'));
  if (reference.schema_version !== '2.0.0') failures.push('reference schema_version must be 2.0.0');
  if (reference.galaxy !== 'NGC 3198') failures.push('reference galaxy must be NGC 3198');
  if (reference.n_points !== 43 || reference.points?.length !== 43) failures.push('reference data must contain exactly 43 NGC 3198 points');
  if (!/^https:\/\/astroweb\.case\.edu\/SPARC\//.test(reference.source_url)) failures.push('reference source must resolve to the SPARC archive');
  if (!/^[a-f0-9]{64}$/.test(reference.provenance?.upstream_sha256 || '')) failures.push('reference provenance needs a SHA-256 checksum');

  const numericColumns = ['x', 'y', 'y_err', 'v_gas', 'v_disk', 'v_bulge', 'sb_disk', 'sb_bulge'];
  for (const [index, point] of (reference.points || []).entries()) {
    for (const key of numericColumns) {
      if (!Number.isFinite(point[key])) failures.push(`point ${index} has non-finite ${key}`);
    }
    if (point.y_err <= 0) failures.push(`point ${index} has non-positive uncertainty`);
    if (index > 0 && point.x <= reference.points[index - 1].x) failures.push(`radius is not strictly increasing at point ${index}`);
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
  for (const pattern of ['class="skip-link"', '<table>', 'aria-describedby="curveSummary"', 'prefers-reduced-motion']) {
    const source = pattern === 'prefers-reduced-motion' ? fs.readFileSync('styles.css', 'utf8') : html;
    if (!source.includes(pattern)) failures.push(`accessibility contract missing: ${pattern}`);
  }

  const combined = required.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  const banned = ['TO' + 'DO', 'PLACE' + 'HOLDER', 'insert ' + 'logic', 'coming ' + 'soon', 'solar_residual_kms', 'Milky-Way-like anchors'];
  for (const token of banned) {
    if (combined.toLowerCase().includes(token.toLowerCase())) failures.push(`unfinished or stale token: ${token}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Dark Matter Evidence Lab: schema, provenance, citation and accessibility contracts passed.');
