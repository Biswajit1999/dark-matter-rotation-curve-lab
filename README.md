# Dark Matter Rotation Curve Lab

Disk, bulge and halo decomposition for spiral-galaxy rotation curves.

Created and maintained by Biswajit Jana.

Private research/teaching tool. It is a zero-build, zero-dependency browser
lab: open `index.html`, no npm install, no bundler. The circular-velocity
model runs in a Web Worker so the UI thread stays free for the Canvas plot
and the mass-decomposition heatmap.

## Scientific Purpose

Spiral galaxies do not rotate the way visible (baryonic) matter alone would
predict. If all the mass were in the stars and gas we can see, circular
velocity should fall off as `v(r) ~ sqrt(1/r)` beyond the point where most of
the light is enclosed (Keplerian decline). Instead, 21 cm HI and optical
rotation curves stay approximately flat out to tens of kiloparsecs. This
"flat rotation curve" problem is one of the classical lines of dynamical
evidence for dark matter.

The historical case was made by Vera Rubin and Kent Ford in a series of
optical spectroscopy studies through the 1970s, extended to a large sample of
Sc spiral galaxies with Norbert Thonnard (Rubin, Ford & Thonnard 1980). Their
measured curves stayed flat instead of declining, implying substantial mass
at large radius that emits no detectable light — i.e. a dark, extended halo.

This lab lets you build a rotation curve as the quadrature sum of disk,
bulge and halo contributions, compare it against real anchor points from the
Milky Way's rotation curve, and see interactively how much of the flat part
at large radius has to come from the halo term rather than the visible
components.

## Circular Velocity and Mass Decomposition

For a tracer star on a circular orbit at galactocentric radius `r`, the
circular speed set by the enclosed gravitating mass `M(r)` is

```
v_c(r) = sqrt( G * M(r) / r )
```

When several mass components (disk, bulge, halo) contribute independently to
the radial force, their circular velocities add in quadrature:

```
v_total(r) = sqrt( v_disk(r)^2 + v_bulge(r)^2 + v_halo(r)^2 )
```

That quadrature sum is exactly what `physicsWorker.js` computes for the
`rotation` lab. It is not a full gravitational N-body or Jeans solve — it is
a standard component-superposition rotation-curve model, the same structural
approach used in textbook and observational rotation-curve fitting.

### Component models used in this repository

The worker's `rotation(p)` function (`physicsWorker.js`) implements, for
parameters `diskMass`, `bulgeMass`, `haloV`, `haloCore`:

**Disk** — a thin, radially truncated exponential-like disk term:

```
v_disk(r) = 185 * sqrt(diskMass) * r / (r + 3) * exp(-r / 55)
```

The `r / (r + 3)` factor gives the characteristic disk rise from the center,
and the outer `exp(-r / 55)` softens the contribution at very large radius,
consistent with the declining surface density of an exponential stellar
disk (`Σ(r) ∝ exp(-r / r_d)`).

**Bulge** — a compact, centrally concentrated component:

```
v_bulge(r) = 150 * sqrt(bulgeMass) * exp(-r / 4)
```

This is a compact-bulge proxy: it contributes strongly within a few kpc and
decays quickly, in the same spirit as a de Vaucouleurs / Hernquist bulge
profile whose rotation contribution is centrally peaked and falls off well
inside the disk scale length.

**Halo** — a pseudo-isothermal sphere:

```
v_halo(r) = haloV * sqrt( 1 - (haloCore / r) * atan(r / haloCore) )
```

This is the classic cored (pseudo-)isothermal-sphere rotation curve: it
rises from the center, flattens once `r >> haloCore`, and asymptotes to the
plateau speed `haloV` — which is precisely the flat-rotation-curve behavior
that motivates the dark matter interpretation. `haloCore` is the halo core
radius; `haloV` is the asymptotic (flat) circular speed contributed by the
halo alone.

The pseudo-isothermal profile is one of two standard halo parameterizations
used in rotation-curve fitting; the other, more commonly used in cosmological
(cold dark matter) contexts, is the Navarro-Frenk-White (NFW) profile derived
from N-body simulations of hierarchical structure formation (Navarro, Frenk &
White 1996):

```
ρ_NFW(r) = ρ_0 / [ (r / r_s) * (1 + r / r_s)^2 ]
```

with an associated circular-velocity profile that rises and then declines
more gently than Keplerian at large `r`. NFW is not currently implemented in
this repository's worker — the lab uses the pseudo-isothermal form above —
but it is the natural next halo-model option if this lab is extended, and is
included here for scientific context.

### Reported metrics

For the current parameter set, the UI panel reports:

- `v_solar` — model circular speed interpolated near the solar circle
  (`r ≈ 8.2 kpc`), for comparison against the `solar circle` reference point.
- `v_flat` — the model's circular speed at the largest tabulated radius,
  i.e. the outer flat-curve value.
- `halo_fraction` — `haloV / max(v_total)`, a rough proxy for how much of the
  peak rotation speed is attributable to the halo term rather than disk or
  bulge.
- `solar_residual_kms` — `v_solar - v_solar_circle_reference`, the signed
  difference in km/s between the current model's solar-circle speed and the
  `solar circle` anchor point (232 km/s) from `data/reference.json`. This
  turns the fixed reference marker into an actual fit-quality number: drag
  the sliders until `solar_residual_kms` is close to zero to match the
  observed Milky Way anchor.

