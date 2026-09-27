# Dark Matter Evidence Lab

Dark Matter Evidence Lab is a reproducible interactive research and teaching
environment for a connected set of questions: what additional gravitating
component is required by galaxy dynamics, how does cluster lensing locate mass
relative to hot gas, what does cosmology measure, and which technologies could
identify the underlying particle or field?

The interactive workbench fits **411 published measurements across ten SPARC
galaxies**: NGC 3198, NGC 2403, NGC 6503, NGC 6946, NGC 7331, NGC 5055,
NGC 2841, DDO 154, IC 2574 and NGC 7793. It displays quoted random
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
  reduced χ², log likelihood, AIC and weighted RMS diagnostics;
- reports the outer halo share as a velocity-squared decomposition, not as an
  exact deprojected mass fraction;
- plots standardised residuals and a real Δχ² response surface;
- provides an accessible HTML data table plus CSV and SVG exports;
- ignores stale Worker responses, keeps numerical work off the UI thread and
  supports reduced motion, visible focus and responsive layouts;
- pins the upstream table checksum and supplies a deterministic ingestion
  script and analytic tests.
- lets the same tested model run across ten galaxies rather than presenting one
  system as representative of a population;
- replaces generic generated-looking hero media with credited Hubble, Webb,
  Chandra, Planck and Rubin products stored in the repository;
- adds a 2026–2076 capability roadmap with explicit validation gates and labels
  its later stages as conditional research directions, not mission forecasts.
- provides explicit uniform prior bounds, deterministic adaptive Metropolis
  chains, 68% credible intervals, split-R-hat, effective sample size, parameter
  covariance visualisation and downloadable posterior samples.

## Development phases

| Phase | Scope | Status |
|---|---|---|
| A | Scientific correctness and repository cleanup | Complete |
| B | SPARC multi-galaxy laboratory | Complete |
| C | Bayesian inference workspace | Complete |
| D | Multiwavelength and archive infrastructure | Next |
| E | Dwarf dynamics, lensing and X-ray laboratories | Pending |
| F | CMB, particle-search and future-sensitivity laboratories | Pending |
| G | Publication mode, educator material and public release | Pending |

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

`scripts/import_sparc.mjs` downloads the official SPARC
`MassModels_Lelli2016c.mrt` table, verifies SHA-256
`9108994b12cc401b94a1768beca61c53ec354779385c9c9cc571049f3043244c`,
selects 411 rows belonging to the ten named galaxies and renames columns
without changing values. It writes `data/galaxies.json` plus the NGC 3198
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
distance of 13.8 Mpc. These limitations are displayed in the interface and are
the next nuisance parameters to implement.

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
rate. Samples can be exported as CSV with chain and draw identifiers.

This is a transparent teaching and diagnostic implementation, not a substitute
for a peer-reviewed inference workflow. Scientific publication should confirm
results with a maintained inference package and include prior-sensitivity,
synthetic-coverage and posterior-predictive tests.

## Validate

```bash
npm run verify
```

The verification chain performs JavaScript syntax checks, validates the data
schema/provenance/citations/accessibility hooks, tests analytic profile limits
and verifies that every halo family produces finite values for all 411
observations across the ten selected systems.

## Repository map

| Path | Role |
|---|---|
| `index.html` | Semantic workstation, controls, chart descriptions and table |
| `styles.css` | Responsive semantic-token theme and focus/reduced-motion states |
| `app.js` | UI state, high-DPI plotting, exports and Worker request ordering |
| `rotationPhysics.js` | Tested halo profiles, SPARC decomposition and likelihood |
| `physicsWorker.js` | Off-thread evaluation and deterministic grid fit |
| `data/galaxies.json` | Ten-galaxy SPARC catalogue with 411 observations |
| `data/reference.json` | NGC 3198 compatibility fixture |
| `assets/observations/` | Real Hubble, Chandra/Webb, Planck and Rubin imagery |
| `scripts/import_sparc.mjs` | Checksum-pinned SPARC ingestion |
| `tests/rotationPhysics.test.js` | Analytic, data and finite-output tests |

## Research boundaries

- A low χ² for one profile does not establish that profile as uniquely true.
- SPARC random uncertainties are not the complete error budget.
- `v_halo²/v_total²` at one radius is a force decomposition, not an exact
  three-dimensional enclosed dark-matter mass fraction for a flattened disc.
- Ten hand-selected systems demonstrate cross-galaxy comparison but are not a
  statistically complete population and do not define a selection function.
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
- NASA/CXC/SAO et al. (2025), “New Image from NASA's Webb and Chandra
  'Pierces' Bullet Cluster”.
  https://chandra.harvard.edu/photo/2025/bullet/more.html
- ESA/Planck Collaboration (2019), “The CMB temperature on large angular
  scales”.
  https://www.esa.int/ESA_Multimedia/Images/2019/06/The_CMB_temperature_on_large_angular_scales
- NASA (2026), “Roman Space Telescope: Weak Lensing”.
  https://science.nasa.gov/mission/roman-space-telescope/weak-lensing/
