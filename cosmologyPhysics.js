'use strict';

(function exposeCosmologyPhysics(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CosmologyPhysics = api;
}(typeof self !== 'undefined' ? self : globalThis, () => {
  const C_KM_S = 299792.458;

  function validate(parameters) {
    for (const key of ['omegaRadiation', 'omegaBaryon', 'omegaDarkMatter', 'omegaDarkEnergy']) {
      if (!Number.isFinite(parameters[key]) || parameters[key] < 0) throw new RangeError(`${key} must be finite and non-negative.`);
    }
    for (const key of ['w0', 'wa']) {
      if (parameters[key] !== undefined && !Number.isFinite(parameters[key])) throw new RangeError(`${key} must be finite.`);
    }
  }

  function darkEnergyDensityFactor(scaleFactor, w0 = -1, wa = 0) {
    if (!(Number.isFinite(scaleFactor) && scaleFactor > 0)) throw new RangeError('Scale factor must be positive.');
    if (!(Number.isFinite(w0) && Number.isFinite(wa))) throw new RangeError('Dark-energy equation-of-state parameters must be finite.');
    // CPL: w(a)=w0+wa(1-a), normalised to rho_DE(a=1)=rho_DE,0.
    return scaleFactor ** (-3 * (1 + w0 + wa)) * Math.exp(3 * wa * (scaleFactor - 1));
  }

  function expansionSquared(scaleFactor, parameters) {
    validate(parameters);
    if (!(scaleFactor > 0)) throw new RangeError('Scale factor must be positive.');
    const w0 = parameters.w0 ?? -1;
    const wa = parameters.wa ?? 0;
    const curvature = parameters.omegaCurvature ?? 0;
    if (!Number.isFinite(curvature)) throw new RangeError('omegaCurvature must be finite.');
    return parameters.omegaRadiation / scaleFactor ** 4
      + (parameters.omegaBaryon + parameters.omegaDarkMatter) / scaleFactor ** 3
      + curvature / scaleFactor ** 2
      + parameters.omegaDarkEnergy * darkEnergyDensityFactor(scaleFactor, w0, wa);
  }

  function componentFractions(scaleFactor, parameters) {
    const denominator = expansionSquared(scaleFactor, parameters);
    const w0 = parameters.w0 ?? -1;
    const wa = parameters.wa ?? 0;
    const curvature = parameters.omegaCurvature ?? 0;
    return {
      radiation: parameters.omegaRadiation / scaleFactor ** 4 / denominator,
      baryons: parameters.omegaBaryon / scaleFactor ** 3 / denominator,
      darkMatter: parameters.omegaDarkMatter / scaleFactor ** 3 / denominator,
      darkEnergy: parameters.omegaDarkEnergy * darkEnergyDensityFactor(scaleFactor, w0, wa) / denominator,
      curvature: curvature / scaleFactor ** 2 / denominator
    };
  }

  function equalityRedshift(parameters) {
    validate(parameters);
    const matter = parameters.omegaBaryon + parameters.omegaDarkMatter;
    return matter / parameters.omegaRadiation - 1;
  }

  function baryonFractionOfMatter(parameters) {
    validate(parameters);
    const matter = parameters.omegaBaryon + parameters.omegaDarkMatter;
    return matter > 0 ? parameters.omegaBaryon / matter : 0;
  }

  function dimensionlessHubble(redshift, parameters) {
    if (!(Number.isFinite(redshift) && redshift >= 0)) throw new RangeError('Redshift must be finite and non-negative.');
    return Math.sqrt(expansionSquared(1 / (1 + redshift), parameters));
  }

  function hubbleKmSPerMpc(redshift, h0KmSPerMpc, parameters) {
    if (!(Number.isFinite(h0KmSPerMpc) && h0KmSPerMpc > 0)) throw new RangeError('H0 must be finite and positive.');
    return h0KmSPerMpc * dimensionlessHubble(redshift, parameters);
  }

  function simpsonIntegral(fn, minimum, maximum, intervals = 1024) {
    if (!(Number.isFinite(minimum) && Number.isFinite(maximum) && maximum >= minimum)) throw new RangeError('Integration bounds must be finite and ordered.');
    let n = Math.max(2, Math.floor(intervals));
    if (n % 2) n += 1;
    if (maximum === minimum) return 0;
    const step = (maximum - minimum) / n;
    let sum = fn(minimum) + fn(maximum);
    for (let index = 1; index < n; index += 1) sum += (index % 2 ? 4 : 2) * fn(minimum + index * step);
    return sum * step / 3;
  }

  function comovingDistanceMpc(redshift, h0KmSPerMpc, parameters, intervals = 1024) {
    if (!(Number.isFinite(redshift) && redshift >= 0)) throw new RangeError('Redshift must be finite and non-negative.');
    if (!(Number.isFinite(h0KmSPerMpc) && h0KmSPerMpc > 0)) throw new RangeError('H0 must be finite and positive.');
    return C_KM_S / h0KmSPerMpc * simpsonIntegral(z => 1 / dimensionlessHubble(z, parameters), 0, redshift, intervals);
  }

  function baoDistances(redshift, h0KmSPerMpc, parameters, soundHorizonMpc = 147.09) {
    if (!(Number.isFinite(soundHorizonMpc) && soundHorizonMpc > 0)) throw new RangeError('Sound horizon must be finite and positive.');
    const hubble = hubbleKmSPerMpc(redshift, h0KmSPerMpc, parameters);
    const dhMpc = C_KM_S / hubble;
    const dmMpc = comovingDistanceMpc(redshift, h0KmSPerMpc, parameters);
    const dvMpc = (redshift * dhMpc * dmMpc * dmMpc) ** (1 / 3);
    return {
      redshift,
      hubbleKmSPerMpc: hubble,
      dhMpc,
      dmMpc,
      dvMpc,
      dhOverRd: dhMpc / soundHorizonMpc,
      dmOverRd: dmMpc / soundHorizonMpc,
      dvOverRd: dvMpc / soundHorizonMpc,
      soundHorizonMpc
    };
  }

  return {
    C_KM_S,
    expansionSquared,
    componentFractions,
    equalityRedshift,
    baryonFractionOfMatter,
    darkEnergyDensityFactor,
    dimensionlessHubble,
    hubbleKmSPerMpc,
    comovingDistanceMpc,
    baoDistances
  };
}));
