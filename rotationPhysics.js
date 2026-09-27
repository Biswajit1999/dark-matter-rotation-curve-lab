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
        { id: 'total', name: 'Total model', x: radii, y: components.map(value => value.total), color: '#f4f7fb', dash: [] },
        { id: 'gas', name: 'SPARC gas', x: radii, y: components.map(value => value.gas), color: '#54b8ea', dash: [8, 5] },
        { id: 'disk', name: 'SPARC stellar disc', x: radii, y: components.map(value => value.disk), color: '#ffd166', dash: [3, 4] },
        { id: 'halo', name: `${params.haloModel.toUpperCase()} halo`, x: radii, y: components.map(value => value.halo), color: '#b1a7ff', dash: [12, 5] }
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

  function seededRandom(seed) {
    let state = Number(seed) >>> 0;
    return function nextRandom() {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normalRandom(random) {
    const first = Math.max(random(), 1e-12);
    const second = random();
    return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
  }

  function quantile(values, probability) {
    const sorted = [...values].sort((left, right) => left - right);
    const position = (sorted.length - 1) * probability;
    const lower = Math.floor(position);
    const fraction = position - lower;
    return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
  }

  function sampleVariance(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  }

  function splitRhat(chains, key) {
    const split = chains.flatMap(chain => {
      const half = Math.floor(chain.length / 2);
      return [chain.slice(0, half), chain.slice(chain.length - half)];
    });
    const length = Math.min(...split.map(chain => chain.length));
    const series = split.map(chain => chain.slice(0, length).map(sample => sample[key]));
    const means = series.map(values => values.reduce((sum, value) => sum + value, 0) / length);
    const within = series.reduce((sum, values) => sum + sampleVariance(values), 0) / series.length;
    if (within <= 0) return 1;
    const between = length * sampleVariance(means);
    const variance = ((length - 1) / length) * within + between / length;
    return Math.sqrt(variance / within);
  }

  function effectiveSampleSize(chains, key) {
    const series = chains.map(chain => chain.map(sample => sample[key]));
    const length = Math.min(...series.map(values => values.length));
    const chainMeans = series.map(values => values.slice(0, length).reduce((sum, value) => sum + value, 0) / length);
    const variances = series.map(values => sampleVariance(values.slice(0, length)));
    let correlationSum = 0;
    for (let lag = 1; lag <= Math.min(60, length - 2); lag += 1) {
      let covariance = 0;
      let variance = 0;
      for (let chainIndex = 0; chainIndex < series.length; chainIndex += 1) {
        const values = series[chainIndex];
        const mean = chainMeans[chainIndex];
        for (let index = 0; index < length - lag; index += 1) {
          covariance += (values[index] - mean) * (values[index + lag] - mean);
        }
        variance += Math.max(variances[chainIndex], 1e-20) * (length - lag);
      }
      const correlation = covariance / variance;
      if (!Number.isFinite(correlation) || correlation <= 0) break;
      correlationSum += correlation;
    }
    return Math.min(series.length * length, (series.length * length) / (1 + 2 * correlationSum));
  }

  function empiricalCovariance(samples, keys, ranges) {
    const means = keys.map(key => samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length);
    return keys.map((leftKey, leftIndex) => keys.map((rightKey, rightIndex) => {
      const covariance = samples.reduce((sum, sample) => (
        sum + (sample[leftKey] - means[leftIndex]) * (sample[rightKey] - means[rightIndex])
      ), 0) / Math.max(1, samples.length - 1);
      return covariance + (leftIndex === rightIndex ? ranges[leftKey] ** 2 * 1e-9 : 0);
    }));
  }

  function cholesky3(matrix) {
    const lower = Array.from({ length: 3 }, () => Array(3).fill(0));
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column <= row; column += 1) {
        let sum = matrix[row][column];
        for (let index = 0; index < column; index += 1) sum -= lower[row][index] * lower[column][index];
        if (row === column) {
          if (sum <= 0 || !Number.isFinite(sum)) return null;
          lower[row][column] = Math.sqrt(sum);
        } else {
          lower[row][column] = sum / lower[column][column];
        }
      }
    }
    return lower;
  }

  function samplePosterior(params, reference, options = {}) {
    const keys = ['massToLightDisk', 'haloVelocity', 'haloScale'];
    const defaultPriors = {
      massToLightDisk: [0.1, 1],
      haloVelocity: [40, 320],
      haloScale: [0.5, 25]
    };
    const priors = Object.fromEntries(keys.map(key => {
      const bounds = options.priors?.[key] || defaultPriors[key];
      const minimum = Number(bounds[0]);
      const maximum = Number(bounds[1]);
      if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum) {
        throw new Error(`Invalid prior bounds for ${key}.`);
      }
      return [key, [minimum, maximum]];
    }));
    const chainCount = clamp(Math.round(Number(options.chainCount) || 4), 2, 8);
    const iterations = clamp(Math.round(Number(options.iterations) || 2600), 800, 12000);
    const burnIn = clamp(Math.round(Number(options.burnIn) || 1000), 200, iterations - 200);
    const thin = clamp(Math.round(Number(options.thin) || 3), 1, 20);
    const seed = Number(options.seed) || 20260927;
    const random = seededRandom(seed);
    const fitted = gridFit(params, reference).params;
    const ranges = Object.fromEntries(keys.map(key => [key, priors[key][1] - priors[key][0]]));
    const chains = [];
    const acceptanceRates = [];

    const logPosterior = candidate => {
      for (const key of keys) {
        if (candidate[key] < priors[key][0] || candidate[key] > priors[key][1]) return -Infinity;
      }
      return -0.5 * weightedStatistics(candidate, reference.points).chiSquared;
    };

    for (let chainIndex = 0; chainIndex < chainCount; chainIndex += 1) {
      let current = { ...fitted };
      for (const [index, key] of keys.entries()) {
        const offset = (chainIndex - (chainCount - 1) / 2) * 0.006 * ranges[key] * (index % 2 ? -1 : 1);
        current[key] = clamp(current[key] + offset, priors[key][0], priors[key][1]);
      }
      let currentLogPosterior = logPosterior(current);
      const steps = Object.fromEntries(keys.map(key => [key, ranges[key] * 0.018]));
      const retained = [];
      const adaptationHistory = [];
      let covarianceFactor = null;
      let proposalScale = 2.38 / Math.sqrt(keys.length);
      let accepted = 0;
      let windowAccepted = 0;

      for (let iteration = 0; iteration < iterations; iteration += 1) {
        const proposal = { ...current };
        if (covarianceFactor) {
          const normals = keys.map(() => normalRandom(random));
          keys.forEach((key, row) => {
            let delta = 0;
            for (let column = 0; column <= row; column += 1) delta += covarianceFactor[row][column] * normals[column];
            proposal[key] += proposalScale * delta;
          });
        } else {
          for (const key of keys) proposal[key] += normalRandom(random) * steps[key];
        }
        const proposalLogPosterior = logPosterior(proposal);
        if (Math.log(Math.max(random(), 1e-12)) < proposalLogPosterior - currentLogPosterior) {
          current = proposal;
          currentLogPosterior = proposalLogPosterior;
          accepted += 1;
          windowAccepted += 1;
        }
        if (iteration < burnIn) adaptationHistory.push(Object.fromEntries(keys.map(key => [key, current[key]])));
        if (iteration < burnIn && (iteration + 1) % 100 === 0) {
          const rate = windowAccepted / 100;
          const adjustment = rate < 0.17 ? 0.78 : rate > 0.4 ? 1.22 : 1;
          if (covarianceFactor) proposalScale *= adjustment;
          else for (const key of keys) steps[key] *= adjustment;
          if (iteration >= 299) {
            const recent = adaptationHistory.slice(-Math.min(1200, adaptationHistory.length));
            covarianceFactor = cholesky3(empiricalCovariance(recent, keys, ranges)) || covarianceFactor;
          }
          windowAccepted = 0;
        }
        if (iteration >= burnIn && (iteration - burnIn) % thin === 0) {
          retained.push(Object.fromEntries(keys.map(key => [key, current[key]])));
        }
      }
      chains.push(retained);
      acceptanceRates.push(accepted / iterations);
    }

    const samples = chains.flat();
    const summaries = Object.fromEntries(keys.map(key => {
      const values = samples.map(sample => sample[key]);
      return [key, {
        q16: quantile(values, 0.16),
        median: quantile(values, 0.5),
        q84: quantile(values, 0.84),
        rhat: splitRhat(chains, key),
        ess: effectiveSampleSize(chains, key)
      }];
    }));
    const posteriorParams = {
      ...params,
      ...Object.fromEntries(keys.map(key => [key, summaries[key].median]))
    };
    return {
      params: posteriorParams,
      result: evaluate(posteriorParams, reference, true),
      posterior: {
        parameterKeys: keys,
        priors,
        chains,
        samples,
        summaries,
        diagnostics: {
          acceptanceRates,
          meanAcceptance: acceptanceRates.reduce((sum, value) => sum + value, 0) / acceptanceRates.length,
          maxRhat: Math.max(...keys.map(key => summaries[key].rhat)),
          minEss: Math.min(...keys.map(key => summaries[key].ess))
        },
        config: { chainCount, iterations, burnIn, thin, seed }
      }
    };
  }

  return {
    burkertVelocity,
    componentsAt,
    evaluate,
    gridFit,
    haloVelocity,
    nfwVelocity,
    pseudoIsothermalVelocity,
    samplePosterior,
    signedSquare,
    weightedStatistics
  };
});
