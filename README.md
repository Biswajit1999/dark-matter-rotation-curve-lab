# Dark Matter Evidence Lab

Dark Matter Evidence Lab is a reproducible interactive research and teaching
environment for a connected set of questions: what additional gravitating
component is required by galaxy dynamics, how does cluster lensing locate mass
relative to hot gas, what does cosmology measure, and which technologies could
identify the underlying particle or field?

The interactive workbench fits **3,391 published measurements across all 175
SPARC galaxies**. It displays quoted random
uncertainties, published gas and stellar contributions, a selected halo
profile, the total model, standardised residuals and a two-parameter Δχ²
surface. Real observatory imagery then connects this galaxy-scale evidence to
the Bullet Cluster, Planck cosmology and Rubin survey technology. The app does
not identify a dark-matter particle and does not treat an interactive grid
minimum as a publication-quality posterior.

## What changed in v2

The pre-upgrade teaching application is preserved at the `v1-legacy` tag. The
active application now:

- uses the SPARC `Vgas`, `Vdisk` and `Vbul` columns instead of invented
  exponential-like velocity proxies;
- evaluates pseudo-isothermal, NFW and Burkert halo profiles in a shared,
  unit-documented module;
- computes a weighted likelihood from the quoted `e_Vobs` values, with χ²,
  reduced χ², log likelihood, AIC, BIC and weighted RMS diagnostics;
- reports the outer halo share as a velocity-squared decomposition, not as an
  exact deprojected mass fraction;
- plots standardised residuals and a real Δχ² response surface;
- provides an accessible HTML data table plus CSV and SVG exports;
- ignores stale Worker responses, keeps numerical work off the UI thread and
  supports reduced motion, visible focus and responsive layouts;
- pins the upstream table checksum and supplies a deterministic ingestion
  script and analytic tests.
- lets the same tested model run across the complete 175-galaxy SPARC sample;
- preserves morphology, distance and inclination errors, luminosity, surface
  brightness, H I mass, flat velocity, quality flags, original column names
  and source references in a normalized, checksum-pinned schema;
- adds a linked Population Lab with name, quality, surface-brightness and
  gas-dominance filters, BTFR and RAR views, accessible data and CSV/JSON export;
- adds a galaxy-level “Challenge the model” laboratory comparing baryons-only,
  the current halo configuration, the empirical RAR form and a MOND-like simple
  interpolation function with explicit acceleration-scale and M/L assumptions;
- replaces generic generated-looking hero media with credited Hubble, Webb,
  Chandra, Planck and Rubin products stored in the repository;
- adds a 2026–2076 capability roadmap with explicit validation gates and labels
  its later stages as conditional research directions, not mission forecasts.
- provides explicit uniform prior bounds, deterministic adaptive Metropolis
  chains, 68% credible intervals, split-R-hat, effective sample size, parameter
  covariance visualisation and downloadable posterior samples;
- generates deterministic posterior predictive intervals, reports predictive
  coverage and a discrepancy-based Bayesian posterior-predictive p-value, and
  exports the interval table as CSV;
- verifies known-truth recovery on a deterministic synthetic galaxy fixture.
- adds a quantitative multi-cluster lensing laboratory with live angular-diameter
  distances, critical surface density, SIS Einstein-radius scale, independent
  tracer layers and explicit reconstruction/systematic warnings;
- includes Bullet Cluster, MACS J0025.4-1222 and disputed Abell 520 cases in a
  machine-readable catalogue linked to primary papers and observatory records.

## Development phases

| Phase | Scope | Status |
|---|---|---|
| A | Scientific correctness and repository cleanup | Complete |
| B | Complete 175-galaxy SPARC workbench and normalized catalogue | Complete |
| C | Bayesian inference workspace | Complete |
| D | Population, BTFR and radial-acceleration laboratory | Complete |
| E | Alternative-hypothesis residual and assumption laboratory | Complete |
| F | Quantitative lensing and colliding-cluster laboratory | Complete |
| G | Cosmology, particle-candidate and experiment landscape | Complete |
| H | Scale explorer, research frontier and constrained-futures laboratory | Next |
| I | Evidence graph, educator/research modes and publication polish | Pending |

Overview imagery does not count as completion of a scientific module. A phase
is marked complete only when its data, computation, provenance, interface and
tests are implemented.

## Run locally

The application remains dependency-free and needs only a static HTTP server:

```bash
npx serve .
```

Open the URL printed by the server. A direct `file://` URL cannot reliably load
Web Workers or the JSON dataset in modern browsers.

## Reproduce the dataset

```bash
npm run data:refresh
```

`scripts/import_sparc.mjs` downloads the official SPARC galaxy-sample and
Newtonian mass-model tables. It verifies SHA-256
`5aa0501f6b0d881fa579030e315e7b5b6ef561a5bd3a07472f9929c7e5728243`
for `SPARC_Lelli2016c.mrt` and
`9108994b12cc401b94a1768beca61c53ec354779385c9c9cc571049f3043244c`
for `MassModels_Lelli2016c.mrt`. It preserves all 175 catalogue records and
3,391 mass-model rows without interpolation. It writes `data/galaxies.json` plus the NGC 3198
compatibility fixture in `data/reference.json`. A checksum mismatch stops the
import so an upstream change cannot silently alter the fixtures.

