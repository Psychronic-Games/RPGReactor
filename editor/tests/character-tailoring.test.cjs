'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Body=require('../src/forge/Character3D/HumanBody.js'),Clothes=require('../src/forge/Character3D/CharacterClothes.js');
const Model=require('../src/forge/Character3D/CharacterModel.js'),Cloth=require('../src/forge/Character3D/CharacterCloth.js'),Poses=require('../src/forge/Character3D/CharacterPoses.js');
const Wardrobe=require('../src/forge/Character3D/CharacterWardrobe.js');
const Outfit=require('../src/forge/Character3D/CharacterOutfit.js');
const profiles=require('./quality/character-outfit-accessory-quality.cjs').FRESH_PROFILES;
let pack;test.before(async()=>{pack=await Body.loadPack();});

// Intersect the rendered faces, rather than accepting a cloth vertex that
// clears its binding while the middle of the triangle still cuts the body.
function faceAt(P,I,x,y,side){
 let hit=side>0?-Infinity:Infinity;
 for(let t=0;t<I.length;t+=3){
  const[a,b,c]=[I[t]*3,I[t+1]*3,I[t+2]*3],d=(P[b+1]-P[c+1])*(P[a]-P[c])+(P[c]-P[b])*(P[a+1]-P[c+1]);if(Math.abs(d)<1e-12)continue;
  const u=((P[b+1]-P[c+1])*(x-P[c])+(P[c]-P[b])*(y-P[c+1]))/d,v=((P[c+1]-P[a+1])*(x-P[c])+(P[a]-P[c])*(y-P[c+1]))/d;if(u<0||v<0||u+v>1)continue;
  const z=P[a+2]*u+P[b+2]*v+P[c+2]*(1-u-v);hit=side>0?Math.max(hit,z):Math.min(hit,z);
 }return hit;
}

test('modeled shirt and uniform faces cover the front and back of broad torsos without relying on their lining',()=>{
 const clothes=Clothes.load(pack);let samples=0;
 for(const profile of profiles.filter(p=>['barrel-male','pear-female'].includes(p.id))){
  const built=Body.build(pack,Body.normalizeRecipe(profile.patch)),body=built.parts[0],hip=built.bones.find(b=>b.name==='Hips').head[1],neck=built.bones.find(b=>b.name==='Neck').head[1];
  for(const id of ['mh_tee_jeans','mh_uniform']){
   const garment=clothes.garments.get(id),positions=Body.gather(Clothes.fit(pack,built,garment,{}),garment.source,3);
   for(let y=hip+.04;y<neck-.10;y+=.025)for(const x of [-.15,0,.15])for(const side of [-1,1]){
    const skin=faceAt(body.positions,body.index,x,y,side),cloth=faceAt(positions,garment.indexRaw,x,y,side);if(!Number.isFinite(skin))continue;
    assert.ok(Number.isFinite(cloth),profile.id+'/'+id+' missing torso face');
    assert.ok((cloth-skin)*side>.001,profile.id+'/'+id+' torso crossing at '+JSON.stringify({x,y,side,skin,cloth}));samples++;
   }
  }
 }assert.ok(samples>200,'both surfaces and multiple torso heights are covered');
});

test('the broad-body skin-topology fitting path keeps the back of a coat outside its shirt and trousers',()=>{
 let samples=0;const failures=[];
 for(const profile of profiles.filter(p=>['barrel-male','pear-female'].includes(p.id))){
  const result=Model.build(pack,Model.normalize({age:35,height:.5,...profile.patch,outfit:Wardrobe.PRESETS.find(p=>p.id==='prince').items,hair:{style:'bald'}}),{},{static:true,skinSize:64,atlasSize:64,hairBudget:0});
  assert.ok(result.cloth?.regions.some(g=>g.kind==='skirt'),profile.id+' fitted coat retains its free-tail cloth rig');
  const hip=result.bones.find(b=>b.name==='Hips').head[1],neck=result.bones.find(b=>b.name==='Neck').head[1],outer=result.parts.filter(p=>p.name.startsWith('Long coat')),inner=result.parts.filter(p=>/Button shirt|Leggings/.test(p.name));
  const body=result.built.parts[0].positions;
  for(const axis of [0,2]){let lo=Infinity,hi=-Infinity;for(let v=axis;v<body.length;v+=3){lo=Math.min(lo,body[v]);hi=Math.max(hi,body[v]);}
   for(const p of outer)for(let v=axis;v<p.positions.length;v+=3)assert.ok(p.positions[v]>lo-result.built.height*.15&&p.positions[v]<hi+result.built.height*.15,profile.id+' coat stretched outside its fitted outline '+JSON.stringify({part:p.name,axis,value:p.positions[v],lo,hi,height:result.built.height}));
  }
  for(let y=hip+.12;y<neck-.12;y+=.015)for(const x of [-.3,-.15,0,.15,.3]){
   const under=Math.min(...inner.map(p=>faceAt(p.positions,p.index,x,y,-1)));if(!Number.isFinite(under))continue;
   const coat=Math.min(...outer.map(p=>faceAt(p.positions,p.index,x,y,-1)));if(!(coat<under-.001))failures.push({profile:profile.id,x,y,coat,under});samples++;
  }
 }assert.equal(failures.length,0,'rear coat crossings: '+JSON.stringify(failures));assert.ok(samples>100,'checks the rear waist and surrounding torso between cloth vertices');
});

