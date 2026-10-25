'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Body=require('../src/forge/Character3D/HumanBody.js'),Outfit=require('../src/forge/Character3D/CharacterOutfit.js'),Wardrobe=require('../src/forge/Character3D/CharacterWardrobe.js'),Armor=require('../src/forge/Character3D/CharacterPowerArmor.js'),Gear=require('../src/forge/Character3D/CreatureGear.js'),Creature=require('../src/forge/Character3D/CreatureBody.js');
const profiles=require('./quality/character-outfit-accessory-quality.cjs').FRESH_PROFILES;
let pack;test.before(async()=>{pack=await Body.loadPack();});

test('wide skirts and coat tails retain their chart bearing through the sewn waistband',()=>{
 for(const profile of profiles.filter(p=>['pear-female','barrel-male'].includes(p.id))){
  const built=Body.build(pack,Body.normalizeRecipe(profile.patch)),hip=built.bones.find(b=>b.name==='Hips').head,neck=built.bones.find(b=>b.name==='Neck').head;
  for(const id of ['robe','gown','trenchcoat','skirt']){
   const item=Wardrobe.normalizeItem({id}),spec=Wardrobe.BY_ID.get(id).pieces(item).find(p=>p.surface==='skirt');spec.cutKey=['ordered-cloth',id];
   const piece=Outfit.cutFor(pack,spec),laid=Outfit.lay(pack,built,piece,spec,{});let waist=0;
   for(let v=0;v<piece.field.length;v++){
    const f=piece.field[v],p=laid.positions.subarray(v*3,v*3+3),t=Math.max(0,Math.min(1,(p[1]-hip[1])/(neck[1]-hip[1]))),cz=hip[2]*(1-t)+neck[2]*t;
    const angle=Math.atan2(p[0],p[2]-cz),error=Math.abs(Math.atan2(Math.sin(angle-f.spineAng),Math.cos(angle-f.spineAng)));
    assert.ok(error<.001,profile.id+'/'+id+' crossed bearing '+error);
    if(f.u<.035)waist++;
   }
   assert.ok(waist>10,'checks the root rows where crossings previously began');
  }
 }
});

test('soft garment returns remain fabric thickness rather than the fitting offset',()=>{
 for(const profile of profiles.filter(p=>['pear-female','barrel-male','compact-lean'].includes(p.id))){
  const built=Body.build(pack,Body.normalizeRecipe(profile.patch));
  for(const id of ['trenchcoat','robe','gown','tshirt']){
   const item=Wardrobe.normalizeItem({id});let pi=0;
   for(const raw of Wardrobe.BY_ID.get(id).pieces(item)){
    if(!raw.surface)continue;const spec={...raw,cutKey:['cloth-return',id,pi++]},piece=Outfit.cutFor(pack,spec),laid=Outfit.lay(pack,built,piece,spec,{});let sampled=0;
    for(let v=laid.rimStart;v<laid.positions.length/3;v++){
     const source=laid.origin[v],d=Math.hypot(...[0,1,2].map(k=>laid.positions[v*3+k]-laid.positions[source*3+k]));
     // Final skin collision may add a little to a returned edge.
     assert.ok(d<built.height*.025,profile.id+'/'+id+' folded return '+d);sampled++;
    }
    assert.ok(sampled>10);
   }
  }
 }
});

function frontAt(part,x,y){let z=-Infinity;const P=part.positions;for(let t=0;t<part.index.length;t+=3){const[a,b,c]=Array.from(part.index.subarray(t,t+3),v=>v*3),d=(P[b+1]-P[c+1])*(P[a]-P[c])+(P[c]-P[b])*(P[a+1]-P[c+1]);if(Math.abs(d)<1e-12)continue;const u=((P[b+1]-P[c+1])*(x-P[c])+(P[c]-P[b])*(y-P[c+1]))/d,v=((P[c+1]-P[a+1])*(x-P[c])+(P[a]-P[c])*(y-P[c+1]))/d;if(u<0||v<0||u+v>1)continue;z=Math.max(z,P[a+2]*u+P[b+2]*v+P[c+2]*(1-u-v));}return z;}

