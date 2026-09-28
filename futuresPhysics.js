'use strict';

(function exposeFuturesPhysics(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FuturesPhysics = api;
}(typeof self !== 'undefined' ? self : globalThis, () => {
  const NUCLEONS_PER_KG = 5.9786374e26;
  const SECONDS_PER_DAY = 86400;
  const GEV_C2_TO_KG = 1.78266192e-27;
  const PLANCK_J_S = 6.62607015e-34;
  const CM_PER_AU = 1.495978707e13;

  function validatePositive(value, label) {
    if (!(Number.isFinite(value) && value > 0)) throw new RangeError(`${label} must be finite and positive.`);
  }

  function numberDensityCm3(localDensityGevCm3, massGev) {
    validatePositive(localDensityGevCm3, 'Local density');
    validatePositive(massGev, 'Particle mass');
    return localDensityGevCm3 / massGev;
  }

  function fluxCm2Second(localDensityGevCm3, massGev, speedKms) {
    validatePositive(speedKms, 'Speed');
    return numberDensityCm3(localDensityGevCm3, massGev) * speedKms * 1e5;
  }

  function illustrativeEventsPerKgDay(localDensityGevCm3, massGev, speedKms, crossSectionCm2, efficiency = 1) {
    validatePositive(crossSectionCm2, 'Cross section');
    if (!(efficiency >= 0 && efficiency <= 1)) throw new RangeError('Efficiency must lie between zero and one.');
    return fluxCm2Second(localDensityGevCm3, massGev, speedKms) * crossSectionCm2 * NUCLEONS_PER_KG * SECONDS_PER_DAY * efficiency;
  }

  function meanSpacingAu(localDensityGevCm3, massGev) {
    return numberDensityCm3(localDensityGevCm3, massGev) ** (-1 / 3) / CM_PER_AU;
  }

  function deBroglieWavelengthMetres(massGev, speedKms) {
    validatePositive(massGev, 'Particle mass');
    validatePositive(speedKms, 'Speed');
    return PLANCK_J_S / (massGev * GEV_C2_TO_KG * speedKms * 1000);
  }

  return { numberDensityCm3, fluxCm2Second, illustrativeEventsPerKgDay, meanSpacingAu, deBroglieWavelengthMetres };
}));
