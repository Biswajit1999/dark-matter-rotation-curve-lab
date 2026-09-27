'use strict';

const CONTROL_DEFINITIONS = [
  { key: 'massToLightDisk', label: 'Disc mass-to-light ratio', unit: 'M☉/L☉ at 3.6 μm', value: 0.5, min: 0.1, max: 1, step: 0.01 },
  { key: 'haloVelocity', label: 'Halo velocity scale', unit: 'km/s', value: 170, min: 40, max: 320, step: 1 },
  { key: 'haloScale', label: 'Halo scale radius', unit: 'kpc', value: 5, min: 0.5, max: 25, step: 0.1 }
];

const HALO_HELP = {
  piso: 'Cored pseudo-isothermal profile; the velocity control is the asymptotic halo speed.',
  nfw: 'Cuspy NFW profile; velocity is the characteristic scale defined by 4πGρₛrₛ².',
  burkert: 'Cored Burkert profile; velocity is the characteristic scale defined by πGρ₀r₀².'
};

const METRIC_LABELS = {
  chi_squared: ['χ²', 'weighted sum'],
  reduced_chi_squared: ['Reduced χ²', 'degrees of freedom'],
  weighted_rms_kms: ['Weighted RMS', 'km/s'],
  log_likelihood: ['Log likelihood', '−χ² / 2'],
  aic: ['AIC', '3 fitted parameters'],
  bic: ['BIC', '3 parameters; n observations'],
  outer_dark_fraction: ['Outer halo share', 'v² halo / v² total']
};

const state = {
  catalog: null,
  reference: null,
  params: {
    haloModel: 'piso',
    massToLightDisk: 0.5,
    massToLightBulge: 0.7,
    haloVelocity: 170,
    haloScale: 5
  },
  result: null,
  posterior: null,
  worker: null,
  requestId: 0,
  pendingFrame: null
};

const $ = id => document.getElementById(id);

