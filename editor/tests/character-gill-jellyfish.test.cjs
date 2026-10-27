'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const Q=require('./helpers/character-quality-matrix.cjs'),Cloth=require('../src/forge/Character3D/CharacterCloth.js');
const hash=a=>crypto.createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const key=(p,i)=>Array.from(p.positions.subarray(i*3,i*3+3)).join(':');

test('shark gill slits and bony-fish opercula are continuous sculpted skin with shared posed boundaries',()=>{
 for(const kind of ['shark','fish','anglerfish'])for(const quality of ['preview','save']){
  const recipe=Q.Creature.kindRecipe(kind),b=Q.Model.build(null,recipe,{},{quality}),body=b.parts.find(p=>p.name==='Body'),gill=b.parts.find(p=>p.name===(kind==='shark'?'Gill folds':'Operculum folds'));
  assert.ok(gill&&gill.index.length/3>1500,'regional skin geometry');assert.ok(!b.parts.some(p=>p.name==='Gills and facial detail'),'no raised black gill tubes');assert.deepEqual(Q.inspect(b,{recipe}).issues,[]);
  const vertices=new Map([...new Set(body.index)].map(i=>[key(body,i),i]));let shared=0;
  for(let i=0;i<gill.positions.length/3;i++){const j=vertices.get(key(gill,i));if(j===undefined)continue;shared++;for(let k=0;k<4;k++){assert.equal(gill.joints[i*4+k],body.joints[j*4+k]);assert.equal(gill.weights[i*4+k],body.weights[j*4+k]);}for(let k=0;k<3;k++)assert.ok(Math.abs(gill.normals[i*3+k]-body.normals[j*3+k])<1e-6);}
  assert.ok(shared>50,'joined boundary on both sides');
  const posed=Cloth.pose(b.bones,Q.Creature.poseClip(b.bones,'attack',recipe),.3),a=Cloth.skin(body,b.bones,posed),c=Cloth.skin(gill,b.bones,posed);
  let maxGap=0;for(let i=0;i<gill.positions.length/3;i++){const j=vertices.get(key(gill,i));if(j!==undefined)for(let k=0;k<3;k++)maxGap=Math.max(maxGap,Math.abs(c[i*3+k]-a[j*3+k]));}assert.ok(maxGap<1e-6,'no animated gill seam');
 }
});

test('jellyfish collars meet the polygonal bell margin and stay parent-bound throughout swimming and turning',()=>{
 for(const patch of [{},{appendages:1,girth:.3,chestDepth:2.2,appendageLength:.2,eyeCount:4},{appendages:16,girth:2.6,chestDepth:.5,appendageLength:3}])for(const quality of ['preview','save']){
  const recipe=Q.Creature.normalizeRecipe({...Q.Creature.kindRecipe('jellyfish'),...patch}),b=Q.Model.build(null,recipe,{},{quality}),L=recipe.size*2.4,body=b.parts.find(p=>p.name==='Body');assert.deepEqual(Q.inspect(b,{recipe}).issues,[]);assert.ok(b.parts.some(p=>p.name==='Bell margin'));assert.equal(b.parts.filter(p=>/^Oral arm\d$/.test(p.name)).length,4);
  let bottom=Infinity;for(let i=1;i<body.positions.length;i+=3)bottom=Math.min(bottom,body.positions[i]);
  for(const bone of b.bones.filter(b=>/^Tendril\d+_0$/.test(b.name))){assert.ok(Math.abs(bone.head[1]-bottom)<L*.000001);const part=b.parts.find(p=>p.name===bone.name.replace(/_0$/,'')),root=[];for(let i=0;i<part.positions.length/3;i++)if(Math.hypot(...bone.head.map((q,k)=>part.positions[i*3+k]-q))<L*.009)root.push(i);assert.ok(root.length>=12);
   for(const i of root){let parent=0;for(let k=0;k<4;k++)if(part.joints[i*4+k]===bone.parent)parent+=part.weights[i*4+k];assert.ok(parent>.9999,'fixed root collar');}
   for(const id of ['swim','turn']){const clip=Q.Creature.poseClip(b.bones,id,recipe),pose=Cloth.pose(b.bones,clip,clip.times.at(-1)*.27),actual=Cloth.skin(part,b.bones,pose),weights=new Float32Array(part.weights.length),joints=new part.joints.constructor(part.joints.length);for(const i of root){weights[i*4]=1;joints[i*4]=bone.parent;}const fixed=Cloth.skin({...part,weights,joints},b.bones,pose);let gap=0;for(const i of root)for(let k=0;k<3;k++)gap=Math.max(gap,Math.abs(actual[i*3+k]-fixed[i*3+k]));assert.ok(gap<L*1e-6);}
  }
 }
 const none=Q.Model.build(null,{...Q.Creature.kindRecipe('jellyfish'),appendages:0},{},{quality:'preview'});assert.ok(!none.parts.some(p=>/Tendril|Oral arm/.test(p.name)));
});

test('gill folds and jellyfish roots retain geometry in real workers and bindings in saved GLB skins',async t=>{
 const {PreviewWorker}=require('../src/forge/Character3D/CharacterPreviewWorker.cjs'),pool=new PreviewWorker();t.after(()=>pool.dispose());pool.configure({});
 for(const kind of ['shark','fish','jellyfish']){const recipe=Q.Creature.kindRecipe(kind),b=Q.Model.build(null,recipe,{},{quality:'preview'}),w=await pool.build({key:'gill-jelly-'+kind,recipe,options:{quality:'preview'}});assert.equal(b.parts.length,w.parts.length);for(let i=0;i<b.parts.length;i++){assert.equal(hash(b.parts[i].positions),hash(w.parts[i].positions));}
  const bytes=await Q.Model.toGlb(b,kind,()=>Uint8Array.of(137,80,78,71)),n=new DataView(bytes.buffer,bytes.byteOffset).getUint32(12,true),j=JSON.parse(Buffer.from(bytes.subarray(20,20+n)).toString());for(const p of b.parts.filter(p=>/Gill folds|Operculum|Tendril|Bell margin/.test(p.name)))assert.ok(j.meshes.find(m=>m.name===p.name).primitives[0].attributes.WEIGHTS_0!=null,p.name);
 }
});