test('closed native outfits cover the shaped torso through broad shoulders and hanging body folds',()=>{
 let samples=0;const failures=[];
 for(const profile of profiles.filter(p=>['barrel-male','pear-female'].includes(p.id))){
  const built=Body.build(pack,Body.normalizeRecipe(profile.patch)),body=built.parts[0],an=Outfit.anatomy(pack),index=[],hip=built.bones.find(b=>b.name==='Hips').head[1],neck=built.bones.find(b=>b.name==='Neck').head[1];
  for(let t=0;t<body.index.length;t+=3){const ids=Array.from(body.index.subarray(t,t+3));if(ids.every(v=>an.member[pack.body.source[v]*5]>.5))index.push(...ids);}
  for(const id of ['robe','techSuit']){const worn=Wardrobe.build(pack,built,[{id}],{atlasSize:64});
   for(let y=hip-.12;y<neck-.08;y+=.035)for(const x of [-.3,-.15,0,.15,.3])for(const direction of [-1,1]){
    const skin=faceAt(body.positions,index,x,y,direction);if(!Number.isFinite(skin))continue;
    const cloth=direction>0?Math.max(...worn.parts.map(p=>faceAt(p.positions,p.index,x,y,direction))):Math.min(...worn.parts.map(p=>faceAt(p.positions,p.index,x,y,direction)));
    if(!Number.isFinite(cloth)||(cloth-skin)*direction<=.001)failures.push({profile:profile.id,id,x,y,direction,skin,cloth});samples++;
   }
  }
 }assert.equal(failures.length,0,'closed garment torso gaps: '+JSON.stringify(failures));assert.ok(samples>200);
});

test('fitted trousers retain separate, covered upper thighs on broad bodies',()=>{
 let samples=0;
 for(const profile of profiles.filter(p=>['barrel-male','pear-female'].includes(p.id))){
  const built=Body.build(pack,Body.normalizeRecipe(profile.patch)),body=built.parts[0],worn=Wardrobe.build(pack,built,[{id:'leggings'}],{atlasSize:64}),hip=built.bones.find(b=>b.name==='Hips').head[1];
  const an=Outfit.anatomy(pack);
  for(const [side,family]of [['Left',3],['Right',4]]){const leg=built.bones.find(b=>b.name===side+'UpLeg').head,index=[];
   // Trace the thigh itself; a hanging belly can lie in front of a trouser
   // leg without being part of the skin that the trousers should cover.
   for(let t=0;t<body.index.length;t+=3){const ids=Array.from(body.index.subarray(t,t+3));if(ids.every(v=>an.member[pack.body.source[v]*5+family]>.4))index.push(...ids);}
   for(let y=hip-.06;y>hip-.30;y-=.03)for(const x of [leg[0]-.025,leg[0],leg[0]+.025])for(const direction of [-1,1]){
    const skin=faceAt(body.positions,index,x,y,direction),cloth=direction>0?Math.max(...worn.parts.map(p=>faceAt(p.positions,p.index,x,y,direction))):Math.min(...worn.parts.map(p=>faceAt(p.positions,p.index,x,y,direction)));if(!Number.isFinite(skin))continue;
    assert.ok(Number.isFinite(cloth)&&(cloth-skin)*direction>.001,profile.id+' uncovered upper thigh '+JSON.stringify({x,y,direction,skin,cloth}));samples++;
   }
  }
 }assert.ok(samples>100);
});

