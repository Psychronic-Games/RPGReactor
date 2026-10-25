'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),V=require('../src/forge/Props/VehicleProp.js'),M=require('../src/forge/Props/PropModel.js'),C=require('../src/forge/Props/PropCatalog.js'),Glb=require('../src/utils/GlbOptimizer.js');
const {PNG}=require('pngjs');const encode=t=>{const p=new PNG({width:t.width,height:t.height});p.data=Buffer.from(t.data);return PNG.sync.write(p);};
function bounds(parts){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const p of parts)for(let i=0;i<p.positions.length;i++) {const k=i%3;lo[k]=Math.min(lo[k],p.positions[i]);hi[k]=Math.max(hi[k],p.positions[i]);}return{lo,hi};}
test('all nine transport types have complete finite geometry, meter dimensions and a grounded origin',()=>{
 for(const [id]of V.FORMS)for(const extra of [{},{width:1,height:1.5,length:2,wheelSize:1.3,axles:3},{width:4,height:3,length:7,roofRack:true,cargo:1,engineSize:1.4,wingSpan:1.4,spokes:10,tread:1}]){
  const recipe=V.normalize({...V.fromPreset(id),...extra}),r=M.build(recipe,{});assert.equal(C.typeOf(recipe).id,'vehicle-'+id);assert.deepEqual(V.normalize(recipe),recipe);
  const b=bounds(r.parts);assert.ok(Math.abs(b.lo[1])<1e-5,id+' ground');assert.ok(r.parts.length>=3);assert.ok(r.parts.reduce((n,p)=>n+p.index.length/3,0)<180000,id+' budget');
  for(const p of r.parts){assert.ok(p.positions.every(Number.isFinite)&&p.normals.every(Number.isFinite),id+' finite');assert.ok(p.index.every(i=>i<p.positions.length/3),id+' indices');assert.equal(p.joints.length,p.positions.length/3*4);assert.ok(p.weights.every((w,i)=>w===(i%4===0?1:0)));}
 }
});
test('ground transport exports exact wheel names, axle centers, radius and a forward direction',async()=>{
 for(const id of V.GROUND){const r=V.build(V.fromPreset(id),{}),side=M.sidecar(r),bytes=await M.toGlb(r,id,encode),{json}=Glb.parseGlb(bytes);assert.equal(side.vehicle.forward,'+z');assert.ok(side.vehicle.wheels.length>=2);
  const names=new Set(json.meshes.map(m=>m.name));for(const w of side.vehicle.wheels){assert.ok(w.radius>0);assert.ok(w.at.every(Number.isFinite));assert.ok(names.has(w.part),w.part+' in exported GLB');for(const p of w.with)assert.ok(names.has(p),p+' in exported GLB');}
  if(id==='motorcycle'){assert.equal(side.vehicle.seats[0].posture,'astride');assert.ok(side.vehicle.seats[0].handL.at[0]>side.vehicle.seats[0].handR.at[0],'left hand follows the +z vehicle left axis');assert.ok(names.has(side.vehicle.controls[0].part));for(const key of ['seat','handL','handR','footL','footR'])assert.ok(side.vehicle.seats[0][key].at.every(Number.isFinite));}
 }
});
test('wheel diameter stays below axle spacing when body proportions are shortened',()=>{
 for(const id of ['compact','rover','truck']){
  const r=V.build({...V.fromPreset(id),length:1,height:7,wheelSize:1.3,axles:3},{}),w=r.sidecarExtra.vehicle.wheels.filter(w=>w.side==='left').sort((a,b)=>a.at[2]-b.at[2]);
  for(let i=1;i<w.length;i++)assert.ok(w[i].at[2]-w[i-1].at[2]>w[i].radius+w[i-1].radius,'tires do not intersect each other');
 }
});
test('scoped vehicle rolls preserve type and unrelated construction settings',()=>{
 for(const [id]of V.FORMS){const r=V.fromPreset(id),a=V.random(81,r,'colors'),b=V.random(81,r,'details');assert.equal(a.form,id);assert.equal(b.form,id);
  for(const k of ['width','height','length','wheelbase','wheelSize','roofRack','spokes','cargo'])assert.equal(a[k],r[k],k);
  for(const k of ['width','height','length','paint','secondary','trim','accent','glass'])assert.equal(b[k],r[k],k);
  assert.notEqual(JSON.stringify(V.random(11,r)),JSON.stringify(V.random(29,r)));
 }
});

test('wheel markers measure the complete tire, and tread changes continuously above zero',()=>{
 for(const form of V.GROUND)for(const tread of [.1,.5,1]){const r=V.build({...V.fromPreset(form),tread},{});for(const wheel of r.sidecarExtra.vehicle.wheels){const p=r.parts.find(p=>p.name===wheel.part);let radius=0;for(let i=0;i<p.positions.length;i+=3)radius=Math.max(radius,Math.hypot(p.positions[i+1]-wheel.at[1],p.positions[i+2]-wheel.at[2]));assert.ok(Math.abs(radius-wheel.radius)<2e-5,form+' radius excludes tire detail');}}
 const a=V.build({...V.fromPreset('compact'),tread:.1},{}),b=V.build({...V.fromPreset('compact'),tread:.3},{});assert.ok(a.sidecarExtra.vehicle.wheels[0].radius!==b.sidecarExtra.vehicle.wheels[0].radius,'low tread settings have no effect');
});
