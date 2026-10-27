'use strict';
// Vehicle quality pass 2, 2026-10-24: body styles (Rounded, Faceted, Armored),
// a sealed flight canopy, the baked panel layer, fittings behind Detail
// density, walker/drone hardware, the dark frame material and the insignia.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const V=require('../src/forge/Props/VehicleProp.js'),HW=require('../src/forge/Props/VehicleHardware.js'),P=require('../src/forge/Props/VehiclePanels.js'),M=require('../src/forge/Props/PropModel.js'),Glb=require('../src/utils/GlbOptimizer.js'),{PNG}=require('pngjs');
const tris=r=>r.parts.reduce((n,p)=>n+p.index.length/3,0),encode=t=>{const p=new PNG({width:t.width,height:t.height});p.data=Buffer.from(t.data);return PNG.sync.write(p);};
const hash=r=>{const h=crypto.createHash('sha256');for(const p of r.parts)for(const k of ['positions','index'])h.update(Buffer.from(p[k].buffer,p[k].byteOffset,p[k].byteLength));return h.digest('hex');};
const FORMS=V.FORMS.map(f=>f[0]);

test('one Body style choice per vehicle: per-form defaults, saved and rolled; a recipe saved before styles stays Rounded',()=>{
 assert.deepEqual(FORMS.map(f=>V.fromPreset(f).bodyStyle),['faceted','rounded','faceted','armored','rounded','faceted','faceted','faceted','armored']);
 for(const f of FORMS){
  assert.equal(V.normalize({form:f}).bodyStyle,'rounded','a recipe without a style keeps its saved look');
  for(const s of V.STYLES){const r=V.normalize({...V.fromPreset(f),bodyStyle:s});assert.deepEqual(V.normalize(JSON.parse(JSON.stringify(r))),r);assert.equal(r.bodyStyle,s);}
  assert.equal(V.normalize({form:f,bodyStyle:'chrome'}).bodyStyle,'rounded');
 }
 const old={...V.fromPreset('rover')};delete old.bodyStyle;delete old.detailDensity;delete old.insignia;
 assert.equal(hash(V.build(old)),hash(V.build({...old,bodyStyle:'rounded'})),'missing style builds exactly as Rounded');
 const rolled=new Set(Array.from({length:12},(_,i)=>V.random(i+3,V.fromPreset('truck'),'shape').bodyStyle));assert.ok(rolled.size>1,'a shape roll picks styles');
 assert.equal(V.random(5,V.fromPreset('truck'),'colors').bodyStyle,'faceted','a colors roll keeps the style');
});

test('every form builds three different bodies within budget, keeping wheel, steering and named-panel contracts',async()=>{
 for(const f of FORMS){const hashes=new Set();
  for(const s of V.STYLES){const r=V.build({...V.fromPreset(f),bodyStyle:s});hashes.add(hash(r));const n=tris(r);assert.ok(n<180000,`${f}/${s}: ${n} triangles`);assert.ok(r.parts.length<=(V.GROUND.has(f)&&f!=='motorcycle'?55:30),`${f}/${s}: ${r.parts.length} meshes`);
   for(const p of r.parts){assert.ok(p.positions.every(Number.isFinite)&&p.normals.every(Number.isFinite),f+' finite');assert.ok(p.index.length>0,f+' no empty mesh: '+p.name);}
   if(!V.GROUND.has(f))continue;
   const side=M.sidecar(r),{json}=Glb.parseGlb(await M.toGlb(r,f,encode)),glb=new Set(json.meshes.map(m=>m.name));
   for(const w of side.vehicle.wheels){assert.deepEqual(w.with,[w.part.replace(/tire$/,'rim'),w.part.replace(/tire$/,'brake')]);for(const n of [w.part,...w.with])assert.ok(glb.has(n),`${f}/${s} ${n}`);}
   for(const c of side.vehicle.controls||[])assert.ok(glb.has(c.part));
   if(f!=='motorcycle')for(const n of ['Sculpted body shell','Access door','Formed wheel arches','Tail lamp lens'])assert.ok(glb.has(n),`${f}/${s} ${n}`);
  }
  assert.equal(hashes.size,3,f+' styles alias each other');
 }
});

test('Armored bodies carry bolted plates over a dark under-frame; Faceted bodies fold at crisp creases',()=>{
 for(const f of ['compact','rover','hover','walker']){
  const a=V.build({...V.fromPreset(f),bodyStyle:'armored'}),r=V.build({...V.fromPreset(f),bodyStyle:'rounded'});
  assert.ok(a.parts.some(p=>p.surfaceRole==='frame'),f+' dark frame material');assert.ok(a.parts.some(p=>p.surfaceRole==='armor'||/plates|equipment bays/.test(p.name)),f+' plates');
 }
 // A faceted shell has far more crease vertices (split normals) than the rounded loft.
 const splits=r=>{const p=r.parts.find(p=>p.name==='Sculpted body shell'),seen=new Map();for(let i=0;i<p.positions.length;i+=3){const k=Array.from(p.positions.subarray(i,i+3)).map(x=>Math.round(x*1e5)).join();if(!seen.has(k))seen.set(k,[]);seen.get(k).push(Array.from(p.normals.subarray(i,i+3)));}let n=0;for(const l of seen.values())if(l.some(a=>l.some(b=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2]<.98)))n++;return n/seen.size;};
 for(const f of ['compact','truck'])assert.ok(splits(V.build({...V.fromPreset(f),bodyStyle:'faceted'}))>splits(V.build({...V.fromPreset(f),bodyStyle:'rounded'}))*1.3,f+' faceted creases');
});

