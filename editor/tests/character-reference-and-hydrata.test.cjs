'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const Q=require('./helpers/character-quality-matrix.cjs'),Cloth=require('../src/forge/Character3D/CharacterCloth.js'),Poses=require('../src/forge/Character3D/CharacterPoses.js');
const hash=a=>crypto.createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const bounds=p=>{const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<p.positions.length;i+=3)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p.positions[i+k]);hi[k]=Math.max(hi[k],p.positions[i+k]);}return {lo,hi};};

test('fly antennae clear both eye lenses at contrasting natural head and eye sizes',()=>{
 for(const headSize of [.7,1,1.4])for(const eyeSize of [.7,1.5]){
  const r=Q.Creature.normalizeRecipe({...Q.Creature.kindRecipe('fly'),headSize,eyeSize,antennaLength:1.5}),b=Q.Creature.build(r,{quality:'preview'}),antennae=b.parts.find(p=>p.name==='Antennae');
  for(const eye of b.parts.filter(p=>p.name.startsWith('Compound eye ')&&!p.name.includes('facets'))){
   const {lo,hi}=bounds(eye),center=lo.map((x,k)=>(x+hi[k])/2),radius=lo.map((x,k)=>(hi[k]-x)/2);
   for(let i=0;i<antennae.positions.length;i+=3){const distance=center.reduce((n,x,k)=>n+((antennae.positions[i+k]-x)/radius[k])**2,0);assert.ok(distance>1.001,'antenna outside lens: '+headSize+'/'+eyeSize);}
  }
  assert.ok(b.parts.some(p=>p.name==='Sponging labium and labella'));
 }
});

test('tick has a low oval body, fitted dorsal shield and eight articulated legs',()=>{
 const b=Q.Creature.build(Q.Creature.kindRecipe('tick'),{quality:'preview'}),body=bounds(b.parts.find(p=>p.name==='Body')),shield=bounds(b.parts.find(p=>p.name==='Dorsal shield'));
 assert.ok((body.hi[1]-body.lo[1])/(body.hi[0]-body.lo[0])<.4);
 assert.ok(shield.lo[0]>body.lo[0]&&shield.hi[0]<body.hi[0]);
 assert.ok(shield.hi[1]<body.hi[1]+.003);
 assert.equal(b.bones.filter(x=>x.role==='legUpper').length,8);
 assert.ok(b.parts.some(p=>p.name==='Ventral plates and spiracles'));
 assert.ok(!b.parts.some(p=>p.name==='Antennae'));
});

test('cat breeds round trip with distinct proportions, coat patterns and bounded sound geometry',()=>{
 const type=Q.Creature.variantsFor(Q.Creature.kindRecipe('cat'))[0];assert.equal(type.key,'catType');assert.equal(type.choices.length,7);
 const summaries={};
 for(const [id]of type.choices){
  const r=Q.Creature.withVariant(Q.Creature.kindRecipe('cat'),'catType',id);assert.deepEqual(Q.Model.normalize(JSON.parse(JSON.stringify(r))),r);
  for(const quality of ['preview','save']){
   const b=Q.Creature.build(r,{quality}),checked=Q.inspect(b,{recipe:r});assert.deepEqual(checked.issues,[],id+'/'+quality);assert.ok(checked.summary.triangles<100000,id+' triangles '+checked.summary.triangles);assert.ok(b.parts.some(p=>p.name==='Whiskers'));summaries[id]=checked.summary;
  }
 }
 assert.ok(summaries.maineCoon.height>summaries.persian.height*1.2);
 const ragdoll=Q.Creature.withVariant(Q.Creature.kindRecipe('cat'),'catType','ragdoll');assert.equal(ragdoll.pattern,'points');assert.notEqual(ragdoll.colors.eye,Q.Creature.kindRecipe('cat').colors.eye);
});