## How It Works

1. **Reference data first.** On load, `app.js` fetches
   `data/reference.json` — five representative circular-speed anchor points
   for a Milky-Way-like flat rotation curve (citing Sofue 2020) — and plots
   them immediately as fixed yellow markers, independent of any model run.
2. **Interactive parameters.** Four sliders (`diskMass`, `haloV`,
   `haloCore`, `bulgeMass`) control the disk, halo and bulge terms above.
   Moving a slider updates `state.params` and triggers a new model run.
3. **Off-thread computation.** `app.js` posts `{lab: "rotation", params,
   reference}` to `physicsWorker.js`, which evaluates `v_disk`, `v_bulge`,
   `v_halo` and their quadrature sum across 650 radii from 0.2 to 30 kpc,
   plus a 72x72 normalized "mass decomposition" heatmap combining the halo
   and disk mass scales.
4. **Render.** The worker posts back `{series, metrics, heatmap}`; `app.js`
   draws the model curve and reference anchors on a shared axis
   (`drawSeries`) and the heatmap on a second canvas (`drawHeatmap`), then
   updates the metrics panel.
5. **Validation layer.** `scripts/validate.js` and
   `scripts/validate_repository.mjs` are dependency-free checks (run via
   `npm run check` / `npm run validate:research`) that confirm required
   files exist, `data/reference.json` and `data/research-reference.json`
   parse and contain finite anchor points, both worker/app scripts are
   syntactically valid, and required citations are present in the README.
   See `RESEARCH_QUALITY.md` for the scope of that layer.

This same `physicsWorker.js` file also hosts unrelated toy models for other
labs (CMB spectrum, supernova distance modulus, FRB dispersion, microlensing,
etc.) behind a `lab` id dispatch table — only the `rotation` entry is used by
this app.

## Usage

Run a static file server from the repository root (a plain `file://` open
will not let the Worker fetch `data/reference.json` in all browsers):

```bash
python -m http.server 8080
```

Open `http://localhost:8080`, then drag the disk mass, bulge mass, halo
speed and halo core sliders and watch `v_solar`, `v_flat` and
`halo_fraction` update against the fixed reference anchors. Click **Reset**
to return all four parameters to their default values.

## Validate

```bash
npm run check              # syntax + reference-data + citation checks
npm run validate:research  # research-quality reference/anchor checks
```

## Math Appendix

| Symbol | Meaning |
|---|---|
| `r` | Galactocentric radius [kpc] |
| `v_c(r)` | Circular (orbital) velocity at radius `r` [km/s] |
| `diskMass` | Disk mass scale factor (dimensionless slider, default 1) |
| `bulgeMass` | Bulge mass scale factor (dimensionless slider, default 0.65) |
| `haloV` | Halo asymptotic circular speed [km/s] |
| `haloCore` | Halo core radius [kpc] |

Disk term:
`v_disk(r) = 185 * sqrt(diskMass) * r / (r + 3) * exp(-r / 55)`

Bulge term:
`v_bulge(r) = 150 * sqrt(bulgeMass) * exp(-r / 4)`

Pseudo-isothermal halo term:
`v_halo(r) = haloV * sqrt(1 - (haloCore / r) * atan(r / haloCore))`

Total (quadrature sum of independent components):
`v_total(r) = sqrt(v_disk(r)^2 + v_bulge(r)^2 + v_halo(r)^2)`

General definition each term approximates (spherically-averaged enclosed
mass form):
`v_c(r) = sqrt(G * M(r) / r)`

NFW halo density profile (background/context, not implemented here):
`ρ_NFW(r) = ρ_0 / [ (r / r_s) * (1 + r / r_s)^2 ]`

## Architecture

- `index.html`: mission-control interface.
- `styles.css`: dense dark scientific dashboard.
- `app.js`: UI state, Canvas rendering and worker orchestration.
- `physicsWorker.js`: numerical rotation-curve model (`rotation(p)`) and
  mass-decomposition heatmap generation, alongside unrelated lab models
  behind the same dispatch table.
- `data/reference.json`: auditable Milky-Way rotation-curve anchor points.
- `data/research-reference.json`: benchmark anchors for the validation
  script.
- `research-overlay.js`: optional mission-control quality/telemetry panel.
- `scripts/validate.js`, `scripts/validate_repository.mjs`: no-dependency
  repository validation.

## Reference Data

Representative circular-speed anchors for a flat Galactic rotation curve
(inner Galaxy, solar-neighbourhood rise, solar circle, outer disk,
halo-supported outer curve), used both for on-screen comparison and for
browser validation. See `data/reference.json`.

## References

- Rubin, V.C., Ford Jr, W.K. and Thonnard, N., 1980. Rotational properties
  of 21 Sc galaxies with a large range of luminosities and radii. The
  Astrophysical Journal, 238, pp.471-487.
- Navarro, J.F., Frenk, C.S. and White, S.D.M., 1996. The structure of cold
  dark matter halos. The Astrophysical Journal, 462, p.563.
- Sofue, Y., 2020. Rotation curve of the Milky Way and the dark matter
  density. Galaxies, 8(2), p.37.

## Research Quality Upgrade

See [RESEARCH_QUALITY.md](RESEARCH_QUALITY.md) for the validation layer,
reference anchors, equations and research boundaries added to this
repository.
