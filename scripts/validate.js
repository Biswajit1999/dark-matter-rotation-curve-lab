const fs=require('node:fs');
const required=['README.md','index.html','styles.css','app.js','physicsWorker.js','data/reference.json'];
let failures=[];
for(const file of required){if(!fs.existsSync(file))failures.push(file+' missing')}
const reference=JSON.parse(fs.readFileSync('data/reference.json','utf8'));
if(!reference.points||reference.points.length<4)failures.push('reference data needs at least four points');
for(const point of reference.points||[]){if(!Number.isFinite(point.x)||!Number.isFinite(point.y))failures.push('reference point is not finite')}
const readme=fs.readFileSync('README.md','utf8');
for(const citation of reference.requiredCitations||[]){if(!readme.includes(citation.split('.')[0]))failures.push('README missing citation family '+citation)}
const combined=required.map(file=>fs.readFileSync(file,'utf8')).join('\n');
const banned=['TO'+'DO','PLACE'+'HOLDER','insert '+'logic','coming '+'soon'];
for(const token of banned){if(combined.toLowerCase().includes(token.toLowerCase()))failures.push('unfinished token '+token)}
if(!combined.includes('physicsWorker.js'))failures.push('worker reference missing');
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('Dark Matter Rotation Curve Lab: validation passed with '+reference.points.length+' reference anchors.');
