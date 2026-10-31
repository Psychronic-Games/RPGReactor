'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const THREE=global.THREE=require('./helpers/three.cjs');
const F=require('../src/forge/Props/FurnitureProp.js'),A=require('../src/forge/Props/AccessoryProp.js'),G=require('../src/forge/Props/GarmentProp.js'),V=require('../src/forge/Props/VehicleProp.js');
const Atlas=require('../src/forge/Character3D/CharacterAtlas.js');
function bounds(p){const lo=[Infinity,Infinity,Infinity],hi=lo.map(()=>-Infinity);for(let i=0;i<p.positions.length;i++){lo[i%3]=Math.min(lo[i%3],p.positions[i]);hi[i%3]=Math.max(hi[i%3],p.positions[i]);}return{lo,hi};}
function motion(r){const p=r.parts.find(p=>/^Live display/.test(p.name));assert.ok(p,'visible waveform mesh');const tracks=r.clips.flatMap(c=>c.tracks).filter(t=>t.path==='translation');assert.ok(tracks.length>=32);for(const t of tracks){assert.ok(t.values.every(Number.isFinite));assert.ok(t.bone<r.bones.length);assert.ok(t.values.some((v,i)=>i>=3&&Math.abs(v-t.values[i%3])>1e-5),'trace or bar actually changes');}assert.ok(p.joints.every(j=>j<r.bones.length));}
test('clinical and computer displays animate, retain custom text, and can be static',()=>{
 for(const form of ['computer','fabricator','medStation','cryoPod','smartToilet']){
  const recipe={...F.fromPreset(form),screenReadout:'PATIENT 17 / 93%',displaySpeed:1.4},r=F.build(recipe);motion(r);
  assert.equal(F.normalize(JSON.parse(JSON.stringify(r.recipe))).screenReadout,recipe.screenReadout);
  const still=F.build({...recipe,animateScreen:false});assert.ok(!still.parts.some(p=>/^Live display/.test(p.name)));
 }
});
test('hologram visibility leaves a complete table and is independent of console screen state',()=>{
 const shown=F.build(F.fromPreset('holoTable')),hidden=F.build({...F.fromPreset('holoTable'),hologram:false});
 assert.ok(hidden.triangles<shown.triangles);assert.ok(hidden.parts.some(p=>/screen$/.test(p.name)));assert.ok(hidden.parts.some(p=>/paint$/.test(p.name)));assert.equal(F.normalize(JSON.parse(JSON.stringify(hidden.recipe))).hologram,false);
});
test('desktop tower clears the screen and smart-toilet screens point upward',()=>{
 const r=F.build(F.fromPreset('computer')),screen=bounds(r.parts.find(p=>p.name.endsWith(' screen')));
 // Tower occupies the right-hand quarter; the monitor, including its glass, stays to the left.
 assert.ok(screen.hi[0]<r.recipe.width*.20);
 const t=F.build(F.fromPreset('smartToilet')),p=t.parts.find(p=>p.name.endsWith(' screen'));let up=0;for(let i=1;i<p.normals.length;i+=3)up+=p.normals[i];assert.ok(up/p.normals.length*3>.4,'sloped screen faces up');
});
test('scouter readouts animate in the lens frame after accessory rotation and scaling',async()=>{
 await A.prepare();const r=A.build({accessory:{id:'earScouter',displayText:'POWER 4217'},rotation:[31,57,-12],scale:1.8});motion(r);assert.equal(r.recipe.accessory.displayText,'POWER 4217');
 const lens=r.parts.find(p=>p.name==='Ear scouter lens'),trace=r.parts.find(p=>/^Live display/.test(p.name)),n=new THREE.Vector3(...lens.normals.subarray(0,3)),a=new THREE.Vector3(...lens.positions.subarray(0,3));let worst=0;
 for(let i=0;i<trace.positions.length;i+=3)worst=Math.max(worst,Math.abs(new THREE.Vector3(...trace.positions.subarray(i,i+3)).sub(a).dot(n)));assert.ok(worst<.006,'telemetry remains on rotated lens '+worst);
});
test('stripes share physical height through shoulder chart boundaries',()=>{
 const colors=[[.1,.1,.1],[.9,.9,.9],[.2,.2,.2]],look={pattern:'stripes',scale:1},p={y:1.35,s:2,ang:.2,cu:.2,cv:.2,rest:[.1,1.35,.1],px:.001,su:.2,rad:.1,vm:-1};
 const torso=Atlas.shade(look,colors,{...p,fam:0}),arm=Atlas.shade(look,colors,{...p,fam:1});assert.ok(torso.every((v,k)=>Math.abs(v-arm[k])<1e-6));
});
test('standalone plate armor has finite inward surfaces with full skin weights',async()=>{
 await G.prepare();for(const id of ['breastplate','pauldrons','greaves','reconArmor','powerarmor']){const r=G.build({garment:{id}},{atlasSize:128}),inners=r.parts.filter(p=>/fitted interior$/.test(p.name));assert.ok(inners.length,id);for(const p of inners){assert.ok(p.positions.every(Number.isFinite));assert.ok(p.uvs1?.every(Number.isFinite));assert.ok(p.rrLining);assert.ok(p.joints.every(j=>j<r.bones.length));}}
});
test('airliner retains a hundred seats with finite conformal rounded doors under its budget',()=>{
 const r=V.build(V.fromPreset('airliner'),{},{textureSize:256});assert.equal(r.passengerSeats.length,100);assert.ok(r.triangles<330000,'airliner '+r.triangles);for(const p of r.parts)assert.ok(p.positions.every(Number.isFinite),p.name);assert.ok(r.parts.some(p=>/Intake turbine/.test(p.name)));assert.ok(r.sidecarExtra.animations.some(a=>a.axis==='z'||Array.isArray(a.axis)&&a.axis[2]===1));
});
test('instrument and tailoring labels exist in all reviewed locales',()=>{
 require('../src/I18nReviewedTranslations.js');for(const row of Object.values(global.RR_REVIEWED_TRANSLATIONS.text))for(const k of ['Animated display','Display readout','Display speed','Holographic display','Preserve original tailoring'])assert.ok(row[k],k);
});

