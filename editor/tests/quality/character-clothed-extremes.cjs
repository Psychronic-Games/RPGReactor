'use strict';
// Catalog-wide mixed clothing/body extremes, shared by geometry and render audits.
const Q=require('../helpers/character-quality-matrix.cjs'),W=require('../../src/forge/Character3D/CharacterWardrobe.js'),G=require('../../src/forge/Character3D/CreatureGear.js');
const P=require('./character-outfit-accessory-quality.cjs').FRESH_PROFILES;
function inventory(){
const rows=[];
function add(id,entity,recipe,extra={}){rows.push({id:'deep-'+id,group:'deep-current',entity,label:id,profile:extra.profile||'preset',frame:'body',audit:true,noFloor:recipe.plan==='quadruped'&&recipe.morphology!=='quadruped',recipe,...extra});}
for(const [i,s]of Q.Species.SPECIES.filter(s=>!s.plan).entries())for(let j=0;j<3;j++){
 const p=P[(i+j*2)%P.length],preset=W.PRESETS[(i*7+j*13)%W.PRESETS.length];
 add('species-'+s.id+'-'+j,'species',Q.Model.normalize({...Q.Model.withSpecies({age:35},s.id),...p.patch,outfit:preset.items}),{profile:p.id+' / '+preset.id,face:true});
}
for(const [i,preset]of W.PRESETS.entries())for(let j=0;j<3;j++){
 const p=P[(i+j*2)%P.length];add('outfit-'+preset.id+'-'+j,'outfit',Q.Model.normalize({age:35,...p.patch,outfit:preset.items,hair:{style:'bald'}}),{profile:p.id});
}
for(const [i,[id]]of Q.Species.heads().entries())for(let j=0;j<2;j++){
 const p=P[(i+j*3)%P.length];add('head-'+id+'-'+j,'head',Q.Model.normalize({age:35,...p.patch,headId:id,outfit:W.PRESETS[(i*3+j*7)%W.PRESETS.length].items}),{profile:p.id,face:true});
}
const creatures=[];
for(const k of Q.Creature.KINDS){const r=Q.Creature.kindRecipe(k.kind),v=Q.Creature.variantsFor(r)[0];if(v)for(const[t]of v.choices)creatures.push([k.kind+'-'+t,Q.Creature.withVariant(r,v.key,t)]);else creatures.push([k.kind,r]);}
for(const[id,r]of creatures)for(let j=0;j<3;j++){
 const patch=j?Object.fromEntries(Q.Creature.slidersFor(r).map((s,i)=>[s.key,(i+j)%2?s.max:s.min])):{};
 patch.size=r.size;
 add('creature-'+id+'-'+j,'creature',Q.Creature.normalizeRecipe({...r,...patch}),{profile:j?'alternating-extremes-'+j:'preset'});
}
for(const [i,[fin]]of Q.Merfolk.FINS.entries())for(let j=0;j<2;j++)add('merfolk-'+fin+'-'+j,'merfolk',Q.Model.normalize({...Q.Model.withSpecies({age:35},'merfolk'),...P[(i+j*3)%P.length].patch,merfolk:{fin,length:j?2:1,armFins:true,hipFins:true,backFin:true,finEars:true},outfit:W.PRESETS[(i*5+j)%W.PRESETS.length].items}));
for(const form of [0,.5,1])for(let j=0;j<2;j++)add('slime-'+form+'-'+j,'slime',Q.Model.normalize({plan:'slime',form,size:1,feelers:j?'tentacles':'none',translucency:j?.9:.2,bubbles:1,props:[{id:j?'sunhat':'tophat'}]}));
for(const kind of ['horse','wolf'])for(const preset of G.PRESETS)for(let j=0;j<2;j++){
 const base=Q.Creature.kindRecipe(kind),patch=Object.fromEntries(Q.Creature.slidersFor(base).map((s,i)=>[s.key,(i+j)%2?(s.natural?.[1]??s.max):(s.natural?.[0]??s.min)]));
 const r=Q.Creature.normalizeRecipe({...base,...patch,size:1,gear:G.presetGear(preset.id,kind)});add('gear-'+kind+'-'+preset.id+'-'+j,'gear',r);
}
return rows;
}
module.exports={inventory};

// Run through codex-check; fresh four-case children bound fitting/atlas caches.
async function run(){
 const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),crypto=require('node:crypto');
 const opt=(key,fallback)=>process.argv.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3)??fallback;
 const out=path.resolve(opt('out','scratchpad/deep-character-audit/geometry-final')),start=Number(opt('start','-1')),cases=inventory();
 if(process.env.CODEX_CHECK_ACTIVE!=='1')throw Error('Use /home/doug/.local/bin/codex-check node '+__filename);
 fs.mkdirSync(out,{recursive:true});
 if(start<0){
  fs.writeFileSync(path.join(out,'fixtures.json'),JSON.stringify(cases,null,2));
  for(let i=0;i<cases.length;i+=4){const r=spawnSync(process.execPath,['--max-old-space-size=1024',__filename,'--out='+out,'--start='+i],{stdio:'inherit',env:process.env});if(r.status!==0)throw Error('Geometry batch '+i+' failed: '+(r.signal||r.status));}
  const records=fs.readdirSync(out).filter(f=>/^report-\d+\.json$/.test(f)).flatMap(f=>JSON.parse(fs.readFileSync(path.join(out,f))).records);
  const summary={cases:records.length,failed:records.filter(r=>r.error||r.issues?.length).length,generated:new Date().toISOString()};
  fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));console.log(summary);if(summary.failed)process.exitCode=1;return;
 }
 const pack=await Q.Body.loadPack(),{PNG}=require('pngjs'),eyeSource=PNG.sync.read(fs.readFileSync(path.resolve(__dirname,'../../src/forge/Character3D/data/eye-brown.png')));
 const folder=path.resolve(__dirname,'../../src/forge/Character3D'),sourceHashes=Object.fromEntries(fs.readdirSync(folder).filter(f=>/\.(js|cjs)$/.test(f)).map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,f))).digest('hex')]));
 const records=[];
 for(const f of cases.slice(start,start+4))try{const b=Q.Model.build(pack,f.recipe,{}, {quality:'preview',static:true,skinSize:64,atlasSize:128,hairBudget:.25,eyeSource});records.push({id:f.id,entity:f.entity,profile:f.profile,...Q.inspect(b,f,pack)});}catch(error){records.push({id:f.id,error:String(error.stack||error)});}
 fs.writeFileSync(path.join(out,'report-'+start+'.json'),JSON.stringify({sourceHashes,records},null,2));if(start%32===0)console.log(start,'/',cases.length,records.filter(r=>r.error||r.issues?.length).map(r=>({id:r.id,error:r.error,issues:r.issues})));
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
