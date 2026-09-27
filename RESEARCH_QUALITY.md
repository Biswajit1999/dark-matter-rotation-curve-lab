# Research quality contract

This file describes what repository validation establishes and what it does
not establish.

## Automated guarantees

`npm run verify` checks that:

1. the catalogue contains 411 strictly ordered measurements across ten named
   SPARC galaxies, while the NGC 3198 compatibility fixture retains 43 points;
2. observed values, uncertainties and SPARC baryonic columns are finite and
   every uncertainty is positive;
3. the official upstream URL, transformation list and pinned SHA-256 checksum
   are recorded;
4. pseudo-isothermal, NFW and Burkert velocities remain finite at small and
   large radii;
5. disc mass-to-light scaling follows \(v_\star\propto\sqrt{\Upsilon}\);
6. all three halo families return finite series and one standardised residual
   per observation for every selected galaxy;
7. the page exposes a skip link, chart descriptions, a data table and reduced
   motion styling;
8. posterior sampling stays inside explicit priors, uses a deterministic seed
   and reports split-R-hat, effective sample size and acceptance diagnostics.

## Guarantees requiring future work

The current tests do not validate distance or inclination marginalisation,
correlated systematics, posterior calibration or predictive coverage, evidence estimation, population
selection or agreement with an independent fitting package. The ten systems
are an intentionally varied demonstration set, not a statistically complete
sample. Grid minimisation
is deterministic exploration, not Bayesian inference. A later release should
add synthetic coverage tests and TypeScript/Python parity fixtures before
claiming research-grade parameter constraints.

## Claim language

Use “halo velocity-squared share at the outermost measured radius”, not “dark
matter mass fraction”. Use “best point on the displayed grid”, not “measured
halo parameters”. Describe the result as evidence for a mass discrepancy under
the stated dynamical assumptions, never as detection of a dark-matter particle.
