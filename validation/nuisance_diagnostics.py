"""Independent SPARC rotation-curve nuisance and robustness diagnostics.

These are conditional model checks, not a population likelihood or halo
parameter posterior. Existing signed gas/stellar contributions are preserved.
"""
from __future__ import annotations

import math

import numpy as np
from numpy.polynomial.hermite import hermgauss
from scipy.special import logsumexp

from rotation_scipy import fit_model, predict


def common_mode_loglike(residual_kms: np.ndarray, sigma_kms: np.ndarray,
                        common_sigma_kms: float = 0.0) -> float:
    """Normalized Gaussian log L for C=diag(sigma_i**2)+tau**2 11^T.

    Sherman-Morrison and matrix determinant lemma avoid dense inversion.
    The common-mode term is a hypothetical calibration systematic, not a
    measured SPARC covariance. All velocities are in km/s.
    """
    r = np.asarray(residual_kms, dtype=float)
    s = np.asarray(sigma_kms, dtype=float)
    tau = float(common_sigma_kms)
    if r.ndim != 1 or s.ndim != 1 or r.shape != s.shape or not r.size:
        raise ValueError("Residual and uncertainty vectors must be nonempty and aligned")
    if (not np.all(np.isfinite(r)) or not np.all(np.isfinite(s))
            or np.any(s <= 0) or not np.isfinite(tau) or tau < 0):
        raise ValueError("Require finite residuals, positive errors and tau >= 0")
    inv_var = 1.0 / (s * s)
    leverage = float(np.sum(inv_var))
    denominator = 1.0 + tau * tau * leverage
    quad = float(np.sum(r * r * inv_var))
    quad -= (tau * tau / denominator) * float(np.sum(r * inv_var)) ** 2
    logdet = float(np.sum(np.log(s * s))) + math.log(denominator)
    return -0.5 * (quad + logdet + r.size * math.log(2 * math.pi))


def geometry_transform(points: dict[str, np.ndarray], *,
                       reference_distance_mpc: float, distance_mpc: float,
                       reference_inclination_deg: float,
                       inclination_deg: float) -> dict[str, np.ndarray]:
    """Rescale at fixed observed angular radii and line-of-sight velocities.

    r -> r*D/D0, baryonic V -> V*sqrt(D/D0), and the deprojected
    observed V and its random sigma -> sin(i0)/sin(i). Halo parameters are
    NOT transformed: callers must refit or explicitly treat them as fixed.
    """
    vals = (reference_distance_mpc, distance_mpc,
            reference_inclination_deg, inclination_deg)
    if not all(np.isfinite(vals)) or min(vals[:2]) <= 0 or not all(
            0 < angle < 90 for angle in vals[2:]):
        raise ValueError("Require positive distances and inclinations strictly between 0 and 90")
    d_ratio = distance_mpc / reference_distance_mpc
    inclination_factor = math.sin(math.radians(reference_inclination_deg)) / math.sin(
        math.radians(inclination_deg))
    factors = {"x": d_ratio, "y": inclination_factor,
               "y_err": inclination_factor, "v_gas": math.sqrt(d_ratio),
               "v_disk": math.sqrt(d_ratio), "v_bulge": math.sqrt(d_ratio)}
    out = {k: np.asarray(v, dtype=float).copy() * factors.get(k, 1.0)
           for k, v in points.items()}
    if not all(np.all(np.isfinite(a)) for a in out.values()):
        raise ValueError("Non-finite transformed data")
    return out


def conditional_nuisance_loglike(theta: np.ndarray, points: dict[str, np.ndarray],
                                 model: str, *, reference_distance_mpc: float,
                                 distance_sigma_mpc: float,
                                 reference_inclination_deg: float,
                                 inclination_sigma_deg: float,
                                 common_sigma_kms: float = 0.0,
                                 quadrature_order: int = 7) -> float:
    """Integrate D and i Gaussian priors at FIXED halo theta using GH quadrature.

    This is a conditional likelihood, not a posterior evidence integral.
    Gaussian tails outside D>0 and 0<i<90 are rejected and quadrature weights
    renormalized, an approximation to truncated physical priors.
    """
    if (distance_sigma_mpc < 0 or inclination_sigma_deg < 0
            or not np.isfinite(distance_sigma_mpc)
            or not np.isfinite(inclination_sigma_deg)):
        raise ValueError("Nuisance prior widths must be nonnegative and finite")
    if not isinstance(quadrature_order, int) or quadrature_order < 1:
        raise ValueError("quadrature_order must be positive integer")
    nodes, weights = hermgauss(quadrature_order)
    terms = []
    retained_weight = 0.0
    for i, wi in zip(nodes, weights):
        d = reference_distance_mpc + math.sqrt(2) * distance_sigma_mpc * float(i)
        for j, wj in zip(nodes, weights):
            inc = reference_inclination_deg + math.sqrt(2) * inclination_sigma_deg * float(j)
            if not (d > 0 and 0 < inc < 90):
                continue
            transformed = geometry_transform(points,
                reference_distance_mpc=reference_distance_mpc, distance_mpc=d,
                reference_inclination_deg=reference_inclination_deg,
                inclination_deg=inc)
            ll = common_mode_loglike(transformed["y"] - predict(theta, transformed, model),
                                     transformed["y_err"], common_sigma_kms)
            weight = float(wi * wj / math.pi)
            terms.append(math.log(weight) + ll)
            retained_weight += weight
    if not terms:
        raise ValueError("No physically admissible nuisance nodes")
    return float(logsumexp(terms) - math.log(retained_weight))


def radial_block_sensitivity(points: dict[str, np.ndarray], model: str,
                             blocks: int = 5) -> dict:
    """Refit while omitting contiguous radial blocks; NOT independent jackknife errors."""
    if not isinstance(blocks, int) or blocks < 2:
        raise ValueError("Need at least two radial blocks")
    radii = np.asarray(points["x"], dtype=float)
    n = len(radii)
    if n < blocks * 2 or not np.all(np.isfinite(radii)):
        raise ValueError("Need at least two measurements per radial block")
    for value in points.values():
        if len(value) != n:
            raise ValueError("Point columns must have equal lengths")
    full = fit_model(points, model)
    groups = np.array_split(np.argsort(radii), blocks)
    fits = []
    for index, omitted in enumerate(groups):
        mask = np.ones(n, dtype=bool)
        mask[omitted] = False
        reduced = {k: np.asarray(v)[mask] for k, v in points.items()}
        result = fit_model(reduced, model)
        fits.append({"block": index, "omitted_count": int(len(omitted)),
                     "omitted_radius_min_kpc": float(np.min(radii[omitted])),
                     "omitted_radius_max_kpc": float(np.max(radii[omitted])),
                     "fit": result,
                     "delta_halo_velocity_kms": result["halo_velocity_kms"] - full["halo_velocity_kms"],
                     "delta_halo_scale_kpc": result["halo_scale_kpc"] - full["halo_scale_kpc"],
                     "delta_mass_to_light_disk": result["mass_to_light_disk"] - full["mass_to_light_disk"]})
    return {"model": model, "full_fit": full, "leave_block_out": fits,
            "interpretation": "Conditional sensitivity to radius selection; not a statistical uncertainty interval."}
