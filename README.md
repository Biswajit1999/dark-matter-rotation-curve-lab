# Dark Matter Evidence Lab

Dark Matter Evidence Lab is a reproducible interactive research and teaching
environment for a precise question: what additional gravitating component is
required when the published gas and stellar mass model does not reproduce a
galaxy's observed circular velocity?

The current release is deliberately narrow. It fits the 43-point **NGC 3198**
rotation curve from the SPARC Newtonian mass-model table and displays the
observations, quoted random uncertainties, published gas and stellar-disc
contributions, a selected halo profile, the total model, standardised
residuals and a two-parameter Δχ² surface. It does not identify a dark-matter
particle and it does not treat an interactive grid minimum as a publication
quality posterior.

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
selects the 43 `NGC3198` rows and renames columns without changing values. A
checksum mismatch stops the import so an upstream change cannot silently alter
the fixture.

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

NGC 3198 has no SPARC bulge component, so `Υbul` is fixed and inactive. The
three halo families are:

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

## Validate

```bash
npm run verify
```

The verification chain performs JavaScript syntax checks, validates the data
schema/provenance/citations/accessibility hooks, tests analytic profile limits
and verifies that every halo family produces finite values for all 43
observations.

## Repository map

| Path | Role |
|---|---|
| `index.html` | Semantic workstation, controls, chart descriptions and table |
| `styles.css` | Responsive semantic-token theme and focus/reduced-motion states |
| `app.js` | UI state, high-DPI plotting, exports and Worker request ordering |
| `rotationPhysics.js` | Tested halo profiles, SPARC decomposition and likelihood |
| `physicsWorker.js` | Off-thread evaluation and deterministic grid fit |
| `data/reference.json` | NGC 3198 values plus column and provenance metadata |
| `scripts/import_sparc.mjs` | Checksum-pinned SPARC ingestion |
| `tests/rotationPhysics.test.js` | Analytic, data and finite-output tests |

## Research boundaries

- A low χ² for one profile does not establish that profile as uniquely true.
- SPARC random uncertainties are not the complete error budget.
- `v_halo²/v_total²` at one radius is a force decomposition, not an exact
  three-dimensional enclosed dark-matter mass fraction for a flattened disc.
- NGC 3198 is one galaxy; population statements require a quality-controlled
  multi-galaxy analysis and a selection function.
- Rotation curves constrain the gravitational field. They do not establish
  the microscopic identity of dark matter.

See [RESEARCH_QUALITY.md](RESEARCH_QUALITY.md) for the validation contract and
the project-level blueprint in the parent workspace for the staged expansion
into dwarf dynamics, lensing, clusters, cosmology and particle-search limits.

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
