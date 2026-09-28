'use strict';

(function exposeCosmologyPhysics(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CosmologyPhysics = api;
}(typeof self !== 'undefined' ? self : globalThis, () => {
  function validate(parameters) {
    for (const key of ['omegaRadiation', 'omegaBaryon', 'omegaDarkMatter', 'omegaDarkEnergy']) {
      if (!Number.isFinite(parameters[key]) || parameters[key] < 0) throw new RangeError(`${key} must be finite and non-negative.`);
    }
  }

  function expansionSquared(scaleFactor, parameters) {
    validate(parameters);
    if (!(scaleFactor > 0)) throw new RangeError('Scale factor must be positive.');
    return parameters.omegaRadiation / scaleFactor ** 4
      + (parameters.omegaBaryon + parameters.omegaDarkMatter) / scaleFactor ** 3
      + parameters.omegaDarkEnergy;
  }

  function componentFractions(scaleFactor, parameters) {
    const denominator = expansionSquared(scaleFactor, parameters);
    return {
      radiation: parameters.omegaRadiation / scaleFactor ** 4 / denominator,
      baryons: parameters.omegaBaryon / scaleFactor ** 3 / denominator,
      darkMatter: parameters.omegaDarkMatter / scaleFactor ** 3 / denominator,
      darkEnergy: parameters.omegaDarkEnergy / denominator
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

  return { expansionSquared, componentFractions, equalityRedshift, baryonFractionOfMatter };
}));
