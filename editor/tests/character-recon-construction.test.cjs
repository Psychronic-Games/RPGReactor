'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Q=require('./helpers/character-quality-matrix.cjs'),W=require('../src/forge/Character3D/CharacterWardrobe.js'),Cloth=require('../src/forge/Character3D/CharacterCloth.js'),Poses=require('../src/forge/Character3D/CharacterPoses.js');
let pack;test.before(async()=>{pack=await Q.Body.loadPack();});
const make=patch=>Q.Model.build(pack,{gender:1,hair:{style:'bald'},outfit:W.PRESETS.find(p=>p.id==='reconTeam').items,...patch},{},{quality:'preview',static:true,skinSize:32,atlasSize:128,eyeSource:{width:1,height:1,data:Uint8Array.of(90,65,45,255)}});
test('recon equipment has a textile carrier, enclosed curved knee cups and supported webbing',()=>{
 for(const patch of [{gender:1},{gender:0},{gender:0,weight:1.8,cup:1.8}]){
  const r=make(patch),s=r.height/1.7,p=r.parts.find(p=>p.name==='Recon knee shells');
  assert.deepEqual(Q.inspect(r,{recipe:r.recipe},pack).issues,[],JSON.stringify(patch));
  const edges=new Map();for(let i=0;i<p.index.length;i+=3)for(let j=0;j<3;j++){const a=p.index[i+j],b=p.index[i+(j+1)%3],key=Math.min(a,b)+':'+Math.max(a,b);edges.set(key,(edges.get(key)||0)+1);}
  assert.ok([...edges.values()].every(n=>n===2),'knee cups have closed backs and cut edges');
  for(const side of ['Left','Right']){
   const joint=r.bones.findIndex(b=>b.name===side+'Leg'),depth=[];for(let v=0;v<p.positions.length/3;v++)if(p.joints[v*4]===joint)depth.push(p.positions[v*3+2]);
   assert.ok(depth.length>100,'knee cup follows the lower leg');assert.ok(Math.max(...depth)-Math.min(...depth)>.025*s,'cup has depth across the knee');
  }
  const carrier=r.parts.find(p=>p.name==='Recon textile carrier');assert.ok(carrier.index.length>1500);assert.equal(carrier.normalTexture,'recon-textile-normal.png');assert.ok(r.textures[carrier.normalTexture].repeat);
 }
});
test('recon knee cups stay near the trousers while walking, sitting and kneeling',()=>{
 const r=make({gender:1}),s=r.height/1.7,p=r.parts.find(p=>p.name==='Recon knee shells'),fabric=r.parts.filter(p=>p.texture==='outfit.png');
 const report=[];
 for(const id of ['walk','sit','kneel']){
  const c=Poses.clip(r.bones,id,r.parts[0]),pose=Cloth.pose(r.bones,c,c.times.at(-1)*.5),knees=Cloth.skin(p,r.bones,pose),surfaces=fabric.map(p=>Cloth.skin(p,r.bones,pose));let worst=0;
  for(let v=0;v<knees.length/3;v+=19){const x=knees[v*3],y=knees[v*3+1],z=knees[v*3+2];let near=Infinity;
   for(const P of surfaces)for(let i=0;i<P.length;i+=3){if(Math.abs(P[i+1]-y)>.08*s)continue;near=Math.min(near,Math.hypot(P[i]-x,P[i+1]-y,P[i+2]-z));}worst=Math.max(worst,near);
  }
  report.push(id+':'+worst.toFixed(4));assert.ok(worst<.045*s,'cup floats from trousers: '+report.join(', '));
 }
});
test('the textile carrier stays outside its jacket on ordinary and fuller bodies',()=>{
 const O=require('../src/forge/Character3D/CharacterOutfit.js');
 for(const patch of [{gender:1},{gender:0,weight:1.8,cup:1.8}]){
  const r=make(patch),p=r.parts.find(p=>p.name==='Recon textile carrier'),fabric=r.parts.filter(p=>p.texture==='outfit.png'),surface=O.projectedSurface(fabric);
  const torso=new Set(['Hips','Spine','Spine1','Spine2'].map(name=>r.bones.findIndex(b=>b.name===name)));let checked=0,buried=0,remote=0;
  for(let i=0;i<p.index.length;i+=27){
   const ids=Array.from(p.index.subarray(i,i+3));if(!ids.every(v=>torso.has(p.joints[v*4])))continue;
   const nz=ids.reduce((s,v)=>s+p.normals[v*3+2],0)/3;if(Math.abs(nz)<.55)continue;
   const [x,y,z]=[0,1,2].map(k=>ids.reduce((s,v)=>s+p.positions[v*3+k],0)/3),front=surface.sample(x,y),back=surface.sample(x,y,-1);
   if(!front||!back)continue;checked++;
   if(z<front.depth-.004&&z>back.depth+.004)buried++;
   if(Math.min(Math.abs(z-front.depth),Math.abs(z-back.depth))>.05*r.height/1.7)remote++;
  }
  assert.ok(checked>100,'sample both carrier panels and the waist');assert.equal(buried,0,'carrier crosses its fabric on '+JSON.stringify(patch));assert.equal(remote,0,'carrier leaves its fabric on '+JSON.stringify(patch));
 }
});
test('recon exports the textile carrier, formed knee cups and their repeating finish maps',async()=>{
 const r=make({gender:0}),{PNG}=require('pngjs'),Optimizer=require('../src/utils/GlbOptimizer.js');
 const bytes=await Q.Model.toGlb(r,'Recon',t=>{
  const p=new PNG({width:t.width,height:t.height});p.data=Buffer.from(t.data);return new Uint8Array(PNG.sync.write(p));
 });
 const {json}=Optimizer.parseGlb(bytes);
 for(const name of ['Recon textile carrier','Recon knee shells']){
  const m=json.meshes.find(m=>m.name===name),p=m?.primitives[0];assert.ok(p,name+' exported');
  assert.ok(p.attributes.JOINTS_0!=null&&p.attributes.WEIGHTS_0!=null&&p.attributes.TEXCOORD_0!=null,name+' skin and UVs');
  const material=json.materials[p.material];assert.ok(material.normalTexture&&material.pbrMetallicRoughness.metallicRoughnessTexture,name+' relief and finish');
  for(const texture of [material.normalTexture,material.pbrMetallicRoughness.metallicRoughnessTexture]){
   const sampler=json.samplers[json.textures[texture.index].sampler];assert.equal(sampler?.wrapS??10497,10497);assert.equal(sampler?.wrapT??10497,10497);
  }
 }
 assert.ok(json.images.some(i=>i.name==='recon-textile-normal.png'));
});
