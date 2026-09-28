'use strict';

(function exposeFuturesPhysics(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FuturesPhysics = api;
}(typeof self !== 'undefined' ? self : globalThis, () => {
  const NUCLEONS_PER_KG = 5.9786374e26;
  const SECONDS_PER_DAY = 86400;
  const SECONDS_PER_YEAR = 365.25 * SECONDS_PER_DAY;
  const GEV_C2_TO_KG = 1.78266192e-27;
  const PLANCK_J_S = 6.62607015e-34;
  const CM_PER_AU = 1.495978707e13;
  const C_M_S = 299792458;

  function validatePositive(value, label) {
    if (!(Number.isFinite(value) && value > 0)) throw new RangeError(`${label} must be finite and positive.`);
  }

  function validateUnitInterval(value, label) {
    if (!(Number.isFinite(value) && value >= 0 && value <= 1)) throw new RangeError(`${label} must lie between zero and one.`);
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
    validateUnitInterval(efficiency, 'Efficiency');
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

  function massDensityKgM3(localDensityGevCm3) {
    validatePositive(localDensityGevCm3, 'Local density');
    return localDensityGevCm3 * GEV_C2_TO_KG * 1e6;
  }

  function massFluxKgM2Second(localDensityGevCm3, speedKms) {
    validatePositive(speedKms, 'Speed');
    return massDensityKgM3(localDensityGevCm3) * speedKms * 1000;
  }

  function kineticPowerFluxWm2(localDensityGevCm3, speedKms) {
    const rho = massDensityKgM3(localDensityGevCm3);
    const speed = speedKms * 1000;
    validatePositive(speedKms, 'Speed');
    return 0.5 * rho * speed ** 3;
  }

  function momentumFluxPa(localDensityGevCm3, speedKms, transferFactor = 1) {
    validatePositive(speedKms, 'Speed');
    if (!(Number.isFinite(transferFactor) && transferFactor >= 0 && transferFactor <= 2)) {
      throw new RangeError('Momentum-transfer factor must lie between zero and two.');
    }
    const speed = speedKms * 1000;
    return transferFactor * massDensityKgM3(localDensityGevCm3) * speed ** 2;
  }

  function restMassPowerFluxWm2(localDensityGevCm3, speedKms, captureEfficiency = 1, conversionEfficiency = 1) {
    validateUnitInterval(captureEfficiency, 'Capture efficiency');
    validateUnitInterval(conversionEfficiency, 'Conversion efficiency');
    return massFluxKgM2Second(localDensityGevCm3, speedKms) * C_M_S ** 2 * captureEfficiency * conversionEfficiency;
  }

  function interactionProbabilityFromColumn(crossSectionCm2, targetColumnPerCm2) {
    validatePositive(crossSectionCm2, 'Cross section');
    if (!(Number.isFinite(targetColumnPerCm2) && targetColumnPerCm2 >= 0)) throw new RangeError('Target column must be finite and non-negative.');
    const opticalDepth = crossSectionCm2 * targetColumnPerCm2;
    return opticalDepth > 700 ? 1 : -Math.expm1(-opticalDepth);
  }

  function engineScenario({
    localDensityGevCm3 = 0.4,
    speedKms = 220,
    collectorAreaM2 = 1e6,
    spacecraftMassKg = 1e5,
    captureEfficiency = 1,
    conversionEfficiency = 1,
    momentumTransferFactor = 1,
    crossSectionCm2 = 1e-46,
    targetColumnPerCm2 = 1e30
  } = {}) {
    validatePositive(collectorAreaM2, 'Collector area');
    validatePositive(spacecraftMassKg, 'Spacecraft mass');
    validateUnitInterval(captureEfficiency, 'Capture efficiency');
    validateUnitInterval(conversionEfficiency, 'Conversion efficiency');
    const massFlux = massFluxKgM2Second(localDensityGevCm3, speedKms);
    const interactionProbability = interactionProbabilityFromColumn(crossSectionCm2, targetColumnPerCm2);
    const effectiveCapture = captureEfficiency * interactionProbability;
    const encounteredMassRateKgS = massFlux * collectorAreaM2;
    const capturedMassRateKgS = encounteredMassRateKgS * effectiveCapture;
    const kineticPowerW = kineticPowerFluxWm2(localDensityGevCm3, speedKms) * collectorAreaM2 * effectiveCapture;
    const restMassPowerW = massFlux * collectorAreaM2 * C_M_S ** 2 * effectiveCapture * conversionEfficiency;
    const thrustN = momentumFluxPa(localDensityGevCm3, speedKms, momentumTransferFactor) * collectorAreaM2 * effectiveCapture;
    const accelerationMps2 = thrustN / spacecraftMassKg;
    return {
      interactionProbability,
      effectiveCapture,
      encounteredMassRateKgS,
      capturedMassRateKgS,
      kineticPowerW,
      restMassPowerW,
      thrustN,
      accelerationMps2,
      deltaVOneYearMps: accelerationMps2 * SECONDS_PER_YEAR,
      deltaVTenYearsMps: accelerationMps2 * SECONDS_PER_YEAR * 10
    };
  }

  return {
    NUCLEONS_PER_KG,
    SECONDS_PER_DAY,
    SECONDS_PER_YEAR,
    GEV_C2_TO_KG,
    C_M_S,
    numberDensityCm3,
    fluxCm2Second,
    illustrativeEventsPerKgDay,
    meanSpacingAu,
    deBroglieWavelengthMetres,
    massDensityKgM3,
    massFluxKgM2Second,
    kineticPowerFluxWm2,
    momentumFluxPa,
    restMassPowerFluxWm2,
    interactionProbabilityFromColumn,
    engineScenario
  };
}));
