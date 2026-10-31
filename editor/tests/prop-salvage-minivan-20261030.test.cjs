'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const V=require('../src/forge/Props/VehicleProp.js'),W=require('../src/forge/Props/WastelandVehicle.js'),F=require('../src/forge/Props/FurnitureProp.js'),S=require('../src/forge/Props/SalvageProp.js'),C=require('../src/forge/Props/PropCatalog.js');
const hash=r=>{const h=crypto.createHash('sha256');for(const t of Object.values(r.textures))h.update(t.data);return h.digest('hex');};
const geometry=r=>{const h=crypto.createHash('sha256');for(const p of r.parts)h.update(Buffer.from(p.positions.buffer,p.positions.byteOffset,p.positions.byteLength));return h.digest('hex');};
const build=(recipe,cache={})=>V.build(recipe,cache,{textureSize:512});
const bounds=p=>{const lo=[Infinity,Infinity,Infinity],hi=lo.map(()=>-Infinity);for(let i=0;i<p.positions.length;i++){const k=i%3;lo[k]=Math.min(lo[k],p.positions[i]);hi[k]=Math.max(hi[k],p.positions[i]);}return{lo,hi};};
test('wasteland transport has its own searchable catalog category and distinct usable running gear',()=>{
 const signatures=new Set();
 for(const [form]of W.FORMS){const r=build(V.fromPreset(form)),t=C.typeOf(r.recipe),block=r.sidecarExtra.vehicle;assert.equal(t.genre,'wasteland');assert.match(t.keywords,/post-apocalyptic/);assert.ok(block.wheels.length>=2);assert.ok(block.seats.length>=1);assert.ok(r.triangles<180000,form+' budget');signatures.add(r.triangles);for(const s of block.seats)assert.ok(s.seat.at[1]>0&&s.footL.at[1]>=0,form+' accessible seat');}
 assert.equal(signatures.size,8);
});
test('minivan seats seven adults in three rows with headroom, aisle space and separate driver controls',()=>{
 for(const dims of [{},{width:1.9,height:1.85,length:5.25},{width:2.4,height:2.4,length:6.2}]){
 const r=build({...V.fromPreset('minivan'),...dims}),seats=r.sidecarExtra.vehicle.seats,c=r.craft.cabin;assert.equal(seats.length,7);assert.equal(r.passengerSeats.length,7);assert.ok(r.parts.some(p=>/upholstery/.test(p.name)));assert.ok(c.roof-c.hip>.98,'adult seated headroom');for(const s of seats){assert.ok(Math.abs(s.seat.at[0])+.225<c.halfWidth);assert.ok(s.footL.at[2]<c.front+.02,'footwell ahead');}assert.ok(r.craft.rowPitch.every(p=>p>=1));assert.ok(seats[0].handL&&seats[0].handR);assert.ok(r.parts.some(p=>p.name===r.sidecarExtra.vehicle.controls[0].part));}
});
test('minivan sliding doors pop outward before travelling, and the liftgate opens outside the cabin',()=>{
 const base=V.fromPreset('minivan'),closed=build(base),open=build({...base,sideDoorOpen:1,tailgateOpen:1});
 const find=(r,n)=>r.parts.find(p=>p.name===n);
 const a=bounds(find(closed,'Minivan sliding door lower panels')),b=bounds(find(open,'Minivan sliding door lower panels'));
 assert.ok(b.hi[0]>a.hi[0]+.15);assert.ok(b.hi[2]<a.hi[2]-.8);
 const rear=bounds(find(closed,'Minivan liftgate lower shell')),raised=bounds(find(open,'Minivan liftgate lower shell'));
 assert.ok(raised.lo[1]>rear.lo[1]+.7);assert.ok(raised.lo[2]<rear.lo[2]-.8);
 assert.equal(open.sidecarExtra.vehicle.seats.length,7);
});
test('corrosion changes real coating maps and stays correct after cache reuse without reshaping the vehicle',()=>{
 const base=V.fromPreset('scrapPickup'),cache={},a=build({...base,corrosion:0},cache),b=build({...base,corrosion:1},cache),fresh=build({...base,corrosion:1});assert.notEqual(hash(a),hash(b));assert.equal(hash(b),hash(fresh));assert.equal(a.triangles,b.triangles);assert.equal(geometry(a),geometry(b),'coating change preserves geometry');
});
test('repair variation changes donor patches while preserving seats and wheel attachments',()=>{
 const base=V.fromPreset('scrapHauler'),a=build({...base,salvageSeed:7}),b=build({...base,salvageSeed:81});assert.notEqual(geometry(a),geometry(b));assert.deepEqual(a.sidecarExtra.vehicle.seats,b.sidecarExtra.vehicle.seats);assert.deepEqual(a.sidecarExtra.vehicle.wheels,b.sidecarExtra.vehicle.wheels);
});
test('rebuilt furniture and salvage have finite grounded geometry, complete materials and bounded detail',()=>{
 for(const [kind,forms]of [[F,['throne','bookshelf','workbench','floorLamp','cabinet','drawers']],[S,['engine','generator','console','scrap','bags']]])for(const form of forms){const r=kind.build(kind.fromPreset?kind.fromPreset(form):{form});assert.ok(r.triangles>100&&r.triangles<180000,form);for(const p of r.parts){assert.ok(p.positions.every(Number.isFinite)&&p.normals.every(Number.isFinite),form);if(p.texture)assert.ok(r.textures[p.texture]);}assert.ok(Math.abs(Math.min(...r.parts.map(p=>bounds(p).lo[1])))<1e-5,form+' ground');}
});
test('working tools retain textured timber handles and separate metallic working heads',async()=>{
 const A=require('../src/forge/Props/AccessoryProp.js');await A.prepare();
 for(const id of ['hammer','pickaxe']){const r=A.build({accessory:{id}});assert.ok(r.parts.some(p=>p.name==='Timber'&&p.metalness===0&&p.normalTexture),id+' timber grain');assert.ok(r.parts.some(p=>/forged head/.test(p.name)&&p.metalness>.75&&p.normalTexture),id+' forged metal');}
 const lantern=A.build({accessory:{id:'lantern'}});assert.ok(lantern.parts.some(p=>p.name==='Accessories'&&p.metalness>.75),'lantern frame remains metal beside transparent glass');
 const scope=A.build({accessory:{id:'stethoscope'}});assert.ok(scope.parts.some(p=>p.name==='Stethoscope steel'&&p.metalness>.75));
});
test('tapered succulent leaves stay within the plant budget at maximum leaf density',()=>{
 const N=require('../src/forge/Props/NatureProp.js');for(const preset of ['echeveria','agave','aloe']){const r=N.build({...N.fromPreset('succulent',preset),character:1}),triangles=r.parts.reduce((n,p)=>n+p.index.length/3,0);assert.ok(triangles<=12000,preset+': '+triangles);for(const p of r.parts)assert.ok(p.positions.every(Number.isFinite)&&p.normals.every(Number.isFinite));}
});
test('rusted machinery has real tangent charts on side faces instead of collapsed normal-map coordinates',()=>{
 for(const form of ['engine','generator','console']){
  const r=S.build({form}),p=r.parts.find(p=>p.name==='Salvage rust'),uv=p.uvs1;assert.ok(uv,form+' physical tangent chart');assert.equal(p.normalTexCoord,1);assert.equal(p.metallicRoughnessTexCoord,1);let valid=0;
  for(let t=0;t<p.index.length;t+=3){const a=p.index[t]*2,b=p.index[t+1]*2,c=p.index[t+2]*2;valid+=Math.abs((uv[b]-uv[a])*(uv[c+1]-uv[a+1])-(uv[c]-uv[a])*(uv[b+1]-uv[a+1]))>1e-12;}
  assert.ok(valid/(p.index.length/3)>.97,form+' degenerate tangent chart');
 }
});
test('new transport remains finite, grounded and within budget at the supported dimension endpoints',()=>{
 for(const form of [...W.IDS,'minivan'])for(const extra of [{width:1,height:1.5,length:2,wheelSize:1.3,axles:3},{width:4,height:3,length:7,roofRack:true,cargo:1,spokes:10,tread:1}]){
  const r=build({...V.fromPreset(form),...extra});assert.ok(r.triangles<180000,form+' endpoint triangles: '+r.triangles);let low=Infinity;
  for(const p of r.parts){assert.ok(p.positions.every(Number.isFinite)&&p.normals.every(Number.isFinite),form+' finite endpoint');assert.ok(p.index.every(i=>i<p.positions.length/3));for(let i=1;i<p.positions.length;i+=3)low=Math.min(low,p.positions[i]);}
  assert.ok(Math.abs(low)<1e-5,form+' endpoint ground');if(r.craft.cabin)assert.ok(r.craft.cabin.roof-r.craft.cabin.hip>.90,form+' endpoint headroom');
 }
});
test('rebuilt lamp retains editable shade, frame material and light colors',()=>{
 const r=F.build({...F.fromPreset('floorLamp'),color:'#a82927',frame:'#7c6241',frameMaterial:'wood',accent:'#8edfff'});
 assert.equal(r.parts.find(p=>p.name.endsWith(' shade')).color,'#a82927');const frame=r.parts.find(p=>p.name.endsWith(' frame'));assert.equal(frame.metalness,0);assert.ok(frame.texture&&r.textures[frame.texture]);assert.equal(r.parts.find(p=>p.name.endsWith(' bulb')).emissive,'#8edfff');
});
test('haft reinforcing plates have physical tangent charts even among many tiny rivets',()=>{
 global.THREE=global.THREE||require('three');const H=require('../src/forge/Props/HaftedProp.js');for(const form of ['warhammer','halberd']){const r=H.build(H.normalize({preset:form})),p=r.parts.find(p=>p.name==='Fittings');assert.ok(p.uvs1,form+' fittings tangent chart');assert.equal(p.normalTexCoord,1);assert.equal(p.metallicRoughnessTexCoord,1);let bad=0;
  for(let i=0;i<p.index.length;i+=3){const ids=[p.index[i],p.index[i+1],p.index[i+2]],a=ids.map(j=>Array.from(p.positions.subarray(j*3,j*3+3))),u=a[1].map((v,k)=>v-a[0][k]),v=a[2].map((v,k)=>v-a[0][k]);if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-12)continue;const uv=ids.map(j=>[p.uvs1[j*2],p.uvs1[j*2+1]]);if(Math.abs((uv[1][0]-uv[0][0])*(uv[2][1]-uv[0][1])-(uv[2][0]-uv[0][0])*(uv[1][1]-uv[0][1]))<1e-12)bad++;}
  assert.equal(bad,0,form+' flat plates must retain a tangent frame');
 }
});
