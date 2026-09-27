(function initialiseRotationPhysics(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RotationPhysics = api;
})(typeof self !== 'undefined' ? self : globalThis, function buildRotationPhysics() {
  'use strict';

  const EPSILON_RADIUS_KPC = 1e-6;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function linspace(start, end, count) {
    if (count <= 1) return [start];
    return Array.from({ length: count }, (_, index) => start + (end - start) * index / (count - 1));
  }

  function signedSquare(value) {
    return Math.sign(value) * value * value;
  }

  function pseudoIsothermalVelocity(radiusKpc, velocityInfinityKmS, coreRadiusKpc) {
    const radius = Math.max(Number(radiusKpc), EPSILON_RADIUS_KPC);
    const core = Math.max(Number(coreRadiusKpc), EPSILON_RADIUS_KPC);
    const bracket = 1 - (core / radius) * Math.atan(radius / core);
    return Number(velocityInfinityKmS) * Math.sqrt(Math.max(0, bracket));
  }

  // vScale^2 = 4 pi G rho_s r_s^2 for rho = rho_s/[x(1+x)^2].
  function nfwVelocity(radiusKpc, velocityScaleKmS, scaleRadiusKpc) {
    const x = Math.max(Number(radiusKpc) / Math.max(Number(scaleRadiusKpc), EPSILON_RADIUS_KPC), EPSILON_RADIUS_KPC);
    const enclosed = Math.log1p(x) - x / (1 + x);
    return Number(velocityScaleKmS) * Math.sqrt(Math.max(0, enclosed / x));
  }

  // vScale^2 = pi G rho_0 r_0^2 for rho = rho_0/[(1+x)(1+x^2)].
  function burkertVelocity(radiusKpc, velocityScaleKmS, scaleRadiusKpc) {
    const x = Math.max(Number(radiusKpc) / Math.max(Number(scaleRadiusKpc), EPSILON_RADIUS_KPC), EPSILON_RADIUS_KPC);
    const enclosed = Math.log((1 + x) * (1 + x) * (1 + x * x)) - 2 * Math.atan(x);
    return Number(velocityScaleKmS) * Math.sqrt(Math.max(0, enclosed / x));
  }

  function haloVelocity(model, radiusKpc, velocityScaleKmS, scaleRadiusKpc) {
    if (model === 'nfw') return nfwVelocity(radiusKpc, velocityScaleKmS, scaleRadiusKpc);
    if (model === 'burkert') return burkertVelocity(radiusKpc, velocityScaleKmS, scaleRadiusKpc);
    return pseudoIsothermalVelocity(radiusKpc, velocityScaleKmS, scaleRadiusKpc);
  }

  function interpolate(points, key, radiusKpc) {
    if (!points.length) return 0;
    if (radiusKpc <= points[0].x) return Number(points[0][key] || 0);
    if (radiusKpc >= points.at(-1).x) return Number(points.at(-1)[key] || 0);
    let low = 0;
    let high = points.length - 1;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (points[middle].x <= radiusKpc) low = middle;
      else high = middle;
    }
    const left = points[low];
    const right = points[high];
    const fraction = (radiusKpc - left.x) / (right.x - left.x);
    return Number(left[key] || 0) + fraction * (Number(right[key] || 0) - Number(left[key] || 0));
  }

  function componentsAt(params, points, radiusKpc) {
    const gasVelocity = interpolate(points, 'v_gas', radiusKpc);
    const diskVelocity = interpolate(points, 'v_disk', radiusKpc);
    const bulgeVelocity = interpolate(points, 'v_bulge', radiusKpc);
    const gasSquared = signedSquare(gasVelocity);
    const diskSquared = Number(params.massToLightDisk) * signedSquare(diskVelocity);
    const bulgeSquared = Number(params.massToLightBulge) * signedSquare(bulgeVelocity);
    const baryonicSquared = gasSquared + diskSquared + bulgeSquared;
    const halo = haloVelocity(params.haloModel, radiusKpc, params.haloVelocity, params.haloScale);
    return {
      gas: gasVelocity,
      disk: Math.sqrt(Math.max(0, diskSquared)),
      bulge: Math.sqrt(Math.max(0, bulgeSquared)),
      baryonic: Math.sqrt(Math.max(0, baryonicSquared)),
      halo,
      total: Math.sqrt(Math.max(0, baryonicSquared + halo * halo))
    };
  }

  function weightedStatistics(params, points) {
    let chiSquared = 0;
    let weightedSquaredResidual = 0;
    let sumWeights = 0;
    const residuals = points.map(point => {
      const predicted = componentsAt(params, points, point.x).total;
      const sigma = Math.max(Number(point.y_err), 1e-6);
      const residual = Number(point.y) - predicted;
      const standardised = residual / sigma;
      const weight = 1 / (sigma * sigma);
      chiSquared += standardised * standardised;
      weightedSquaredResidual += weight * residual * residual;
      sumWeights += weight;
      return { radius: point.x, observed: point.y, uncertainty: sigma, predicted, residual, standardised };
    });
    const parameterCount = 3;
    const degreesOfFreedom = Math.max(1, points.length - parameterCount);
    return {
      chiSquared,
      reducedChiSquared: chiSquared / degreesOfFreedom,
      weightedRmsKmS: Math.sqrt(weightedSquaredResidual / Math.max(sumWeights, 1e-12)),
      logLikelihood: -0.5 * chiSquared,
      aic: chiSquared + 2 * parameterCount,
      degreesOfFreedom,
      residuals
    };
  }

  function responseGrid(params, points, size = 40) {
    const velocities = linspace(60, 300, size);
    const scales = linspace(0.5, 25, size);
    const chiSquared = [];
    let minimum = Infinity;
    for (const scale of scales) {
      for (const velocity of velocities) {
        const value = weightedStatistics({ ...params, haloVelocity: velocity, haloScale: scale }, points).chiSquared;
        chiSquared.push(value);
        minimum = Math.min(minimum, value);
      }
    }
    return {
      n: size,
      label: '\u0394\u03c7\u00b2 surface: halo velocity \u00d7 scale radius',
      xMinimum: velocities[0],
      xMaximum: velocities.at(-1),
      yMinimum: scales[0],
      yMaximum: scales.at(-1),
      minimumChiSquared: minimum,
      values: chiSquared.map(value => value - minimum)
    };
  }

  function evaluate(params, reference, includeGrid = true) {
    const points = reference.points || [];
    if (!points.length) throw new Error('Reference data contain no points.');
    const radii = linspace(points[0].x, points.at(-1).x, 420);
    const components = radii.map(radius => componentsAt(params, points, radius));
    const statistics = weightedStatistics(params, points);
    const outer = componentsAt(params, points, points.at(-1).x);
    const outerDarkFraction = outer.total > 0 ? (outer.halo * outer.halo) / (outer.total * outer.total) : 0;
    const observed = statistics.residuals.map((item, index) => ({
      ...points[index],
      ...item,
      ...componentsAt(params, points, item.radius)
    }));
    return {
      series: [
        { id: 'total', name: 'Total model', x: radii, y: components.map(value => value.total), color: '#f3f7ff', dash: [] },
        { id: 'gas', name: 'SPARC gas', x: radii, y: components.map(value => value.gas), color: '#4cc9f0', dash: [8, 5] },
        { id: 'disk', name: 'SPARC stellar disc', x: radii, y: components.map(value => value.disk), color: '#f9c74f', dash: [3, 4] },
        { id: 'halo', name: `${params.haloModel.toUpperCase()} halo`, x: radii, y: components.map(value => value.halo), color: '#b58cff', dash: [12, 5] }
      ],
      observed,
      residuals: statistics.residuals,
      metrics: {
        chi_squared: statistics.chiSquared,
        reduced_chi_squared: statistics.reducedChiSquared,
        weighted_rms_kms: statistics.weightedRmsKmS,
        log_likelihood: statistics.logLikelihood,
        aic: statistics.aic,
        outer_dark_fraction: clamp(outerDarkFraction, 0, 1)
      },
      heatmap: includeGrid ? responseGrid(params, points) : null
    };
  }

  function gridFit(params, reference) {
    const points = reference.points || [];
    let best = { chiSquared: Infinity, params: { ...params } };
    // Grid nodes align with the UI control steps so an applied fit is displayed exactly.
    const massToLightValues = linspace(0.2, 0.8, 13);
    const velocityValues = linspace(60, 300, 25);
    const scaleValues = linspace(0.5, 25, 50);
    for (const massToLightDisk of massToLightValues) {
      for (const haloVelocity of velocityValues) {
        for (const haloScale of scaleValues) {
          const candidate = { ...params, massToLightDisk, haloVelocity, haloScale };
          const chiSquared = weightedStatistics(candidate, points).chiSquared;
          if (chiSquared < best.chiSquared) best = { chiSquared, params: candidate };
        }
      }
    }
    return { params: best.params, result: evaluate(best.params, reference, true) };
  }

  return {
    burkertVelocity,
    componentsAt,
    evaluate,
    gridFit,
    haloVelocity,
    nfwVelocity,
    pseudoIsothermalVelocity,
    signedSquare,
    weightedStatistics
  };
});