// Ray-triangle (Möller–Trumbore).
function hits(parts,o,d,max){
 for(const p of parts){const P=p.positions,I=p.index;for(let k=0;k<I.length;k+=3){const a=I[k]*3,b=I[k+1]*3,c=I[k+2]*3,e1=[P[b]-P[a],P[b+1]-P[a+1],P[b+2]-P[a+2]],e2=[P[c]-P[a],P[c+1]-P[a+1],P[c+2]-P[a+2]],h=[d[1]*e2[2]-d[2]*e2[1],d[2]*e2[0]-d[0]*e2[2],d[0]*e2[1]-d[1]*e2[0]],det=e1[0]*h[0]+e1[1]*h[1]+e1[2]*h[2];if(Math.abs(det)<1e-12)continue;const f=1/det,s=[o[0]-P[a],o[1]-P[a+1],o[2]-P[a+2]],u=f*(s[0]*h[0]+s[1]*h[1]+s[2]*h[2]);if(u<0||u>1)continue;const q=[s[1]*e1[2]-s[2]*e1[1],s[2]*e1[0]-s[0]*e1[2],s[0]*e1[1]-s[1]*e1[0]],v=f*(d[0]*q[0]+d[1]*q[1]+d[2]*q[2]);if(v<0||u+v>1)continue;const t=f*(e2[0]*q[0]+e2[1]*q[1]+e2[2]*q[2]);if(t>1e-4&&t<max)return true;}}
 return false;
}
test('flight cabins are sealed: a one-piece canopy, seal ring, bows and a rear spine; no open back, no roof slab',()=>{
 for(const f of ['hover','shuttle'])for(const s of V.STYLES)for(const flightFit of ['transport','interceptor']){
  const r=V.build({...V.fromPreset(f),bodyStyle:s,flightFit}),names=r.parts.map(p=>p.name).join('|');
  assert.ok(!/Canopy crown|Flight side glass/.test(names),'no car-style roof slab or loose side panes');
  assert.ok(/mullion/.test(names),'framed bows');
  const glass=r.parts.filter(p=>p.surfaceRole==='glass'&&p.opacity<1);assert.ok(glass.length,'see-through canopy keeps the interior visible');
  const seat=r.parts.find(p=>p.name==='Cabin seat upholstery');assert.ok(seat,'cabin interior');
  let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<seat.positions.length;i++){lo[i%3]=Math.min(lo[i%3],seat.positions[i]);hi[i%3]=Math.max(hi[i%3],seat.positions[i]);}
  const head=[(lo[0]+hi[0])/2+(hi[0]-lo[0])*.25,hi[1]+.05,(lo[2]+hi[2])/2];
  for(const d of [[0,1,0],[0,.6,-.8],[0,.2,-1],[.8,.6,0],[-.8,.6,0],[0,.5,.86],[.6,.3,-.74]]){const l=Math.hypot(...d);assert.ok(hits(r.parts,head,d.map(v=>v/l),8),`${f}/${s}/${flightFit}: the pilot's head sees open sky toward ${d}`);}
 }
});

test('the panel layer draws seams and features as height, AO and roughness, and leaves reserved texels clean',()=>{
 const f=new P.Field(240,120,.01,.01,0,0);f.cover.fill(1);f.face.fill(1);for(let j=0;j<120;j++)for(let i=150;i<210;i++)f.keep[j*240+i]=1;
 P.detail(f,{kit:'hull',style:'faceted',density:1,seed:7});
 let carved=0,keepTouched=0,dark=0;for(let k=0;k<f.H.length;k++){if(f.keep[k]){if(f.H[k]!==0||f.A[k]!==1||f.S[k]!==0)keepTouched++;continue;}if(f.H[k]<-.001)carved++;if(f.A[k]<.6)dark++;}
 assert.equal(keepTouched,0,'lettering regions stay clean');assert.ok(carved>200,'seams and recesses carved: '+carved);assert.ok(dark>100,'occluded grooves');
 // On a built vehicle the coating normal map now carries panel-scale relief.
 const tilt=r=>{const t=r.textures['vehicle-coating-normal.png'];let n=0;for(let i=0;i<t.data.length;i+=4)if(t.data[i+2]<244)n++;return n;};
 const on=V.build(V.fromPreset('shuttle')),off=V.build({...V.fromPreset('shuttle'),detailDensity:0});
 assert.ok(tilt(on)>tilt(off)*1.5+5000,`panel relief: ${tilt(on)} tilted texels vs ${tilt(off)}`);
 assert.ok(on.textures['vehicle-coating-normal.png'].width<=2048&&on.textures['vehicle-coating-normal.png'].height<=2048);
});