test('Hydrata has two complete heads and animated neck roots sewn to the body',async()=>{
 const pack=await Q.Body.loadPack();
 for(const gender of [0,1]){
  const r=Q.Model.normalize({...Q.Model.withSpecies({},'hydrata'),gender}),b=Q.Model.build(pack,r,{}, {quality:'preview',skinSize:64,atlasSize:64}),checked=Q.inspect(b,{recipe:r},pack);
  assert.deepEqual(checked.issues,[]);assert.equal(r.head.heads,2);assert.ok(!b.parts.some(p=>p.name==='Head Body'||p.name==='Eyes'));
  const body=b.parts.find(p=>p.name==='Body'),bodyVertices=new Map();for(let i=0;i<body.positions.length;i+=3)bodyVertices.set([0,1,2].map(k=>body.positions[i+k].toFixed(6)).join(','),i);
  for(const side of ['Left','Right']){
   const neck=b.parts.find(p=>p.name==='Head '+side+' neck'),skull=b.parts.find(p=>p.name==='Head '+side+' Body'),head=b.bones.findIndex(x=>x.name==='Hydrata'+side+'Head');assert.ok(neck&&skull);assert.equal(b.bones[head].motionSource,'Head');
   const shared=[];for(let i=0;i<neck.positions.length;i+=3){const at=bodyVertices.get([0,1,2].map(k=>neck.positions[i+k].toFixed(6)).join(','));if(at!==undefined)shared.push([i,at]);}assert.ok(shared.length>=20,'collar has shared body vertices');
   for(const motion of ['walk','run','jump']){
    const clip=Poses.clip(b.bones,motion,body);assert.ok(clip,motion);assert.ok(clip.tracks.some(t=>t.bone===head),'second head follows source head motion');
    for(let frame=0;frame<=12;frame++){
     const pose=Cloth.pose(b.bones,clip,clip.times.at(-1)*frame/12),a=Cloth.skin(neck,b.bones,pose),c=Cloth.skin(body,b.bones,pose);
     for(const [i,j]of shared)assert.ok(Math.hypot(...[0,1,2].map(k=>a[i+k]-c[j+k]))<2e-6,side+'/'+motion+' neck stays attached');
    }
   }
  }
  const glb=await Q.Model.toGlb(b,'Hydrata',()=>new Uint8Array([137,80,78,71])),n=new DataView(glb.buffer,glb.byteOffset).getUint32(12,true),json=JSON.parse(Buffer.from(glb.subarray(20,20+n)).toString());
  for(const side of ['Left','Right']){const node=json.nodes.findIndex(x=>x.name==='Hydrata'+side+'Head');assert.ok(node>=0);assert.ok(json.animations.some(a=>a.channels.some(c=>c.target.node===node)));}
 }
});

test('Hydrata and cat breeds match the actual Node worker',async t=>{
 const {PreviewWorker}=require('../src/forge/Character3D/CharacterPreviewWorker.cjs'),worker=new PreviewWorker();t.after(()=>worker.dispose());worker.configure({});const pack=await Q.Body.loadPack();
 for(const r of [Q.Model.withSpecies({},'hydrata'),Q.Creature.withVariant(Q.Creature.kindRecipe('cat'),'catType','maineCoon')]){
  const options={quality:'preview',skinSize:64,atlasSize:64},expected=Q.Model.build(r.plan==='human'?pack:null,r,{},options),actual=await worker.build({key:r.species||r.catType,recipe:r,options});assert.equal(actual.parts.length,expected.parts.length);
  expected.parts.forEach((p,i)=>{assert.equal(hash(actual.parts[i].positions),hash(p.positions),p.name);assert.equal(hash(actual.parts[i].normals),hash(p.normals),p.name+' normals');});
 }
});

test('cat type labels and Hydrata have explicit translations in every supported locale',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),scope={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/I18nReviewedTranslations.js'),'utf8'),scope);
 const labels=['Hydrata','Cat type',...Q.Creature.variantsFor(Q.Creature.kindRecipe('cat'))[0].choices.map(c=>c[1])];
 for(const [locale,catalog]of Object.entries(scope.RR_REVIEWED_TRANSLATIONS.text))for(const label of labels)assert.ok(typeof catalog[label]==='string'&&catalog[label].length>0,locale+'/'+label);
});

test('single-head equipment cannot replace or float between Hydrata heads',async()=>{
 const base=Q.Model.withSpecies({},'hydrata'),r=Q.Model.normalize({...base,outfit:[{id:'greathelm'},{id:'tshirt'}],props:[{id:'cap'},{id:'glasses'},{id:'backpack'}]});
 assert.deepEqual(r.outfit.map(x=>x.id),['tshirt']);assert.deepEqual(r.props.map(x=>x.id),['backpack']);
 assert.equal(Q.Model.fitsGarment(r,'greathelm'),false);assert.equal(Q.Model.fitsProp(r,'cap'),false);
 const dragon=Q.Model.normalize({...Q.Model.withSpecies({},'dragonborn'),outfit:[{id:'greathelm'}],props:[{id:'cap'}]});assert.equal(dragon.outfit.length,1);assert.equal(dragon.props.length,1);
 const b=Q.Model.build(await Q.Body.loadPack(),{...base,outfit:[{id:'greathelm'},{id:'tshirt'}],props:[{id:'cap'}]}, {}, {quality:'preview',static:true,skinSize:64});
 for(const side of ['Left','Right']){assert.ok(b.parts.some(p=>p.name==='Head '+side+' Body'));assert.ok(b.parts.some(p=>p.name==='Head '+side+' neck'));}
 assert.deepEqual(Q.inspect(b,{recipe:b.recipe}).issues,[]);
});