function formatNumber(value, digits = 3) {
  if (!Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-GB', { maximumFractionDigits: digits });
}

function createControl(definition) {
  const group = document.createElement('div');
  group.className = 'range-field';

  const labelRow = document.createElement('div');
  labelRow.className = 'range-label';
  const label = document.createElement('label');
  label.htmlFor = `control-${definition.key}`;
  label.textContent = definition.label;
  const output = document.createElement('output');
  output.id = `output-${definition.key}`;
  output.htmlFor = `control-${definition.key}`;
  output.textContent = `${formatNumber(definition.value)} ${definition.unit}`;
  labelRow.append(label, output);

  const input = document.createElement('input');
  input.id = `control-${definition.key}`;
  input.type = 'range';
  input.min = definition.min;
  input.max = definition.max;
  input.step = definition.step;
  input.value = definition.value;
  input.addEventListener('input', event => {
    state.params[definition.key] = Number(event.currentTarget.value);
    output.textContent = `${formatNumber(state.params[definition.key])} ${definition.unit}`;
    scheduleModel();
  });

  const bounds = document.createElement('div');
  bounds.className = 'range-bounds';
  bounds.setAttribute('aria-hidden', 'true');
  bounds.innerHTML = `<span>${definition.min}</span><span>${definition.max}</span>`;
  group.append(labelRow, input, bounds);
  return group;
}

function buildControls() {
  const root = $('controls');
  root.replaceChildren(...CONTROL_DEFINITIONS.map(createControl));
  $('haloModel').value = state.params.haloModel;
  $('haloHelp').textContent = HALO_HELP[state.params.haloModel];
}

function selectReference(galaxyId) {
  const selected = state.catalog.galaxies.find(galaxy => galaxy.galaxy_id === galaxyId);
  if (!selected) throw new Error(`Unknown galaxy selection: ${galaxyId}`);
  const { galaxies, selection_count, total_points, ...shared } = state.catalog;
  state.reference = { ...shared, ...selected };
  $('referenceLabel').textContent = `${state.reference.n_points} SPARC points`;
  $('datasetName').textContent = state.reference.dataset;
  $('distanceValue').textContent = `${state.reference.distance_mpc} Mpc`;
  $('checksumValue').textContent = state.reference.provenance.upstream_sha256;
  $('sourceLink').href = state.reference.source_url;
  $('curve-title').textContent = `${state.reference.galaxy} rotation-curve decomposition`;
  $('tableSummary').textContent = `Show ${state.reference.n_points}-point accessible data table`;
  $('dataCaption').textContent = `${state.reference.galaxy} observed rotation curve and current model evaluation`;
  $('notes').textContent = `${state.reference.citation} Random velocity uncertainties are included; inclination and distance systematics are not.`;
}

async function loadCatalog() {
  const response = await fetch('data/galaxies.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Galaxy catalogue request failed with HTTP ${response.status}.`);
  state.catalog = await response.json();
  const options = state.catalog.galaxies.map(galaxy => {
    const option = document.createElement('option');
    option.value = galaxy.galaxy_id;
    option.textContent = `${galaxy.galaxy} · ${galaxy.n_points} points · ${galaxy.distance_mpc} Mpc`;
    return option;
  });
  $('galaxySelect').replaceChildren(...options);
  $('galaxySelect').value = 'NGC3198';
  selectReference('NGC3198');
}

function getWorker() {
  if (state.worker) return state.worker;
  state.worker = new Worker('physicsWorker.js');
  state.worker.onmessage = event => {
    if (event.data.requestId !== state.requestId) return;
    if (event.data.action === 'error') {
      setBusy(false);
      $('workerStatus').textContent = `Model error: ${event.data.message}`;
      $('posteriorStatus').textContent = `Posterior error: ${event.data.message}`;
      return;
    }
    state.params = { ...state.params, ...event.data.params };
    state.result = event.data.result;
    if (event.data.action === 'sample') state.posterior = event.data.posterior;
    syncControls();
    renderAll();
    renderPosterior();
    setBusy(false);
    $('workerStatus').textContent = `${state.catalog.selection_count} galaxies loaded · deterministic calculation`;
    $('fitStatus').textContent = event.data.action === 'fit'
      ? `${state.reference.galaxy} grid minimum`
      : event.data.action === 'sample'
        ? `${state.reference.galaxy} posterior sampled`
        : `${state.reference.galaxy} · ${state.params.haloModel.toUpperCase()}`;
  };
  state.worker.onerror = event => {
    setBusy(false);
    $('workerStatus').textContent = `Worker error: ${event.message}`;
  };
  return state.worker;
}

function setBusy(isBusy, action = '') {
  $('fitModel').disabled = isBusy;
  $('runPosterior').disabled = isBusy;
  $('fitModel').textContent = isBusy && action === 'fit' ? 'Searching parameter grid…' : 'Find grid best fit';
  $('runPosterior').textContent = isBusy && action === 'sample' ? 'Sampling four chains…' : 'Run posterior chains';
  document.body.classList.toggle('is-busy', isBusy);
}

function clearPosterior(message = 'Posterior not run for this galaxy and halo model.') {
  state.posterior = null;
  $('posteriorStatus').textContent = message;
  $('posteriorMetrics').replaceChildren();
  $('posteriorRows').innerHTML = '<tr><td colspan="6">No posterior samples yet.</td></tr>';
  $('predictiveRows').innerHTML = '<tr><td colspan="7">No posterior predictive intervals yet.</td></tr>';
  $('exportPosterior').disabled = true;
  $('exportPredictive').disabled = true;
  drawPosterior();
}

function runModel(action = 'evaluate', samplerOptions = null) {
  if (!state.reference) return;
  if (action !== 'sample') clearPosterior('Model or target changed; run new posterior chains for this configuration.');
  state.requestId += 1;
  $('runId').textContent = `run ${String(state.requestId).padStart(3, '0')}`;
  getWorker().postMessage({ requestId: state.requestId, action, params: state.params, reference: state.reference, samplerOptions });
}

function scheduleModel() {
  if (state.pendingFrame) cancelAnimationFrame(state.pendingFrame);
  state.pendingFrame = requestAnimationFrame(() => {
    state.pendingFrame = null;
    runModel();
  });
}

function syncControls() {
  $('haloModel').value = state.params.haloModel;
  $('haloHelp').textContent = HALO_HELP[state.params.haloModel];
  for (const definition of CONTROL_DEFINITIONS) {
    const input = $(`control-${definition.key}`);
    input.value = state.params[definition.key];
    $(`output-${definition.key}`).textContent = `${formatNumber(state.params[definition.key])} ${definition.unit}`;
  }
}

function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width));
  const height = Math.max(180, Math.round(rect.height));
  const density = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== width * density || canvas.height !== height * density) {
    canvas.width = width * density;
    canvas.height = height * density;
  }
  const context = canvas.getContext('2d');
  context.setTransform(density, 0, 0, density, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
}

