'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),THREE=require('./helpers/three.cjs');
const F=require('../src/forge/Props/FurnitureProp.js');
function hits(parts,origin,direction,side=THREE.DoubleSide){
 const ray=new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction)),out=[];
 for(const p of parts){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p.positions,3));g.setIndex(new THREE.BufferAttribute(p.index,1));const material=new THREE.MeshBasicMaterial({side}),mesh=new THREE.Mesh(g,material);mesh.updateMatrixWorld(true);for(const h of ray.intersectObject(mesh))out.push(h.distance);g.dispose();material.dispose();}return out.sort((a,b)=>a-b);
}
test('smart toilet has two sloping front displays and two upward armrest displays, all animated',()=>{
 const r=F.build(F.fromPreset('smartToilet')),p=r.parts.find(p=>p.name.endsWith(' screen'));assert.equal(p.index.length/6,4);
 let upward=0,sloping=0;for(let i=1;i<p.normals.length;i+=3){if(p.normals[i]>.98)upward++;else if(p.normals[i]>.4&&p.normals[i]<.9)sloping++;}assert.equal(upward,8);assert.equal(sloping,8);
 assert.equal(r.parts.filter(p=>/^Live display/.test(p.name)).length,4);assert.equal(r.clips.length,1);assert.equal(r.bones.length,129);
 for(const track of r.clips[0].tracks){assert.ok(track.values.every(Number.isFinite));assert.ok(track.values.some((x,i)=>i>2&&Math.abs(x-track.values[i%3])>1e-6));}
 const still=F.build({...r.recipe,animateScreen:false});assert.equal(still.clips.length,0);assert.equal(still.bones.length,1);
});
test('toilet openings have no suspended seat bumpers within the bowl',()=>{
 for(const form of ['toilet','smartToilet']){const r=F.build(F.fromPreset(form)),{width:W,height:H,depth:D}=r.recipe,seat=r.parts.filter(p=>p.name.endsWith(' seatShell'));
  for(const sign of [-1,1])assert.equal(hits(seat,[sign*W*.32,H*.60,D*.22],[0,-1,0],THREE.FrontSide).filter(d=>d<H*.12).length,0,form+' floating inner bumper');
 }
});
test('the pedestal neck and bowl share one axis and the rear inlet stays at tank height',()=>{
 for(const form of ['toilet','smartToilet'])for(const extra of [{},{width:.68,height:1.05,depth:.90}]){const r=F.build({...F.fromPreset(form),...extra}),{width:W,height:H,depth:D}=r.recipe,body=r.parts.filter(p=>p.name.endsWith(' ceramic')),y=H*.30;
  const front=hits(body,[0,y,D*.10],[0,0,1])[0],rear=hits(body,[0,y,D*.10],[0,0,-1])[0];assert.ok(front&&rear);assert.ok(Math.abs(front-rear)<.00001,form+' centered pedestal');
  const metal=r.parts.find(p=>p.name.endsWith(' metal'));assert.ok(metal);let back=Infinity;for(let v=0;v<metal.positions.length;v+=3){back=Math.min(back,metal.positions[v+2]);if(metal.positions[v+2]<-D*.565)assert.ok(metal.positions[v+1]>H*.55,'rear inlet does not drop toward the bowl');}assert.ok(back<-D*.62,'supply port faces behind tank');
 }
});
test('smart armrest housing supports every display instead of exposing detached mounting hardware',()=>{
 const r=F.build({...F.fromPreset('smartToilet'),animateScreen:false}),{width:W,height:H,depth:D}=r.recipe,paint=r.parts.filter(p=>p.name.endsWith(' paint'));
 for(const sign of [-1,1]){const x=sign*W*.65,contact=hits(paint,[x,H*.80,-D*.015],[0,-1,0])[0];assert.ok(contact!==undefined);assert.ok(Math.abs(H*.80-contact-(H*.68+H*.075/2))<.001,'armrest under top display');
  const mount=hits(paint,[x,H*.65,-D*.10],[0,-1,0]);assert.ok(mount.some(d=>H*.65-d<H*.53&&H*.65-d>H*.49),'continuous support reaches cantilever');
 }
});

test('water remains translucent and nonmetallic above a genuine recessed flush throat',()=>{
 for(const form of ['toilet','smartToilet'])for(const shellFinish of ['standard','chrome']){
  const r=F.build({...F.fromPreset(form),shellFinish}),{width:W,height:H,depth:D}=r.recipe,water=r.parts.find(p=>p.name.endsWith(' water')),basin=r.parts.find(p=>p.name.endsWith(' bowlInterior'));
  assert.ok(water&&basin);assert.equal(water.metalness,0);assert.ok(water.opacity>.1&&water.opacity<.6);assert.ok(water.normals.every((n,i)=>i%3===1?n>.99:Math.abs(n)<.001),'water faces upward');
  const body=r.parts.filter(p=>/ (ceramic|bowlInterior|drainInterior)$/.test(p.name)),down=hits(body,[0,H*.50,D*.10],[0,-1,0]);assert.ok(down.length);assert.ok(down[0]>H*.28,'center drains deeply below the old solid bowl floor');
  const outlet=hits(body,[0,-.01,D*.10],[0,1,0]);assert.ok(!outlet.length||outlet[0]>.01+H*.025,'pedestal has a real underside outlet, not a capped drain');
  let min=Infinity,max=-Infinity;for(let i=0;i<water.positions.length;i+=3){min=Math.min(min,water.positions[i+1]);max=Math.max(max,water.positions[i+1]);}assert.ok(max-min<.00001);assert.ok(Math.abs(min-H*.38)<.001);
  const throat=r.parts.find(p=>p.name.endsWith(' drainInterior'));assert.ok(throat&&throat.positions.some((n,i)=>i%3===1&&n<H*.2),'drain extends inside pedestal');
 }
});

test('smart-toilet humor is the editable default, without changing other console headings',()=>{
 assert.equal(F.fromPreset('smartToilet').screenText,'FECAL ANALYSIS / SYSTEM READY');
 assert.equal(F.normalize({...F.fromPreset('smartToilet'),screenText:'CREW HEALTH / READY'}).screenText,'CREW HEALTH / READY');
 assert.equal(F.fromPreset('computer').screenText,'REACTOR / SYSTEM READY');
});

test('smart pedestal has no protruding rear floor-anchor covers',()=>{
 const r=F.build(F.fromPreset('smartToilet')),{height:H,depth:D}=r.recipe,metal=r.parts.filter(p=>p.name.endsWith(' metal')),shell=r.parts.filter(p=>p.name.endsWith(' ceramic'));
 for(const p of metal)for(let v=0;v<p.positions.length;v+=3)assert.ok(p.positions[v+1]>H*.05,'no exposed base screw');
 for(const p of shell)for(let v=0;v<p.positions.length;v+=3)if(p.positions[v+1]<.06){const radius=Math.hypot(p.positions[v],(p.positions[v+2]-D*.10)/1.35);assert.ok(radius<=r.recipe.width*.351,'base remains within its continuous pedestal skirt');}
});
