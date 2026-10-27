'use strict';
// Vehicle detail pass, 2026-10-24: wheel/tire kit, creased coachwork with shut lines,
// the lamp kit and draw-call consolidation. The wheel/rider contracts stay exact.
const test=require('node:test'),assert=require('node:assert/strict');
const V=require('../src/forge/Props/VehicleProp.js'),B=require('../src/forge/Props/VehicleBodywork.js'),CM=require('../src/forge/Props/ContainerMesh.js'),M=require('../src/forge/Props/PropModel.js'),Glb=require('../src/utils/GlbOptimizer.js'),{PNG}=require('pngjs');
const ROAD=['compact','sport','truck','rover'],tris=p=>p?p.index.length/3:0,part=(r,n)=>r.parts.find(p=>p.name===n);
const encode=t=>{const p=new PNG({width:t.width,height:t.height});p.data=Buffer.from(t.data);return PNG.sync.write(p);};
// Triangles of one complete wheel (tire, rim, brake) before this pass, per form.
const BEFORE={compact:11624,sport:11624,truck:12104,rover:12104,motorcycle:8744};

test('each wheel costs at least 3k fewer triangles than the former kit',()=>{
 for(const form of Object.keys(BEFORE)){const r=V.build(V.fromPreset(form));for(const w of r.sidecarExtra.vehicle.wheels){const n=tris(part(r,w.part))+w.with.reduce((s,x)=>s+tris(part(r,x)),0);assert.ok(n<=BEFORE[form]-3000,`${form} ${w.part}: ${n}`);assert.ok(n>3000,form+' wheel kept its detail');}}
});

test('tires carry chamfered tread blocks; the pattern is a saved, rollable choice with form defaults',()=>{
 assert.deepEqual(['compact','sport','truck','rover','motorcycle'].map(f=>V.fromPreset(f).treadPattern),['road','road','allTerrain','mud','road']);
 const tire=r=>part(r,r.sidecarExtra.vehicle.wheels[0].part),shapes=new Set();
 for(const treadPattern of ['road','allTerrain','mud']){
  const recipe=V.normalize({...V.fromPreset('truck'),treadPattern});assert.equal(V.normalize(JSON.parse(JSON.stringify(recipe))).treadPattern,treadPattern);
  const on=tire(V.build(recipe)),off=tire(V.build({...recipe,details:false}));assert.ok(tris(on)-tris(off)>=600,treadPattern+' has lug blocks');
  // Chamfers: block tops and their bevels face different ways (flat-shaded bands).
  let bevel=0;for(let i=0;i<on.normals.length;i+=3){const ny=Math.abs(on.normals[i+1]),nz=Math.abs(on.normals[i+2]),nx=Math.abs(on.normals[i]);if(nx>.3&&nx<.9&&Math.hypot(ny,nz)>.3)bevel++;}assert.ok(bevel>100,treadPattern+' blocks are chamfered');
  shapes.add(tris(on)+':'+on.positions.slice(0,600).join());
 }
 assert.equal(shapes.size,3,'patterns build different treads');
 assert.equal(V.normalize({treadPattern:'slick'}).treadPattern,'road');
 const rolled=new Set(Array.from({length:12},(_,i)=>V.random(i+1,V.fromPreset('rover'),'details').treadPattern));assert.ok(rolled.size>1,'details roll picks treads');
 assert.equal(V.random(4,V.fromPreset('rover'),'colors').treadPattern,'mud','a colors roll keeps the tread');
});

test('lamps have a bezel, a reflector bowl at least a quarter of its radius deep, an element and a lens',()=>{
 for(const style of ['round','caged','projector','bar']){
  const got=new Map(),c={r:{lights:true},H:1.5,put:(k,m,n)=>{const key=k+'|'+n;if(!got.has(key))got.set(key,[]);got.get(key).push(m);},tube:()=>{}},F=CM.frame([0,0,0],[1,0,0],[0,1,0]);
  B.lampUnit(c,F,.36,.18,style,false);const names=[...got.keys()];
  for(const want of ['Headlamp housings','Headlamp reflectors','Headlamp lenses'])assert.ok(names.some(n=>n.endsWith(want)),style+' '+want);
  assert.ok(names.some(n=>n.startsWith('light|')),style+' emissive element');
  const bowls=got.get('chrome|Headlamp reflectors');
  for(const m of bowls){let rad=0,lo=Infinity,hi=-Infinity,cx=0,cy=0;const n=m.positions.length/3;for(let i=0;i<n;i++){cx+=m.positions[i*3]/n;cy+=m.positions[i*3+1]/n;}
   for(let i=0;i<n;i++){rad=Math.max(rad,Math.hypot(m.positions[i*3]-cx,m.positions[i*3+1]-cy));lo=Math.min(lo,m.positions[i*3+2]);hi=Math.max(hi,m.positions[i*3+2]);}
   assert.ok(hi-lo>=rad*.25,`${style} reflector ${(hi-lo).toFixed(4)} deep for radius ${rad.toFixed(4)}`);}
 }
 // On the vehicles: the fascia pocket and the tail lens stand out from the body caps.
 for(const form of ROAD){const r=V.build(V.fromPreset(form));assert.ok(r.parts.some(p=>p.surfaceRole==='chrome'),form+' reflectors');assert.ok(r.parts.some(p=>p.surfaceRole==='lens'&&p.opacity<1),form+' clear lenses');assert.ok(part(r,'Tail lamp lens').opacity<1);}
});