The table defines:

- `Vobs` and `e_Vobs`: observed velocity and its random uncertainty from
  non-circular motions or kinematic asymmetries;
- `Vgas`: gas contribution including the SPARC factor 1.33 for helium;
- `Vdisk` and `Vbul`: stellar contributions at
  \(\Upsilon_{3.6}=1\ M_\odot/L_\odot\);
- `SBdisk` and `SBbul`: inclination-corrected surface-brightness profiles.

The quoted random errors do **not** include systematic uncertainty from the
inclination correction. The current browser fit also fixes SPARC's adopted
distance for the selected galaxy. These limitations are displayed in the interface and are
the next nuisance parameters to implement.

## Population laboratory

The population view applies one shared selection to the accessible catalogue,
BTFR and RAR panels. The BTFR uses published positive `Vflat` values and the
explicit illustrative assumption:

```text
Mbar = 0.5 L3.6 + 1.33 MHI
```

The RAR evaluates each resolved radius using `g = v²/R`, fixed disc and bulge
mass-to-light ratios of 0.5 and 0.7, and the sign-preserving SPARC gas
contribution. Its violet reference is the McGaugh et al. (2016)
phenomenological relation with `g† = 1.2e-10 m/s²`. Neither panel performs a
hierarchical fit or propagates all distance, inclination and stellar-population
systematics. The interface labels these assumptions and does not interpret a
correlation as proof of a unique physical cause.

## Challenge the model

The selected galaxy can also be evaluated without adding a halo contribution.
The laboratory compares baryons alone with two explicit acceleration mappings:

```text
Empirical RAR: gpred = gbar / [1 - exp(-sqrt(gbar/g†))]
Simple ν:      gpred = [1/2 + sqrt(1/4 + a0/gbar)] gbar
```

The browser exposes the acceleration scale and disc mass-to-light ratio, then
reports velocity curves, standardised residuals, χ², RMS and outlier counts at
the displayed parameter values. These are phenomenological tests under fixed
assumptions—not evidence that one framework is true. Relativistic completion,
the MOND external-field effect and non-galaxy constraints are not implemented.

## Lensing and colliding clusters

Phase F adds a separate, tested geometry module. For each catalogued merger it
computes angular-diameter distances in a flat ΛCDM reference cosmology,
critical surface density and the Einstein-radius scale of a singular isothermal
sphere. The displayed optical-galaxy, X-ray-gas, shear and total-mass layers are
normalised explanatory reconstructions, not pixel fits to the credited
observatory products. Layer labels deliberately distinguish direct tracers from
the model-dependent mass inversion.

The default Bullet Cluster record uses `z_l = 0.296`; MACS J0025.4-1222 provides
an independent merger case, while Abell 520 is explicitly labelled as a
systematics stress case because published reconstructions have disagreed about
its central mass peak. Interactive velocity dispersion is only an SIS scale
proxy. It must not be interpreted as a fitted merger mass or a constraint on
dark-matter self-interactions.

## Cosmology and candidate landscape

Phase G evaluates the background evolution of radiation, baryons, cold dark
matter and a cosmological constant. The scale-factor control displays each
component's fractional contribution to `H²`, matter–radiation equality and the
baryon share of total matter. Present-day baryon and cold-dark-matter controls
preserve flatness by assigning the remainder to ΩΛ. This is a background
calculation, not a Boltzmann solver or Planck likelihood fit.

The machine-readable candidate atlas deliberately spans particles, coherent
fields, interaction frameworks and compact objects. It links each candidate to
complementary observables and keeps “operating”, “constrained”, “proposed” and
“no accepted detection” conceptually separate. Exclusion contours are not
compressed into one misleading universal mass–cross-section plot because the
relevant coupling and observable differ by model.

## Model equations

At every radius the application uses SPARC's sign-preserving convention for
component accelerations:

```text
v_bar² = sign(Vgas) Vgas²
       + Υdisk sign(Vdisk) Vdisk²
       + Υbul  sign(Vbul)  Vbul²

v_total² = v_bar² + v_halo²
```

The interactive release holds `Υbul` fixed at 0.7; galaxies with no SPARC bulge
component are unaffected by that value. The three halo families are:

```text
pISO:   v² = v∞² [1 - (rc/r) atan(r/rc)]

NFW:    v² = vs² [ln(1+x) - x/(1+x)] / x
        x = r/rs,  vs² = 4πGρsrs²

Burkert:v² = vs² {ln[(1+x)²(1+x²)] - 2 atan(x)} / x
        x = r/r0,  vs² = πGρ0r0²
```

The weighted likelihood assumes independent Gaussian random errors:

```text
χ² = Σ [(Vobs - Vmodel) / σV]²
ln L = -χ² / 2 + constant
```

That independence assumption is explicit: the current release does not claim
to model covariance, distance uncertainty, inclination uncertainty or stellar
population uncertainty beyond the interactive disc mass-to-light ratio.

## Bayesian workspace

