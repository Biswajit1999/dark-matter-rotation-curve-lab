import crypto from 'node:crypto';
import fs from 'node:fs';

const SOURCE_URL = 'https://astroweb.case.edu/SPARC/MassModels_Lelli2016c.mrt';
const EXPECTED_SHA256 = '9108994b12cc401b94a1768beca61c53ec354779385c9c9cc571049f3043244c';
const GALAXY = 'NGC3198';

const response = await fetch(SOURCE_URL);
if (!response.ok) throw new Error(`SPARC download failed: HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
if (checksum !== EXPECTED_SHA256) {
  throw new Error(`SPARC checksum changed: expected ${EXPECTED_SHA256}, received ${checksum}`);
}

const rows = bytes.toString('utf8').split(/\r?\n/)
  .filter(line => line.slice(0, 11).trim() === GALAXY)
  .map(line => {
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
  });

if (rows.length !== 43) throw new Error(`Expected 43 ${GALAXY} rows, received ${rows.length}`);

const reference = {
  schema_version: '2.0.0',
  dataset: 'NGC 3198 SPARC Newtonian mass model',
  galaxy: 'NGC 3198',
  distance_mpc: rows[0].distance_mpc,
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
    selection: `Rows with ID=${GALAXY}`,
    parser: 'scripts/import_sparc.mjs',
    transformations: ['Fixed-width table tokenisation', 'Column renaming only', 'No interpolation or fitting']
  },
  n_points: rows.length,
  points: rows.map(({ distance_mpc, ...point }) => point),
  requiredCitations: [
    'Lelli, F., McGaugh, S. S. and Schombert, J. M. (2016)',
    'de Blok, W. J. G. et al. (2008)'
  ]
};

fs.writeFileSync('data/reference.json', `${JSON.stringify(reference, null, 2)}\n`);
console.log(`Wrote ${rows.length} ${GALAXY} rows to data/reference.json (${checksum.slice(0, 12)}...).`);
