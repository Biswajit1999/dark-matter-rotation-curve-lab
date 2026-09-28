'use strict';

const BUILD_VERSION = '2.0.0-rc.1';
const INITIAL_QUERY = new URLSearchParams(window.location.search);

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
  mode: INITIAL_QUERY.get('mode') === 'educator' ? 'educator' : 'research',
  requestedGalaxy: INITIAL_QUERY.get('galaxy') || 'NGC3198',
  catalog: null,
  reference: null,
  params: {
    haloModel: ['piso', 'nfw', 'burkert'].includes(INITIAL_QUERY.get('halo')) ? INITIAL_QUERY.get('halo') : 'piso',
    massToLightDisk: 0.5,
    massToLightBulge: 0.7,
    haloVelocity: 170,
    haloScale: 5
  },
  result: null,
  posterior: null,
  worker: null,
  requestId: 0,
  pendingFrame: null,
  population: { galaxies: [], highlightedGalaxyId: null, plotPoints: { btfrCanvas: [], rarCanvas: [] } },
  challenge: { relation: 'rar', accelerationScale: 1.2e-10, massToLightDisk: 0.5, rows: [] },
  lensing: { catalog: null, selectedId: 'bullet', sourceRedshift: 1, velocityDispersion: 1150 },
  cosmology: {
    atlas: null,
    logScaleFactor: 0,
    parameters: { omegaRadiation: 0.00009, omegaBaryon: 0.0493, omegaDarkMatter: 0.264, omegaDarkEnergy: 0.68661 }
  },
  futures: { data: null, logScaleMetres: 19, logMassGev: 2, logCrossSectionCm2: -46, localDensity: 0.4, efficiency: 0.5, speedKms: 220 },
  evidence: { graph: null, selectedId: null }
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
  const response = await fetch(`data/galaxies.json?v=${BUILD_VERSION}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Galaxy catalogue request failed with HTTP ${response.status}.`);
  state.catalog = await response.json();
  renderGalaxyOptions();
  const requested = state.catalog.galaxies.some(galaxy => galaxy.galaxy_id === state.requestedGalaxy) ? state.requestedGalaxy : 'NGC3198';
  $('galaxySelect').value = requested;
  selectReference(requested);
  renderPopulation();
}

async function loadClusterCatalog() {
  const response = await fetch(`data/cluster_systems.json?v=${BUILD_VERSION}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Cluster catalogue request failed with HTTP ${response.status}.`);
  state.lensing.catalog = await response.json();
  const options = state.lensing.catalog.systems.map(system => {
    const option = document.createElement('option');
    option.value = system.id;
    option.textContent = `${system.name} · z=${system.redshift}`;
    return option;
  });
  $('clusterSelect').replaceChildren(...options);
  $('clusterSelect').value = state.lensing.selectedId;
  selectCluster(state.lensing.selectedId);
}

async function loadCandidateAtlas() {
  const response = await fetch(`data/dark_matter_candidates.json?v=${BUILD_VERSION}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Candidate atlas request failed with HTTP ${response.status}.`);
  state.cosmology.atlas = await response.json();
  renderCosmology();
  renderCandidates();
}

async function loadResearchFrontier() {
  const response = await fetch(`data/research_frontier.json?v=${BUILD_VERSION}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Research-frontier request failed with HTTP ${response.status}.`);
  state.futures.data = await response.json();
  renderFutures();
}

async function loadEvidenceGraph() {
  const response = await fetch(`data/evidence_graph.json?v=${BUILD_VERSION}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Evidence-graph request failed with HTTP ${response.status}.`);
  state.evidence.graph = await response.json();
  renderEvidenceGraph();
}

function renderGalaxyOptions(query = '') {
  const normalised = query.trim().toLowerCase();
  const matches = state.catalog.galaxies.filter(galaxy => (
    !normalised || `${galaxy.galaxy} ${galaxy.galaxy_id} ${galaxy.morphology}`.toLowerCase().includes(normalised)
  ));
  const options = matches.map(galaxy => {
    const option = document.createElement('option');
    option.value = galaxy.galaxy_id;
    option.textContent = `${galaxy.galaxy} · ${galaxy.morphology} · Q${galaxy.quality_flag} · ${galaxy.n_points} points`;
    return option;
  });
  $('galaxySelect').replaceChildren(...options);
  $('galaxyHelp').textContent = `${matches.length} of ${state.catalog.galaxies.length} galaxies match this search.`;
}

