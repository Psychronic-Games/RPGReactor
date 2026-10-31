#!/usr/bin/env node
/** Catalog-wide clothing inspection. Run through codex-check, one browser/four garments at a time. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),W=require('../../src/forge/Character3D/CharacterWardrobe.js'),G=require('../../src/forge/Props/GarmentProp.js');
const opt=(name,fallback)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3)||fallback;
const out=path.resolve(opt('out','scratchpad/clothing-audit-20261030/current'));
const wanted=opt('ids','').split(',').filter(Boolean),list=W.GARMENTS.filter(g=>G.supports(g.id)&&(!wanted.length||wanted.includes(g.id))).slice(0,Number(opt('limit','10000')));
fs.mkdirSync(out,{recursive:true});
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const sources=Object.fromEntries(['CharacterOutfit','CharacterWardrobe','CharacterGarmentDetails','CharacterAtlas','CharacterFabric','CharacterDrape','CharacterClothes','CharacterOutfitTransfer','CharacterCyberwear','CharacterWasteland','ConstructionPatterns'].map(name=>['editor/src/forge/Character3D/'+name+'.js',sha('editor/src/forge/Character3D/'+name+'.js')]));
for(const file of ['editor/src/forge/Props/GarmentProp.js','editor/src/forge/Props/PropArmorInterior.js'])sources[file]=sha(file);
function measurements(p){
 const P=p.positions,N=p.normals,I=p.index,U=p.uvs1||p.uvs,edges=new Map();let degenerate=0,opposed=0,collapsedUV=0;
 for(let t=0;t<I.length;t+=3){const a=I[t],b=I[t+1],c=I[t+2],u=[0,1,2].map(k=>P[b*3+k]-P[a*3+k]),v=[0,1,2].map(k=>P[c*3+k]-P[a*3+k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],area=Math.hypot(...n);
  if(area<1e-12)degenerate++;else if(N&&n.reduce((s,x,k)=>s+x*(N[a*3+k]+N[b*3+k]+N[c*3+k]),0)<-area*.15)opposed++;
  if(U&&area>1e-9&&Math.abs((U[b*2]-U[a*2])*(U[c*2+1]-U[a*2+1])-(U[c*2]-U[a*2])*(U[b*2+1]-U[a*2+1]))<1e-10)collapsedUV++;
  for(const [x,y] of [[a,b],[b,c],[c,a]]){const key=Math.min(x,y)+','+Math.max(x,y);edges.set(key,(edges.get(key)||0)+1);}
 }
 const finite=['positions','normals','weights','uvs','uvs1'].every(k=>!p[k]||p[k].every(Number.isFinite));
 return {name:p.name,triangles:I.length/3,vertices:P.length/3,degenerate,opposed,collapsedUV,boundaryEdges:[...edges.values()].filter(n=>n===1).length,finite,lining:!!p.rrLining,fabric:p.fabric||null,textured:!!p.texture,relief:!!p.normalTexture,secondaryUV:!!p.uvs1};
}
async function child(args){const result=spawn(process.execPath,args,{cwd:root,env:{...process.env,NODE_OPTIONS:(process.env.NODE_OPTIONS||'')+' --max-old-space-size=1024'},stdio:'inherit'});await new Promise((resolve,reject)=>{result.once('error',reject);result.once('exit',code=>code===0?resolve():reject(Error('Native batch exited '+code)));});}
(async()=>{
 const rows=[],batchSize=Math.max(1,Math.min(4,Number(opt('batch-size','4'))||4));
 const mergeTail=opt('merge-tail','');
 if(mergeTail){
  const prior=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8')),tailFolder=path.resolve(mergeTail),tail=JSON.parse(fs.readFileSync(path.join(tailFolder,'manifest.json'),'utf8'));
  if(JSON.stringify(prior.sources)!==JSON.stringify(sources)||JSON.stringify(tail.sources)!==JSON.stringify(sources))throw Error('Cannot merge captures from different source snapshots');
  const replacements=new Map(tail.rows.map(r=>[r.id,{...r,folder:path.relative(out,path.join(tailFolder,r.folder))}])),existing=new Map(prior.rows.map(r=>[r.id,r]));
  for(const g of list){const row=replacements.get(g.id)||existing.get(g.id);if(!row)throw Error('Missing captured garment '+g.id);rows.push(row);}
 }else if(!process.argv.includes('--native')){
  globalThis.RR_CYBERWEAR_STRICT=true;globalThis.RR_DETAILS_STRICT=true;await G.prepare();
  for(const g of list){const start=performance.now();try{
   const result=G.build({garment:{id:g.id}},{atlasSize:2048}),parts=result.parts.map(measurements);
   if(parts.some(p=>!p.finite))throw Error('Non-finite garment buffers');
   for(const p of result.parts){
    for(const key of ['texture','normalTexture','metallicRoughnessTexture','occlusionTexture','emissiveTexture'])if(p[key]&&!result.textures[p[key]])throw Error('Missing '+key+' on '+p.name);
    for(let v=0;v<p.positions.length/3;v++){let sum=0;for(let k=0;k<4;k++){if(p.joints[v*4+k]>=result.bones.length)throw Error('Out-of-range joint on '+p.name);sum+=p.weights[v*4+k];}if(Math.abs(sum-1)>.001)throw Error('Unnormalized skin weights on '+p.name);}
   }
   rows.push({id:g.id,label:g.label,slot:g.slot,group:g.group,transfer:g.transfer||null,modeled:!!g.modeled,triangles:result.triangles,parts,textureCount:Object.keys(result.textures).length,ms:Math.round(performance.now()-start)});
  }catch(error){rows.push({id:g.id,error:String(error.stack)});process.exitCode=1;}
   if(global.gc)global.gc();if(rows.length%10===0)console.log('Measured '+rows.length+'/'+list.length+' clothing defaults');
  }
 }else{
  for(let i=0,bi=0;i<list.length;bi++){
   const batch=[];let cap=batchSize;
   while(i<list.length&&batch.length<cap){const g=list[i],large=/^ss_(jolt|max)_/.test(g.id);if(large&&batch.length>=2)break;if(large)cap=Math.min(cap,2);batch.push(g);i++;}
   const folder=path.join(out,String(bi+1).padStart(2,'0'));
   const fresh=fs.existsSync(path.join(folder,'sources.json'))&&fs.readFileSync(path.join(folder,'sources.json'),'utf8')===JSON.stringify(sources);
   if(!process.argv.includes('--resume')||!fresh||!fs.existsSync(path.join(folder,'report.json'))){
    await child(['editor/tests/smoke/nw-prop-quality.cjs','--cases='+batch.map(g=>'garment:'+g.id).join(','),'--out='+folder,'--extra-views=true','--clothing-review=true',...(process.argv.includes('--details')?['--detail-views=true']:[]),...(process.argv.includes('--export')?['--export=true','--keep-exports=true']:[])]);
   }
   fs.writeFileSync(path.join(folder,'sources.json'),JSON.stringify(sources));
   const reports=JSON.parse(fs.readFileSync(path.join(folder,'report.json')));
   for(const g of batch){const report=reports.find(r=>r.id===g.id);if(!report)throw Error('Missing native garment '+g.id);rows.push({id:g.id,label:g.label,slot:g.slot,folder:path.relative(out,folder),triangles:report.triangles,errors:report.errors,sourceFingerprint:report.sourceFingerprint});}
   console.log('Captured '+rows.length+'/'+list.length+' clothing defaults');
   fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({sources,rows},null,2));
  }
 }
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({sources,rows},null,2));
 if(process.argv.includes('--native')||mergeTail){
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  fs.writeFileSync(path.join(out,'review.html'),`<!doctype html><meta charset="utf-8"><title>Clothing inspection</title><style>body{background:#20252d;color:#e3e9ef;font:16px system-ui}input{padding:8px;position:sticky;top:0}article{border-top:1px solid #6b7480;padding:12px}figure{display:inline-block;margin:4px;width:24%}img{width:100%}figcaption{font-size:12px}</style><h1>${rows.length} clothing defaults</h1><input placeholder="Find garment" oninput="for(const a of document.querySelectorAll('article'))a.hidden=!a.textContent.toLowerCase().includes(this.value.toLowerCase())">`+rows.map(r=>`<article><h2>${esc(r.label)} <small>${esc(r.id)}</small></h2>`+['front','back','inside','below','side',...(process.argv.includes('--details')?['detail-front','detail-back','detail-hem']:[])].map(view=>`<figure><a href="${r.folder}/${r.id}-${view}.png"><img loading="lazy" src="${r.folder}/${r.id}-${view}.png"></a><figcaption>${view}</figcaption></figure>`).join('')+'</article>').join(''));
 }
 console.log('Finished '+rows.length+' clothing defaults: '+out);
})().catch(error=>{console.error(error);process.exitCode=1;});
