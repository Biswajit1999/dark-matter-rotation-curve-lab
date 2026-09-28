# Research quality contract

This file describes what repository validation establishes and what it does
not establish.

## Automated guarantees

`npm run verify` checks that:

1. the catalogue contains 3,391 strictly ordered measurements across all 175
   SPARC galaxies, while the NGC 3198 compatibility fixture retains 43 points;
2. observed values, uncertainties and SPARC baryonic columns are finite and
   every uncertainty is positive;
3. the official upstream URL, transformation list and pinned SHA-256 checksum
   are recorded;
4. pseudo-isothermal, NFW and Burkert velocities remain finite at small and
   large radii;
5. disc mass-to-light scaling follows \(v_\star\propto\sqrt{\Upsilon}\);
6. all three halo families return finite series and one standardised residual
   per observation for every SPARC galaxy;
7. the page exposes a skip link, chart descriptions, a data table and reduced
   motion styling;
8. posterior sampling stays inside explicit priors, uses a deterministic seed
   and reports split-R-hat, effective sample size and acceptance diagnostics;
9. posterior predictive intervals are finite and ordered, with reproducible
   predictive random draws, coverage and a discrepancy-based Bayesian p-value;
10. a deterministic noisy synthetic galaxy recovers its known disc and halo
    parameters within two 68% posterior interval half-widths;
11. normalized population metadata retain original fields and quality flags,
    while resolved acceleration transforms remain finite for all radii;
12. empirical-RAR and simple-ν acceleration mappings recover their Newtonian
    and deep-acceleration asymptotic limits;
13. lens–source distances remain geometrically ordered, while the Bullet
    Cluster reference produces finite, plausible critical surface density,
    Einstein radius and angular scale;
14. every colliding-cluster record links primary evidence and carries an
    explicit schematic, geometry, reconstruction or dispute warning;
15. cosmological component fractions close to unity from the radiation era to
    today and recover finite matter–radiation equality and baryon share;
16. the candidate and experiment atlases contain explicit search status,
    methods and source links rather than implying a detection;
17. local flux and illustrative contact rates scale monotonically with mass,
    cross section and efficiency, while spacing and wavelength remain finite;
18. every future horizon carries an active, planned, conditional, speculative
    or unknown confidence label and every frontier names a decisive test;
19. evidence-graph identifiers are unique, every edge resolves, and every node
    records a source layer, scientific claim and failure mode;
20. educator/research modes, landmark navigation, workspace export, print
    styling and an accessible edge-list alternative remain present.

## Guarantees requiring future work

The current tests do not validate distance or inclination marginalisation,
correlated systematics, repeated-simulation posterior calibration, evidence
estimation, hierarchical population inference or agreement with an independent
fitting package. The one synthetic recovery fixture is a regression test, not a
coverage study. SPARC is broad but is not a volume-limited statistically
complete survey. Grid minimisation is deterministic
exploration, not Bayesian inference. A later release should add repeated
synthetic coverage experiments and JavaScript/Python parity fixtures before
claiming research-grade parameter constraints.

The colliding-cluster canvas is an explanatory layer renderer. Automated tests
do not reproduce published shear catalogues, point-spread-function correction,
photometric-redshift calibration, mass-map inversion or merger simulations.
Quantitative publication use requires those source data and an independently
validated lensing pipeline.

## Claim language

Use “halo velocity-squared share at the outermost measured radius”, not “dark
matter mass fraction”. Use “best point on the displayed grid”, not “measured
halo parameters”. Describe the result as evidence for a mass discrepancy under
the stated dynamical assumptions, never as detection of a dark-matter particle.