function drawAxes(context, dimensions, bounds, labels) {
  const { width, height } = dimensions;
  const plot = { left: 64, top: labels.top || 22, right: width - 20, bottom: height - 48 };
  context.font = '12px ui-monospace, SFMono-Regular, Consolas, monospace';
  context.lineWidth = 1;
  context.textBaseline = 'middle';
  for (let index = 0; index <= 5; index += 1) {
    const x = plot.left + (plot.right - plot.left) * index / 5;
    const y = plot.bottom - (plot.bottom - plot.top) * index / 5;
    context.strokeStyle = 'rgba(149, 166, 190, 0.16)';
    context.beginPath();
    context.moveTo(x, plot.top);
    context.lineTo(x, plot.bottom);
    context.moveTo(plot.left, y);
    context.lineTo(plot.right, y);
    context.stroke();
    context.fillStyle = '#a8b4c8';
    context.textAlign = 'center';
    context.fillText(formatNumber(bounds.minX + (bounds.maxX - bounds.minX) * index / 5, 1), x, plot.bottom + 20);
    context.textAlign = 'right';
    context.fillText(formatNumber(bounds.minY + (bounds.maxY - bounds.minY) * index / 5, 1), plot.left - 10, y);
  }
    context.strokeStyle = '#4b6b86';
  context.beginPath();
  context.moveTo(plot.left, plot.top);
  context.lineTo(plot.left, plot.bottom);
  context.lineTo(plot.right, plot.bottom);
  context.stroke();
  context.fillStyle = '#c8d1df';
  context.textAlign = 'center';
  context.fillText(labels.x, (plot.left + plot.right) / 2, height - 13);
  context.save();
  context.translate(14, (plot.top + plot.bottom) / 2);
  context.rotate(-Math.PI / 2);
  context.fillText(labels.y, 0, 0);
  context.restore();
  const scaleX = value => plot.left + (value - bounds.minX) / (bounds.maxX - bounds.minX || 1) * (plot.right - plot.left);
  const scaleY = value => plot.bottom - (value - bounds.minY) / (bounds.maxY - bounds.minY || 1) * (plot.bottom - plot.top);
  return { plot, scaleX, scaleY };
}

