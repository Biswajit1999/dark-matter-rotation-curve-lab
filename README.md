# Dark Matter Rotation Curve Lab

Disk, bulge and halo decomposition for spiral-galaxy rotation curves.

Created and maintained by Biswajit Jana.

## Scientific Purpose

This zero-build browser laboratory puts a compact reference-data bundle in front of the simulation. The app loads `data/reference.json`, renders those published anchors first, then sends the adjustable model to `physicsWorker.js` so numerical work stays off the UI thread.

## Architecture

- `index.html`: mission-control interface.
- `styles.css`: dense dark scientific dashboard.
- `app.js`: UI state, Canvas rendering and worker orchestration.
- `physicsWorker.js`: numerical model and heatmap generation.
- `data/reference.json`: small auditable reference-data bundle.
- `scripts/validate.js`: no-dependency repository validation.

## Run

```bash
python -m http.server 8080
```

Open `http://localhost:8080`.

## Validate

```bash
npm run check
```

The validation script checks required files, JSON reference data, worker syntax, citations and absence of unfinished scaffold tokens.

## Reference Data

Representative circular-speed anchors for a flat Galactic rotation curve used for browser validation.

## References

- Rubin, V.C., Ford Jr, W.K. and Thonnard, N., 1980. Rotational properties of 21 Sc galaxies with a large range of luminosities and radii. The Astrophysical Journal, 238, pp.471-487.
- Sofue, Y., 2020. Rotation curve of the Milky Way and the dark matter density. Galaxies, 8(2), p.37.

## Research Quality Upgrade

See [RESEARCH_QUALITY.md](RESEARCH_QUALITY.md) for the validation layer, reference anchors, equations and research boundaries added to this repository.