test('unused helper vertices do not pull the prop camera away from visible triangles',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),context={THREE,console,RRPropCatalog:global.RRPropCatalog,RRPropModel:require('../src/forge/Props/PropModel.js')};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/forge/Props/PropBuilder.js'),'utf8')+'\nglobalThis.Builder=PropBuilder;',context);
 const box=context.Builder.prototype._shownBox.call({_view:null},{parts:[{positions:Float32Array.of(0,1,0,1,1,0,0,2,0,500,-500,500),index:Uint32Array.of(0,1,2)}]});assert.equal(box.min.y,1);assert.equal(box.max.y,2);assert.equal(box.max.x,1);
});
test('source tailoring is saved explicitly and can be disabled for a chosen body',async()=>{
 await G.prepare();const original=G.normalize({garment:{id:'ss_carol_uniform'}}),custom=G.normalize({...original,sourceTailoring:false,body:{gender:1,weight:1.2}});assert.ok(original.sourceTailoring);assert.equal(G.normalize(JSON.parse(JSON.stringify(custom))).sourceTailoring,false);assert.equal(custom.body.gender,1);assert.equal(custom.body.weight,1.2);
});

test('tailcoat panels extend toward the knees instead of stopping at a compressed pelvis cut',async()=>{
 await G.prepare();const r=G.build({garment:{id:'tailcoat'}},{atlasSize:128}),hip=r.bones.find(b=>b.name==='Hips').head,outer=r.parts.find(p=>p.name==='Tailcoat'),ys=[...new Set(outer.index)].map(v=>outer.positions[v*3+1]);assert.ok(Math.min(...ys)<hip[1]-.30,'long rear drop');
});
test('outboard cargo-pocket anchors remain in place when reseated on unchanged cloth',async()=>{
 await G.prepare();const D=require('../src/forge/Character3D/CharacterGarmentDetails.js'),build=D.build;let entries;
 try{D.build=(pack,body,e,...args)=>{entries=e;return build(pack,body,e,...args);};const r=G.build({garment:{id:'cargoTrousers'}},{atlasSize:128}),parts=r.parts.filter(p=>p.detailAnchors),before=parts.map(p=>Float32Array.from(p.positions));assert.ok(parts.length);D.follow(parts,entries);let worst=0;parts.forEach((p,k)=>{for(let i=0;i<p.positions.length;i++)worst=Math.max(worst,Math.abs(p.positions[i]-before[k][i]));});assert.ok(worst<.00001,'reseeded pocket offset '+worst);}finally{D.build=build;}
});