function drawSeries() {
  if (!state.result) return;
  const canvas = $('seriesCanvas');
  const { context, width, height } = prepareCanvas(canvas);
  const points = state.result.observed;
  const predictive = state.posterior?.predictive;
  const legendItems = [
    { name: 'Observed ±1σ', color: '#f4b860', dash: [] },
    ...(predictive ? [{ name: '68% predictive interval', color: '#54b8ea', dash: [3, 4], fill: true }] : []),
    ...state.result.series
  ];
  const columns = width < 720 ? 2 : legendItems.length;
  const legendRows = Math.ceil(legendItems.length / columns);
  const predictiveMaximum = predictive ? Math.max(...predictive.intervals.map(interval => interval.predictiveQ84)) : 0;
  const maxY = Math.max(predictiveMaximum, ...points.map(point => point.observed + point.uncertainty), ...state.result.series.flatMap(series => series.y));
  const bounds = { minX: 0, maxX: points.at(-1).radius, minY: 0, maxY: Math.ceil(maxY / 20) * 20 };
  const { scaleX, scaleY } = drawAxes(context, { width, height }, bounds, {
    x: 'Galactocentric radius [kpc]',
    y: 'Circular velocity [km/s]',
    top: 28 + legendRows * 19
  });

  if (predictive?.intervals?.length) {
    const intervals = predictive.intervals;
    context.fillStyle = 'rgba(84, 184, 234, 0.16)';
    context.beginPath();
    intervals.forEach((interval, index) => {
      const x = scaleX(interval.radius);
      const y = scaleY(interval.predictiveQ84);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    for (let index = intervals.length - 1; index >= 0; index -= 1) {
      context.lineTo(scaleX(intervals[index].radius), scaleY(intervals[index].predictiveQ16));
    }
    context.closePath();
    context.fill();
    context.strokeStyle = 'rgba(84, 184, 234, 0.7)';
    context.lineWidth = 1;
    context.setLineDash([3, 4]);
    for (const key of ['predictiveQ16', 'predictiveQ84']) {
      context.beginPath();
      intervals.forEach((interval, index) => {
        const x = scaleX(interval.radius);
        const y = scaleY(interval[key]);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
    context.setLineDash([]);
  }

  for (const series of state.result.series) {
    context.strokeStyle = series.color;
    context.lineWidth = series.id === 'total' ? 2.6 : 1.8;
    context.setLineDash(series.dash || []);
    context.beginPath();
    series.x.forEach((radius, index) => {
      const x = scaleX(radius);
      const y = scaleY(series.y[index]);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }
  context.setLineDash([]);

  for (const point of points) {
    const x = scaleX(point.radius);
    const y = scaleY(point.observed);
    context.strokeStyle = '#f4b860';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, scaleY(point.observed - point.uncertainty));
    context.lineTo(x, scaleY(point.observed + point.uncertainty));
    context.moveTo(x - 3, scaleY(point.observed - point.uncertainty));
    context.lineTo(x + 3, scaleY(point.observed - point.uncertainty));
    context.moveTo(x - 3, scaleY(point.observed + point.uncertainty));
    context.lineTo(x + 3, scaleY(point.observed + point.uncertainty));
    context.stroke();
    context.fillStyle = '#f4b860';
    context.beginPath();
    context.arc(x, y, 2.8, 0, Math.PI * 2);
    context.fill();
  }

  const itemWidth = Math.min(160, (width - 88) / columns);
  legendItems.forEach((item, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = 76 + column * itemWidth;
    const y = 34 + row * 19;
    if (item.fill) {
      context.fillStyle = 'rgba(84, 184, 234, 0.24)';
      context.fillRect(x, y - 5, 20, 10);
      context.strokeStyle = item.color;
      context.strokeRect(x, y - 5, 20, 10);
    } else {
      context.strokeStyle = item.color;
      context.lineWidth = 2;
      context.setLineDash(item.dash || []);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + 20, y);
      context.stroke();
    }
    context.setLineDash([]);
    context.fillStyle = '#dce4ef';
    context.font = '11px system-ui, sans-serif';
    context.textAlign = 'left';
    context.fillText(item.name, x + 26, y);
  });
  const predictiveSummary = predictive
    ? ` The shaded 68% posterior predictive interval covers ${formatNumber(predictive.coverage68 * 100, 1)}% of the observed velocities under the selected model, priors and quoted random uncertainties.`
    : '';
  $('curveSummary').textContent = `${state.reference.galaxy} has ${points.length} observed velocities from ${formatNumber(points[0].radius)} to ${formatNumber(points.at(-1).radius)} kpc. The current ${state.params.haloModel.toUpperCase()} model has reduced chi-squared ${formatNumber(state.result.metrics.reduced_chi_squared, 2)}.${predictiveSummary}`;
}

function drawResiduals() {
  if (!state.result) return;
  const canvas = $('residualCanvas');
  const { context, width, height } = prepareCanvas(canvas);
  const residuals = state.result.residuals;
  const extent = Math.max(4, Math.ceil(Math.max(...residuals.map(item => Math.abs(item.standardised)))));
  const bounds = { minX: 0, maxX: residuals.at(-1).radius, minY: -extent, maxY: extent };
  const { plot, scaleX, scaleY } = drawAxes(context, { width, height }, bounds, { x: 'Radius [kpc]', y: 'Residual / σ' });
  for (const level of [-3, 0, 3]) {
    if (Math.abs(level) > extent) continue;
    context.strokeStyle = level === 0 ? '#9cabc0' : 'rgba(255, 159, 110, 0.45)';
    context.setLineDash(level === 0 ? [] : [5, 5]);
    context.beginPath();
    context.moveTo(plot.left, scaleY(level));
    context.lineTo(plot.right, scaleY(level));
    context.stroke();
  }
  context.setLineDash([]);
  for (const item of residuals) {
    context.fillStyle = Math.abs(item.standardised) > 3 ? '#ff7b8b' : '#54b8ea';
    context.beginPath();
    context.arc(scaleX(item.radius), scaleY(item.standardised), 3, 0, Math.PI * 2);
    context.fill();
  }
  const outside = residuals.filter(item => Math.abs(item.standardised) > 3).length;
  $('residualSummary').textContent = `${outside} of ${residuals.length} points lie more than three quoted random uncertainties from the current model.`;
}

function drawHeatmap() {
  if (!state.result?.heatmap) return;
  const canvas = $('heatCanvas');
  const { context, width, height } = prepareCanvas(canvas);
  const map = state.result.heatmap;
  const margin = { left: 60, top: 20, right: 18, bottom: 48 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const buffer = document.createElement('canvas');
  buffer.width = map.n;
  buffer.height = map.n;
  const bufferContext = buffer.getContext('2d');
  const image = bufferContext.createImageData(map.n, map.n);
  map.values.forEach((delta, index) => {
    const quality = Math.exp(-0.5 * Math.min(delta, 36) / 6);
    const offset = index * 4;
    image.data[offset] = Math.round(20 + 170 * quality);
    image.data[offset + 1] = Math.round(35 + 190 * Math.sqrt(quality));
    image.data[offset + 2] = Math.round(65 + 170 * quality);
    image.data[offset + 3] = 255;
  });
  bufferContext.putImageData(image, 0, 0);
  context.imageSmoothingEnabled = false;
  context.drawImage(buffer, margin.left, margin.top, plotWidth, plotHeight);
  context.strokeStyle = '#4b6b86';
  context.strokeRect(margin.left, margin.top, plotWidth, plotHeight);
  context.fillStyle = '#c8d1df';
  context.font = '12px ui-monospace, SFMono-Regular, Consolas, monospace';
  context.textAlign = 'center';
  context.fillText(`Halo velocity [${map.xMinimum}–${map.xMaximum} km/s]`, margin.left + plotWidth / 2, height - 15);
  context.save();
  context.translate(14, margin.top + plotHeight / 2);
  context.rotate(-Math.PI / 2);
  context.fillText(`Scale radius [${map.yMinimum}–${map.yMaximum} kpc]`, 0, 0);
  context.restore();
  context.fillStyle = '#eff6ff';
  context.textAlign = 'left';
  context.fillText('brighter = lower Δχ²', margin.left + 8, margin.top + 16);
  $('heatSummary').textContent = `The response surface scans halo velocity from ${map.xMinimum} to ${map.xMaximum} kilometres per second and scale radius from ${map.yMinimum} to ${map.yMaximum} kiloparsecs at the current mass-to-light ratio.`;
}

function renderMetrics() {
  const cards = Object.entries(state.result.metrics).map(([key, value]) => {
    const card = document.createElement('div');
    card.className = 'metric';
    const label = document.createElement('span');
    label.textContent = METRIC_LABELS[key][0];
    const strong = document.createElement('strong');
    strong.textContent = key === 'outer_dark_fraction' ? `${formatNumber(value * 100, 1)}%` : formatNumber(value, 3);
    const note = document.createElement('small');
    note.textContent = key === 'reduced_chi_squared' ? `${Math.max(1, state.reference.n_points - 3)} degrees of freedom` : METRIC_LABELS[key][1];
    card.append(label, strong, note);
    return card;
  });
  $('metrics').replaceChildren(...cards);
}

function renderTable() {
  const fragment = document.createDocumentFragment();
  for (const point of state.result.observed) {
    const row = document.createElement('tr');
    const values = [point.radius, point.observed, point.uncertainty, point.gas, point.disk, point.halo, point.total, point.standardised];
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = formatNumber(value, 3);
      row.appendChild(cell);
    }
    fragment.appendChild(row);
  }
  $('dataRows').replaceChildren(fragment);
}

function renderAll() {
  drawSeries();
  drawResiduals();
  drawHeatmap();
  renderMetrics();
  renderTable();
}

function drawPosterior() {
  const canvas = $('posteriorCanvas');
  if (!canvas) return;
  const { context, width, height } = prepareCanvas(canvas);
  context.fillStyle = '#091725';
  context.fillRect(0, 0, width, height);
  if (!state.posterior) {
    context.fillStyle = '#a8b4c8';
    context.font = '14px system-ui, sans-serif';
    context.textAlign = 'center';
    context.fillText('Run posterior chains to inspect uncertainty and covariance.', width / 2, height / 2);
    return;
  }

  const { samples, summaries, priors } = state.posterior;
  const scatter = { left: 62, top: 30, right: Math.max(230, width * 0.58), bottom: height - 48 };
  const velocityWidth = Math.max(1e-6, summaries.haloVelocity.q84 - summaries.haloVelocity.q16);
  const scaleWidth = Math.max(1e-6, summaries.haloScale.q84 - summaries.haloScale.q16);
  const velocityMin = Math.max(priors.haloVelocity[0], summaries.haloVelocity.median - velocityWidth * 4);
  const velocityMax = Math.min(priors.haloVelocity[1], summaries.haloVelocity.median + velocityWidth * 4);
  const scaleMin = Math.max(priors.haloScale[0], summaries.haloScale.median - scaleWidth * 4);
  const scaleMax = Math.min(priors.haloScale[1], summaries.haloScale.median + scaleWidth * 4);
  const x = value => scatter.left + (value - velocityMin) / (velocityMax - velocityMin) * (scatter.right - scatter.left);
  const y = value => scatter.bottom - (value - scaleMin) / (scaleMax - scaleMin) * (scatter.bottom - scatter.top);

  context.strokeStyle = '#4b6b86';
  context.strokeRect(scatter.left, scatter.top, scatter.right - scatter.left, scatter.bottom - scatter.top);
  context.fillStyle = 'rgba(84, 184, 234, 0.22)';
  const sampleStep = Math.max(1, Math.ceil(samples.length / 900));
  for (let index = 0; index < samples.length; index += sampleStep) {
    const sample = samples[index];
    context.fillRect(x(sample.haloVelocity) - 1, y(sample.haloScale) - 1, 2, 2);
  }
  context.strokeStyle = '#f9c74f';
  context.setLineDash([5, 4]);
  context.beginPath();
  context.moveTo(x(summaries.haloVelocity.median), scatter.top);
  context.lineTo(x(summaries.haloVelocity.median), scatter.bottom);
  context.moveTo(scatter.left, y(summaries.haloScale.median));
  context.lineTo(scatter.right, y(summaries.haloScale.median));
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = '#dce4ef';
  context.font = '11px ui-monospace, Consolas, monospace';
  context.textAlign = 'center';
  context.fillText('Halo velocity [km/s]', (scatter.left + scatter.right) / 2, height - 15);
  context.save();
  context.translate(16, (scatter.top + scatter.bottom) / 2);
  context.rotate(-Math.PI / 2);
  context.fillText('Scale radius [kpc]', 0, 0);
  context.restore();

  const histogramLeft = Math.max(scatter.right + 34, width * 0.63);
  const histogramWidth = Math.max(80, width - histogramLeft - 18);
  const labels = {
    massToLightDisk: 'Disc M/L',
    haloVelocity: 'Halo velocity',
    haloScale: 'Scale radius'
  };
  state.posterior.parameterKeys.forEach((key, panelIndex) => {
    const values = samples.map(sample => sample[key]);
    const [minimum, maximum] = priors[key];
    const bins = Array(22).fill(0);
    for (const value of values) {
      const bin = Math.min(bins.length - 1, Math.max(0, Math.floor((value - minimum) / (maximum - minimum) * bins.length)));
      bins[bin] += 1;
    }
    const panelTop = 18 + panelIndex * ((height - 28) / 3);
    const panelHeight = (height - 40) / 3;
    const maximumCount = Math.max(...bins, 1);
    context.fillStyle = '#c8d1df';
    context.font = '700 11px system-ui, sans-serif';
    context.textAlign = 'left';
    context.fillText(labels[key], histogramLeft, panelTop + 9);
    context.fillStyle = '#a8b4c8';
    context.font = '10px ui-monospace, Consolas, monospace';
    context.fillText(`${formatNumber(summaries[key].median, 3)} [${formatNumber(summaries[key].q16, 3)}, ${formatNumber(summaries[key].q84, 3)}]`, histogramLeft, panelTop + 23);
    context.fillStyle = '#54b8ea';
    bins.forEach((count, index) => {
      const barWidth = histogramWidth / bins.length;
      const barHeight = count / maximumCount * (panelHeight - 38);
      context.fillRect(histogramLeft + index * barWidth, panelTop + panelHeight - 5 - barHeight, Math.max(1, barWidth - 1), barHeight);
    });
  });
}

function renderPosterior() {
  drawPosterior();
  if (!state.posterior) return;
  const { diagnostics, summaries, samples, config, predictive } = state.posterior;
  const metrics = [
    ['Max split R-hat', formatNumber(diagnostics.maxRhat, 3), diagnostics.maxRhat < 1.05 ? 'target met (< 1.05)' : 'review convergence'],
    ['Minimum ESS', formatNumber(diagnostics.minEss, 0), 'effective draws'],
    ['Acceptance', `${formatNumber(diagnostics.meanAcceptance * 100, 1)}%`, 'across four chains'],
    ['68% coverage', `${formatNumber(predictive.coverage68 * 100, 1)}%`, `${predictive.intervals.length} observed radii`],
    ['PPC p-value', formatNumber(predictive.bayesianPValue, 3), 'extremes flag mismatch']
  ];
  $('posteriorMetrics').replaceChildren(...metrics.map(([label, value, note]) => {
    const card = document.createElement('div');
    card.className = 'posterior-metric';
    const span = document.createElement('span');
    span.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = value;
    const small = document.createElement('small');
    small.textContent = note;
    card.append(span, strong, small);
    return card;
  }));
  const labels = { massToLightDisk: 'Disc M/L', haloVelocity: 'Halo velocity [km/s]', haloScale: 'Scale radius [kpc]' };
  const rows = state.posterior.parameterKeys.map(key => {
    const summary = summaries[key];
    return `<tr><th scope="row">${labels[key]}</th><td>${formatNumber(summary.q16, 4)}</td><td>${formatNumber(summary.median, 4)}</td><td>${formatNumber(summary.q84, 4)}</td><td>${formatNumber(summary.rhat, 4)}</td><td>${formatNumber(summary.ess, 0)}</td></tr>`;
  });
  $('posteriorRows').innerHTML = rows.join('');
  $('predictiveRows').innerHTML = predictive.intervals.map(interval => `<tr><th scope="row">${formatNumber(interval.radius, 3)}</th><td>${formatNumber(interval.observed, 3)}</td><td>${formatNumber(interval.modelQ16, 3)}</td><td>${formatNumber(interval.modelMedian, 3)}</td><td>${formatNumber(interval.modelQ84, 3)}</td><td>${formatNumber(interval.predictiveQ16, 3)}</td><td>${formatNumber(interval.predictiveQ84, 3)}</td></tr>`).join('');
  $('posteriorStatus').textContent = `${samples.length.toLocaleString('en-GB')} retained samples and ${predictive.drawsUsed.toLocaleString('en-GB')} predictive draws for ${state.reference.galaxy} with the ${state.params.haloModel.toUpperCase()} halo; seed ${config.seed}.`;
  $('posteriorSummary').textContent = `Posterior for ${state.reference.galaxy}: disc mass-to-light ratio ${formatNumber(summaries.massToLightDisk.median, 3)}, halo velocity ${formatNumber(summaries.haloVelocity.median, 2)} kilometres per second and scale radius ${formatNumber(summaries.haloScale.median, 2)} kiloparsecs. Maximum split R-hat is ${formatNumber(diagnostics.maxRhat, 3)}, minimum effective sample size is ${formatNumber(diagnostics.minEss, 0)}, the 68% posterior predictive interval covers ${formatNumber(predictive.coverage68 * 100, 1)}% of measured velocities, and the posterior-predictive discrepancy p-value is ${formatNumber(predictive.bayesianPValue, 3)}. This check is conditional on the selected halo family, priors and quoted independent random errors.`;
  $('exportPosterior').disabled = false;
  $('exportPredictive').disabled = false;
}

function posteriorPriors() {
  const definitions = [
    ['massToLightDisk', 'priorMlMin', 'priorMlMax'],
    ['haloVelocity', 'priorVelocityMin', 'priorVelocityMax'],
    ['haloScale', 'priorScaleMin', 'priorScaleMax']
  ];
  const priors = {};
  let valid = true;
  for (const [key, minimumId, maximumId] of definitions) {
    const minimumInput = $(minimumId);
    const maximumInput = $(maximumId);
    const minimum = Number(minimumInput.value);
    const maximum = Number(maximumInput.value);
    const message = Number.isFinite(minimum) && Number.isFinite(maximum) && minimum < maximum ? '' : 'Maximum must be greater than minimum.';
    maximumInput.setCustomValidity(message);
    if (message) valid = false;
    priors[key] = [minimum, maximum];
  }
  if (!valid) $('priorForm').reportValidity();
  return valid ? priors : null;
}

function exportPosterior() {
  if (!state.posterior) return;
  const header = ['chain', 'draw', 'mass_to_light_disk', 'halo_velocity_kms', 'halo_scale_kpc'];
  const rows = [header];
  state.posterior.chains.forEach((chain, chainIndex) => {
    chain.forEach((sample, drawIndex) => rows.push([chainIndex + 1, drawIndex + 1, sample.massToLightDisk, sample.haloVelocity, sample.haloScale]));
  });
  download(`${state.reference.galaxy_id.toLowerCase()}-${state.params.haloModel}-posterior.csv`, 'text/csv;charset=utf-8', rows.map(row => row.join(',')).join('\n'));
}

function exportPredictive() {
  if (!state.posterior?.predictive) return;
  const header = ['radius_kpc', 'observed_kms', 'uncertainty_kms', 'model_q16_kms', 'model_median_kms', 'model_q84_kms', 'predictive_q16_kms', 'predictive_median_kms', 'predictive_q84_kms'];
  const rows = state.posterior.predictive.intervals.map(interval => [
    interval.radius,
    interval.observed,
    interval.uncertainty,
    interval.modelQ16,
    interval.modelMedian,
    interval.modelQ84,
    interval.predictiveQ16,
    interval.predictiveMedian,
    interval.predictiveQ84
  ]);
  download(`${state.reference.galaxy_id.toLowerCase()}-${state.params.haloModel}-posterior-predictive.csv`, 'text/csv;charset=utf-8', [header, ...rows].map(row => row.join(',')).join('\n'));
}

function download(name, type, content) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function exportCsv() {
  if (!state.result) return;
  const header = ['radius_kpc', 'observed_kms', 'uncertainty_kms', 'gas_kms', 'disk_scaled_kms', 'halo_kms', 'total_kms', 'standardised_residual'];
  const rows = state.result.observed.map(point => [point.radius, point.observed, point.uncertainty, point.gas, point.disk, point.halo, point.total, point.standardised]);
  download(`${state.reference.galaxy_id.toLowerCase()}-${state.params.haloModel}-fit.csv`, 'text/csv;charset=utf-8', [header, ...rows].map(row => row.join(',')).join('\n'));
}

function exportSvg() {
  if (!state.result) return;
  const width = 1200;
  const height = 640;
  const left = 80;
  const right = 1160;
  const top = 60;
  const bottom = 570;
  const points = state.result.observed;
  const maxX = points.at(-1).radius;
  const maxY = Math.ceil(Math.max(...points.map(point => point.observed + point.uncertainty), ...state.result.series.flatMap(series => series.y)) / 20) * 20;
  const x = value => left + value / maxX * (right - left);
  const y = value => bottom - value / maxY * (bottom - top);
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
  const paths = state.result.series.map(series => {
    const path = series.x.map((radius, index) => `${index ? 'L' : 'M'}${x(radius).toFixed(2)},${y(series.y[index]).toFixed(2)}`).join(' ');
    return `<path d="${path}" fill="none" stroke="${series.color}" stroke-width="${series.id === 'total' ? 3 : 2}"${series.dash?.length ? ` stroke-dasharray="${series.dash.join(' ')}"` : ''}/>`;
  }).join('');
  const observations = points.map(point => `<g><line x1="${x(point.radius)}" x2="${x(point.radius)}" y1="${y(point.observed - point.uncertainty)}" y2="${y(point.observed + point.uncertainty)}" stroke="#f4b860"/><circle cx="${x(point.radius)}" cy="${y(point.observed)}" r="3" fill="#f4b860"/></g>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${escape(state.reference.galaxy)} rotation-curve decomposition</title><desc>Observed SPARC velocities with gas, stellar disc, ${escape(state.params.haloModel)} halo and total model.</desc><rect width="100%" height="100%" fill="#0d1b2a"/><line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="#8290a6"/><line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="#8290a6"/>${paths}${observations}<text x="600" y="620" fill="#f4f7fb" text-anchor="middle">Galactocentric radius [kpc]</text><text x="28" y="320" fill="#f4f7fb" text-anchor="middle" transform="rotate(-90 28 320)">Circular velocity [km/s]</text></svg>`;
  download(`${state.reference.galaxy_id.toLowerCase()}-${state.params.haloModel}-fit.svg`, 'image/svg+xml;charset=utf-8', svg);
}

$('galaxySelect').addEventListener('change', event => {
  selectReference(event.currentTarget.value);
  state.result = null;
  $('fitStatus').textContent = `${state.reference.galaxy} selected`;
  runModel();
});

$('haloModel').addEventListener('change', event => {
  state.params.haloModel = event.currentTarget.value;
  $('haloHelp').textContent = HALO_HELP[state.params.haloModel];
  runModel();
});

$('fitModel').addEventListener('click', () => {
  setBusy(true, 'fit');
  $('fitStatus').textContent = 'Searching grid';
  runModel('fit');
});

$('priorForm').addEventListener('submit', event => {
  event.preventDefault();
  const priors = posteriorPriors();
  if (!priors) return;
  clearPosterior('Sampling four chains in the physics worker…');
  setBusy(true, 'sample');
  $('fitStatus').textContent = 'Posterior sampling';
  runModel('sample', { priors, chainCount: 4, iterations: 2600, burnIn: 1000, thin: 3, seed: 20260927 });
});

$('exportPosterior').addEventListener('click', exportPosterior);
$('exportPredictive').addEventListener('click', exportPredictive);

$('reset').addEventListener('click', () => {
  state.params = { haloModel: 'piso', massToLightDisk: 0.5, massToLightBulge: 0.7, haloVelocity: 170, haloScale: 5 };
  syncControls();
  runModel();
});

$('exportCsv').addEventListener('click', exportCsv);
$('exportSvg').addEventListener('click', exportSvg);

buildControls();
drawPosterior();
loadCatalog()
  .then(() => runModel())
  .catch(error => {
    $('workerStatus').textContent = 'Reference data unavailable';
    $('notes').textContent = error.message;
  });

const resizeObserver = new ResizeObserver(() => {
  if (state.result) renderAll();
  drawPosterior();
});
for (const canvas of document.querySelectorAll('canvas')) resizeObserver.observe(canvas);