Phase C adds four deterministic adaptive Metropolis chains for the disc
mass-to-light ratio, halo velocity scale and halo radius. The browser exposes
all prior bounds and records the sampler configuration and seed. Proposal
covariance is adapted only during warm-up; retained draws are not used to tune
the sampler. The interface reports median and 16th/84th percentiles, split
R-hat, an autocorrelation-based effective sample-size estimate and acceptance
rate. It also propagates retained draws through the rotation model and quoted
random errors to form a 68% posterior predictive interval at every observed
radius. Predictive coverage and a discrepancy-based Bayesian p-value are model
checks, not probabilities that a halo family is true. Samples and predictive
intervals can be exported as separate CSV files.

This is a transparent teaching and diagnostic implementation, not a substitute
for a peer-reviewed inference workflow. Scientific publication should confirm
results with a maintained inference package and include prior-sensitivity,
repeated synthetic-coverage calibration and posterior-predictive tests using a
complete treatment of correlated systematics.

## Validate

```bash
npm run verify
```

The verification chain performs JavaScript syntax checks, validates the data
schema/provenance/citations/accessibility hooks, tests analytic profile limits
and verifies that every halo family produces finite values for all 3,391
observations across all 175 systems.

## Repository map

| Path | Role |
|---|---|
| `index.html` | Semantic workstation, controls, chart descriptions and table |
| `styles.css` | Responsive semantic-token theme and focus/reduced-motion states |
| `app.js` | UI state, high-DPI plotting, exports and Worker request ordering |
| `rotationPhysics.js` | Tested halo profiles, SPARC decomposition and likelihood |
| `lensingPhysics.js` | Tested lens geometry, critical density and SIS scale |
| `cosmologyPhysics.js` | Tested background-density evolution and equality scale |
| `physicsWorker.js` | Off-thread evaluation and deterministic grid fit |
| `data/galaxies.json` | Complete SPARC catalogue with 175 galaxies and 3,391 observations |
| `data/reference.json` | NGC 3198 compatibility fixture |
| `data/cluster_systems.json` | Multi-cluster evidence records and schematic coordinates |
| `data/dark_matter_candidates.json` | Candidate and experiment landscape with source links |
| `assets/observations/` | Real Hubble, Chandra/Webb, Planck and Rubin imagery |
| `scripts/import_sparc.mjs` | Checksum-pinned SPARC ingestion |
| `tests/rotationPhysics.test.js` | Analytic, data and finite-output tests |
| `tests/lensingPhysics.test.js` | Distance-geometry and cluster-contract tests |
| `tests/cosmologyPhysics.test.js` | Component-closure and candidate-schema tests |

## Research boundaries

- A low χ² for one profile does not establish that profile as uniquely true.
- SPARC random uncertainties are not the complete error budget.
- `v_halo²/v_total²` at one radius is a force decomposition, not an exact
  three-dimensional enclosed dark-matter mass fraction for a flattened disc.
- The catalogue is complete relative to the published SPARC sample, but SPARC
  itself is not a volume-limited or statistically complete galaxy survey. Each
  population view therefore exposes its selection and quality criteria.
- Rotation curves constrain the gravitational field. They do not establish
  the microscopic identity of dark matter.

See [RESEARCH_QUALITY.md](RESEARCH_QUALITY.md) for the validation contract.
Image credits and primary-source links are displayed directly beneath every
image in the application.

## References

- Lelli, F., McGaugh, S. S. and Schombert, J. M. (2016), “SPARC: Mass
  Models for 175 Disk Galaxies with Spitzer Photometry and Accurate Rotation
  Curves”, *The Astronomical Journal* 152, 157.
  https://doi.org/10.3847/0004-6256/152/6/157
- de Blok, W. J. G. et al. (2008), “High-Resolution Rotation Curves and
  Galaxy Mass Models from THINGS”, *The Astronomical Journal* 136, 2648.
  https://doi.org/10.1088/0004-6256/136/6/2648
- Navarro, J. F., Frenk, C. S. and White, S. D. M. (1996), “The Structure
  of Cold Dark Matter Halos”, *The Astrophysical Journal* 462, 563.
  https://doi.org/10.1086/177173
- Burkert, A. (1995), “The Structure of Dark Matter Halos in Dwarf
  Galaxies”, *The Astrophysical Journal Letters* 447, L25.
  https://doi.org/10.1086/309560
- McGaugh, S. S., Lelli, F. and Schombert, J. M. (2016), “Radial Acceleration
  Relation in Rotationally Supported Galaxies”, *Physical Review Letters* 117,
  201101. https://doi.org/10.1103/PhysRevLett.117.201101
- NASA/CXC/SAO et al. (2025), “New Image from NASA's Webb and Chandra
  'Pierces' Bullet Cluster”.
  https://chandra.harvard.edu/photo/2025/bullet/more.html
- ESA/Planck Collaboration (2019), “The CMB temperature on large angular
  scales”.
  https://www.esa.int/ESA_Multimedia/Images/2019/06/The_CMB_temperature_on_large_angular_scales
- NASA (2026), “Roman Space Telescope: Weak Lensing”.
  https://science.nasa.gov/mission/roman-space-telescope/weak-lensing/
