'use strict';

(function exposeLensingPhysics(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LensingPhysics = api;
}(typeof self !== 'undefined' ? self : globalThis, () => {
  const C_KMS = 299792.458;
  const G_MPC_KMS2_MSUN = 4.30091e-9;
  const ARCSEC_PER_RADIAN = 206264.806247;

  function expansionFunction(redshift, omegaMatter = 0.3, omegaLambda = 0.7) {
    if (redshift < 0) throw new RangeError('Redshift must be non-negative.');
    const omegaCurvature = 1 - omegaMatter - omegaLambda;
    return Math.sqrt(omegaMatter * (1 + redshift) ** 3 + omegaCurvature * (1 + redshift) ** 2 + omegaLambda);
  }

  function comovingDistanceMpc(redshift, h0 = 70, omegaMatter = 0.3, omegaLambda = 0.7) {
    if (redshift < 0) throw new RangeError('Redshift must be non-negative.');
    if (!(h0 > 0)) throw new RangeError('H0 must be positive.');
    if (redshift === 0) return 0;
    const intervals = 800;
    const step = redshift / intervals;
    let sum = 1 / expansionFunction(0, omegaMatter, omegaLambda)
      + 1 / expansionFunction(redshift, omegaMatter, omegaLambda);
    for (let index = 1; index < intervals; index += 1) {
      sum += (index % 2 ? 4 : 2) / expansionFunction(index * step, omegaMatter, omegaLambda);
    }
    return C_KMS / h0 * step * sum / 3;
  }

  function angularDiameterDistanceMpc(redshift, h0 = 70, omegaMatter = 0.3, omegaLambda = 0.7) {
    return comovingDistanceMpc(redshift, h0, omegaMatter, omegaLambda) / (1 + redshift);
  }

  function angularDiameterDistanceBetweenMpc(lensRedshift, sourceRedshift, h0 = 70, omegaMatter = 0.3, omegaLambda = 0.7) {
    if (sourceRedshift <= lensRedshift) return 0;
    const lensComoving = comovingDistanceMpc(lensRedshift, h0, omegaMatter, omegaLambda);
    const sourceComoving = comovingDistanceMpc(sourceRedshift, h0, omegaMatter, omegaLambda);
    return (sourceComoving - lensComoving) / (1 + sourceRedshift);
  }

  function criticalSurfaceDensity(lensRedshift, sourceRedshift, h0 = 70, omegaMatter = 0.3, omegaLambda = 0.7) {
    const lensDistance = angularDiameterDistanceMpc(lensRedshift, h0, omegaMatter, omegaLambda);
    const sourceDistance = angularDiameterDistanceMpc(sourceRedshift, h0, omegaMatter, omegaLambda);
    const betweenDistance = angularDiameterDistanceBetweenMpc(lensRedshift, sourceRedshift, h0, omegaMatter, omegaLambda);
    if (!(lensDistance > 0 && sourceDistance > 0 && betweenDistance > 0)) return Infinity;
    const solarMassesPerMpcSquared = C_KMS ** 2 / (4 * Math.PI * G_MPC_KMS2_MSUN)
      * sourceDistance / (lensDistance * betweenDistance);
    return solarMassesPerMpcSquared / 1e12;
  }

  function einsteinRadiusArcsec(velocityDispersionKms, lensRedshift, sourceRedshift, h0 = 70, omegaMatter = 0.3, omegaLambda = 0.7) {
    if (!(velocityDispersionKms > 0)) throw new RangeError('Velocity dispersion must be positive.');
    const sourceDistance = angularDiameterDistanceMpc(sourceRedshift, h0, omegaMatter, omegaLambda);
    const betweenDistance = angularDiameterDistanceBetweenMpc(lensRedshift, sourceRedshift, h0, omegaMatter, omegaLambda);
    if (!(sourceDistance > 0 && betweenDistance > 0)) return 0;
    return 4 * Math.PI * (velocityDispersionKms / C_KMS) ** 2 * betweenDistance / sourceDistance * ARCSEC_PER_RADIAN;
  }

  function angularScaleKpcPerArcsec(redshift, h0 = 70, omegaMatter = 0.3, omegaLambda = 0.7) {
    return angularDiameterDistanceMpc(redshift, h0, omegaMatter, omegaLambda) * 1000 / ARCSEC_PER_RADIAN;
  }

  return {
    C_KMS,
    expansionFunction,
    comovingDistanceMpc,
    angularDiameterDistanceMpc,
    angularDiameterDistanceBetweenMpc,
    criticalSurfaceDensity,
    einsteinRadiusArcsec,
    angularScaleKpcPerArcsec
  };
}));