test('no black chassis slab under road bodies; the skirt sits below the axles',()=>{
 for(const form of ROAD){
  const recipe=V.fromPreset(form),r=V.build(recipe),shell=part(r,'Sculpted body shell'),low=Math.min(...shell.positions.filter((_,i)=>i%3===1)),wheel=r.sidecarExtra.vehicle.wheels[0];
  assert.ok(low<wheel.at[1],form+' body skirt reaches below the axle line');
  let area=0;
  for(const p of r.parts){if(!['dark','trim'].includes(p.surfaceRole))continue;const P=p.positions,I=p.index;
   for(let k=0;k<I.length;k+=3){const a=[...P.subarray(I[k]*3,I[k]*3+3)],b=[...P.subarray(I[k+1]*3,I[k+1]*3+3)],c=[...P.subarray(I[k+2]*3,I[k+2]*3+3)],e1=b.map((v,i)=>v-a[i]),e2=c.map((v,i)=>v-a[i]),f=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]],l=Math.hypot(...f);
    if(l>0&&f[1]/l<-.9&&Math.max(a[1],b[1],c[1])<low+recipe.height*.12&&Math.abs(a[0])<recipe.width*.3&&Math.abs(a[2])<recipe.length*.4)area+=l/2;}}
  assert.ok(area<.05,`${form}: ${area.toFixed(3)} m² of dark slab under the body`);
 }
});

test('coachwork has split-normal creases, a door cut from the shell and dark arch liners',()=>{
 for(const form of ROAD){const r=V.build(V.fromPreset(form)),door=part(r,'Access door'),shell=part(r,'Sculpted body shell');assert.ok(door&&shell);
  assert.ok(r.parts.some(p=>p.name==='Wheel arch liners'||(p.surfaceRole==='liner'&&p.doubleSided)),form+' arch liners');
  assert.ok(!r.parts.some(p=>/Door seal|Pressed belt line|Bonnet perimeter seal/.test(p.name)),form+' no pasted seals');
  // The door is part of the shell surface: its edge vertices are the shell's own groove vertices.
  const key=(P,i)=>Math.round(P[i]*1e5)+','+Math.round(P[i+1]*1e5)+','+Math.round(P[i+2]*1e5),sx=new Set();for(let i=0;i<shell.positions.length;i+=3)sx.add(key(shell.positions,i));
  let shared=0,n=0;for(let i=0;i<door.positions.length;i+=3){n++;if(sx.has(key(door.positions,i)))shared++;}
  assert.ok(shared/n>.08,form+' door edges meet the shell in the groove');
 }
});

test('meshes are consolidated by material; wheels, steering and named panels stay whole in the GLB',async()=>{
 const LIMIT={compact:45,sport:45,truck:45,rover:52,motorcycle:30,hover:25,shuttle:25,drone:20,walker:20};
 for(const [form]of V.FORMS){const r=V.build(V.fromPreset(form));assert.ok(r.parts.length<=LIMIT[form],`${form}: ${r.parts.length} meshes`);
  const names=new Set(r.parts.map(p=>p.name));assert.equal(names.size,r.parts.length,form+' mesh names are unique');
  if(!V.GROUND.has(form))continue;
  const side=M.sidecar(r),{json}=Glb.parseGlb(await M.toGlb(r,form,encode)),glb=new Set(json.meshes.map(m=>m.name));
  for(const w of side.vehicle.wheels){assert.match(w.part,/^(Front|Rear|Middle)( left| right)? tire$|^(Front|Rear) tire$/);assert.deepEqual(w.with,[w.part.replace(/tire$/,'rim'),w.part.replace(/tire$/,'brake')]);for(const n of [w.part,...w.with])assert.ok(glb.has(n),n);}
  for(const c of side.vehicle.controls||[])assert.ok(glb.has(c.part),c.part);
  if(form!=='motorcycle')for(const n of ['Sculpted body shell','Access door','Formed wheel arches','Tail lamp lens'])assert.ok(glb.has(n),form+' '+n);
 }
});
