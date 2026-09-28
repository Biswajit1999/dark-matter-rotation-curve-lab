(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const ids = ['h0', 'omegaB', 'omegaC', 'omegaR'];

  function value(id) { return Number($(id).value); }
  function fmt(number, digits = 4) {
    return Number(number).toLocaleString('en-GB', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function calculate() {
    const h0 = value('h0');
    const h = h0 / 100;
    const omegaB = value('omegaB');
    const omegaC = value('omegaC');
    const omegaR = value('omegaR');

    const baryons = omegaB / (h * h);
    const cdm = omegaC / (h * h);
    const radiation = omegaR / (h * h);
    const darkEnergy = 1 - baryons - cdm - radiation;

    const components = { radiation, baryons, cdm, darkEnergy };
    for (const [key, fraction] of Object.entries(components)) {
      const pct = fraction * 100;
      const output = $('out-' + key);
      if (output) output.textContent = (pct < 0.01 ? pct.toFixed(4) : pct.toFixed(2)) + '%';
      const bar = $('bar-' + key);
      if (bar) bar.style.setProperty('--share', Math.max(pct, 0.015) + '%');
    }

    $('hValue').textContent = fmt(h, 3);
    $('closureValue').textContent = fmt(baryons + cdm + radiation + darkEnergy, 6);
    $('eqBaryon').textContent = `${omegaB.toFixed(4)} / ${h.toFixed(3)}² = ${baryons.toFixed(5)}`;
    $('eqCdm').textContent = `${omegaC.toFixed(3)} / ${h.toFixed(3)}² = ${cdm.toFixed(5)}`;
    $('eqRadiation').textContent = `${omegaR.toExponential(3)} / ${h.toFixed(3)}² = ${radiation.toExponential(3)}`;
    $('eqDarkEnergy').textContent = `1 − Ωb − Ωcdm − Ωr = ${darkEnergy.toFixed(5)}`;
  }

  ids.forEach(id => $(id)?.addEventListener('input', calculate));
  calculate();
}());