test('power chest shells follow upper torso sections and retain rigid bindings',()=>{
 for(const patch of [{gender:1},profiles.find(p=>p.id==='barrel-male').patch,profiles.find(p=>p.id==='pear-female').patch]){
  const built=Body.build(pack,Body.normalizeRecipe(patch)),plate=Armor.build(pack,built,Wardrobe.normalizeItem({id:'powerarmor'})).parts.find(p=>p.name==='Power armor plating'),neck=built.bones.find(b=>b.name==='Neck').head;
  for(const y of [neck[1]-.07*built.height/1.7,neck[1]-.11*built.height/1.7]){
   const body=frontAt(built.parts[0],0,y),metal=frontAt(plate,0,y);assert.ok(Number.isFinite(body)&&Number.isFinite(metal));
   assert.ok(metal>body,'shell encloses the upper chest');assert.ok(metal-body<built.height*.10,'upper chest stands off '+(metal-body));
  }
  for(let v=0;v<plate.weights.length;v+=4)assert.deepEqual(Array.from(plate.weights.subarray(v,v+4)),[1,0,0,0]);
 }
});

test('fur grooming tests actual shell coverage and keeps roots beside openings',()=>{
 const shell={positions:new Float32Array([-1,-1,.01,1,-1,.01,1,1,.01,-1,1,.01]),index:new Uint32Array([0,1,2,0,2,3])};
 const root=(x,z)=>({p:[x,0,z],n:[0,0,1],flow:[0,-1,0],len:.04});
 const hidden=root(0,0),protruding=root(.5,.02),open=root(1.2,0),far=root(0,.2),all=[hidden,protruding,open,far];
 assert.deepEqual(Gear.clearFur(all,[shell]),[open,far]);assert.equal(all.length,4,'does not mutate the source root catalog');
});

test('furry animal gear suppresses covered strands while retaining exposed fur and valid skinning',()=>{
 for(const kind of ['wolf','cat']){
  const base={...Creature.kindRecipe(kind),fluff:1.4},bare=Creature.build(base,{quality:'preview'}),dressed=Creature.build({...base,gear:Gear.presetGear('royal')},{quality:'preview'});
  const count=r=>r.parts.filter(p=>p.kind==='hair').reduce((s,p)=>s+p.index.length,0);
  assert.ok(count(dressed)>0&&count(dressed)<count(bare),kind+' groomed coat');
  for(const p of dressed.parts){assert.ok(p.positions.every(Number.isFinite));for(let v=0;v<p.weights.length;v+=4)assert.ok(Math.abs(p.weights[v]+p.weights[v+1]+p.weights[v+2]+p.weights[v+3]-1)<1e-4);}
 }
});

test('fitted cape faces clear the actual cat and horse shoulders between their vertices',()=>{
 const T=require('three');
 const heightAt=(part,x,z,y)=>{const ray=new T.Ray(new T.Vector3(x,y,z),new T.Vector3(0,-1,0)),hit=new T.Vector3(),points=[new T.Vector3(),new T.Vector3(),new T.Vector3()];let top=-Infinity;
  for(let t=0;t<part.index.length;t+=3){for(let k=0;k<3;k++)points[k].fromArray(part.positions,part.index[t+k]*3);if(ray.intersectTriangle(...points,false,hit))top=Math.max(top,hit.y);}return top;};
 for(const kind of ['cat','horse']){
  const built=Creature.build({...Creature.kindRecipe(kind),gear:[{id:'cape'}]},{quality:'preview',static:true,hairBudget:0}),body=built.parts.find(p=>p.name==='Body'),cloth=built.parts.find(p=>p.name==='Gear cloth'),box=new T.Box3();
  for(let i=0;i<cloth.positions.length;i+=3)box.expandByPoint(new T.Vector3().fromArray(cloth.positions,i));
  let samples=0;for(const u of [.12,.20,.3,.4,.55,.7,.85])for(const v of [-.4,-.2,0,.2,.4]){const x=box.max.x*v,z=box.max.z+(box.min.z-box.max.z)*u,bodyY=heightAt(body,x,z,built.height+1),clothY=heightAt(cloth,x,z,built.height+1);
   if(Number.isFinite(bodyY)&&Number.isFinite(clothY)){assert.ok(clothY>bodyY,kind+' shoulder cloth intersects the rendered body');samples++;}
  }assert.equal(samples,35);
 }
});
