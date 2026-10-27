'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const V=require('../src/forge/Props/VehicleProp.js'),M=require('../src/forge/Props/PropModel.js');
const hash=r=>{const h=crypto.createHash('sha256');for(const p of r.parts)for(const k of ['positions','index'])h.update(Buffer.from(p[k].buffer,p[k].byteOffset,p[k].byteLength));return h.digest('hex');};
test('new equipment choices change actual meshes with surface details enabled and disabled',()=>{
 const variants=[['compact','aero',[0,.4,1]],['sport','aero',[0,.4,1]],['motorcycle','fairing',['naked','half','full']],['hover','flightFit',['transport','interceptor','cargo']],['shuttle','flightFit',['transport','interceptor','cargo']],['drone','rotorGuard',['ring','cage','open']],['walker','armor',[0,.5,1]]];
 for(const [form,key,values]of variants)for(const details of [false,true]){
  const hashes=new Set();for(const value of values){const recipe=V.normalize({...V.fromPreset(form),[key]:value,details}),r=V.build(recipe);assert.equal(V.normalize(JSON.parse(JSON.stringify(recipe)))[key],value,'saved recipe loses '+key);hashes.add(hash(r));}
  assert.equal(hashes.size,values.length,form+'/'+key+' aliases choices with details='+details);
 }
});
test('secondary body paint reaches a real opaque assembly on every vehicle, including without details',()=>{
 for(const [form]of V.FORMS)for(const details of [false,true]){const a=V.build({...V.fromPreset(form),secondary:'#28445a',details}),b=V.build({...V.fromPreset(form),secondary:'#d8b876',details});assert.ok(a.parts.some(p=>p.color==='#28445a'),form+' secondary paint unused');assert.ok(b.parts.some(p=>p.color==='#d8b876'));assert.equal(hash(a),hash(b),'paint rolls must not deform the model');}
});
test('coachwork normals are continuous except at deliberate creases and shut lines',()=>{
 // 2026-10-24: character lines and panel grooves split normals on purpose.
 // A split must be a real crease (8 degrees or more), never faint banding.
 for(const form of ['compact','sport','truck','rover']){const recipe=V.fromPreset(form),r=V.build(recipe),p=r.parts.find(p=>p.name==='Sculpted body shell'),seen=new Map();assert.ok(p);
  for(let i=0;i<p.positions.length;i+=3){if(Math.abs(p.positions[i+2])>=recipe.length*.489)continue;const key=Array.from(p.positions.subarray(i,i+3)).map(x=>Math.round(x*1e6)).join(',');if(!seen.has(key))seen.set(key,[]);seen.get(key).push(Array.from(p.normals.subarray(i,i+3)));}
  let split=0;for(const list of seen.values()){let min=1;for(const a of list)for(const b of list)min=Math.min(min,a[0]*b[0]+a[1]*b[1]+a[2]*b[2]);if(min<.999){split++;assert.ok(min<Math.cos(8*Math.PI/180),form+' weld creates a faint shading seam');}}
  // 2026-10-24 phase 2: Faceted and Armored shells fold at every panel edge, so more of their vertices are creases.
  assert.ok(split>0&&split<seen.size*(recipe.bodyStyle==='rounded'?.25:.5),form+' creases are lines, not the whole surface');
 }
});
test('glazed front assemblies and their supporting rails share the same curved envelope',()=>{
 for(const form of ['rover','hover','shuttle','walker']){const r=V.build(V.fromPreset(form)),names=r.parts.map(p=>p.name);assert.ok(names.some(n=>/divider|mullion/.test(n)),form+' requires a supported curved pane rail');for(const p of r.parts)assert.ok(p.normals.every(Number.isFinite));}
});
test('flight cargo pods clear their engines, including at cabin and engine range endpoints',()=>{
 for(const form of ['hover','shuttle'])for(const engineSize of [.7,1.4])for(const wingSpan of [.7,1.4]){
  const recipe=V.normalize({...V.fromPreset(form),flightFit:'cargo',engineSize,wingSpan}),r=V.build(recipe),pods=r.parts.find(p=>p.name==='Outboard cargo pods'),engines=r.parts.find(p=>p.name==='Turbine casings');assert.ok(pods&&engines);
  const xs=p=>Array.from(p.positions.filter((_,i)=>i%3===0&&p.positions[i]>0));assert.ok(Math.min(...xs(pods))>Math.max(...xs(engines)),form+' cargo cuts through engine cowling');
 }
});
test('new vehicle designs keep named runtime wheel and motorcycle rider contracts',()=>{
 for(const form of V.GROUND){const r=V.build(V.fromPreset(form)),side=M.sidecar(r);assert.equal(side.vehicle.forward,'+z');const names=new Set(r.parts.map(p=>p.name));for(const wheel of side.vehicle.wheels){assert.ok(names.has(wheel.part));assert.ok(wheel.with.every(n=>names.has(n)));}if(form==='motorcycle')for(const fairing of ['naked','half','full'])assert.deepEqual(M.sidecar(V.build({...r.recipe,fairing})).vehicle.seats,side.vehicle.seats);}
});

test('ground clearance raises the supported body while wheel centers stay grounded',()=>{
 for(const form of ['compact','sport','truck','rover']){const a=V.build({...V.fromPreset(form),clearance:0}),b=V.build({...V.fromPreset(form),clearance:1}),body=r=>r.parts.find(p=>p.name==='Sculpted body shell'),low=p=>Math.min(...p.positions.filter((_,i)=>i%3===1));assert.ok(low(body(b))-low(body(a))>V.fromPreset(form).height*.06,form+' clearance changes only the bonnet');assert.deepEqual(a.sidecarExtra.vehicle.wheels.map(w=>w.at),b.sidecarExtra.vehicle.wheels.map(w=>w.at));}
});

test('rear lamp lenses sit outward of the body cap instead of disappearing into it',()=>{
 for(const form of ['compact','sport','truck','rover']){const recipe=V.fromPreset(form),r=V.build(recipe),shell=r.parts.find(p=>p.name==='Sculpted body shell'),lens=r.parts.find(p=>p.name==='Tail lamp lens'),z=p=>Array.from(p.positions.filter((_,i)=>i%3===2));assert.ok(Math.max(...z(lens))<Math.min(...z(shell))-recipe.height*.015,form+' lens buried in the body');}
});