test('one Detail density control adds fittings on anchors, capped per face and never overlapping',()=>{
 for(const f of FORMS){const a=V.build({...V.fromPreset(f),detailDensity:0}),b=V.build({...V.fromPreset(f),detailDensity:1});if(['sport','motorcycle'].includes(f))continue;assert.ok(tris(b)>tris(a),f+' density adds fittings');}
 assert.equal(hash(V.build({...V.fromPreset('rover'),details:false,detailDensity:0})),hash(V.build({...V.fromPreset('rover'),details:false,detailDensity:1})),'Details off means no fittings');
 const placed=[],c={r:{details:true,surfaceSeed:3,lights:true},H:1,put:()=>{},tube:()=>{}},F=o=>({o,u:[1,0,0],v:[0,0,-1],n:[0,1,0]});
 const anchors=[...Array.from({length:6},(_,i)=>({kind:'antenna',F:F([i*.05,0,0]),size:[.1,.3],face:'roof'})),...Array.from({length:5},(_,i)=>({kind:'vent',F:F([2+i*.5,0,0]),size:[.3,.2],face:'deck'}))];
 placed.push(...HW.fittings(c,anchors,1,3));
 for(const face of ['roof','deck'])assert.ok(placed.filter(a=>a.face===face).length<=3,'cap per face');
 for(const a of placed)for(const b of placed)if(a!==b)assert.ok(Math.hypot(a.F.o[0]-b.F.o[0],a.F.o[1]-b.F.o[1],a.F.o[2]-b.F.o[2])>=(Math.max(...a.size)+Math.max(...b.size))/2-1e-9,'fittings collide');
 assert.equal(V.normalize({form:'rover',detailDensity:4}).detailDensity,1);assert.equal(V.normalize({form:'rover'}).detailDensity,.75);
});

test('walker and drone hardware: frame under plates, bolt-capped joints, piston pairs, vents, louvered pauldrons, stators and guards',()=>{
 const seen=new Map(),spy=(name,fn)=>(...a)=>{seen.set(name,(seen.get(name)||0)+1);return fn(...a);};
 const keep={joint:HW.joint,pistonPair:HW.pistonPair,ventBank:HW.ventBank};
 try{for(const k of Object.keys(keep))HW[k]=spy(k,keep[k]);
  const w=V.build({...V.fromPreset('walker'),bodyStyle:'armored'});assert.ok(seen.get('joint')>=10&&seen.get('pistonPair')>=6&&seen.get('ventBank')>=2,JSON.stringify([...seen]));
  assert.ok(w.parts.some(p=>p.surfaceRole==='frame'));const n=tris(w);assert.ok(n>25000&&n<90000,'walker '+n);
 }finally{Object.assign(HW,keep);}
 const d=V.build({...V.fromPreset('drone'),rotorGuard:'ring'}),open=V.build({...V.fromPreset('drone'),rotorGuard:'open'});assert.ok(d.parts.some(p=>p.surfaceRole==='frame'));assert.ok(tris(d)>tris(open)+2000,'duct guards and stators');
});

test('frame material and stronger lamps; insignia is optional, saved, painted on doors, flanks and fins',()=>{
 const r=V.build(V.fromPreset('compact')),light=r.parts.find(p=>p.surfaceRole==='light');assert.ok(light.emissiveIntensity>=.8);
 for(const f of FORMS)assert.deepEqual(V.fromPreset(f).insignia.layers,[],f+' insignia defaults to none');
 const star={layers:[{shape:'star',color:'#f2efe6',size:.8}]},ink=r=>{const p=r.parts.find(p=>p.name==='Vehicle markings');return p?p.index.length:0;};
 for(const f of ['compact','rover','shuttle','hover','motorcycle']){const a=V.build(V.fromPreset(f)),b=V.build({...V.fromPreset(f),insignia:star});assert.ok(ink(b)>ink(a),f+' insignia decals');
  const saved=V.normalize(JSON.parse(JSON.stringify(b.recipe)));assert.equal(saved.insignia.layers[0].shape,'star');assert.deepEqual(V.normalize(saved),saved);}
 const pic=V.build({...V.fromPreset('rover'),insignia:{layers:[{source:'picture',image:'crest'}]}});assert.equal(pic.imageMissing,true);assert.equal(pic.imageName,'crest');
 const img={width:2,height:2,data:new Uint8Array(16).fill(255)},withPic=V.build({...V.fromPreset('rover'),insignia:{layers:[{source:'picture',image:'crest'}]}},{},{images:{crest:img}});assert.equal(withPic.imageMissing,false);
 // An insignia edit keeps the baked coating.
 const cache={},a=V.build(V.fromPreset('rover'),cache),b=V.build({...V.fromPreset('rover'),insignia:star},cache);assert.ok(a.textures['vehicle-coating-albedo.png'].data===b.textures['vehicle-coating-albedo.png'].data);
});
