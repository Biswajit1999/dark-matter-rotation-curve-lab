#!/usr/bin/env python3
"""Independent SciPy parity fit for the NGC 3198 SPARC fixture.

This file intentionally re-implements the browser model instead of importing
JavaScript. It is a cross-language numerical check, not a publication pipeline.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from scipy.optimize import least_squares

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "data" / "reference.json"


def load_reference() -> dict:
    return json.loads(REFERENCE.read_text(encoding="utf-8"))


def signed_square(values: np.ndarray) -> np.ndarray:
    return np.sign(values) * values**2


def baryonic_squared(points: dict[str, np.ndarray], mass_to_light: float) -> np.ndarray:
    return (
        signed_square(points["v_gas"])
        + mass_to_light * signed_square(points["v_disk"])
        + 0.7 * signed_square(points["v_bulge"])
    )


def piso_velocity(radius: np.ndarray, velocity: float, scale: float) -> np.ndarray:
    radius = np.maximum(radius, 1e-9)
    scale = max(scale, 1e-9)
    bracket = 1.0 - scale / radius * np.arctan(radius / scale)
    return velocity * np.sqrt(np.maximum(bracket, 0.0))


def nfw_velocity(radius: np.ndarray, velocity: float, scale: float) -> np.ndarray:
    x = np.maximum(radius / max(scale, 1e-9), 1e-12)
    enclosed = np.log1p(x) - x / (1.0 + x)
    return velocity * np.sqrt(np.maximum(enclosed / x, 0.0))


def burkert_velocity(radius: np.ndarray, velocity: float, scale: float) -> np.ndarray:
    x = np.maximum(radius / max(scale, 1e-9), 1e-12)
    enclosed = np.log((1.0 + x) ** 2 * (1.0 + x**2)) - 2.0 * np.arctan(x)
    return velocity * np.sqrt(np.maximum(enclosed / x, 0.0))


HALO = {"piso": piso_velocity, "nfw": nfw_velocity, "burkert": burkert_velocity}


def arrays(reference: dict) -> dict[str, np.ndarray]:
    keys = ["x", "y", "y_err", "v_gas", "v_disk", "v_bulge"]
    return {key: np.array([row[key] for row in reference["points"]], dtype=float) for key in keys}


def predict(theta: np.ndarray, points: dict[str, np.ndarray], model: str) -> np.ndarray:
    mass_to_light, velocity, scale = theta
    halo = HALO[model](points["x"], velocity, scale)
    total_squared = baryonic_squared(points, mass_to_light) + halo**2
    return np.sqrt(np.maximum(total_squared, 0.0))


def residuals(theta: np.ndarray, points: dict[str, np.ndarray], model: str) -> np.ndarray:
    return (points["y"] - predict(theta, points, model)) / points["y_err"]


def fit_model(points: dict[str, np.ndarray], model: str) -> dict:
    result = least_squares(
        residuals,
        x0=np.array([0.5, 170.0, 5.0]),
        bounds=(np.array([0.1, 40.0, 0.5]), np.array([1.0, 320.0, 25.0])),
        args=(points, model),
        method="trf",
        xtol=1e-12,
        ftol=1e-12,
        gtol=1e-12,
        max_nfev=20_000,
    )
    chi2 = float(np.sum(result.fun**2))
    n = len(points["x"])
    k = len(result.x)
    return {
        "model": model,
        "mass_to_light_disk": float(result.x[0]),
        "halo_velocity_kms": float(result.x[1]),
        "halo_scale_kpc": float(result.x[2]),
        "chi_squared": chi2,
        "reduced_chi_squared": chi2 / max(1, n - k),
        "aic": chi2 + 2 * k,
        "bic": chi2 + k * np.log(n),
        "success": bool(result.success),
        "message": str(result.message),
        "nfev": int(result.nfev),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="Write validation/scipy_reference_fit.json")
    args = parser.parse_args()

    reference = load_reference()
    points = arrays(reference)
    fits = [fit_model(points, model) for model in HALO]
    payload = {
        "contract": "Independent SciPy least-squares implementation of the fixed-distance/fixed-inclination browser model.",
        "galaxy": reference["galaxy"],
        "source_checksum": reference["provenance"]["upstream_sha256"],
        "bounds": {
            "mass_to_light_disk": [0.1, 1.0],
            "halo_velocity_kms": [40.0, 320.0],
            "halo_scale_kpc": [0.5, 25.0],
        },
        "fits": fits,
        "limitations": [
            "No distance or inclination marginalisation.",
            "No correlated covariance model.",
            "No Bayesian evidence calculation.",
            "SciPy optimisation is a cross-language numerical check, not a physical truth test.",
        ],
    }
    text = json.dumps(payload, indent=2)
    print(text)
    if args.write:
        (ROOT / "validation" / "scipy_reference_fit.json").write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
