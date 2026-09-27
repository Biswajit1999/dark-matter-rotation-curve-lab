import crypto from 'node:crypto';
import fs from 'node:fs';

const SOURCES = {
  sample: {
    url: 'https://astroweb.case.edu/SPARC/SPARC_Lelli2016c.mrt',
    sha256: '5aa0501f6b0d881fa579030e315e7b5b6ef561a5bd3a07472f9929c7e5728243'
  },
  massModels: {
    url: 'https://astroweb.case.edu/SPARC/MassModels_Lelli2016c.mrt',
    sha256: '9108994b12cc401b94a1768beca61c53ec354779385c9c9cc571049f3043244c'
  }
};
const FEATURED = ['NGC3198', 'NGC2403', 'NGC6503', 'NGC6946', 'NGC7331', 'NGC5055', 'NGC2841', 'DDO154', 'IC2574', 'NGC7793'];
const HUBBLE_TYPES = ['S0', 'Sa', 'Sab', 'Sb', 'Sbc', 'Sc', 'Scd', 'Sd', 'Sdm', 'Sm', 'Im', 'BCD'];
const RETRIEVED_UTC = '2026-09-27T00:00:00Z';

async function download(source) {
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`SPARC download failed for ${source.url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  if (checksum !== source.sha256) {
    throw new Error(`SPARC checksum changed for ${source.url}: expected ${source.sha256}, received ${checksum}`);
  }
  return { text: bytes.toString('utf8'), checksum };
}

const [sampleSource, massModelSource] = await Promise.all([download(SOURCES.sample), download(SOURCES.massModels)]);
const metadataByGalaxy = new Map();

for (const line of sampleSource.text.split(/\r?\n/)) {
  const values = line.trim().split(/\s+/);
  if (values.length !== 19) continue;
  const [galaxyId, hubbleType, distance, distanceError, distanceMethod, inclination, inclinationError,
    luminosityValue, luminosityError, effectiveRadius, effectiveSurfaceBrightness, diskScaleLength,
    centralSurfaceBrightness, hiMassValue, hiRadius, flatVelocity, flatVelocityError, quality, references] = values;
  const hubbleTypeCode = Number(hubbleType);
  const qualityFlag = Number(quality);
  if (!galaxyId || !Number.isInteger(hubbleTypeCode) || hubbleTypeCode < 0 || hubbleTypeCode > 11 || ![1, 2, 3].includes(qualityFlag)) continue;
  const luminosity = Number(luminosityValue);
  const hiMass = Number(hiMassValue);
  const assumedStellarMass = 0.5 * luminosity;
  const heliumCorrectedGasMass = 1.33 * hiMass;
  const assumedBaryonicMass = assumedStellarMass + heliumCorrectedGasMass;
  metadataByGalaxy.set(galaxyId, {
    hubble_type_code: hubbleTypeCode,
    morphology: HUBBLE_TYPES[hubbleTypeCode] || `T=${hubbleTypeCode}`,
    distance_mpc: Number(distance),
    distance_error_mpc: Number(distanceError),
    distance_method_code: Number(distanceMethod),
    inclination_deg: Number(inclination),
    inclination_error_deg: Number(inclinationError),
    luminosity_3p6_1e9_lsun: luminosity,
    luminosity_3p6_error_1e9_lsun: Number(luminosityError),
    effective_radius_kpc: Number(effectiveRadius),
    effective_surface_brightness_lsun_pc2: Number(effectiveSurfaceBrightness),
    disk_scale_length_kpc: Number(diskScaleLength),
    central_surface_brightness_lsun_pc2: Number(centralSurfaceBrightness),
    hi_mass_1e9_msun: hiMass,
    hi_radius_kpc: Number(hiRadius),
    flat_velocity_kms: Number(flatVelocity),
    flat_velocity_error_kms: Number(flatVelocityError),
    quality_flag: qualityFlag,
    rotation_curve_references: references,
    derived: {
      stellar_mass_1e9_msun_at_ml_0p5: assumedStellarMass,
      gas_mass_1e9_msun_with_helium: heliumCorrectedGasMass,
      baryonic_mass_1e9_msun_at_ml_0p5: assumedBaryonicMass,
      gas_fraction_at_ml_0p5: assumedBaryonicMass > 0 ? heliumCorrectedGasMass / assumedBaryonicMass : 0
    },
    original_columns: {
      Galaxy: galaxyId,
      T: hubbleTypeCode,
      D: Number(distance),
      e_D: Number(distanceError),
      f_D: Number(distanceMethod),
      Inc: Number(inclination),
      e_Inc: Number(inclinationError),
      'L[3.6]': luminosity,
      'e_L[3.6]': Number(luminosityError),
      Reff: Number(effectiveRadius),
      SBeff: Number(effectiveSurfaceBrightness),
      Rdisk: Number(diskScaleLength),
      SBdisk: Number(centralSurfaceBrightness),
      MHI: hiMass,
      RHI: Number(hiRadius),
      Vflat: Number(flatVelocity),
      e_Vflat: Number(flatVelocityError),
      Q: qualityFlag,
      Ref: references
    }
  });
}

const rowsByGalaxy = new Map();
for (const line of massModelSource.text.split(/\r?\n/)) {
  const id = line.slice(0, 11).trim();
  if (!metadataByGalaxy.has(id)) continue;
  const values = line.trim().split(/\s+/);
  if (values.length !== 10) throw new Error(`Unexpected SPARC mass-model row: ${line}`);
  const [, distance, radius, observed, uncertainty, gas, disk, bulge, surfaceDisk, surfaceBulge] = values;
  const row = {
    x: Number(radius), y: Number(observed), y_err: Number(uncertainty), v_gas: Number(gas),
    v_disk: Number(disk), v_bulge: Number(bulge), sb_disk: Number(surfaceDisk), sb_bulge: Number(surfaceBulge),
    distance_mpc: Number(distance)
  };
  if (!rowsByGalaxy.has(id)) rowsByGalaxy.set(id, []);
  rowsByGalaxy.get(id).push(row);
}

if (metadataByGalaxy.size !== 175) throw new Error(`Expected 175 SPARC metadata rows, received ${metadataByGalaxy.size}`);
if (rowsByGalaxy.size !== 175) throw new Error(`Expected mass models for 175 galaxies, received ${rowsByGalaxy.size}`);
if (rowsByGalaxy.get('NGC3198')?.length !== 43) throw new Error('Expected 43 NGC3198 rows');

const shared = {
  schema_version: '3.0.0',
  source: 'SPARC galaxy sample and Newtonian mass models from Lelli, McGaugh & Schombert (2016).',
  source_url: SOURCES.massModels.url,
  citation: 'Lelli, F., McGaugh, S. S. and Schombert, J. M. (2016), The Astronomical Journal, 152, 157. DOI: 10.3847/0004-6256/152/6/157.',
  columns: {
    x: 'Galactocentric radius [kpc]', y: 'Observed circular velocity [km/s]',
    y_err: 'Random uncertainty in observed velocity [km/s]; excludes inclination systematics',
    v_gas: 'Gas contribution [km/s], including factor 1.33 for helium',
    v_disk: 'Stellar-disc contribution [km/s] at M/L_3.6 = 1 Msun/Lsun',
    v_bulge: 'Bulge contribution [km/s] at M/L_3.6 = 1 Msun/Lsun',
    sb_disk: 'Disc surface brightness [Lsun/pc^2]', sb_bulge: 'Bulge surface brightness [Lsun/pc^2]'
  },
  metadata_columns: {
    morphology: 'Hubble type decoded from original T column', distance_mpc: 'Distance [Mpc]',
    inclination_deg: 'Inclination [deg]', luminosity_3p6_1e9_lsun: 'Total 3.6 micron luminosity [10^9 Lsun]',
    effective_surface_brightness_lsun_pc2: 'Effective surface brightness at 3.6 micron [Lsun/pc^2]',
    hi_mass_1e9_msun: 'Total neutral-hydrogen mass [10^9 Msun]', flat_velocity_kms: 'Asymptotically flat velocity [km/s]',
    quality_flag: 'SPARC quality flag: 1 high, 2 medium, 3 low'
  },
  provenance: {
    upstream_sha256: massModelSource.checksum,
    source_checksums: { galaxy_sample: sampleSource.checksum, mass_models: massModelSource.checksum },
    retrieved_utc: RETRIEVED_UTC,
    selection: 'All 175 galaxies in the public SPARC sample table with their mass-model rows',
    parser: 'scripts/import_sparc.mjs',
    transformations: ['Fixed-width catalogue parsing', 'Mass-model table tokenisation', 'Column renaming only', 'No interpolation or fitting'],
    derived_quantities: 'Population stellar masses assume M/L_3.6=0.5; gas masses multiply MHI by 1.33 for helium; these assumptions are stored with each record.'
  },
  requiredCitations: ['Lelli, F., McGaugh, S. S. and Schombert, J. M. (2016)', 'de Blok, W. J. G. et al. (2008)']
};

const displayName = id => id.replace(/^(NGC|IC|DDO)(\d)/, '$1 $2');
const galaxies = [...metadataByGalaxy.entries()].map(([id, metadata]) => {
  const rows = rowsByGalaxy.get(id);
  return {
    galaxy_id: id,
    galaxy: displayName(id),
    dataset: `${displayName(id)} SPARC Newtonian mass model`,
    ...metadata,
    n_points: rows.length,
    maximum_observed_velocity_kms: Math.max(...rows.map(row => row.y)),
    points: rows.map(({ distance_mpc, ...point }) => point)
  };
});

const catalog = {
  ...shared,
  dataset: 'Complete SPARC galaxy sample and Newtonian mass models',
  selection_count: galaxies.length,
  total_points: galaxies.reduce((sum, galaxy) => sum + galaxy.n_points, 0),
  featured_galaxy_ids: FEATURED,
  galaxies
};
const defaultGalaxy = galaxies.find(galaxy => galaxy.galaxy_id === 'NGC3198');
const reference = { ...shared, ...defaultGalaxy };

fs.writeFileSync('data/reference.json', `${JSON.stringify(reference, null, 2)}\n`);
fs.writeFileSync('data/galaxies.json', `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Wrote ${catalog.total_points} points for ${galaxies.length} galaxies (${massModelSource.checksum.slice(0, 12)}...).`);