test('joined robes keep a stable rear waist lining while broad bodies walk and sit',()=>{
 let samples=0;
 for(const profile of profiles.filter(p=>['barrel-male','pear-female'].includes(p.id))){
  const built=Body.build(pack,Body.normalizeRecipe({age:35,height:.5,...profile.patch})),body=built.parts[0],an=Outfit.anatomy(pack),index=[];
  for(let t=0;t<body.index.length;t+=3){const ids=Array.from(body.index.subarray(t,t+3));if(ids.every(v=>{const o=pack.body.source[v]*5;return Math.max(an.member[o+1],an.member[o+2])<.2&&an.s[o]>-2&&an.s[o]<1.8;}))index.push(...ids);}
  const worn=Wardrobe.build(pack,built,[{id:'robe',bell:.3}],{atlasSize:64}),lining=worn.parts.filter(p=>p.name.includes('lining'));assert.ok(lining.length);
  for(const id of ['walk','sit','kneel']){
   const clip=Poses.clip(built.bones,id,body),pose=Cloth.pose(built.bones,clip,clip.times.at(-1)*(id==='walk'?.25:.5)),skin=Cloth.skin(body,built.bones,pose),surfaces=lining.map(p=>[Cloth.skin(p,built.bones,pose),p.index]),hip=pose.P[built.bones.findIndex(b=>b.name==='Hips')][1];
   for(let y=hip-.28;y<hip+.17;y+=.035)for(const x of [-.3,-.15,0,.15,.3])for(const side of [-1]){
    const hit=faceAt(skin,index,x,y,side);if(!Number.isFinite(hit))continue;
    const cloth=Math.min(...surfaces.map(([p,i])=>faceAt(p,i,x,y,side)));
    assert.ok(Number.isFinite(cloth)&&(cloth-hit)*side>.001,profile.id+'/'+id+' exposed lower torso '+JSON.stringify({x,y,side,hit,cloth}));samples++;
   }
  }
 }assert.ok(samples>50,'samples the actual posed waist surfaces');
});

test('rolled garment edges stay on their fabric through rest draping, grounding and a seated pose',()=>{
 const result=Model.build(pack,Model.normalize({outfit:[{id:'robe'},{id:'boots'}],hair:{style:'bald'}}),{},{static:true,skinSize:64,atlasSize:64,hairBudget:0});
 const trim=result.parts.find(p=>p.name==='Sewn garment edges');assert.ok(trim&&result.cloth);
 const fabric=result.parts.filter(p=>p.fabricRefs),refs=new Map();
 for(const p of fabric)for(let v=0;v<p.positions.length/3;v++){
  refs.set(p.fabricRefs[v*2]+':'+p.fabricRefs[v*2+1],[p,v]);
 }
 const raw=Poses.clip(result.bones,'sit',result.parts.find(p=>p.name==='Body')),clip=Cloth.bake(result,raw,{quality:'preview'}),pose=Cloth.pose(result.bones,clip,clip.times.at(-1)*.5),posed=Cloth.skin(trim,result.bones,pose),cache=new Map();let checked=0,moving=0;
 for(let v=0;v<trim.positions.length/3;v+=6){
  const best=refs.get(trim.sewnRefs[v*2]+':'+trim.sewnRefs[v*2+1]);assert.ok(best,'exact owning fabric vertex exists');const[p,i]=best;
  const distance=Math.hypot(...[0,1,2].map(k=>trim.positions[v*3+k]-p.positions[i*3+k]));assert.ok(distance<.003,'rolled edge detached from fabric at rest: '+distance);
  if(!cache.has(p))cache.set(p,Cloth.skin(p,result.bones,pose));const target=cache.get(p),d=Math.hypot(...[0,1,2].map(k=>posed[v*3+k]-target[i*3+k]));
  assert.ok(d<.004,'rolled edge detached in seated pose: '+d);
  if(Array.from(trim.joints.subarray(v*4,v*4+4)).some(j=>result.bones[j]?.cloth))moving++;checked++;
 }
 assert.ok(checked>100&&moving>30,'checks the free hem as well as cuffs and collar');
});

test('background cloth baking retains sewn-detail collision probes and matches direct baking',async t=>{
 const result=Model.build(pack,Model.normalize({outfit:[{id:'robe',length:.83},{id:'boots'}],hair:{style:'bald'}}),{},{static:true,skinSize:64,atlasSize:64,hairBudget:0});
 const raw=Poses.clip(result.bones,'walk',result.parts.find(p=>p.name==='Body')),copy=structuredClone(result);copy.cloth.key+=':direct-comparison';
 const expected=Cloth.bake(copy,raw,{quality:'preview'}),saved=new Map(['Worker','document','postMessage'].map(k=>[k,global[k]]));let payload,instance;
 t.after(()=>{for(const[k,v]of saved){if(v===undefined)delete global[k];else global[k]=v;}});
 global.document={};global.Worker=class{
  constructor(){instance=this;}
  postMessage(message){const cloned=structuredClone(message);if(cloned.build)payload=cloned.build;queueMicrotask(()=>Cloth._serve(cloned));}
  terminate(){}
 };
 global.postMessage=message=>instance.onmessage({data:message});
 const actual=await Cloth.bakeAsync(result,raw,{quality:'preview'});
 assert.ok(payload,'background build message was used');
 assert.equal(payload.parts.filter(p=>p?.sewnRoots).length,result.parts.filter(p=>p.sewnRoots).length,'all sewn-detail probes reach the background solver');
 assert.deepEqual(actual.tracks,expected.tracks,'the saved and background paths produce the same cloth keys');
});
