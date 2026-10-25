'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const Q=require('./helpers/character-quality-matrix.cjs');
const hash=a=>crypto.createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');

test('clothing collar and sleeve cuts cannot become stretched animal-head neck joins',async()=>{
 const pack=await Q.Body.loadPack();
 for(const [id]of Q.Species.heads().filter(([id])=>id!=='human')){
  const r=Q.Model.normalize({...Q.Model.withSpecies({},'human'),headId:id,hair:{style:'bald'},outfit:[]}),bare=Q.Model.build(pack,r,{}, {quality:'preview',static:true,skinSize:128}),necks=bare.parts.filter(p=>/^Head .*neck$/.test(p.name));assert.equal(necks.length,id==='hydrata'?2:1,id);
  for(const outfit of [[{id:'tshirt'},{id:'shorts'}],[{id:'robe'}]]){
   const clothed=Q.Model.build(pack,{...r,outfit},{},{quality:'preview',static:true,skinSize:128});
   for(const neck of necks){const join=clothed.parts.find(p=>p.name===neck.name);assert.ok(join);assert.equal(hash(join.positions),hash(neck.positions),id+' neck follows the head cut independently of garment openings');assert.equal(hash(join.index),hash(neck.index));assert.equal(hash(join.weights),hash(neck.weights));}
  }
 }
});

test('shoulder-length Klingon locks clear a shirt without projecting out to its sleeves',async()=>{
 const pack=await Q.Body.loadPack(),r=Q.Model.normalize({...Q.Model.withSpecies({},'klingon'),gender:1,outfit:[{id:'tshirt'},{id:'shorts'}]}),b=Q.Model.build(pack,r,{}, {quality:'preview',static:true,skinSize:128}),hair=b.parts.find(p=>p.name==='Hair');assert.ok(hair);
 const head=b.bones.find(b=>b.name==='Head'),left=b.bones.find(b=>b.name==='LeftArm'),right=b.bones.find(b=>b.name==='RightArm');
 const limit=Math.max(Math.abs(left.head[0]),Math.abs(right.head[0]))*.9;let contacts=0;
 for(let i=0;i<hair.positions.length;i+=3)if(hair.positions[i+1]<head.head[1]){contacts++;assert.ok(Math.abs(hair.positions[i])<limit,'neck locks stay inside the shoulder line');}
 let longest=0;
 for(let f=0;f<hair.index.length;f+=3)for(let k=0;k<3;k++){const a=hair.index[f+k]*3,c=hair.index[f+(k+1)%3]*3;longest=Math.max(longest,Math.hypot(...[0,1,2].map(d=>hair.positions[a+d]-hair.positions[c+d])));}
 assert.ok(longest<.12,'no stretched sleeve-directed hair sheets');assert.ok(contacts>100);
});

test('closed helmets hide replacement animal faces and reopening the head slot restores them',async()=>{
 const pack=await Q.Body.loadPack(),options={quality:'preview',static:true,skinSize:64,hairBudget:.1},cache={};
 for(const species of ['wolffolk','catfolk','dragonborn']){
  const base=Q.Model.withSpecies({age:35},species);
  for(const id of ['powerhelm','greathelm','visorhelm']){
   const built=Q.Model.build(pack,{...base,outfit:[{id}]},cache,options);
   assert.ok(!built.parts.some(p=>p.name==='Head Body'||p.name.startsWith('Head Eye')),species+'/'+id+' muzzle and eyes stay behind the shell');
   assert.ok(built.parts.some(p=>p.name==='Head neck'),species+' neck still joins into the helmet');
  }
  for(const outfit of [[],[{id:'helm'}]]){
   const restored=Q.Model.build(pack,{...base,outfit},cache,options);
   assert.ok(restored.parts.some(p=>p.name==='Head Body'),species+' face returns with an open head slot');
  }
 }
});
