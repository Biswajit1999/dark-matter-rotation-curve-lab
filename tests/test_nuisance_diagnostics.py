"""Regression tests on synthetic SPARC-format data (not real halo inference)."""
import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "validation"))
from nuisance_diagnostics import (
    common_mode_loglike, conditional_nuisance_loglike,
    geometry_transform, radial_block_sensitivity,
)
from rotation_scipy import predict


def fixture(seed=10):
    rng = np.random.default_rng(seed)
    r = np.linspace(0.6, 20, 35)
    points = {"x": r, "y": np.zeros_like(r), "y_err": np.full_like(r, 2.5),
              "v_gas": 20 * np.tanh(r / 10) - 3,
              "v_disk": 90 * np.exp(-r / 22),
              "v_bulge": np.zeros_like(r)}
    points["y"] = predict(np.array([0.5, 150, 5]), points, "piso") + rng.normal(0, 2.5, len(r))
    return points


def test_zero_common_mode_matches_diagonal_normal_likelihood():
    r = np.array([1., -2., 3.])
    s = np.array([1.5, 2., 3.])
    expected = -0.5 * (np.sum((r/s)**2) + np.sum(np.log(2*math.pi*s*s)))
    assert common_mode_loglike(r, s, 0) == pytest.approx(expected, abs=1e-12)


@pytest.mark.parametrize("tau", [0.01, 1.0, 3.0, 20.0])
def test_common_mode_matches_dense_covariance(tau):
    r = np.array([2., -3., 0.5, 1.2])
    s = np.array([0.5, 1.5, 2., 0.9])
    c = np.diag(s*s) + tau*tau*np.ones((len(s), len(s)))
    sign, logdet = np.linalg.slogdet(c)
    assert sign > 0
    expected = -0.5*(r @ np.linalg.solve(c, r)+logdet+len(r)*math.log(2*math.pi))
    assert common_mode_loglike(r, s, tau) == pytest.approx(expected, rel=1e-11)


def test_invalid_covariance_inputs_rejected():
    with pytest.raises(ValueError):
        common_mode_loglike([1], [0])
    with pytest.raises(ValueError):
        common_mode_loglike([1, 2], [1])
    with pytest.raises(ValueError):
        common_mode_loglike([1], [1], -0.1)


def test_geometry_identity_preserves_signed_gas_and_input():
    points = fixture()
    before = {k:v.copy() for k,v in points.items()}
    transformed = geometry_transform(points, reference_distance_mpc=13.8,
        distance_mpc=13.8, reference_inclination_deg=73, inclination_deg=73)
    for key in points:
        np.testing.assert_allclose(transformed[key], before[key], rtol=0, atol=1e-13)
        np.testing.assert_array_equal(points[key], before[key])


def test_geometry_distance_scaling():
    points = fixture()
    transformed = geometry_transform(points, reference_distance_mpc=13.8,
        distance_mpc=27.6, reference_inclination_deg=73, inclination_deg=73)
    np.testing.assert_allclose(transformed["x"], 2 * points["x"])
    np.testing.assert_allclose(transformed["v_disk"], math.sqrt(2)*points["v_disk"])
    np.testing.assert_allclose(transformed["v_gas"], math.sqrt(2)*points["v_gas"])
    np.testing.assert_allclose(transformed["y"], points["y"])


def test_geometry_inclination_scaling():
    points = fixture()
    transformed = geometry_transform(points, reference_distance_mpc=13.8,
        distance_mpc=13.8, reference_inclination_deg=73, inclination_deg=60)
    factor = math.sin(math.radians(73))/math.sin(math.radians(60))
    np.testing.assert_allclose(transformed["y"], points["y"]*factor)
    np.testing.assert_allclose(transformed["y_err"], points["y_err"]*factor)


def test_bad_geometry_rejected():
    with pytest.raises(ValueError):
        geometry_transform(fixture(), reference_distance_mpc=13.8,
            distance_mpc=0, reference_inclination_deg=73, inclination_deg=73)
    with pytest.raises(ValueError):
        geometry_transform(fixture(), reference_distance_mpc=13.8,
            distance_mpc=13.8, reference_inclination_deg=73, inclination_deg=0)


def test_zero_width_quadrature_equals_fixed_likelihood():
    points = fixture()
    theta = np.array([0.5, 150, 5])
    fixed = common_mode_loglike(points["y"]-predict(theta,points,"piso"),points["y_err"],2)
    integrated = conditional_nuisance_loglike(theta,points,"piso",
        reference_distance_mpc=13.8,distance_sigma_mpc=0,
        reference_inclination_deg=73,inclination_sigma_deg=0,
        common_sigma_kms=2,quadrature_order=7)
    assert integrated == pytest.approx(fixed, abs=1e-10)


def test_conditional_nuisance_quadrature_finite_and_order_stable():
    points = fixture()
    theta = np.array([0.5, 150, 5])
    kwargs=dict(reference_distance_mpc=13.8,distance_sigma_mpc=0.4,
        reference_inclination_deg=73,inclination_sigma_deg=1.0,common_sigma_kms=1)
    a=conditional_nuisance_loglike(theta,points,"piso",quadrature_order=11,**kwargs)
    b=conditional_nuisance_loglike(theta,points,"piso",quadrature_order=15,**kwargs)
    assert math.isfinite(a) and math.isfinite(b)
    assert abs(a-b) < 0.1


def test_conditional_prior_width_rejected():
    with pytest.raises(ValueError):
        conditional_nuisance_loglike(np.array([.5,150,5]),fixture(),"piso",
            reference_distance_mpc=13.8,distance_sigma_mpc=-1,
            reference_inclination_deg=73,inclination_sigma_deg=2)


def test_radial_block_deletion_refits_and_preserves_points():
    points=fixture()
    original={k:v.copy() for k,v in points.items()}
    report=radial_block_sensitivity(points,"piso",blocks=5)
    assert len(report["leave_block_out"]) == 5
    assert sum(r["omitted_count"] for r in report["leave_block_out"]) == len(points["x"])
    assert report["full_fit"]["success"]
    assert all(row["fit"]["success"] for row in report["leave_block_out"])
    assert all(math.isfinite(row["delta_halo_scale_kpc"]) for row in report["leave_block_out"])
    for key in points:
        np.testing.assert_array_equal(points[key],original[key])


def test_radial_block_count_rejected():
    with pytest.raises(ValueError):
        radial_block_sensitivity(fixture(),"piso",blocks=100)
