'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Q=require('./helpers/character-quality-matrix.cjs'),W=require('../src/forge/Character3D/CharacterWardrobe.js'),O=require('../src/forge/Character3D/CharacterOutfit.js'),Cloth=require('../src/forge/Character3D/CharacterCloth.js'),Poses=require('../src/forge/Character3D/CharacterPoses.js');
let pack;test.before(async()=>{pack=await Q.Body.loadPack();});
function warrior(id,gender,extra={}){return Q.Model.build(pack,{gender,hair:{style:'bald'},outfit:W.dressFor(W.PRESETS.find(p=>p.id===id).items,gender===0),...extra},{},{quality:'preview',skinSize:32,atlasSize:128});}
test('Barbarian and Gladiator have closed, curved overlapping leather with a covered waist on both sexes',()=>{
 for(const id of ['barbarian','gladiator'])for(const gender of [0,1]){
  const r=warrior(id,gender),p=r.parts.find(p=>p.name==='Leather apron panels'),surface=O.projectedSurface(r.parts.filter(p=>p.texture==='outfit.png')),edges=new Map();assert.ok(r.cloth,id+' cloth rig');
  assert.equal(p.normalTexture,'warrior-leather-normal.png');assert.ok(r.textures[p.normalTexture].repeat);
  const depths=[];let buried=0,probed=0;
  for(let v=0;v<p.positions.length/3;v++){depths.push(p.positions[v*3+2]);if(p.hang[v]>.22||v%7)continue;const [x,y,z]=Array.from(p.positions.subarray(v*3,v*3+3)),front=surface.sample(x,y),back=surface.sample(x,y,-1);if(!front||!back)continue;probed++;if(z<front.depth-.004&&z>back.depth+.004)buried++;}
  assert.ok(Math.max(...depths)-Math.min(...depths)>.18*r.height/1.7,'wrap has front, side and rear volume');assert.ok(probed>25);assert.equal(buried,0,id+'/'+gender+' waist crosses its lining');
  for(let i=0;i<p.index.length;i+=3)for(let j=0;j<3;j++){const a=p.index[i+j],b=p.index[i+(j+1)%3],key=Math.min(a,b)+':'+Math.max(a,b);edges.set(key,(edges.get(key)||0)+1);}
  assert.ok([...edges.values()].every(n=>n===2),'closed leather cut edges');
 }
});
test('warrior waist roots remain attached while the panels bend around walking, sitting and kneeling',()=>{
 const r=warrior('gladiator',1),p=r.parts.find(p=>p.name==='Leather apron panels'),hip=r.bones.findIndex(b=>b.name==='Hips');
 const roots=[];for(let v=0;v<p.hang.length;v++)if(p.hang[v]===0)roots.push(v);
 for(const id of ['walk','sit','kneel']){
  const clip=Cloth.bake(r,Poses.clip(r.bones,id,r.parts[0]),{quality:'preview'});
  for(const u of [.2,.5,.8]){const pose=Cloth.pose(r.bones,clip,clip.times.at(-1)*u),P=Cloth.skin(p,r.bones,pose);assert.ok(P.every(Number.isFinite));
   for(const v of roots){assert.equal(p.joints[v*4],hip,'upper edge belongs to belt anchor');assert.ok(Math.abs(P[v*3+1]-p.positions[v*3+1])<.10,'root does not whip upward');}
  }
 }
});
test('birds fold on the ground and keep a horizontal flight posture with a forward-facing head',()=>{
 const r=Q.Creature.kindRecipe('avian'),b=Q.Creature.build(r,{quality:'preview'}),idle=Q.Creature.poseClip(b.bones,'idle',r),fly=Q.Creature.poseClip(b.bones,'fly',r);
 const bounds=clip=>{const pose=Cloth.pose(b.bones,clip,0);let lo=Infinity,hi=-Infinity;for(const p of b.parts){const P=Cloth.skin(p,b.bones,pose);for(let i=0;i<P.length;i+=3){lo=Math.min(lo,P[i]);hi=Math.max(hi,P[i]);}}return hi-lo;};
 assert.ok(bounds(idle)<bounds(fly)*.75,'ground wings fold against the body');
 const pose=Cloth.pose(b.bones,fly,0),body=Cloth.skin(b.parts.find(p=>p.name==='Body'),b.bones,pose),feet=b.parts.filter(p=>p.name.startsWith('Leg and foot')).map(p=>Cloth.skin(p,b.bones,pose));
 const maxY=p=>{let hi=-Infinity;for(let i=1;i<p.length;i+=3)hi=Math.max(hi,p[i]);return hi;};
 assert.ok(feet.every(p=>maxY(p)<maxY(body)),'flight legs tuck beneath the breast');
 assert.ok(b.bones.some(b=>b.role==='birdTail'),'tail articulates separately for flight');
 for(const id of ['idle','fly','glide']){const c=Q.Creature.poseClip(b.bones,id,r);for(const u of [0,.25,.5,.75,1]){const pose=Cloth.pose(b.bones,c,c.times.at(-1)*u);for(const p of b.parts)assert.ok(Cloth.skin(p,b.bones,pose).every(Number.isFinite));}}
});
