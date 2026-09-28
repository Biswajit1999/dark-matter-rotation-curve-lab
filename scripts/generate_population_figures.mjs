import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'docs', 'figures');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'galaxies.json'), 'utf8'));
fs.mkdirSync(output, { recursive: true });

function regression(points) {
  const n=points.length, mx=points.reduce((s,p)=>s+p.x,0)/n, my=points.reduce((s,p)=>s+p.y,0)/n;
  const sxx=points.reduce((s,p)=>s+(p.x-mx)**2,0);
  const slope=points.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0)/sxx;
  const intercept=my-slope*mx;
  const ssTot=points.reduce((s,p)=>s+(p.y-my)**2,0);
  const ssRes=points.reduce((s,p)=>s+(p.y-(intercept+slope*p.x))**2,0);
  return {slope,intercept,r2:1-ssRes/ssTot};
}

function scatterSvg({title,subtitle,xLabel,yLabel,points,xMin,xMax,yMin,yMax,line,footer,width=900,height=600}) {
  const m={l:88,r:32,t:78,b:82}, sx=x=>m.l+(x-xMin)/(xMax-xMin)*(width-m.l-m.r), sy=y=>height-m.b-(y-yMin)/(yMax-yMin)*(height-m.t-m.b);
  const xTicks=Array.from({length:6},(_,i)=>xMin+i*(xMax-xMin)/5), yTicks=Array.from({length:6},(_,i)=>yMin+i*(yMax-yMin)/5);
  const circles=points.map(p=>`<circle cx="${sx(p.x).toFixed(2)}" cy="${sy(p.y).toFixed(2)}" r="${p.r||2.2}" fill="${p.color||'#67d6c0'}" fill-opacity="${p.alpha||0.48}"/>`).join('');
  const lineMarkup=line?`<line x1="${sx(xMin)}" y1="${sy(line.fn(xMin))}" x2="${sx(xMax)}" y2="${sy(line.fn(xMax))}" stroke="${line.color||'#e8a85b'}" stroke-width="2.4" stroke-dasharray="${line.dash||'7 5'}"/><text x="${sx(xMin)+8}" y="${Math.max(m.t+16,sy(line.fn(xMin))-8)}" fill="${line.color||'#e8a85b'}" font-family="ui-monospace,monospace" font-size="11">${line.label}</text>`:'';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><rect width="100%" height="100%" fill="#07100f"/><text x="${m.l}" y="35" fill="#f1efe7" font-family="system-ui,sans-serif" font-size="22" font-weight="650">${title}</text><text x="${m.l}" y="57" fill="#b4c0ba" font-family="ui-monospace,monospace" font-size="11">${subtitle}</text><rect x="${m.l}" y="${m.t}" width="${width-m.l-m.r}" height="${height-m.t-m.b}" fill="#0b1716" stroke="#31504b"/>${xTicks.map(v=>`<line x1="${sx(v)}" y1="${m.t}" x2="${sx(v)}" y2="${height-m.b}" stroke="#17302d"/><text x="${sx(v)}" y="${height-m.b+25}" fill="#b4c0ba" text-anchor="middle" font-family="ui-monospace,monospace" font-size="10">${v.toFixed(1)}</text>`).join('')}${yTicks.map(v=>`<line x1="${m.l}" y1="${sy(v)}" x2="${width-m.r}" y2="${sy(v)}" stroke="#17302d"/><text x="${m.l-12}" y="${sy(v)+4}" fill="#b4c0ba" text-anchor="end" font-family="ui-monospace,monospace" font-size="10">${v.toFixed(1)}</text>`).join('')}${circles}${lineMarkup}<text x="${(m.l+width-m.r)/2}" y="${height-35}" fill="#d6dfdb" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12">${xLabel}</text><text x="26" y="${(m.t+height-m.b)/2}" fill="#d6dfdb" text-anchor="middle" transform="rotate(-90 26 ${(m.t+height-m.b)/2})" font-family="system-ui,sans-serif" font-size="12">${yLabel}</text><text x="${m.l}" y="${height-10}" fill="#82948e" font-family="system-ui,sans-serif" font-size="10">${footer}</text></svg>\n`;
}
const qc={1:'#67d6c0',2:'#84a9ff',3:'#e8a85b'};
const btfr=catalog.galaxies.filter(g=>g.flat_velocity_kms>0&&g.derived?.baryonic_mass_1e9_msun_at_ml_0p5>0).map(g=>({x:Math.log10(g.derived.baryonic_mass_1e9_msun_at_ml_0p5*1e9),y:Math.log10(g.flat_velocity_kms),color:qc[g.quality_flag],alpha:g.quality_flag===1?0.8:0.5,r:g.quality_flag===1?2.8:2.2}));
const reg=regression(btfr);
const K=1e6/3.085677581491367e19, rar=[];
for(const g of catalog.galaxies) for(const p of g.points||[]){const vbar2=Math.sign(p.v_gas)*p.v_gas**2+0.5*p.v_disk**2+0.7*p.v_bulge**2;if(p.x>0&&p.y>0&&vbar2>0){const gobs=p.y**2/p.x*K,gbar=vbar2/p.x*K;if(gobs>0&&gbar>0)rar.push({x:Math.log10(gbar),y:Math.log10(gobs),color:qc[g.quality_flag],alpha:0.17,r:1.35});}}
fs.writeFileSync(path.join(output,'btfr.svg'),scatterSvg({title:'SPARC baryonic Tully–Fisher plane',subtitle:`${btfr.length} galaxies with published Vflat · M/L3.6=0.5 · helium factor=1.33`,xLabel:'log10 baryonic mass [M☉]',yLabel:'log10 Vflat [km/s]',points:btfr,xMin:6.8,xMax:11.6,yMin:1.15,yMax:2.65,line:{fn:x=>reg.intercept+reg.slope*x,label:`OLS guide: slope ${reg.slope.toFixed(3)} · R² ${reg.r2.toFixed(3)}`},footer:'Colour encodes SPARC quality flag. OLS line is descriptive, not a selection-corrected likelihood.'}));
fs.writeFileSync(path.join(output,'rar.svg'),scatterSvg({title:'SPARC radial-acceleration plane',subtitle:`${rar.length} resolved measurements · Υdisk=0.5 · Υbul=0.7`,xLabel:'log10 gbar [m/s²]',yLabel:'log10 gobs [m/s²]',points:rar,xMin:-13.3,xMax:-8.7,yMin:-12.7,yMax:-8.7,line:{fn:x=>x,label:'Newtonian equality gobs = gbar',color:'#e8a85b',dash:'6 5'},footer:'Each point is a resolved SPARC radius. Empirical plane; no unique physical cause is assumed.'}));
console.log(`Generated BTFR (${btfr.length} galaxies) and RAR (${rar.length} resolved points) figures.`);
