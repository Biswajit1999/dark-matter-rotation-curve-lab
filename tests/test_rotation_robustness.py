"""Synthetic numerical regression tests for rotation robustness diagnostics."""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "validation"))
from rotation_robustness import (covariance_exponential, fit_gls, leave_one_out,
                                 parametric_bootstrap)


def predictor(theta, points, model):
    # Synthetic three-parameter surrogate, used solely to test numerical machinery.
    x = points["x"]
    return theta[0] * x + theta[1] * np.exp(-x / theta[2])


def fixture(seed=4):
    rng = np.random.default_rng(seed)
    x = np.linspace(0.5, 18, 36)
    points = {"x": x, "y_err": np.full(len(x), 0.8)}
    points["y"] = predictor(np.array([0.55, 165, 5.0]), points, "synthetic") + rng.normal(0, 0.8, len(x))
    return points


class RotationRobustnessTests(unittest.TestCase):
    def test_diagonal_limit(self):
        p = fixture()
        np.testing.assert_allclose(covariance_exponential(p["x"], p["y_err"]),
                                   np.diag(p["y_err"] ** 2))

    def test_correlated_covariance_spd(self):
        p = fixture()
        cov = covariance_exponential(p["x"], p["y_err"], 0.7, 2)
        np.linalg.cholesky(cov)
        np.testing.assert_allclose(np.diag(cov), p["y_err"] ** 2)
        self.assertGreater(cov[0, 1], 0)

    def test_invalid_kernel(self):
        p = fixture()
        for f in (-0.1, 1.0, float("nan")):
            with self.assertRaises(ValueError):
                covariance_exponential(p["x"], p["y_err"], f)

    def test_parameter_recovery(self):
        fit = fit_gls(fixture(), "synthetic", predictor)
        self.assertTrue(fit["success"])
        self.assertAlmostEqual(fit["parameters"][1], 165, delta=3)
        self.assertGreater(fit["jacobian_condition"], 0)

    def test_gls_correlated(self):
        fit = fit_gls(fixture(), "synthetic", predictor, 0.3, 1.5)
        self.assertTrue(fit["success"])
        self.assertTrue(np.isfinite(fit["log_likelihood"]))

    def test_loo_influence(self):
        p = fixture()
        result = leave_one_out(p, "synthetic", predictor)
        self.assertEqual(len(result["rows"]), len(p["x"]))
        self.assertGreaterEqual(result["most_influential"]["shift_norm"], 0)

    def test_bootstrap_seed_and_quantiles(self):
        p = fixture()
        a = parametric_bootstrap(p, "synthetic", predictor, draws=12, seed=19)
        b = parametric_bootstrap(p, "synthetic", predictor, draws=12, seed=19)
        self.assertEqual(a["quantiles_16_50_84"], b["quantiles_16_50_84"])
        self.assertEqual(a["successful_refits"], 12)
        for values in a["quantiles_16_50_84"].values():
            self.assertLessEqual(values[0], values[1])
            self.assertLessEqual(values[1], values[2])

    def test_draw_bounds(self):
        with self.assertRaises(ValueError):
            parametric_bootstrap(fixture(), "synthetic", predictor, draws=1)


if __name__ == "__main__":
    unittest.main()
