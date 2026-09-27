import crypto from 'node:crypto';
import fs from 'node:fs';

const SOURCE_URL = 'https://astroweb.case.edu/SPARC/MassModels_Lelli2016c.mrt';
const EXPECTED_SHA256 = '9108994b12cc401b94a1768beca61c53ec354779385c9c9cc571049f3043244c';
const TARGETS = [
  'NGC3198',
  'NGC2403',
  'NGC6503',
  'NGC6946',
  'NGC7331',
  'NGC5055',
  'NGC2841',
  'DDO154',
  'IC2574',
  'NGC7793'
];

const response = await fetch(SOURCE_URL);
if (!response.ok) throw new Error(`SPARC download failed: HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
if (checksum !== EXPECTED_SHA256) {
  throw new Error(`SPARC checksum changed: expected ${EXPECTED_SHA256}, received ${checksum}`);
}

const rowsByGalaxy = new Map(TARGETS.map(id => [id, []]));

for (const line of bytes.toString('utf8').split(/\r?\n/)) {
  const id = line.slice(0, 11).trim();
  if (!rowsByGalaxy.has(id)) continue;
  const row = (() => {
    const values = line.trim().split(/\s+/);
    if (values.length !== 10) throw new Error(`Unexpected SPARC row: ${line}`);
    const [, distance, radius, observed, uncertainty, gas, disk, bulge, surfaceDisk, surfaceBulge] = values;
    return {
      x: Number(radius),
      y: Number(observed),
      y_err: Number(uncertainty),
      v_gas: Number(gas),
      v_disk: Number(disk),
      v_bulge: Number(bulge),
      sb_disk: Number(surfaceDisk),
      sb_bulge: Number(surfaceBulge),
      distance_mpc: Number(distance)
    };
  })();
  rowsByGalaxy.get(id).push(row);
}

if (rowsByGalaxy.get('NGC3198').length !== 43) {
  throw new Error(`Expected 43 NGC3198 rows, received ${rowsByGalaxy.get('NGC3198').length}`);
}
for (const [id, rows] of rowsByGalaxy) {
  if (!rows.length) throw new Error(`No SPARC rows found for ${id}`);
}

const shared = {
  schema_version: '2.0.0',
  source: 'SPARC Newtonian Mass Models table from Lelli, McGaugh & Schombert (2016).',
  source_url: SOURCE_URL,
  citation: 'Lelli, F., McGaugh, S. S. and Schombert, J. M. (2016), The Astronomical Journal, 152, 157. DOI: 10.3847/0004-6256/152/6/157.',
  columns: {
    x: 'Galactocentric radius [kpc]',
    y: 'Observed circular velocity [km/s]',
    y_err: 'Random uncertainty in observed velocity [km/s]; excludes inclination systematics',
    v_gas: 'Gas contribution [km/s], including factor 1.33 for helium',
    v_disk: 'Stellar-disc contribution [km/s] at M/L_3.6 = 1 Msun/Lsun',
    v_bulge: 'Bulge contribution [km/s] at M/L_3.6 = 1 Msun/Lsun',
    sb_disk: 'Disc surface brightness [Lsun/pc^2]',
    sb_bulge: 'Bulge surface brightness [Lsun/pc^2]'
  },
  provenance: {
    upstream_sha256: checksum,
    retrieved_utc: '2026-09-27T00:00:00Z',
    selection: `Rows with ID in ${TARGETS.join(', ')}`,
    parser: 'scripts/import_sparc.mjs',
    transformations: ['Fixed-width table tokenisation', 'Column renaming only', 'No interpolation or fitting']
  },
  requiredCitations: [
    'Lelli, F., McGaugh, S. S. and Schombert, J. M. (2016)',
    'de Blok, W. J. G. et al. (2008)'
  ]
};

const displayName = id => id.replace(/^(NGC|IC|DDO)(\d)/, '$1 $2');
const galaxies = TARGETS.map(id => {
  const rows = rowsByGalaxy.get(id);
  return {
    galaxy_id: id,
    galaxy: displayName(id),
    dataset: `${displayName(id)} SPARC Newtonian mass model`,
    distance_mpc: rows[0].distance_mpc,
    n_points: rows.length,
    points: rows.map(({ distance_mpc, ...point }) => point)
  };
});

const catalog = {
  ...shared,
  dataset: 'Selected SPARC galaxy rotation curves and Newtonian mass models',
  selection_count: galaxies.length,
  total_points: galaxies.reduce((sum, galaxy) => sum + galaxy.n_points, 0),
  galaxies
};

const defaultGalaxy = galaxies.find(galaxy => galaxy.galaxy_id === 'NGC3198');
const reference = { ...shared, ...defaultGalaxy };

fs.writeFileSync('data/reference.json', `${JSON.stringify(reference, null, 2)}\n`);
fs.writeFileSync('data/galaxies.json', `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Wrote ${catalog.total_points} points for ${galaxies.length} galaxies (${checksum.slice(0, 12)}...).`);
