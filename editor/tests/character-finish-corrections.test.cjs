'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),T=require('../node_modules/three');
const Q=require('./helpers/character-quality-matrix.cjs'),Skin=require('../src/forge/Character3D/CharacterSkin.js'),Props=require('../src/forge/Character3D/CharacterProps.js'),Gear=require('../src/forge/Character3D/CreatureGear.js');
let pack;test.before(async()=>{pack=await Q.Body.loadPack();});
function inside(part,p){const origin=new T.Vector3(...p),ray=new T.Ray(origin,new T.Vector3(.932,.271,.239).normalize()),hit=new T.Vector3(),hits=[];const at=i=>new T.Vector3(...part.positions.subarray(i*3,i*3+3));for(let t=0;t<part.index.length;t+=3)if(ray.intersectTriangle(...[0,1,2].map(k=>at(part.index[t+k])),false,hit)){const d=hit.distanceTo(origin);if(d>1e-7&&!hits.some(x=>Math.abs(x-d)<1e-7))hits.push(d);}return hits.length%2===1;}

test('reptile necks enter the rear skull and have two-dimensional scale charts',()=>{
 for(const species of ['hydrata','dragonborn','lizardfolk']){
  const b=Q.Model.build(pack,Q.Model.withSpecies({},species),{}, {quality:'preview',static:true,skinSize:256});
  for(const neck of b.parts.filter(p=>/^Head .*neck$/.test(p.name))){
   const skull=b.parts.find(p=>p.name===neck.name.replace(/neck$/,'Body')),eye=b.parts.find(p=>p.name===neck.name.replace(/neck$/,'Eyes')),cols=neck.positions.length/3/13;
   let sumZ=0;for(let col=0;col<cols-1;col++){const i=(12*cols+col)*3,p=Array.from(neck.positions.subarray(i,i+3));assert.ok(inside(skull,p),species+' collar ring is inside the braincase');sumZ+=p[2]/(cols-1);}
   let eyeZ=0;for(let i=2;i<eye.positions.length;i+=3)eyeZ+=eye.positions[i]/(eye.positions.length/3);assert.ok(sumZ<eyeZ-.005,species+' neck joins behind the eyes');
   let area=0;for(let t=0;t<neck.index.length;t+=3){const [a,c,d]=[0,1,2].map(k=>neck.index[t+k]*2),uv=neck.uvs;area+=Math.abs((uv[c]-uv[a])*(uv[d+1]-uv[a+1])-(uv[c+1]-uv[a+1])*(uv[d]-uv[a]));}assert.ok(area>1.9,'UV chart has area rather than a repeated row');
   assert.equal(neck.normalTexture,'neck-scales-normal.png');assert.ok(b.textures[neck.normalTexture]);
  }
  assert.equal(b.parts.find(p=>p.name==='Body').normalTexture,'skin-scales-normal.png');assert.deepEqual(Q.inspect(b,{recipe:b.recipe},pack).issues,[]);
 }
});

test('vampire canines are rooted at the actual upper lip across contrasting faces',()=>{
 for(const body of [{gender:0},{gender:1,shapes:{noseProjection:1,mouthWidth:1}},{gender:0,shapes:{mouthWidth:-1,upperLip:1}}]){
  const built=Q.Body.build(pack,Q.Body.normalizeRecipe(body)),L=Props.landmarks(pack,built),f=Q.Species.build(pack,built,{fangs:{type:'long'}}).parts[0],fields=Skin.fieldsOf(pack),lips=L.headIds.filter(v=>fields.lips[v]>.15);
  const front=Math.max(...lips.map(v=>L.P[v*3+2]));let nearest=Infinity;
  for(let i=0;i<f.positions.length;i+=3){assert.ok(f.positions[i+2]<=front+.004);for(const v of lips)nearest=Math.min(nearest,Math.hypot(...[0,1,2].map(k=>f.positions[i+k]-L.P[v*3+k])));}
  assert.ok(nearest<.004,'fang roots intersect the lip area');
 }
});

test('humanoid clothing retains a dense atlas and material relief through cached shape changes',()=>{
 const cache={},r=Q.Model.normalize({outfit:[{id:'tshirt',pattern:'plaid'},{id:'jeans'}],hair:{style:'bald'}}),o={quality:'preview',static:false,skinSize:64},a=Q.Model.build(pack,r,cache,o),b=Q.Model.build(pack,{...r,weight:.6},cache,o);
 assert.equal(a.textures['outfit.png'].width,2048);assert.equal(a.textures['outfit-normal.png'].width,2048);assert.equal(a.textures['outfit.png'],b.textures['outfit.png']);assert.equal(a.textures['outfit-normal.png'],b.textures['outfit-normal.png']);
 assert.ok(a.parts.some(p=>p.normalTexture==='outfit-normal.png'));assert.ok(a.textures['outfit-normal.png'].data.some((v,i)=>i%4===0&&Math.abs(v-128)>8));
});

test('animal cloth and leather have physically tiled grain and export their relief maps',async()=>{
 const r=Q.Creature.normalizeRecipe({...Q.Creature.kindRecipe('horse'),gear:Gear.presetGear('royal')}),b=Q.Creature.build(r,{quality:'preview'}),gear=b.parts.filter(p=>p.name.startsWith('Gear ')&&p.kind==='cloth');assert.ok(gear.length>0);
 for(const p of gear){assert.equal(p.uvs.length,p.positions.length/3*2);assert.ok(b.textures[p.normalTexture].repeat);assert.ok(b.textures[p.texture].repeat);}
 assert.deepEqual(Q.inspect(b,{recipe:r}).issues,[]);
 const glb=await Q.Model.toGlb(b,'Royal',()=>new Uint8Array([137,80,78,71])),size=new DataView(glb.buffer,glb.byteOffset).getUint32(12,true),json=JSON.parse(Buffer.from(glb.subarray(20,20+size)).toString());assert.ok(json.materials.some(m=>m.normalTexture));
});
