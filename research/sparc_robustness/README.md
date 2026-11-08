# SPARC projection and baryonic robustness (8 November 2026)

Independent standard-library diagnostics, not new fitted SPARC halo constraints.

1. The SPARC signed squared-velocity convention retains negative gas contributions rather than silently squaring them into positive baryonic terms.
2. The residual v_halo^2 = v_obs^2 - v_baryon^2 can be negative; it must not be interpreted as a real halo velocity or particle detection.
3. A first-order inclination-error calculation propagates independent line-of-sight velocity and inclination uncertainties, highlighting the severe sensitivity of nearly face-on systems.

Run: `cd research/sparc_robustness && python -m unittest -v test_robustness.py`.

Assumptions: independent observational angle/LOS errors, fixed stellar mass-to-light ratios, no distance covariance, beam smearing, asymmetric drift, or halo fitting. Synthetic/analytic checks only. AI-assisted implementation; Biswajit Jana is the requested sole Git commit author.
