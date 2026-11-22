# Conditional inclination and baryonic sensitivity — 2026-11-22

Run: `python research/2026-11-22/conditional_inclination.py`.

Three independent diagnostics: sign-preserving SPARC baryonic squared-velocity accounting, line-of-sight inclination correction with first-order independent-error propagation, and the residual squared-velocity discrepancy. Units must be consistent (km/s for velocity, degrees for inclination); mass-to-light ratios scale the published baryonic velocity-squared templates. These are conditional functions, not fits to the 175-galaxy sample. Near face-on inclination the correction and linearized uncertainty become unstable; covariance, warps, asymmetric drift, distance errors and parameter correlations are excluded. A negative discrepancy is allowed. Do not interpret squared-velocity discrepancy as a dark-matter mass fraction or particle detection.

Scientific interpretation and tests were prepared with AI coding assistance; Biswajit Jana is the requested sole authenticated Git author. No observational claims or existing results changed.