function getWorker() {
  if (state.worker) return state.worker;
  state.worker = new Worker(`physicsWorker.js?v=${BUILD_VERSION}`);
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
  renderChallenge();
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

function challengeEvaluation() {
  if (!state.reference || !state.result || typeof RotationPhysics === 'undefined') return [];
  return state.reference.points.map((point, index) => {
    const gBar = RotationPhysics.baryonicAcceleration(point, state.challenge.massToLightDisk, state.params.massToLightBulge);
    const baryonic = RotationPhysics.accelerationToVelocity(gBar, point.x);
    const phenomenological = RotationPhysics.phenomenologicalVelocity(
      point,
      state.challenge.relation,
      state.challenge.massToLightDisk,
      state.params.massToLightBulge,
      state.challenge.accelerationScale
    );
    const halo = state.result.observed[index].total;
    return {
      radius: point.x,
      observed: point.y,
      uncertainty: point.y_err,
      baryonic,
      phenomenological,
      halo,
      phenomenologicalResidual: (point.y - phenomenological) / point.y_err,
      haloResidual: (point.y - halo) / point.y_err
    };
  }).filter(row => Object.values(row).every(Number.isFinite));
}

function drawChallengeCurve(rows) {
  const { context, width, height } = prepareCanvas($('challengeCurveCanvas'));
  if (!rows.length) return;
  const maxY = Math.ceil(Math.max(...rows.flatMap(row => [row.observed + row.uncertainty, row.baryonic, row.phenomenological, row.halo])) / 20) * 20;
  const scales = drawAxes(context, { width, height }, { minX: 0, maxX: rows.at(-1).radius, minY: 0, maxY }, { x: 'Radius [kpc]', y: 'Circular velocity [km/s]' });
  const series = [
    { key: 'baryonic', colour: '#9bdcf7', dash: [5, 5], label: 'Baryons only' },
    { key: 'phenomenological', colour: '#b1a7ff', dash: [], label: state.challenge.relation === 'rar' ? 'Empirical RAR' : 'Simple ν' },
    { key: 'halo', colour: '#54b8ea', dash: [], label: `Current ${state.params.haloModel.toUpperCase()} halo` }
  ];
  for (const item of series) {
    context.beginPath(); context.strokeStyle = item.colour; context.lineWidth = item.key === 'phenomenological' ? 2.7 : 1.8; context.setLineDash(item.dash);
    rows.forEach((row, index) => { const x = scales.scaleX(row.radius); const y = scales.scaleY(row[item.key]); if (index) context.lineTo(x, y); else context.moveTo(x, y); });
    context.stroke();
  }
  context.setLineDash([]);
  for (const row of rows) {
    const x = scales.scaleX(row.radius); const y = scales.scaleY(row.observed);
    context.strokeStyle = '#f4b860'; context.lineWidth = 1; context.beginPath();
    context.moveTo(x, scales.scaleY(row.observed - row.uncertainty)); context.lineTo(x, scales.scaleY(row.observed + row.uncertainty)); context.stroke();
    context.fillStyle = '#f4b860'; context.beginPath(); context.arc(x, y, 2.5, 0, Math.PI * 2); context.fill();
  }
  context.font = '11px ui-monospace, monospace'; context.textAlign = 'left';
  series.forEach((item, index) => { context.fillStyle = item.colour; context.fillText(`${item.key === 'baryonic' ? '– –' : '━━'} ${item.label}`, scales.plot.left + 8, scales.plot.top + 12 + index * 16); });
  context.fillStyle = '#f4b860'; context.fillText('● Observed ± σ', scales.plot.left + 8, scales.plot.top + 60);
}

function drawChallengeResiduals(rows) {
  const { context, width, height } = prepareCanvas($('challengeResidualCanvas'));
  if (!rows.length) return;
  const maximum = Math.max(5, Math.ceil(Math.max(...rows.flatMap(row => [Math.abs(row.phenomenologicalResidual), Math.abs(row.haloResidual)]))));
  const scales = drawAxes(context, { width, height }, { minX: 0, maxX: rows.at(-1).radius, minY: -maximum, maxY: maximum }, { x: 'Radius [kpc]', y: 'Standardised residual' });
  context.strokeStyle = '#d7e0eb'; context.lineWidth = 1; context.beginPath();
  context.moveTo(scales.plot.left, scales.scaleY(0)); context.lineTo(scales.plot.right, scales.scaleY(0)); context.stroke();
  for (const row of rows) {
    const x = scales.scaleX(row.radius);
    context.fillStyle = '#b1a7ff'; context.beginPath(); context.arc(x, scales.scaleY(row.phenomenologicalResidual), 3, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#54b8ea'; context.fillRect(x - 2.5, scales.scaleY(row.haloResidual) - 2.5, 5, 5);
  }
  context.font = '11px ui-monospace, monospace'; context.textAlign = 'left';
  context.fillStyle = '#b1a7ff'; context.fillText('● Phenomenological', scales.plot.left + 8, scales.plot.top + 12);
  context.fillStyle = '#54b8ea'; context.fillText('■ Current halo', scales.plot.left + 8, scales.plot.top + 28);
}

function comparisonMetrics(rows, key) {
  const residuals = rows.map(row => row.observed - row[key]);
  return {
    chiSquared: rows.reduce((sum, row) => sum + ((row.observed - row[key]) / row.uncertainty) ** 2, 0),
    rms: Math.sqrt(residuals.reduce((sum, value) => sum + value ** 2, 0) / Math.max(1, rows.length)),
    outliers: rows.filter(row => Math.abs((row.observed - row[key]) / row.uncertainty) > 3).length
  };
}

function renderChallenge() {
  const rows = challengeEvaluation();
  state.challenge.rows = rows;
  if (!rows.length) return;
  const baryonic = comparisonMetrics(rows, 'baryonic');
  const phenomenological = comparisonMetrics(rows, 'phenomenological');
  const halo = comparisonMetrics(rows, 'halo');
  const relationLabel = state.challenge.relation === 'rar' ? 'Empirical RAR' : 'Simple ν';
  $('challengeMetrics').innerHTML = [
    ['Baryons-only χ²', baryonic.chiSquared, `${baryonic.outliers} |residual| > 3σ`],
    [`${relationLabel} χ²`, phenomenological.chiSquared, `${phenomenological.outliers} |residual| > 3σ · RMS ${formatNumber(phenomenological.rms, 2)} km/s`],
    [`Current ${state.params.haloModel.toUpperCase()} χ²`, halo.chiSquared, `${halo.outliers} |residual| > 3σ · RMS ${formatNumber(halo.rms, 2)} km/s`]
  ].map(([label, value, note]) => `<div class="challenge-metric"><span>${label}</span><strong>${formatNumber(value, 2)}</strong><small>${note}</small></div>`).join('');
  $('challengeRows').innerHTML = rows.map(row => `<tr><td>${formatNumber(row.radius, 3)}</td><td>${formatNumber(row.observed, 2)}</td><td>${formatNumber(row.uncertainty, 2)}</td><td>${formatNumber(row.baryonic, 2)}</td><td>${formatNumber(row.phenomenological, 2)}</td><td>${formatNumber(row.halo, 2)}</td><td>${formatNumber(row.phenomenologicalResidual, 2)}</td><td>${formatNumber(row.haloResidual, 2)}</td></tr>`).join('');
  $('challengeCaption').textContent = `${state.reference.galaxy}: baryonic, ${relationLabel}, and current ${state.params.haloModel.toUpperCase()} predictions`;
  $('challengeCurveSummary').textContent = `${state.reference.galaxy} comparison across ${rows.length} radii. The ${relationLabel} prediction has chi-squared ${formatNumber(phenomenological.chiSquared, 2)} at the displayed assumptions; the current ${state.params.haloModel.toUpperCase()} configuration has chi-squared ${formatNumber(halo.chiSquared, 2)}.`;
  $('challengeResidualSummary').textContent = `${relationLabel} has ${phenomenological.outliers} residuals and the current halo configuration has ${halo.outliers} residuals beyond three quoted random uncertainties. This comparison does not include correlated, distance, or inclination systematics.`;
  drawChallengeCurve(rows);
  drawChallengeResiduals(rows);
}

function exportChallenge() {
  const header = ['radius_kpc', 'observed_kms', 'uncertainty_kms', 'baryonic_kms', 'phenomenological_kms', 'current_halo_kms', 'phenomenological_standardised_residual', 'halo_standardised_residual'];
  const values = state.challenge.rows.map(row => [row.radius, row.observed, row.uncertainty, row.baryonic, row.phenomenological, row.halo, row.phenomenologicalResidual, row.haloResidual]);
  download(`${state.reference.galaxy_id.toLowerCase()}-alternative-comparison.csv`, 'text/csv;charset=utf-8', [header, ...values].map(row => row.join(',')).join('\n'));
}

function selectedCluster() {
  return state.lensing.catalog?.systems.find(system => system.id === state.lensing.selectedId) || null;
}

function activeClusterLayers() {
  return new Set([...document.querySelectorAll('input[name="clusterLayer"]:checked')].map(input => input.value));
}

function selectCluster(clusterId) {
  const cluster = state.lensing.catalog.systems.find(system => system.id === clusterId);
  if (!cluster) return;
  state.lensing.selectedId = cluster.id;
  state.lensing.sourceRedshift = cluster.source_redshift;
  state.lensing.velocityDispersion = cluster.velocity_dispersion_kms;
  $('sourceRedshift').min = Math.min(2.9, cluster.redshift + 0.05).toFixed(2);
  $('sourceRedshift').value = cluster.source_redshift;
  $('clusterDispersion').value = cluster.velocity_dispersion_kms;
  $('sourceRedshiftOutput').textContent = formatNumber(cluster.source_redshift, 2);
  $('clusterDispersionOutput').textContent = `${formatNumber(cluster.velocity_dispersion_kms, 0)} km/s`;
  renderLensing();
}

function drawClusterContours(context, point, width, height, index, showUncertainty) {
  const x = point[0] * width;
  const y = point[1] * height;
  for (let ring = 1; ring <= 4; ring += 1) {
    context.strokeStyle = `rgba(84, 184, 234, ${0.82 - ring * 0.13})`;
    context.lineWidth = ring === 1 ? 2.5 : 1.4;
    context.beginPath();
    context.ellipse(x, y, 23 + ring * 22, 15 + ring * 14, index % 2 ? -0.2 : 0.18, 0, Math.PI * 2);
    context.stroke();
  }
  context.fillStyle = '#9bdcf7';
  context.font = '700 11px ui-monospace, monospace';
  context.textAlign = 'center';
  context.fillText(`M${index + 1}`, x, y + 4);
  if (showUncertainty) {
    context.setLineDash([5, 5]);
    context.strokeStyle = '#f4f7fb';
    context.lineWidth = 1;
    context.beginPath(); context.arc(x, y, 16, 0, Math.PI * 2); context.stroke();
    context.setLineDash([]);
  }
}

function drawClusterMap() {
  const cluster = selectedCluster();
  if (!cluster) return;
  const layers = activeClusterLayers();
  const { context, width, height } = prepareCanvas($('clusterCanvas'));
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#07111f');
  background.addColorStop(1, '#13263a');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = 'rgba(173, 186, 200, 0.08)';
  for (let x = 0; x < width; x += 44) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
  for (let y = 0; y < height; y += 44) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }

  if (layers.has('shear')) {
    context.strokeStyle = 'rgba(244, 184, 96, 0.72)';
    context.lineWidth = 1.4;
    for (let index = 0; index < 54; index += 1) {
      const x = 24 + ((index * 97) % Math.max(40, width - 48));
      const y = 25 + ((index * 53) % Math.max(40, height - 50));
      const nearest = cluster.mass_peaks.reduce((best, peak) => {
        const distance = (x - peak[0] * width) ** 2 + (y - peak[1] * height) ** 2;
        return distance < best.distance ? { peak, distance } : best;
      }, { peak: cluster.mass_peaks[0], distance: Infinity }).peak;
      const angle = Math.atan2(y - nearest[1] * height, x - nearest[0] * width) + Math.PI / 2;
      context.beginPath();
      context.moveTo(x - Math.cos(angle) * 5, y - Math.sin(angle) * 5);
      context.lineTo(x + Math.cos(angle) * 5, y + Math.sin(angle) * 5);
      context.stroke();
    }
  }

  if (layers.has('gas')) {
    for (const [index, point] of cluster.gas_peaks.entries()) {
      const gradient = context.createRadialGradient(point[0] * width, point[1] * height, 2, point[0] * width, point[1] * height, 88);
      gradient.addColorStop(0, 'rgba(244, 122, 96, 0.78)');
      gradient.addColorStop(0.55, 'rgba(244, 184, 96, 0.32)');
      gradient.addColorStop(1, 'rgba(244, 184, 96, 0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.ellipse(point[0] * width, point[1] * height, 96, 52, index ? 0.15 : -0.18, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffd6a0'; context.font = '700 11px ui-monospace, monospace'; context.textAlign = 'center';
      context.fillText(`X${index + 1}`, point[0] * width, point[1] * height + 4);
    }
  }

  if (layers.has('galaxies')) {
    for (const [peakIndex, point] of cluster.galaxy_peaks.entries()) {
      for (let index = 0; index < 28; index += 1) {
        const angle = index * 2.399 + peakIndex;
        const radius = 7 + (index * 13) % 62;
        const x = point[0] * width + Math.cos(angle) * radius;
        const y = point[1] * height + Math.sin(angle) * radius * 0.62;
        context.fillStyle = index % 3 ? '#f4f7fb' : '#f4b860';
        context.beginPath(); context.arc(x, y, index % 5 === 0 ? 2.8 : 1.7, 0, Math.PI * 2); context.fill();
      }
      context.strokeStyle = '#f4f7fb'; context.lineWidth = 1.3;
      const x = point[0] * width; const y = point[1] * height;
      context.beginPath(); context.moveTo(x - 8, y); context.lineTo(x + 8, y); context.moveTo(x, y - 8); context.lineTo(x, y + 8); context.stroke();
    }
  }

  if (layers.has('mass')) cluster.mass_peaks.forEach((point, index) => drawClusterContours(context, point, width, height, index, layers.has('uncertainty')));

  context.fillStyle = 'rgba(7, 17, 31, 0.88)';
  context.fillRect(12, 12, Math.min(width - 24, 330), 34);
  context.fillStyle = '#f4f7fb'; context.font = '12px ui-monospace, monospace'; context.textAlign = 'left';
  context.fillText(`${cluster.name} · layer reconstruction`, 24, 33);
}

function renderClusterRows() {
  const selected = selectedCluster();
  $('clusterRows').innerHTML = state.lensing.catalog.systems.map(system => {
    const sourceRedshift = system.id === selected.id ? state.lensing.sourceRedshift : system.source_redshift;
    const dispersion = system.id === selected.id ? state.lensing.velocityDispersion : system.velocity_dispersion_kms;
    const scale = LensingPhysics.angularScaleKpcPerArcsec(system.redshift);
    const critical = LensingPhysics.criticalSurfaceDensity(system.redshift, sourceRedshift);
    const einstein = LensingPhysics.einsteinRadiusArcsec(dispersion, system.redshift, sourceRedshift);
    const status = system.id === 'abell-520' ? 'Systematics stress case' : 'Independent collision case';
    return `<tr><th scope="row">${system.name}</th><td>${formatNumber(system.redshift, 3)}</td><td>${formatNumber(sourceRedshift, 2)}</td><td>${formatNumber(scale, 2)}</td><td>${formatNumber(critical, 0)}</td><td>${formatNumber(einstein, 1)}</td><td>${status}</td></tr>`;
  }).join('');
}

function renderLensing() {
  const cluster = selectedCluster();
  if (!cluster) return;
  const critical = LensingPhysics.criticalSurfaceDensity(cluster.redshift, state.lensing.sourceRedshift);
  const einstein = LensingPhysics.einsteinRadiusArcsec(state.lensing.velocityDispersion, cluster.redshift, state.lensing.sourceRedshift);
  const scale = LensingPhysics.angularScaleKpcPerArcsec(cluster.redshift);
  const layers = activeClusterLayers();
  $('clusterCanvasTitle').textContent = cluster.name;
  $('lensingMetrics').innerHTML = [
    ['Lens redshift', formatNumber(cluster.redshift, 3), 'catalogued system'],
    ['Angular scale', `${formatNumber(scale, 2)} kpc/″`, 'flat ΛCDM'],
    ['Critical surface density', `${formatNumber(critical, 0)} M☉/pc²`, `sources at z=${formatNumber(state.lensing.sourceRedshift, 2)}`],
    ['SIS Einstein radius', `${formatNumber(einstein, 1)}″`, `σv=${formatNumber(state.lensing.velocityDispersion, 0)} km/s`]
  ].map(([label, value, note]) => `<div><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('');
  $('clusterFinding').innerHTML = `<strong>Published finding:</strong> ${cluster.finding}`;
  $('clusterCaution').innerHTML = `<strong>Interpretive limit:</strong> ${cluster.caution}`;
  $('clusterPaper').href = cluster.reference_url;
  $('clusterPaper').textContent = cluster.primary_reference;
  $('clusterObservatory').href = cluster.observatory_url;
  $('clusterCanvasSummary').textContent = `${cluster.name} schematic with ${layers.has('galaxies') ? 'optical galaxy positions, ' : ''}${layers.has('gas') ? 'X-ray gas proxies, ' : ''}${layers.has('mass') ? 'lensing-derived total-mass contours, ' : ''}${layers.has('shear') ? 'and background-galaxy shear ticks' : ''}. The normalized centroids explain the published separation qualitatively and are not fitted image coordinates.`;
  drawClusterMap();
  renderClusterRows();
}

function updateCosmicClosure() {
  const parameters = state.cosmology.parameters;
  parameters.omegaDarkEnergy = Math.max(0, 1 - parameters.omegaRadiation - parameters.omegaBaryon - parameters.omegaDarkMatter);
}

function drawCosmology() {
  const { context, width, height } = prepareCanvas($('cosmologyCanvas'));
  const bounds = { minX: -6, maxX: 0, minY: 0, maxY: 1 };
  const scales = drawPopulationAxes(context, width, height, bounds, { x: 'log₁₀ scale factor a', y: 'fraction of H²' });
  const series = [
    { key: 'radiation', label: 'Radiation', colour: '#f4b860', dash: [] },
    { key: 'baryons', label: 'Baryons', colour: '#f4f7fb', dash: [7, 4] },
    { key: 'darkMatter', label: 'Cold dark matter', colour: '#54b8ea', dash: [] },
    { key: 'darkEnergy', label: 'Dark energy', colour: '#b1a7ff', dash: [2, 4] }
  ];
  for (const item of series) {
    context.strokeStyle = item.colour; context.lineWidth = 2.2; context.setLineDash(item.dash); context.beginPath();
    for (let index = 0; index <= 180; index += 1) {
      const logA = -6 + index / 30;
      const fractions = CosmologyPhysics.componentFractions(10 ** logA, state.cosmology.parameters);
      const x = scales.x(logA); const y = scales.y(fractions[item.key]);
      if (index) context.lineTo(x, y); else context.moveTo(x, y);
    }
    context.stroke();
  }
  context.setLineDash([]);
  const selectedX = scales.x(state.cosmology.logScaleFactor);
  context.strokeStyle = '#ffd166'; context.lineWidth = 1.5;
  context.beginPath(); context.moveTo(selectedX, scales.plot.top); context.lineTo(selectedX, scales.plot.bottom); context.stroke();
  context.font = '11px ui-monospace, monospace'; context.textAlign = 'left';
  series.forEach((item, index) => { context.fillStyle = item.colour; context.fillText(`${index === 1 ? '┄' : '━'} ${item.label}`, scales.plot.left + 8 + (index % 2) * 148, scales.plot.top + 13 + Math.floor(index / 2) * 17); });
}

function renderCosmology() {
  updateCosmicClosure();
  const scaleFactor = 10 ** state.cosmology.logScaleFactor;
  const redshift = 1 / scaleFactor - 1;
  const fractions = CosmologyPhysics.componentFractions(scaleFactor, state.cosmology.parameters);
  const equality = CosmologyPhysics.equalityRedshift(state.cosmology.parameters);
  const baryonShare = CosmologyPhysics.baryonFractionOfMatter(state.cosmology.parameters);
  $('cosmologyMetrics').innerHTML = [
    ['Selected redshift', redshift > 10000 ? redshift.toExponential(2) : formatNumber(redshift, 1), `a=${scaleFactor.toExponential(2)}`],
    ['Radiation fraction', `${formatNumber(fractions.radiation * 100, 2)}%`, 'of H² at selected epoch'],
    ['Matter split', `${formatNumber(baryonShare * 100, 1)}% baryonic`, `${formatNumber((1 - baryonShare) * 100, 1)}% cold dark component`],
    ['Matter–radiation equality', `z≈${formatNumber(equality, 0)}`, `ΩΛ=${formatNumber(state.cosmology.parameters.omegaDarkEnergy, 3)}`]
  ].map(([label, value, note]) => `<div><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('');
  $('cosmologySummary').textContent = `For the displayed flat background model at scale factor ${scaleFactor.toExponential(2)}, radiation contributes ${formatNumber(fractions.radiation * 100, 2)} percent, baryons ${formatNumber(fractions.baryons * 100, 2)} percent, cold dark matter ${formatNumber(fractions.darkMatter * 100, 2)} percent and dark energy ${formatNumber(fractions.darkEnergy * 100, 2)} percent of H squared. Matter–radiation equality occurs near redshift ${formatNumber(equality, 0)}.`;
  drawCosmology();
}

function renderCandidates() {
  if (!state.cosmology.atlas) return;
  const family = $('candidateFamily').value;
  const candidates = state.cosmology.atlas.candidates.filter(candidate => family === 'all' || candidate.family === family);
  $('candidateGrid').innerHTML = candidates.map(candidate => `<article><div><span class="candidate-family">${candidate.family}</span><h3>${candidate.name}</h3></div><dl><div><dt>Mass scale</dt><dd>${candidate.mass_scale}</dd></div><div><dt>Production</dt><dd>${candidate.production}</dd></div><div><dt>Observable</dt><dd>${candidate.signatures}</dd></div></dl><p><strong>Status:</strong> ${candidate.status}</p><p class="candidate-methods">${candidate.methods.map(method => `<span>${method}</span>`).join('')}</p><a href="${candidate.source}" target="_blank" rel="noopener noreferrer">Primary/review source</a></article>`).join('');
  $('experimentRows').innerHTML = state.cosmology.atlas.experiments.map(experiment => `<tr><th scope="row">${experiment.name}</th><td>${experiment.channel}</td><td>${experiment.target}</td><td>${experiment.status}</td><td><a href="${experiment.source}" target="_blank" rel="noopener noreferrer">Programme source</a></td></tr>`).join('');
}

function superscriptInteger(value) {
  const digits = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  return String(value).split('').map(character => digits[character]).join('');
}

function nearestScaleMilestone() {
  return state.futures.data.scale_milestones.reduce((best, milestone) => (
    Math.abs(milestone.log10_metres - state.futures.logScaleMetres) < Math.abs(best.log10_metres - state.futures.logScaleMetres) ? milestone : best
  ));
}

function renderFutures() {
  if (!state.futures.data) return;
  const milestone = nearestScaleMilestone();
  $('scaleOutput').textContent = `10${superscriptInteger(state.futures.logScaleMetres)} m`;
  $('scaleMilestone').innerHTML = `<span class="epistemic-label">${milestone.label}</span><h3>${milestone.question}</h3><p>${milestone.probe}</p><small>Nearest research scale: 10${superscriptInteger(milestone.log10_metres)} metres</small>`;

  const mass = 10 ** state.futures.logMassGev;
  const crossSection = 10 ** state.futures.logCrossSectionCm2;
  const flux = FuturesPhysics.fluxCm2Second(state.futures.localDensity, mass, state.futures.speedKms);
  const rate = FuturesPhysics.illustrativeEventsPerKgDay(state.futures.localDensity, mass, state.futures.speedKms, crossSection, state.futures.efficiency);
  const spacingMetres = FuturesPhysics.meanSpacingAu(state.futures.localDensity, mass) * 1.495978707e11;
  const wavelength = FuturesPhysics.deBroglieWavelengthMetres(mass, state.futures.speedKms);
  $('futureMetrics').innerHTML = [
    ['Number flux', `${flux.toExponential(2)} cm⁻² s⁻¹`, 'ρv/m'],
    ['Contact-count scale', `${rate.toExponential(2)} kg⁻¹ day⁻¹`, 'not a detector rate'],
    ['Mean particle spacing', `${spacingMetres.toExponential(2)} m`, 'homogeneous local density'],
    ['de Broglie wavelength', `${wavelength.toExponential(2)} m`, 'non-relativistic estimate']
  ].map(([label, value, note]) => `<div><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('');
  const waveLike = wavelength > 1;
  $('futureValidityTitle').textContent = waveLike ? 'Coherent-field treatment required' : 'Illustrative particle-contact scale only';
  $('futureValidity').textContent = waveLike
    ? 'At this mass and speed the de Broglie wavelength exceeds one metre. Independent particle contacts are not a suitable physical picture; phase-coherent field or wave observables become relevant.'
    : 'A real exclusion or sensitivity curve must specify an interaction operator, target nucleus, form factor, recoil threshold, exposure, background model and statistical treatment.';

  $('frontierGrid').innerHTML = state.futures.data.frontiers.map(item => `<article><h3>${item.name}</h3><dl><div><dt>Known</dt><dd>${item.known}</dd></div><div><dt>Unknown</dt><dd>${item.unknown}</dd></div><div><dt>Decisive test</dt><dd>${item.decisive}</dd></div></dl></article>`).join('');
  $('futureTimelineRows').innerHTML = state.futures.data.timeline.map(item => `<tr><th scope="row">${item.horizon}</th><td>${item.capability}</td><td>${item.gate}</td><td><span class="certainty-tag certainty-${item.certainty}">${item.certainty}</span></td></tr>`).join('');
}

function syncUrlState() {
  const url = new URL(window.location.href);
  url.searchParams.set('mode', state.mode);
  if (state.reference) url.searchParams.set('galaxy', state.reference.galaxy_id);
  url.searchParams.set('halo', state.params.haloModel);
  window.history.replaceState(null, '', url);
}

function applyMode(mode, updateUrl = true) {
  state.mode = mode === 'educator' ? 'educator' : 'research';
  document.body.classList.toggle('mode-educator', state.mode === 'educator');
  document.body.classList.toggle('mode-research', state.mode === 'research');
  $('modeEducator').setAttribute('aria-pressed', String(state.mode === 'educator'));
  $('modeResearch').setAttribute('aria-pressed', String(state.mode === 'research'));
  $('modeStatus').textContent = state.mode === 'educator'
    ? 'Educator mode active. Core evidence remains visible; advanced audit tables are hidden.'
    : 'Research mode active. Full audit tables and reproducibility controls are visible.';
  if (state.mode === 'educator') document.querySelectorAll('details').forEach(detail => { detail.open = false; });
  if (updateUrl) syncUrlState();
}

function selectEvidenceNode(nodeId) {
  if (!state.evidence.graph) return;
  const node = state.evidence.graph.nodes.find(candidate => candidate.id === nodeId);
  if (!node) return;
  state.evidence.selectedId = nodeId;
  for (const button of document.querySelectorAll('.evidence-node')) button.setAttribute('aria-pressed', String(button.dataset.nodeId === nodeId));
  const incoming = state.evidence.graph.edges.filter(edge => edge.to === nodeId);
  const outgoing = state.evidence.graph.edges.filter(edge => edge.from === nodeId);
  const label = id => state.evidence.graph.nodes.find(candidate => candidate.id === id)?.label || id;
  $('evidenceDetail').innerHTML = `<span class="epistemic-label">${node.group}</span><h3>${node.label}</h3><dl><div><dt>Claim</dt><dd>${node.claim}</dd></div><div><dt>Source layer</dt><dd>${node.source}</dd></div><div><dt>Can break because</dt><dd>${node.limit}</dd></div></dl><div class="edge-summary"><strong>Connections</strong>${[...incoming.map(edge => `${label(edge.from)} → ${edge.relation} → this node`), ...outgoing.map(edge => `This node → ${edge.relation} → ${label(edge.to)}`)].map(text => `<span>${text}</span>`).join('') || '<span>No recorded connections.</span>'}</div>`;
}

function renderEvidenceGraph() {
  if (!state.evidence.graph) return;
  const groupLabels = { observation: '1 · Observations', equation: '2 · Physical mapping', inference: '3 · Inferences', hypothesis: '4 · Identity hypotheses' };
  const root = $('evidenceGraph');
  root.replaceChildren(...Object.entries(groupLabels).map(([group, heading]) => {
    const column = document.createElement('section');
    column.className = `evidence-column evidence-${group}`;
    const title = document.createElement('h3'); title.textContent = heading;
    column.append(title);
    for (const node of state.evidence.graph.nodes.filter(candidate => candidate.group === group)) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'evidence-node'; button.dataset.nodeId = node.id;
      button.setAttribute('role', 'listitem'); button.setAttribute('aria-pressed', 'false');
      button.innerHTML = `<span>${node.group}</span><strong>${node.label}</strong>`;
      button.addEventListener('click', () => selectEvidenceNode(node.id));
      column.append(button);
    }
    return column;
  }));
  const label = id => state.evidence.graph.nodes.find(node => node.id === id)?.label || id;
  $('evidenceRelations').innerHTML = state.evidence.graph.edges.map(edge => `<tr><th scope="row">${label(edge.from)}</th><td>${edge.relation}</td><td>${label(edge.to)}</td></tr>`).join('');
  selectEvidenceNode(state.evidence.selectedId || 'rotation');
}

function exportWorkspace() {
  const payload = {
    softwareVersion: BUILD_VERSION,
    exportedAt: new Date().toISOString(),
    mode: state.mode,
    galaxy: state.reference?.galaxy_id,
    haloParameters: state.params,
    challenge: state.challenge,
    lensing: { selectedId: state.lensing.selectedId, sourceRedshift: state.lensing.sourceRedshift, velocityDispersion: state.lensing.velocityDispersion },
    cosmology: { logScaleFactor: state.cosmology.logScaleFactor, parameters: state.cosmology.parameters },
    futures: { ...state.futures, data: undefined },
    provenance: {
      galaxyCatalogSha256: state.catalog?.provenance?.source_checksums,
      graphSchemaVersion: state.evidence.graph?.schema_version,
      limitations: 'Interactive state only; exported values are not publication-grade parameter inference.'
    }
  };
  download(`dark-matter-evidence-lab-${state.reference?.galaxy_id || 'workspace'}.json`, 'application/json;charset=utf-8', `${JSON.stringify(payload, null, 2)}\n`);
}

function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function filteredPopulation() {
  const query = $('populationSearch').value.trim().toLowerCase();
  const quality = $('qualityFilter').value;
  const subset = $('populationClass').value;
  const surfaceMedian = median(state.catalog.galaxies.map(galaxy => galaxy.effective_surface_brightness_lsun_pc2));
  return state.catalog.galaxies.filter(galaxy => {
    if (query && !`${galaxy.galaxy} ${galaxy.galaxy_id}`.toLowerCase().includes(query)) return false;
    if (quality === '1' && galaxy.quality_flag !== 1) return false;
    if (quality === '2' && galaxy.quality_flag > 2) return false;
    if (subset === 'low-sb' && galaxy.effective_surface_brightness_lsun_pc2 >= surfaceMedian) return false;
    if (subset === 'high-sb' && galaxy.effective_surface_brightness_lsun_pc2 < surfaceMedian) return false;
    if (subset === 'gas-rich' && galaxy.derived.gas_fraction_at_ml_0p5 <= 0.5) return false;
    return true;
  });
}

function drawPopulationAxes(context, width, height, bounds, labels) {
  const plot = { left: 70, top: 24, right: width - 20, bottom: height - 58 };
  context.font = '11px ui-monospace, SFMono-Regular, Consolas, monospace';
  context.textBaseline = 'middle';
  for (let index = 0; index <= 5; index += 1) {
    const fraction = index / 5;
    const x = plot.left + (plot.right - plot.left) * fraction;
    const y = plot.bottom - (plot.bottom - plot.top) * fraction;
    context.strokeStyle = 'rgba(149, 166, 190, 0.15)';
    context.beginPath();
    context.moveTo(x, plot.top); context.lineTo(x, plot.bottom);
    context.moveTo(plot.left, y); context.lineTo(plot.right, y); context.stroke();
    context.fillStyle = '#a8b4c8';
    context.textAlign = 'center';
    context.fillText(formatNumber(bounds.minX + (bounds.maxX - bounds.minX) * fraction, 1), x, plot.bottom + 20);
    context.textAlign = 'right';
    context.fillText(formatNumber(bounds.minY + (bounds.maxY - bounds.minY) * fraction, 1), plot.left - 9, y);
  }
  context.strokeStyle = '#4b6b86';
  context.strokeRect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
  context.fillStyle = '#d7e0eb';
  context.textAlign = 'center';
  context.fillText(labels.x, (plot.left + plot.right) / 2, height - 18);
  context.save();
  context.translate(18, (plot.top + plot.bottom) / 2);
  context.rotate(-Math.PI / 2);
  context.fillText(labels.y, 0, 0);
  context.restore();
  return {
    plot,
    x: value => plot.left + (value - bounds.minX) / (bounds.maxX - bounds.minX) * (plot.right - plot.left),
    y: value => plot.bottom - (value - bounds.minY) / (bounds.maxY - bounds.minY) * (plot.bottom - plot.top)
  };
}

function populationPointColour(galaxy) {
  return galaxy.derived.gas_fraction_at_ml_0p5 > 0.5 ? '#f4b860' : '#54b8ea';
}

function drawBtfr(galaxies) {
  const canvas = $('btfrCanvas');
  const { context, width, height } = prepareCanvas(canvas);
  const data = galaxies.filter(galaxy => galaxy.flat_velocity_kms > 0 && galaxy.derived.baryonic_mass_1e9_msun_at_ml_0p5 > 0).map(galaxy => ({
    galaxy,
    x: Math.log10(galaxy.flat_velocity_kms),
    y: Math.log10(galaxy.derived.baryonic_mass_1e9_msun_at_ml_0p5 * 1e9)
  }));
  const bounds = { minX: 1.3, maxX: 2.6, minY: 7, maxY: 12 };
  const scales = drawPopulationAxes(context, width, height, bounds, { x: 'log₁₀ Vflat [km/s]', y: 'log₁₀ Mbar [M☉]' });
  state.population.plotPoints.btfrCanvas = [];
  for (const point of data) {
    const x = scales.x(point.x);
    const y = scales.y(point.y);
    const highlighted = point.galaxy.galaxy_id === state.population.highlightedGalaxyId;
    context.fillStyle = populationPointColour(point.galaxy);
    context.globalAlpha = highlighted ? 1 : 0.72;
    context.beginPath(); context.arc(x, y, highlighted ? 6 : point.galaxy.quality_flag === 1 ? 3.3 : 2.4, 0, Math.PI * 2); context.fill();
    if (highlighted) { context.strokeStyle = '#ffffff'; context.lineWidth = 2; context.stroke(); }
    state.population.plotPoints.btfrCanvas.push({ x, y, galaxyId: point.galaxy.galaxy_id });
  }
  context.globalAlpha = 1;
  context.fillStyle = '#d7e0eb'; context.font = '11px ui-monospace, monospace'; context.textAlign = 'left';
  context.fillText(`N = ${data.length}; amber = gas dominated`, scales.plot.left + 8, scales.plot.top + 12);
  $('btfrSummary').textContent = `${data.length} filtered galaxies with published positive flat velocities are shown. Baryonic masses assume a fixed 3.6-micron stellar mass-to-light ratio of 0.5 and the SPARC helium correction.`;
}

function drawRar(galaxies) {
  const canvas = $('rarCanvas');
  const { context, width, height } = prepareCanvas(canvas);
  const accelerationFactor = 3.240779289e-14;
  const data = [];
  for (const galaxy of galaxies) {
    for (const point of galaxy.points) {
      const baryonicVelocitySquared = point.v_gas * Math.abs(point.v_gas) + 0.5 * point.v_disk ** 2 + 0.7 * point.v_bulge ** 2;
      const observedAcceleration = point.y ** 2 / point.x * accelerationFactor;
      const baryonicAcceleration = baryonicVelocitySquared / point.x * accelerationFactor;
      if (observedAcceleration > 0 && baryonicAcceleration > 0) data.push({
        galaxy, x: Math.log10(baryonicAcceleration), y: Math.log10(observedAcceleration)
      });
    }
  }
  const bounds = { minX: -13.5, maxX: -8, minY: -13.5, maxY: -8 };
  const scales = drawPopulationAxes(context, width, height, bounds, { x: 'log₁₀ gbar [m/s²]', y: 'log₁₀ gobs [m/s²]' });
  const gDagger = 1.2e-10;
  context.strokeStyle = '#b1a7ff'; context.lineWidth = 2; context.beginPath();
  for (let index = 0; index <= 120; index += 1) {
    const logBaryonic = bounds.minX + (bounds.maxX - bounds.minX) * index / 120;
    const gBar = 10 ** logBaryonic;
    const predicted = gBar / (1 - Math.exp(-Math.sqrt(gBar / gDagger)));
    const x = scales.x(logBaryonic); const y = scales.y(Math.log10(predicted));
    if (index) context.lineTo(x, y); else context.moveTo(x, y);
  }
  context.stroke();
  state.population.plotPoints.rarCanvas = [];
  for (const point of data) {
    const x = scales.x(point.x); const y = scales.y(point.y);
    const highlighted = point.galaxy.galaxy_id === state.population.highlightedGalaxyId;
    context.fillStyle = populationPointColour(point.galaxy);
    context.globalAlpha = highlighted ? 0.95 : 0.35;
    context.fillRect(x - (highlighted ? 2.5 : 1), y - (highlighted ? 2.5 : 1), highlighted ? 5 : 2, highlighted ? 5 : 2);
    state.population.plotPoints.rarCanvas.push({ x, y, galaxyId: point.galaxy.galaxy_id });
  }
  context.globalAlpha = 1;
  context.fillStyle = '#d7e0eb'; context.font = '11px ui-monospace, monospace'; context.textAlign = 'left';
  context.fillText(`N = ${data.length} radii; violet = g† reference`, scales.plot.left + 8, scales.plot.top + 12);
  $('rarSummary').textContent = `${data.length} resolved radii from ${galaxies.length} filtered galaxies are shown against the empirical acceleration-relation reference with g-dagger equal to 1.2 times 10 to the minus 10 metres per second squared.`;
}

function renderPopulationTable(galaxies) {
  $('populationRows').innerHTML = galaxies.map(galaxy => `<tr><th scope="row">${galaxy.galaxy}</th><td>${galaxy.morphology}</td><td>${galaxy.quality_flag}</td><td>${formatNumber(galaxy.distance_mpc, 2)}</td><td>${formatNumber(galaxy.inclination_deg, 1)}</td><td>${formatNumber(galaxy.effective_surface_brightness_lsun_pc2, 2)}</td><td>${formatNumber(galaxy.derived.gas_fraction_at_ml_0p5, 3)}</td><td>${galaxy.flat_velocity_kms > 0 ? formatNumber(galaxy.flat_velocity_kms, 1) : '—'}</td><td>${galaxy.n_points}</td></tr>`).join('') || '<tr><td colspan="9">No galaxies match these filters.</td></tr>';
}

function renderPopulation() {
  if (!state.catalog) return;
  const galaxies = filteredPopulation();
  state.population.galaxies = galaxies;
  const resolvedPoints = galaxies.reduce((sum, galaxy) => sum + galaxy.n_points, 0);
  const btfrCount = galaxies.filter(galaxy => galaxy.flat_velocity_kms > 0).length;
  const gasFractions = galaxies.map(galaxy => galaxy.derived.gas_fraction_at_ml_0p5);
  $('populationMetrics').innerHTML = [
    ['Selected galaxies', galaxies.length, `of ${state.catalog.selection_count}`],
    ['Resolved velocities', resolvedPoints.toLocaleString('en-GB'), 'RAR inputs'],
    ['Published Vflat', btfrCount, 'BTFR inputs'],
    ['Median gas fraction', formatNumber(median(gasFractions), 3), 'fixed M/L=0.5']
  ].map(([label, value, note]) => `<div class="population-metric"><span>${label}</span><strong>${value}</strong><span>${note}</span></div>`).join('');
  drawBtfr(galaxies);
  drawRar(galaxies);
  renderPopulationTable(galaxies);
}

function exportPopulationCsv() {
  const header = ['galaxy_id', 'morphology', 'quality_flag', 'distance_mpc', 'inclination_deg', 'effective_surface_brightness_lsun_pc2', 'gas_fraction_at_ml_0p5', 'baryonic_mass_1e9_msun_at_ml_0p5', 'flat_velocity_kms', 'flat_velocity_error_kms', 'n_points', 'rotation_curve_references'];
  const rows = state.population.galaxies.map(galaxy => [galaxy.galaxy_id, galaxy.morphology, galaxy.quality_flag, galaxy.distance_mpc, galaxy.inclination_deg, galaxy.effective_surface_brightness_lsun_pc2, galaxy.derived.gas_fraction_at_ml_0p5, galaxy.derived.baryonic_mass_1e9_msun_at_ml_0p5, galaxy.flat_velocity_kms || '', galaxy.flat_velocity_error_kms || '', galaxy.n_points, galaxy.rotation_curve_references]);
  const csvCell = value => /[",\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);
  download('sparc-filtered-population.csv', 'text/csv;charset=utf-8', [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n'));
}

function exportPopulationJson() {
  const payload = {
    softwareVersion: BUILD_VERSION,
    dataset: state.catalog.dataset,
    datasetVersion: state.catalog.schema_version,
    sourceChecksums: state.catalog.provenance.source_checksums,
    filters: { name: $('populationSearch').value, quality: $('qualityFilter').value, subset: $('populationClass').value },
    assumptions: { stellarMassToLight3p6: 0.5, bulgeMassToLight3p6: 0.7, gasHeliumFactor: 1.33, rarGDaggerMps2: 1.2e-10 },
    selectedGalaxyIds: state.population.galaxies.map(galaxy => galaxy.galaxy_id)
  };
  download('sparc-population-state.json', 'application/json;charset=utf-8', `${JSON.stringify(payload, null, 2)}\n`);
}

function handlePopulationPointer(event) {
  const canvas = event.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left; const y = event.clientY - rect.top;
  let closest = null; let distanceSquared = 100;
  for (const point of state.population.plotPoints[canvas.id]) {
    const candidate = (point.x - x) ** 2 + (point.y - y) ** 2;
    if (candidate < distanceSquared) { closest = point; distanceSquared = candidate; }
  }
  const next = closest?.galaxyId || null;
  if (next !== state.population.highlightedGalaxyId) {
    state.population.highlightedGalaxyId = next;
    drawBtfr(state.population.galaxies); drawRar(state.population.galaxies);
    if (next) {
      const galaxy = state.catalog.galaxies.find(candidate => candidate.galaxy_id === next);
      canvas.title = `${galaxy.galaxy}: ${galaxy.morphology}, Q=${galaxy.quality_flag}, ${galaxy.n_points} resolved measurements`;
    } else canvas.removeAttribute('title');
  }
}

$('galaxySelect').addEventListener('change', event => {
  selectReference(event.currentTarget.value);
  syncUrlState();
  state.result = null;
  $('fitStatus').textContent = `${state.reference.galaxy} selected`;
  runModel();
});

$('galaxySearch').addEventListener('input', event => {
  const previous = $('galaxySelect').value;
  renderGalaxyOptions(event.currentTarget.value);
  if ([...$('galaxySelect').options].some(option => option.value === previous)) $('galaxySelect').value = previous;
});

$('haloModel').addEventListener('change', event => {
  state.params.haloModel = event.currentTarget.value;
  syncUrlState();
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
  syncUrlState();
  runModel();
});

$('exportCsv').addEventListener('click', exportCsv);
$('exportSvg').addEventListener('click', exportSvg);
$('exportPopulationCsv').addEventListener('click', exportPopulationCsv);
$('exportPopulationJson').addEventListener('click', exportPopulationJson);
$('exportChallenge').addEventListener('click', exportChallenge);
$('challengeRelation').addEventListener('change', event => {
  state.challenge.relation = event.currentTarget.value;
  renderChallenge();
});
$('challengeScale').addEventListener('input', event => {
  state.challenge.accelerationScale = Number(event.currentTarget.value) * 1e-10;
  $('challengeScaleOutput').textContent = `${formatNumber(event.currentTarget.value, 2)} × 10⁻¹⁰ m/s²`;
  renderChallenge();
});
$('challengeMl').addEventListener('input', event => {
  state.challenge.massToLightDisk = Number(event.currentTarget.value);
  $('challengeMlOutput').textContent = `${formatNumber(event.currentTarget.value, 2)} M☉/L☉`;
  renderChallenge();
});
$('clusterSelect').addEventListener('change', event => selectCluster(event.currentTarget.value));
$('sourceRedshift').addEventListener('input', event => {
  state.lensing.sourceRedshift = Number(event.currentTarget.value);
  $('sourceRedshiftOutput').textContent = formatNumber(state.lensing.sourceRedshift, 2);
  renderLensing();
});
$('clusterDispersion').addEventListener('input', event => {
  state.lensing.velocityDispersion = Number(event.currentTarget.value);
  $('clusterDispersionOutput').textContent = `${formatNumber(state.lensing.velocityDispersion, 0)} km/s`;
  renderLensing();
});
for (const layer of document.querySelectorAll('input[name="clusterLayer"]')) layer.addEventListener('change', renderLensing);
$('cosmicEpoch').addEventListener('input', event => {
  state.cosmology.logScaleFactor = Number(event.currentTarget.value);
  $('cosmicEpochOutput').textContent = formatNumber(state.cosmology.logScaleFactor, 2);
  renderCosmology();
});
$('cosmicBaryons').addEventListener('input', event => {
  state.cosmology.parameters.omegaBaryon = Number(event.currentTarget.value);
  $('cosmicBaryonsOutput').textContent = formatNumber(state.cosmology.parameters.omegaBaryon, 3);
  renderCosmology();
});
$('cosmicDarkMatter').addEventListener('input', event => {
  state.cosmology.parameters.omegaDarkMatter = Number(event.currentTarget.value);
  $('cosmicDarkMatterOutput').textContent = formatNumber(state.cosmology.parameters.omegaDarkMatter, 3);
  renderCosmology();
});
$('resetCosmology').addEventListener('click', () => {
  state.cosmology.logScaleFactor = 0;
  state.cosmology.parameters = { omegaRadiation: 0.00009, omegaBaryon: 0.0493, omegaDarkMatter: 0.264, omegaDarkEnergy: 0.68661 };
  $('cosmicEpoch').value = 0; $('cosmicEpochOutput').textContent = '0.00';
  $('cosmicBaryons').value = 0.0493; $('cosmicBaryonsOutput').textContent = '0.049';
  $('cosmicDarkMatter').value = 0.264; $('cosmicDarkMatterOutput').textContent = '0.264';
  renderCosmology();
});
$('candidateFamily').addEventListener('change', renderCandidates);
$('modeEducator').addEventListener('click', () => applyMode('educator'));
$('modeResearch').addEventListener('click', () => applyMode('research'));
$('exportWorkspace').addEventListener('click', exportWorkspace);
$('scaleRange').addEventListener('input', event => {
  state.futures.logScaleMetres = Number(event.currentTarget.value);
  renderFutures();
});
for (const [id, stateKey, output, formatter] of [
  ['futureMass', 'logMassGev', 'futureMassOutput', value => formatNumber(value, 1)],
  ['futureCrossSection', 'logCrossSectionCm2', 'futureCrossSectionOutput', value => formatNumber(value, 1)],
  ['futureDensity', 'localDensity', 'futureDensityOutput', value => formatNumber(value, 2)],
  ['futureEfficiency', 'efficiency', 'futureEfficiencyOutput', value => `${formatNumber(value * 100, 0)}%`]
]) {
  $(id).addEventListener('input', event => {
    state.futures[stateKey] = Number(event.currentTarget.value);
    $(output).textContent = formatter(state.futures[stateKey]);
    renderFutures();
  });
}
for (const control of [$('populationSearch'), $('qualityFilter'), $('populationClass')]) {
  control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', renderPopulation);
}
for (const canvas of [$('btfrCanvas'), $('rarCanvas')]) {
  canvas.addEventListener('pointermove', handlePopulationPointer);
  canvas.addEventListener('click', () => {
    if (!state.population.highlightedGalaxyId) return;
    $('galaxySearch').value = '';
    renderGalaxyOptions();
    $('galaxySelect').value = state.population.highlightedGalaxyId;
    selectReference(state.population.highlightedGalaxyId);
    state.result = null;
    $('fitStatus').textContent = `${state.reference.galaxy} selected from population view`;
    runModel();
  });
  canvas.addEventListener('pointerleave', () => {
    state.population.highlightedGalaxyId = null;
    drawBtfr(state.population.galaxies);
    drawRar(state.population.galaxies);
  });
}

applyMode(state.mode, false);
buildControls();
drawPosterior();
Promise.all([loadCatalog(), loadClusterCatalog(), loadCandidateAtlas(), loadResearchFrontier(), loadEvidenceGraph()])
  .then(() => { syncUrlState(); runModel(); })
  .catch(error => {
    $('workerStatus').textContent = 'Reference data unavailable';
    $('notes').textContent = error.message;
  });

const resizeObserver = new ResizeObserver(() => {
  if (state.result) renderAll();
  drawPosterior();
  if (state.catalog) renderPopulation();
  if (state.lensing.catalog) drawClusterMap();
  if (state.cosmology.atlas) drawCosmology();
});
for (const canvas of document.querySelectorAll('canvas')) resizeObserver.observe(canvas);
