#!/usr/bin/env python3
"""NGC 3198 SPARC nuisance sensitivity; explicit --synthetic for fixtures."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from nuisance_diagnostics import (common_mode_loglike, conditional_nuisance_loglike,
                                  radial_block_sensitivity)
from rotation_scipy import arrays, fit_model, load_reference, predict


def synthetic_points() -> dict[str, np.ndarray]:
    rng = np.random.default_rng(20261023)
    radius = np.linspace(0.6, 25, 43)
    points = {"x": radius, "y": np.zeros_like(radius),
              "y_err": np.full_like(radius, 2.5),
              "v_gas": 18 * np.tanh(radius / 12) - 3,
              "v_disk": 100 * np.exp(-radius / 24),
              "v_bulge": np.zeros_like(radius)}
    points["y"] = predict(np.array([0.5, 150, 5]), points, "piso") + rng.normal(0, 2.5, len(radius))
    return points


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--synthetic", action="store_true", help="Use seeded synthetic data explicitly")
    parser.add_argument("--output", type=Path, default=Path("results/ngc3198_nuisance_audit.json"))
    parser.add_argument("--plot", action="store_true", help="Requires matplotlib")
    args = parser.parse_args()
    if args.synthetic:
        points = synthetic_points()
        label = "Synthetic SPARC-format data; no observational inference"
        distance, distance_sigma, inclination, inclination_sigma = 13.8, 0.4, 73, 1.0
        provenance = "Synthetic seeded fixture 20261023"
    else:
        reference = load_reference()  # pinned NGC 3198 fixture already in repository
        points = arrays(reference)
        label = reference["galaxy"] + " (published SPARC mass-model derivative)"
        distance = reference["distance_mpc"]
        distance_sigma = reference["distance_error_mpc"]
        inclination = reference["inclination_deg"]
        inclination_sigma = reference["inclination_error_deg"]
        provenance = reference["provenance"]["upstream_sha256"]
    fits = [fit_model(points, model) for model in ("piso", "nfw", "burkert")]
    best = min(fits, key=lambda row: row["chi_squared"])
    theta = np.array([best["mass_to_light_disk"], best["halo_velocity_kms"],
                      best["halo_scale_kpc"]])
    residual = points["y"] - predict(theta, points, best["model"])
    covariance = {str(tau): common_mode_loglike(residual, points["y_err"], tau)
                  for tau in (0.0, 1.0, 3.0)}
    quadrature_orders = (5, 9, 13, 17, 25, 33)
    nuisance = {str(order): conditional_nuisance_loglike(theta, points, best["model"],
        reference_distance_mpc=distance, distance_sigma_mpc=distance_sigma,
        reference_inclination_deg=inclination, inclination_sigma_deg=inclination_sigma,
        common_sigma_kms=1.0, quadrature_order=order) for order in quadrature_orders}
    final_quadrature_delta = abs(nuisance["33"] - nuisance["25"])
    quadrature_convergence = {
        "last_two_orders": [25, 33],
        "absolute_loglike_change": final_quadrature_delta,
        "tolerance_loglike": 0.05,
        "passes_tolerance": bool(final_quadrature_delta < 0.05),
        "warning": "A passing order comparison is a heuristic, not an integration error bound."
    }
    blocks = radial_block_sensitivity(points, best["model"], blocks=5)
    report = {
        "dataset": label, "provenance": provenance,
        "assumptions": {"distance_mpc": distance, "distance_sigma_mpc": distance_sigma,
                        "inclination_deg": inclination, "inclination_sigma_deg": inclination_sigma,
                        "common_mode_sigma_kms": "hypothetical 0,1,3 (not measured)",
                        "fixed_halo_theta_for_nuisance_integration": True},
        "fit_comparison": fits, "selected_model_by_diagonal_chi2": best["model"],
        "common_mode_loglike_at_fixed_theta": covariance,
        "conditional_nuisance_loglike_by_quadrature_order": nuisance,
        "quadrature_convergence": quadrature_convergence,
        "radial_block_sensitivity": blocks,
        "limitations": ["Nuisance integration is conditional on fixed halo parameters, not evidence",
                        "No correlated SPARC covariance supplied", "No selection-corrected population inference",
                        "Radial blocks are sensitivity tests, not jackknife uncertainty intervals"],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if args.plot:
        import matplotlib.pyplot as plt
        rows = blocks["leave_block_out"]
        fig, ax = plt.subplots(figsize=(7, 4.5))
        ax.axhline(0, color="black", lw=0.7)
        ax.plot([r["block"] for r in rows],
                [r["delta_halo_velocity_kms"] for r in rows], "o-")
        ax.set_xlabel("Omitted radial block (inner to outer)")
        ax.set_ylabel("Shift in fitted halo velocity (km/s)")
        ax.set_title("Conditional radial-block sensitivity: " + best["model"])
        ax.grid(True, alpha=0.3)
        fig.tight_layout()
        fig.savefig(args.output.with_suffix(".png"), dpi=160)
        plt.close(fig)
    print(f"Wrote {args.output} using {len(points['x'])} points; model={best['model']}")


if __name__ == "__main__":
    main()
