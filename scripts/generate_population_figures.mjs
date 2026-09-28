import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'docs', 'figures');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'galaxies.json'), 'utf8'));
fs.mkdirSync(output, { recursive: true });

const QUALITY = {
  1: { colour: '#68d6c0', marker: 'circle', label: 'Q1 high quality' },
  2: { colour: '#8fa9ff', marker: 'square', label: 'Q2 medium quality' },
  3: { colour: '#e7aa40', marker: 'diamond', label: 'Q3 low quality' }
};

function escapeXml(value) {
  return String(value).replace(/[&<>"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[character]));
}

function regression(points) {
  const n = points.length;
  const mx = points.reduce((sum, point) => sum + point.x, 0) / n;
  const my = points.reduce((sum, point) => sum + point.y, 0) / n;
  const sxx = points.reduce((sum, point) => sum + (point.x - mx) ** 2, 0);
  const slope = points.reduce((sum, point) => sum + (point.x - mx) * (point.y - my), 0) / sxx;
  const intercept = my - slope * mx;
  const ssTot = points.reduce((sum, point) => sum + (point.y - my) ** 2, 0);
  const ssRes = points.reduce((sum, point) => sum + (point.y - (intercept + slope * point.x)) ** 2, 0);
  return { slope, intercept, r2: 1 - ssRes / ssTot };
}

function marker(point, x, y) {
  const q = QUALITY[point.quality] || QUALITY[2];
  const alpha = point.alpha ?? 0.55;
  const size = point.size ?? 2.4;
  if (q.marker === 'square') {
    return `<rect x="${(x-size).toFixed(2)}" y="${(y-size).toFixed(2)}" width="${(2*size).toFixed(2)}" height="${(2*size).toFixed(2)}" fill="${q.colour}" fill-opacity="${alpha}"/>`;
  }
  if (q.marker === 'diamond') {
    return `<rect x="${(x-size).toFixed(2)}" y="${(y-size).toFixed(2)}" width="${(2*size).toFixed(2)}" height="${(2*size).toFixed(2)}" transform="rotate(45 ${x.toFixed(2)} ${y.toFixed(2)})" fill="${q.colour}" fill-opacity="${alpha}"/>`;
  }
  return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${size}" fill="${q.colour}" fill-opacity="${alpha}"/>`;
}

function legendMarker(q, x, y) {
  const item = QUALITY[q];
  if (item.marker === 'square') return `<rect x="${x-4}" y="${y-4}" width="8" height="8" fill="${item.colour}"/>`;
  if (item.marker === 'diamond') return `<rect x="${x-4}" y="${y-4}" width="8" height="8" transform="rotate(45 ${x} ${y})" fill="${item.colour}"/>`;
  return `<circle cx="${x}" cy="${y}" r="4" fill="${item.colour}"/>`;
}

function scatterSvg({ title, subtitle, xLabel, yLabel, points, xMin, xMax, yMin, yMax, lines = [], footer, width=980, height=620 }) {
  const m = { l:90, r:34, t:116, b:82 };
  const sx = x => m.l + (x-xMin)/(xMax-xMin)*(width-m.l-m.r);
  const sy = y => height-m.b - (y-yMin)/(yMax-yMin)*(height-m.t-m.b);
  const xTicks = Array.from({length:6},(_,i)=>xMin+i*(xMax-xMin)/5);
  const yTicks = Array.from({length:6},(_,i)=>yMin+i*(yMax-yMin)/5);

  const markers = points.map(point => marker(point, sx(point.x), sy(point.y))).join('');
  const lineMarkup = lines.map(line => {
    const samples = Array.from({length:181},(_,i) => {
      const x = xMin + (xMax-xMin)*i/180;
      const y = line.fn(x);
      return Number.isFinite(y) ? [sx(x),sy(y)] : null;
    }).filter(Boolean);
    const d = samples.map((point,index)=>`${index?'L':'M'}${point[0].toFixed(2)},${point[1].toFixed(2)}`).join(' ');
    return `<path d="${d}" fill="none" stroke="${line.colour}" stroke-width="${line.width||2.3}" stroke-dasharray="${line.dash||''}"/>`;
  }).join('');

  const qualityLegend = [1,2,3].map((q,index)=>{
    const x = m.l + index*148;
    return `${legendMarker(q,x,m.t-20)}<text x="${x+10}" y="${m.t-16}" fill="#cfd8d5" font-family="system-ui,sans-serif" font-size="11">${escapeXml(QUALITY[q].label)}</text>`;
  }).join('');

  const lineLegend = lines.map((line,index)=>{
    const x = width-m.r-250;
    const y = m.t-28 + index*18;
    return `<line x1="${x}" y1="${y}" x2="${x+26}" y2="${y}" stroke="${line.colour}" stroke-width="2.3" stroke-dasharray="${line.dash||''}"/><text x="${x+34}" y="${y+4}" fill="#cfd8d5" font-family="system-ui,sans-serif" font-size="11">${escapeXml(line.label)}</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
<rect width="100%" height="100%" fill="#0b0a0d"/>
<text x="${m.l}" y="34" fill="#f4efe6" font-family="system-ui,sans-serif" font-size="22" font-weight="650">${escapeXml(title)}</text>
<text x="${m.l}" y="57" fill="#aaa097" font-family="ui-monospace,monospace" font-size="11">${escapeXml(subtitle)}</text>
${qualityLegend}${lineLegend}
<rect x="${m.l}" y="${m.t}" width="${width-m.l-m.r}" height="${height-m.t-m.b}" fill="#131117" stroke="#42384a"/>
${xTicks.map(v=>`<line x1="${sx(v)}" y1="${m.t}" x2="${sx(v)}" y2="${height-m.b}" stroke="#26222c"/><text x="${sx(v)}" y="${height-m.b+25}" fill="#aaa097" text-anchor="middle" font-family="ui-monospace,monospace" font-size="10">${v.toFixed(1)}</text>`).join('')}
${yTicks.map(v=>`<line x1="${m.l}" y1="${sy(v)}" x2="${width-m.r}" y2="${sy(v)}" stroke="#26222c"/><text x="${m.l-12}" y="${sy(v)+4}" fill="#aaa097" text-anchor="end" font-family="ui-monospace,monospace" font-size="10">${v.toFixed(1)}</text>`).join('')}
${lineMarkup}${markers}
<text x="${(m.l+width-m.r)/2}" y="${height-35}" fill="#e1d9d0" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12">${escapeXml(xLabel)}</text>
<text x="26" y="${(m.t+height-m.b)/2}" fill="#e1d9d0" text-anchor="middle" transform="rotate(-90 26 ${(m.t+height-m.b)/2})" font-family="system-ui,sans-serif" font-size="12">${escapeXml(yLabel)}</text>
<text x="${m.l}" y="${height-10}" fill="#8f857d" font-family="system-ui,sans-serif" font-size="10">${escapeXml(footer)}</text>
</svg>\n`;
}

const btfr = catalog.galaxies
  .filter(galaxy => galaxy.flat_velocity_kms > 0 && galaxy.derived?.baryonic_mass_1e9_msun_at_ml_0p5 > 0)
  .map(galaxy => ({
    x: Math.log10(galaxy.flat_velocity_kms),
    y: Math.log10(galaxy.derived.baryonic_mass_1e9_msun_at_ml_0p5*1e9),
    quality: galaxy.quality_flag,
    alpha: galaxy.quality_flag===1 ? .82 : .58,
    size: galaxy.quality_flag===1 ? 3.2 : 2.5
  }));

const btfrFit = regression(btfr);

const accelerationFactor = 1e6/3.085677581491367e19;
const rar = [];
for (const galaxy of catalog.galaxies) {
  for (const point of galaxy.points || []) {
    const vbar2 = Math.sign(point.v_gas)*point.v_gas**2 + .5*point.v_disk**2 + .7*point.v_bulge**2;
    if (point.x > 0 && point.y > 0 && vbar2 > 0) {
      const gobs = point.y**2/point.x*accelerationFactor;
      const gbar = vbar2/point.x*accelerationFactor;
      if (gobs > 0 && gbar > 0) rar.push({
        x: Math.log10(gbar),
        y: Math.log10(gobs),
        quality: galaxy.quality_flag,
        alpha: .20,
        size: 1.35
      });
    }
  }
}

const gDagger = 1.2e-10;
fs.writeFileSync(path.join(output,'btfr.svg'), scatterSvg({
  title:'SPARC baryonic Tully–Fisher plane',
  subtitle:`${btfr.length} galaxies with positive published Vflat · Υ3.6=0.5 · helium factor=1.33`,
  xLabel:'log10 Vflat [km/s]',
  yLabel:'log10 baryonic mass [M☉]',
  points:btfr,
  xMin:1.15,xMax:2.65,yMin:6.8,yMax:11.6,
  lines:[{
    fn:x=>btfrFit.intercept+btfrFit.slope*x,
    label:`descriptive OLS · slope ${btfrFit.slope.toFixed(2)} · R² ${btfrFit.r2.toFixed(3)}`,
    colour:'#f0a24a',
    dash:'8 5'
  }],
  footer:'Markers encode SPARC quality. The OLS guide is descriptive, not a selection-corrected population likelihood.'
}));

fs.writeFileSync(path.join(output,'rar.svg'), scatterSvg({
  title:'SPARC radial-acceleration plane',
  subtitle:`${rar.length} resolved measurements · Υdisk=0.5 · Υbul=0.7`,
  xLabel:'log10 gbar [m/s²]',
  yLabel:'log10 gobs [m/s²]',
  points:rar,
  xMin:-13.3,xMax:-8.7,yMin:-12.7,yMax:-8.7,
  lines:[
    { fn:x=>x, label:'Newtonian equality · gobs = gbar', colour:'#c8c3cc', dash:'6 5', width:1.7 },
    {
      fn:x=>{
        const gbar=10**x;
        return Math.log10(gbar/(1-Math.exp(-Math.sqrt(gbar/gDagger))));
      },
      label:'empirical RAR · g† = 1.2×10⁻¹⁰ m/s²',
      colour:'#a06be7',
      width:2.5
    }
  ],
  footer:'Markers encode SPARC quality. Curves are references; neither line uniquely identifies the underlying physical cause.'
}));

console.log(`Generated BTFR (${btfr.length} galaxies, slope ${btfrFit.slope.toFixed(3)}) and RAR (${rar.length} resolved points) figures with legends.`);