test('arthropod leg roots stay within the measured shell and front-body joints carry spider legs',()=>{
 const crossing=(part,y,z)=>{const hits=[];for(let t=0;t<part.index.length;t+=3){const p=Array.from(part.index.subarray(t,t+3),i=>part.positions.subarray(i*3,i*3+3)),ay=p[1][1]-p[0][1],az=p[1][2]-p[0][2],by=p[2][1]-p[0][1],bz=p[2][2]-p[0][2],det=ay*bz-az*by;if(Math.abs(det)<1e-12)continue;const u=((y-p[0][1])*bz-(z-p[0][2])*by)/det,v=(ay*(z-p[0][2])-az*(y-p[0][1]))/det;if(u>=-1e-6&&v>=-1e-6&&u+v<=1.000001)hits.push(p[0][0]+u*(p[1][0]-p[0][0])+v*(p[2][0]-p[0][0]));}return hits;};
 for(const kind of ['beetle','spider','crab','centipede'])for(const patch of [{},{girth:.3,chestDepth:.5,headSize:.6},{girth:2.6,chestDepth:2.2,headSize:2}]){
  const recipe=Q.Creature.normalizeRecipe({...Q.Creature.kindRecipe(kind),...patch}),b=Q.Model.build(null,recipe,{},{quality:'preview'}),body=b.parts.find(p=>p.name==='Body');assert.deepEqual(Q.inspect(b,{recipe}).issues,[]);
  // A beetle's front pair rises from the prothorax (its Pronotum), the others from the body behind it.
  const shells=[body,...b.parts.filter(p=>kind==='beetle'&&p.name==='Pronotum')];
  for(const bone of b.bones.filter(b=>b.role==='legUpper')){const spans=shells.map(part=>crossing(part,bone.head[1],bone.head[2])).filter(hits=>hits.length>1);assert.ok(spans.length,kind+' shell at leg origin');assert.ok(spans.some(hits=>bone.head[0]>Math.min(...hits)&&bone.head[0]<Math.max(...hits)),kind+' root is inset in shell');if(kind==='spider')assert.equal(b.bones[bone.parent].name,'Head');}
  if(kind==='crab'){let low=Infinity,high=-Infinity;for(let i=0;i<body.positions.length;i+=3){low=Math.min(low,body.positions[i]);high=Math.max(high,body.positions[i]);}assert.ok(high-low>recipe.size*.8*recipe.girth,'broad carapace');}
 }
});


test('swimmer markings and strength controls change the actual skin instead of leaving identical presets',()=>{
 for(const kind of ['shark','fish','dolphin']){
  const r=Q.Creature.kindRecipe(kind),colors=new Set();
  // Swimmer coloration is painted on the body's own chart since 2026-10-24: hash the chart with the vertex colors.
  const skin=b=>{const p=b.parts.find(p=>p.name==='Body');return hash(p.colors)+':'+hash(b.textures[p.texture].data);};
  for(const pattern of ['solid','countershade','stripes','spots','rosettes','piebald','scales']){const b=Q.Model.build(null,{...r,pattern},{},{quality:'preview'});colors.add(skin(b));}
  assert.equal(colors.size,7,kind+' supports distinct editable markings');
  const muted=Q.Model.build(null,{...r,pattern:'stripes',patternAmount:0},{},{quality:'preview'}),marked=Q.Model.build(null,{...r,pattern:'stripes',patternAmount:1},{},{quality:'preview'});assert.notEqual(skin(muted),skin(marked));
 }
});

test('zero swimmer tail length omits collapsed fins and retains valid body skin',()=>{
 for(const kind of ['shark','fish','whale','dolphin'])for(const quality of ['preview','save']){
  const recipe={...Q.Creature.kindRecipe(kind),tailLength:0},b=Q.Model.build(null,recipe,{},{quality});assert.ok(!b.parts.some(p=>/^Fluke/.test(p.name)));assert.deepEqual(Q.inspect(b,{recipe}).issues,[]);
 }
});

test('mantle-rooted arms inherit the mixed body skin rather than a rigid head collar',()=>{
 for(const kind of ['octopus','squid']){const recipe=Q.Creature.kindRecipe(kind),b=Q.Model.build(null,recipe,{},{quality:'preview'}),hips=b.bones.findIndex(b=>b.name==='Hips'),head=b.bones.findIndex(b=>b.name==='Head');let mixed=0;
  for(const root of b.bones.filter(b=>/^Arm\d+_0$/.test(b.name))){const p=b.parts.find(p=>p.name===root.name.replace(/_0$/,''));let nearest=0,dist=Infinity;for(let i=0;i<p.positions.length/3;i++){const d=Math.hypot(...root.head.map((x,k)=>p.positions[i*3+k]-x));if(d<dist){dist=d;nearest=i;}}let h=0,r=0;for(let k=0;k<4;k++){if(p.joints[nearest*4+k]===hips)r+=p.weights[nearest*4+k];if(p.joints[nearest*4+k]===head)h+=p.weights[nearest*4+k];}assert.ok(Math.abs(h+r-1)<1e-6);if(h>.01&&r>.01)mixed++;}
  assert.ok(mixed>0,kind+' blends the same head/torso joints as its mantle');
 }
});
