# SPARC nuisance and radius-selection audit

Run from the repository root with existing `validation/requirements.txt`:

```bash
python -m pip install -r validation/requirements.txt
python -m pip install pytest
python -m pytest -q tests/test_nuisance_diagnostics.py
python validation/run_nuisance_audit.py --output results/ngc3198_nuisance_audit.json
# Optional: pip install matplotlib; add --plot for a figure.
# For a clearly labelled synthetic pilot only: append --synthetic.
```

This adds three checks to the existing independent SciPy halo fitting:

1. **Correlated-velocity-error sensitivity.** For hypothetical shared velocity
   calibration uncertainty `tau` in km/s, use
   `C = diag(sigma_i²) + tau² 11ᵀ`. The normalized Gaussian log likelihood
   includes the log determinant; Sherman–Morrison gives the exact inverse
   for this *assumed* covariance structure. The actual SPARC off-diagonal
   covariance is not supplied; `tau` is a scenario, not a measurement.
2. **Distance/inclination uncertainty.** At fixed angular radius, scale
   physical radius by `D/D0`, baryonic velocity columns by `sqrt(D/D0)`,
   and deprojected observed velocity and its quoted random uncertainty by
   `sin(i0)/sin(i)`. Preserve negative gas contributions. Integrate Gaussian
   D and i priors with Gauss–Hermite quadrature, renormalizing admissible
   nodes when priors reach unphysical geometry. **Halo theta is held fixed**
   at the baseline fit, so this is a conditional nuisance-integrated
   likelihood, **not** marginal Bayesian evidence or posterior constraints.
3. **Leave-one-radial-block-out refitting.** Refit the same halo family
   after removing each of five contiguous radial groups. Parameter shifts
   describe radius-selection sensitivity, not independent uncertainty bars.

The script reads the existing pinned NGC 3198 SPARC derivative by default;
`--synthetic` must be explicitly requested to use a generated fixture.
Neither the source SPARC catalogue nor the browser results are modified.

This is a numerical robustness experiment, not identification of a dark
matter particle, selection-corrected galaxy inference, or a full correlated
systematics analysis. Follow `RESEARCH_QUALITY.md` and existing SPARC
provenance/citation requirements when sharing results.

The runner reports Gauss–Hermite orders 5–33 and a **heuristic** 25-to-33
log-likelihood change threshold of 0.05. If it fails, the conditional
likelihood is numerically unresolved and must not support model selection.
Even a pass does not establish an absolute integration error bound.
