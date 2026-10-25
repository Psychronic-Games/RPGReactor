'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Body = require('../src/forge/Character3D/HumanBody.js');
const Outfit = require('../src/forge/Character3D/CharacterOutfit.js');
const Wardrobe = require('../src/forge/Character3D/CharacterWardrobe.js');

test('skirt waistbands stay seated on the fitted skin across heavy and compact bodies', async () => {
    const pack = await Body.loadPack();
    for (const recipe of [
        { gender: 1 },
        { gender: 0, weight: 3.2, cup: 3.5, firmness: .15, shapes: { hips: 1.8, butt: 1.4 } },
        { gender: 0, height: -.6, weight: -.7, shapes: { torsoLength: -2, legLength: -1.5 } }
    ]) {
        const built = Body.build(pack, Body.normalizeRecipe(recipe));
        const fitted = Outfit.boundPositions(pack, built, 'skirt', {});
        for (const id of ['dress', 'robe', 'tunic', 'tailcoat']) {
            const item = Wardrobe.normalizeItem({ id }), spec = Wardrobe.BY_ID.get(id).pieces(item).find(p => p.surface === 'skirt');
            spec.cutKey=['waistband-test',id];
            const cut = Outfit.cutFor(pack, spec), laid = Outfit.lay(pack, built, cut, spec, {});
            let tested = 0, worst = 0;
            for (let v = 0; v < cut.verts.length; v++) {
                if (cut.field[v].u > .02) continue;
                const { a,b,t } = cut.verts[v];
                const y = fitted[a * 3 + 1] * (1-t) + fitted[b * 3 + 1] * t;
                worst = Math.max(worst, Math.abs(laid.positions[v * 3 + 1] - y)); tested++;
            }
            assert.ok(tested > 5, id + ': sampled waistband');
            assert.ok(worst < built.height * .045, id + ': waistband lift ' + worst.toFixed(4) + ' m');
            assert.ok(laid.positions.every(Number.isFinite), id + ': finite fitted surface');
        }
    }
});

test('wide seats remain inside fitted skirt sections without shrinking their flare or moving the waistband',async()=>{
 const pack=await Body.loadPack();
 for(const profile of require('./quality/character-outfit-accessory-quality.cjs').FRESH_PROFILES.filter(p=>['pear-female','barrel-male'].includes(p.id))){
  const built=Body.build(pack,Body.normalizeRecipe(profile.patch));
  for(const id of ['dress','robe','tunic']){
   const item=Wardrobe.normalizeItem({id}),spec=Wardrobe.BY_ID.get(id).pieces(item).find(p=>p.surface==='skirt'),piece=Outfit.cutFor(pack,{...spec,cutKey:['seat-test',id]}),laid=Outfit.lay(pack,built,piece,spec,{});
   const hips=built.bones.find(b=>b.name==='Hips').head,an=Outfit.anatomy(pack),bodyIds=[...new Set(pack.body.source)];let count=0;
   for(let i=0;i<piece.field.length;i++){
    const [x,y,z]=laid.positions.subarray(i*3,i*3+3);if(y<hips[1]*.8||y>hips[1]*1.1||piece.field[i].u<.05)continue;
    const radius=Math.hypot(x,z-hips[2]);if(radius<1e-5)continue;
    const nx=x/radius,nz=(z-hips[2])/radius;let support=-Infinity;
    for(const v of bodyIds)if(Math.abs(built.shaped[v*3+1]-y)<.012*built.height/1.7&&an.member[v*5+1]<.4&&an.member[v*5+2]<.4)support=Math.max(support,built.shaped[v*3]*nx+(built.shaped[v*3+2]-hips[2])*nz);
    if(Number.isFinite(support)){assert.ok(radius>support-.01,profile.id+'/'+id+' seat clearance '+JSON.stringify({radius,support,y,u:piece.field[i].u,x,z,hip:hips}));count++;}
   }
   assert.ok(count>5,profile.id+'/'+id+' sampled seat');
  }
 }
});

