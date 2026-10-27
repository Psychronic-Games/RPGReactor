'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const V=require('../src/forge/Props/VehicleProp.js'),F=require('../src/forge/Props/FurnitureProp.js'),M=require('../src/forge/Props/PropModel.js'),W=require('../src/forge/Character3D/CharacterWardrobe.js'),B=require('../src/forge/Character3D/HumanBody.js'),P=require('../src/forge/Character3D/CharacterProps.js'),Creature=require('../src/forge/Character3D/CreatureBody.js'),Forms=require('../src/forge/Character3D/CreatureForms.js'),Cloth=require('../src/forge/Character3D/CharacterCloth.js');
const digest=t=>crypto.createHash('sha256').update(t.data).digest('hex');
test('road access panels and supported steps fit wholly between the actual adjacent wheels',()=>{
 for(const form of ['compact','sport','truck','rover'])for(const axles of [2,3])for(const cabinLength of [.75,1.25])for(const wheelSize of [.75,1.3]){
  const recipe=V.normalize({form,axles,cabinLength,wheelSize}),r=V.build(recipe),door=r.parts.find(p=>p.name==='Access door'),tires=r.sidecarExtra.vehicle.wheels;
  assert.ok(door,form+' access panel');
  const lo=Math.min(...door.positions.filter((_,i)=>i%3===2)),hi=Math.max(...door.positions.filter((_,i)=>i%3===2));
  for(const wheel of tires)assert.ok(hi<wheel.at[2]-wheel.radius||lo>wheel.at[2]+wheel.radius,form+' access panel overlaps wheel '+wheel.part);
  if(['truck','rover'].includes(form))assert.ok(r.parts.some(p=>p.name==='Access step')&&r.parts.some(p=>p.name==='Step supports'));
 }
});
test('custom screen text changes actual pixels on every screen design and survives recipe serialization/cache reuse',()=>{
 for(const form of ['computer','console','tv','wallPanel','microwave'])for(const screenStyle of ['status','radar','landscape']){
  const cache={},a=F.build({form,screenStyle,screenText:'BRIDGE / DECK 07'},cache),text=F.normalize(JSON.parse(JSON.stringify(a.recipe)));
  assert.equal(text.screenText,'BRIDGE / DECK 07');
  const b=F.build({...text,screenText:'ENGINE / DECK 02'},cache),c=F.build({...text,screenText:''},cache),fresh=F.build({...text,screenText:'ENGINE / DECK 02'},{});
  const pic=r=>r.textures['furniture-screen.png'];assert.ok(pic(a)&&pic(b));assert.notEqual(digest(pic(a)),digest(pic(b)));assert.notEqual(digest(pic(c)),digest(pic(b)));assert.equal(digest(pic(b)),digest(pic(fresh)));
 }
});
test('wardrobe categories describe clothing use while provenance and saved outfit identifiers remain intact',()=>{
 assert.equal(W.PRESETS.find(p=>p.id==='mhstarcrew').group,'Sci-fi');assert.equal(W.BY_ID.get('mh_uniform').group,'Sci-fi');
 const transferred=W.PRESETS.filter(p=>p.id.startsWith('ss_'));assert.equal(transferred.length,4);for(const p of transferred){assert.equal(p.group,'Sci-fi');assert.ok(W.BY_ID.get(p.items[0].id).transfer);}
 assert.ok(W.PRESETS.every(p=>!['Modeled','Star Shift'].includes(p.group)));assert.ok(W.BY_ID.get('mh_uniform').modeled);
});
test('suitcase grip rises from its case top and closes into two supported mounting feet',async()=>{
 const pack=await B.loadPack(),built=B.build(pack,B.normalizeRecipe({gender:1})),r=P.build(pack,built,[{id:'suitcase'}],[]),mesh=r.parts[0],hand=built.bones.find(b=>b.name==='LeftHand'),y=hand.head[1]+(hand.tail[1]-hand.head[1])*.8,s=built.height/1.7;
 const grip=[];for(let v=0;v<mesh.positions.length;v+=3)if(mesh.positions[v+1]>y-.072*s&&mesh.colors[v]>.3)grip.push(Array.from(mesh.positions.subarray(v,v+3)));
 assert.ok(grip.length>50);const top=Math.max(...grip.map(p=>p[1]));assert.ok(top>y-.005*s&&top<y+.012*s,'grip crown sits at the hand');
 for(const sign of [-1,1])assert.ok(grip.some(p=>Math.abs(p[0]-(hand.head[0]+(hand.tail[0]-hand.head[0])*.8+sign*.052*s))<.009*s&&p[1]<y-.058*s),'both grip roots descend into the case');
});
test('new cats use an unstriped coat and existing tabby recipes remain tabby',()=>{
 const cat=Creature.kindRecipe('cat'),body=Creature.build(cat,{quality:'preview'}).parts.find(p=>p.name==='Body');assert.ok(!body.normalTexture,'periodic pore relief must not stripe an unmarked fur coat');
 assert.equal(cat.pattern,'countershade');assert.equal(Creature.normalizeRecipe({...Creature.kindRecipe('cat'),pattern:'tabby'}).pattern,'tabby');assert.equal(Creature.withVariant(Creature.kindRecipe('cat'),'catType','maineCoon').pattern,'tabby');
});
test('bird wings have separate manus articulation and standing feathers stay above the toe plane',()=>{
 for(const birdType of ['eagle','owl','crow','sparrow']){
  const recipe=Creature.withVariant(Creature.kindRecipe('avian'),'birdType',birdType),r=Creature.build(recipe,{quality:'preview'});
  assert.equal(r.bones.filter(b=>b.role==='wingHand').length,2);
  for(const p of r.parts.filter(p=>p.name.startsWith('Wing shoulder'))){
   let high=-Infinity;for(let i=1;i<p.positions.length;i+=3)high=Math.max(high,p.positions[i]);let sum=0,n=0;
   for(let i=1;i<p.positions.length;i+=3)if(p.positions[i]>high-recipe.size*.008){sum+=p.normals[i];n++;}
   assert.ok(n>0&&sum/n>0,'mirrored wing airfoil points inward: '+p.name);
  }
  for(const pose of ['idle','walk','run','fly','glide']){
   // Birds fold with their own feather-group rig (Creature.poseClip routes to RRCreatureFlyers).
   const clip=Creature.poseClip(r.bones,pose,recipe);assert.ok(clip);
   for(const u of [.1,.5,.8]){
    const ps=Cloth.pose(r.bones,clip,clip.times.at(-1)*u),feathers=r.parts.filter(p=>/Flight feathers|Wing shoulder|Wing coverts/.test(p.name));
    for(const p of feathers){const pos=Cloth.skin(p,r.bones,ps);assert.ok(pos.every(Number.isFinite));}
    if(['fly','glide'].includes(pose))continue;
    let wingLow=Infinity,footLow=Infinity;
    for(const p of r.parts.filter(p=>/Flight feathers|Wing shoulder|Wing coverts|Leg and foot/.test(p.name))){const pos=Cloth.skin(p,r.bones,ps);let low=Infinity;for(let i=1;i<pos.length;i+=3)low=Math.min(low,pos[i]);if(p.name.startsWith('Leg'))footLow=Math.min(footLow,low);else wingLow=Math.min(wingLow,low);}
    assert.ok(wingLow>footLow-.005,birdType+' standing wing reaches below toes by '+(footLow-wingLow).toFixed(4));
   }
  }
 }
});
test('sewn shoulder panels remain complete across mixed torso/arm chart boundaries',async()=>{
 const D=require('../src/forge/Character3D/CharacterGarmentDetails.js'),O=require('../src/forge/Character3D/CharacterOutfit.js'),pack=await B.loadPack(),built=B.build(pack,B.normalizeRecipe({gender:1}));
 const laid={positions:Float32Array.from([-.3,.9,.3,.3,.9,.3,-.3,1.6,.3,.3,1.6,.3]),index:Uint32Array.from([0,1,2,1,3,2]),normals:Float32Array.from([0,0,1,0,0,1,0,0,1,0,0,1]),joints:new Uint8Array(16),weights:Float32Array.from([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]),field:[{fam:1},{fam:0},{fam:1},{fam:0}],fabricEntry:0};
 const parts=D.build(pack,built,[{garment:'officerJacket',laid,look:{color:'#203040',color2:'#708090',trim:'#b0b8c0'}}]),surface=O.projectedSurface(parts),an=O.anatomy(pack),hip=built.bones.find(b=>b.name==='Hips').head[1],neck=built.bones.find(b=>b.name==='Neck').head[1];
 for(const x of [-.11,.11]){const restY=1.292-Math.abs(x)*.16+.026,y=hip+(restY-an.chains.spine[0][1])/(an.chains.spine[4][1]-an.chains.spine[0][1])*(neck-hip),hit=surface.sample(x,y);assert.ok(hit&&hit.depth>.305,'sewn panel has a hole at its anatomical chart boundary');}
});
test('formed wheel flanges leave the entire wheel opening clear, including triangle interiors',()=>{
 for(const form of ['compact','sport','truck','rover']){
  const r=V.build(V.fromPreset(form)),p=r.parts.find(p=>p.name==='Formed wheel arches'),wheels=r.sidecarExtra.vehicle.wheels;
  assert.ok(p);for(let k=0;k<p.index.length;k+=3){const point=[0,1,2].map(axis=>[0,1,2].reduce((sum,j)=>sum+p.positions[p.index[k+j]*3+axis],0)/3),wheel=wheels.filter(w=>Math.sign(w.at[0])===Math.sign(point[0])).sort((a,b)=>Math.abs(a.at[2]-point[2])-Math.abs(b.at[2]-point[2]))[0];assert.ok(Math.hypot(point[1]-wheel.at[1],point[2]-wheel.at[2])>wheel.radius*1.02,form+' wheel flange fills its opening');}
 }
});
