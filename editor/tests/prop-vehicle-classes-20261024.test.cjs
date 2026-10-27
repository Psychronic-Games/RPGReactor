'use strict';
// Vehicle quality pass 3, 2026-10-24: every road form has its own class
// proportions (hatchback, mid-engine wedge, pickup, armored patrol truck).
const test=require('node:test'),assert=require('node:assert/strict');
const V=require('../src/forge/Props/VehicleProp.js'),B=require('../src/forge/Props/VehicleBodywork.js');
const box=parts=>{const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const p of parts)for(let i=0;i<p.positions.length;i++){lo[i%3]=Math.min(lo[i%3],p.positions[i]);hi[i%3]=Math.max(hi[i%3],p.positions[i]);}return{lo,hi};};
const part=(r,n)=>r.parts.find(p=>p.name===n);

test('road forms use their own class designs and default dimensions',()=>{
 for(const f of ['compact','sport','truck','rover'])assert.ok(B.DESIGN[f],f);
 const dims=f=>{const r=V.fromPreset(f);return[r.width,r.height,r.length];};
 assert.deepEqual(dims('compact'),[1.76,1.5,3.95]);assert.deepEqual(dims('sport'),[1.98,1.18,4.5]);assert.deepEqual(dims('truck'),[2.02,1.92,5.4]);assert.deepEqual(dims('rover'),[2.55,2.75,6.3]);
 assert.equal(V.fromPreset('compact').wheelbase,.64);assert.equal(V.normalize({form:'compact',wheelbase:.55}).wheelbase,.55,'a saved wheelbase stays');
});

test('glass is about a third of the side on the hatchback; the coupe is low; the wheels are big',()=>{
 for(const f of ['compact','sport','truck','rover'])for(const s of V.STYLES){
  const r=V.build({...V.fromPreset(f),bodyStyle:s}),H=r.recipe.height,w=r.sidecarExtra.vehicle.wheels[0],shell=box([part(r,'Sculpted body shell')]);
  assert.ok(w.radius*2/H>(f==='sport'?.48:.38),`${f}/${s} wheel diameter ${(w.radius*2/H).toFixed(2)} of the height`);
  if(f==='compact'||f==='truck'){const glass=r.parts.filter(p=>p.surfaceRole==='glass'&&p.opacity<1),g=box(glass),side=g.hi[1]-shell.lo[1],ratio=(g.hi[1]-g.lo[1])/side;assert.ok(ratio>.24&&ratio<.42,`${f}/${s} glass ${ratio.toFixed(2)} of the side`);}
 }
 assert.ok(V.fromPreset('sport').height<=1.2);
});

test('the pickup has a separate cab and a deep bed; the armored truck has small windows and outboard wheels',()=>{
 const t=V.build(V.fromPreset('truck')),R=t.sidecarExtra.vehicle.wheels[0].radius,shell=part(t,'Sculpted body shell');
 // A recessed gap between cab and bed: shell vertices pulled inward at one station.
 let gap=0;const P=shell.positions,ys=new Map();for(let i=0;i<P.length;i+=3){const z=Math.round(P[i+2]*1000);ys.set(z,Math.max(ys.get(z)||0,Math.abs(P[i])));}
 const z=[...ys.keys()].sort((a,b)=>a-b);for(let k=1;k+1<z.length;k++)if(ys.get(z[k])<ys.get(z[k-1])-.02&&ys.get(z[k])<ys.get(z[k+1])-.02)gap++;
 assert.ok(gap>=1,'cab-to-bed gap');
 const cargoFloor=Math.min(...Array.from({length:P.length/3},(_,i)=>Math.abs(P[i*3])<.3&&P[i*3+2]<-1&&P[i*3+2]>-2.3&&P[i*3+1]>R*1.2?P[i*3+1]:Infinity));
 const top=box([shell]).hi[1];assert.ok(top-cargoFloor>.25,`bed depth ${(top-cargoFloor).toFixed(2)} m`);assert.ok(cargoFloor>R*1.9,'bed floor over the wheels');
 const sideGlass=r=>{let area=0;for(const p of r.parts){if(p.surfaceRole!=='glass')continue;const P=p.positions,I=p.index;for(let k=0;k<I.length;k+=3){const A=[0,1,2].map(j=>[P[I[k+j]*3],P[I[k+j]*3+1],P[I[k+j]*3+2]]),e=[A[1].map((v,i)=>v-A[0][i]),A[2].map((v,i)=>v-A[0][i])],n=[e[0][1]*e[1][2]-e[0][2]*e[1][1],e[0][2]*e[1][0]-e[0][0]*e[1][2],e[0][0]*e[1][1]-e[0][1]*e[1][0]],l=Math.hypot(...n);if(l&&Math.abs(n[0])/l>.8&&A[0][0]>0)area+=l/2;}}return area/2;};
 const m=V.build(V.fromPreset('rover')),c=V.build(V.fromPreset('compact')),side=r=>r.recipe.length*r.recipe.height;
 assert.ok(sideGlass(m)/side(m)<sideGlass(c)/side(c)*.6,`small deep-set windows: ${(sideGlass(m)/side(m)).toFixed(3)} vs a car's ${(sideGlass(c)/side(c)).toFixed(3)}`);
 const body=box([part(m,'Sculpted body shell')]),wheel=m.sidecarExtra.vehicle.wheels.find(w=>w.side==='left'),tire=box([part(m,wheel.part)]);
 assert.ok(tire.hi[0]>body.hi[0]+.05,'wheels stand outboard of the hull');
 for(const axles of [2,3])assert.equal(V.build({...V.fromPreset('rover'),axles}).sidecarExtra.vehicle.wheels.length,axles*2);
});

test('an older saved recipe still builds, adopting the new class proportions',()=>{
 const old={kind:'vehicle',form:'compact',width:1.75,height:1.48,length:3.45,wheelbase:.62,paint:'#426c80'},r=V.build(old);
 assert.ok(part(r,'Sculpted body shell')&&part(r,'Access door'));assert.equal(r.recipe.length,3.45);assert.equal(r.recipe.bodyStyle,'rounded');
});