test('sewn garments close separated bodice and skirt boundaries with the same positions and skin bindings',async()=>{
 const pack=await Body.loadPack(),profiles=require('./quality/character-outfit-accessory-quality.cjs').FRESH_PROFILES;let seams=0;
 const key=(p,i)=>Array.from(p.positions.subarray(i*3,i*3+3),q=>Math.round(q*1e6)).join(':');
 for(const profile of profiles.filter(p=>['pear-female','barrel-male'].includes(p.id)))for(const id of ['ballGown','dress','robe','trenchcoat']){
  const built=Body.build(pack,Body.normalizeRecipe(profile.patch)),worn=Wardrobe.build(pack,built,[{id}],{atlasSize:64}),part=worn.parts.find(p=>p.name.endsWith(' waist seam'));
  if(!part)continue;seams++;
  const source=new Map();for(const p of worn.parts)if(p.fabricRefs)for(let i=0;i<p.positions.length/3;i++)source.set(p.fabricRefs[i*2]+':'+p.fabricRefs[i*2+1],[p,i]);
  for(let i=0;i<part.positions.length/3;i++){
   const hit=source.get(part.sewnRefs[i*2]+':'+part.sewnRefs[i*2+1]);assert.ok(hit,id+' seam boundary belongs to the garment');
   const[p,v]=hit;let error=0;
   assert.equal(key({positions:part.sewnRoots},i),key(p,v),id+' exact sewn root position');
   assert.ok(Math.hypot(...[0,1,2].map(k=>part.positions[i*3+k]-part.sewnRoots[i*3+k]))<built.height*.02,id+' narrow facing overlaps its owning cloth');
   // Unused slots can repeat the active Hips index: compare joint totals,
   // rather than treating each zero-weight slot as another active influence.
   for(const j of new Set([...p.joints.subarray(v*4,v*4+4),...part.joints.subarray(i*4,i*4+4)])){let expected=0,actual=0;for(let q=0;q<4;q++){if(p.joints[v*4+q]===j)expected+=p.weights[v*4+q];if(part.joints[i*4+q]===j)actual+=part.weights[i*4+q];}error=Math.max(error,Math.abs(actual-expected));}
   assert.ok(error<1e-5,id+' boundary skin follows its source');assert.ok(Math.hypot(...part.normals.subarray(i*3,i*3+3))>.9,id+' valid sewn surface normal');
  }
 }
 assert.ok(seams>=3,'multiple contrasting sewn garment joins are checked');
});

test('cloth rigging preserves sewn waist endpoints while the body bends',async()=>{
 const pack=await Body.loadPack(),Model=require('../src/forge/Character3D/CharacterModel.js'),Cloth=require('../src/forge/Character3D/CharacterCloth.js'),Poses=require('../src/forge/Character3D/CharacterPoses.js');
 const key=(p,i)=>Array.from(p.positions.subarray(i*3,i*3+3),q=>Math.round(q*1e6)).join(':');let seams=0;
 for(const profile of require('./quality/character-outfit-accessory-quality.cjs').FRESH_PROFILES.filter(p=>['pear-female','barrel-male'].includes(p.id))){
  const result=Model.build(pack,Model.normalize({age:35,...profile.patch,outfit:[{id:'ballGown'}],hair:{style:'bald'}}),{},{static:true,skinSize:64,atlasSize:64,hairBudget:0}),seam=result.parts.find(p=>p.name.endsWith(' waist seam'));if(!seam)continue;seams++;
  const sources=new Map();for(const p of result.parts)if(p.fabricRefs)for(let v=0;v<p.positions.length/3;v++)sources.set(p.fabricRefs[v*2]+':'+p.fabricRefs[v*2+1],[p,v]);
  for(const pose of ['sit','backFlip','climbWall']){
   const raw=Poses.clip(result.bones,pose,result.parts.find(p=>p.name==='Body'));assert.ok(raw,pose+' exists');const clip=Cloth.bake(result,raw,{quality:'preview'}),ps=Cloth.pose(result.bones,clip,clip.times.at(-1)*.35),actual=Cloth.skin({...seam,positions:seam.sewnRoots},result.bones,ps),cache=new Map();let worst=0;
   for(let v=0;v<seam.positions.length/3;v++){
    const hit=sources.get(seam.sewnRefs[v*2]+':'+seam.sewnRefs[v*2+1]);assert.ok(hit,profile.id+' sewn endpoint remains on its fabric');const[p,i]=hit;
    if(!cache.has(p))cache.set(p,Cloth.skin(p,result.bones,ps));const target=cache.get(p);
    for(let k=0;k<3;k++)worst=Math.max(worst,Math.abs(actual[v*3+k]-target[i*3+k]));
   }
   assert.ok(worst<1e-5,profile.id+'/'+pose+' sewn endpoint drift '+worst.toFixed(6));
  }
 }
 assert.ok(seams>=1,'an actual rigged waist seam is exercised');
});
