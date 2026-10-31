'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/forge/Props/GarmentProp.js'),O=require('../src/forge/Character3D/CharacterOutfit.js'),F=require('../src/forge/Character3D/CharacterFabric.js');
test.before(()=>G.prepare());
const dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0);
function faces(part,fn){const P=part.positions,I=part.index;for(let t=0;t<I.length;t+=3){const ids=[I[t],I[t+1],I[t+2]],p=ids.map(i=>Array.from(P.subarray(i*3,i*3+3))),u=p[1].map((x,k)=>x-p[0][k]),v=p[2].map((x,k)=>x-p[0][k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];fn(ids,p,n);}}

test('woven relief uses complete UV charts across curved corners and retains painting, skin and sewing attributes',()=>{
 const part={positions:Float32Array.of(0,0,0,1,0,0,0,1,0,0,0,1),normals:Float32Array.of(1,0,0,0,1,0,0,0,1,0,1,0),index:Uint32Array.of(0,1,2,0,3,1),
  uvs:Float32Array.of(.1,.1,.9,.1,.1,.9,.9,.9),joints:Uint8Array.of(1,0,0,0,2,0,0,0,3,0,0,0,4,0,0,0),weights:Float32Array.of(1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0),sewnRefs:Int32Array.of(0,10,0,20,0,30,0,40),source:Int32Array.of(0,1,2,3)};
 const originalUV=Float32Array.from(part.uvs);F.applyTo(part,'canvas',[]);
 assert.equal(part.index.length,6);assert.ok(part.positions.length/3>4,'chart boundary splits the shared corners');
 faces(part,ids=>{const U=part.uvs1,[a,b,c]=ids;assert.ok(Math.abs((U[b*2]-U[a*2])*(U[c*2+1]-U[a*2+1])-(U[c*2]-U[a*2])*(U[b*2+1]-U[a*2+1]))>1e-6,'each visible face has a non-collapsed weave chart');});
 for(let v=0;v<part.positions.length/3;v++){const old=part.source[v];assert.equal(part.joints[v*4],old+1);assert.equal(part.weights[v*4],1);assert.equal(part.sewnRefs[v*2+1],(old+1)*10);assert.equal(part.uvs[v*2],originalUV[old*2]);assert.equal(part.uvs[v*2+1],originalUV[old*2+1]);}
});

test('finishing a cuff removes alternating edge chatter while preserving its opening and bounding movement',()=>{
 const count=64,P=new Float32Array(count*2*3),index=[],border=[],neighbors=Array.from({length:count*2},()=>new Set());
 for(let i=0;i<count;i++){const a=i/count*Math.PI*2;P.set([Math.cos(a)*.2,1+(i%2?-.006:.006),Math.sin(a)*.2],i*3);P.set([Math.cos(a)*.2,1.06,Math.sin(a)*.2],(i+count)*3);const b=(i+1)%count;index.push(i,b,i+count,b,b+count,i+count);border.push([i,b]);}
 for(let t=0;t<index.length;t+=3)for(let k=0;k<3;k++){const a=index[t+k];neighbors[a].add(index[t+(k+1)%3]);neighbors[a].add(index[t+(k+2)%3]);}
 const before=Float32Array.from(P),piece={border,index:Uint32Array.from(index),neighbors:neighbors.map(n=>[...n])};O.finishBorder(piece,P,Float32Array.from(P));
 let height=0,worst=0;for(let i=0;i<count;i++){height=Math.max(height,Math.abs(P[i*3+1]-1));worst=Math.max(worst,Math.hypot(...[0,1,2].map(k=>P[i*3+k]-before[i*3+k])));assert.ok(Math.abs(Math.hypot(P[i*3],P[i*3+2])-.2)<.002,'cuff retains its diameter');}
 assert.ok(height<.002,'edge chatter falls below two millimeters');assert.ok(worst<=.01201);
});

test('contrast bindings color the rolled cloth edge without a second overlapping ribbon and retain skinning',()=>{
 const D=require('../src/forge/Character3D/CharacterGarmentDetails.js'),build=D.build;let entries;
 try{D.build=(...args)=>{const parts=build(...args);entries=args[2];return parts;};
  for(const id of ['gambeson','vest','tabard','offShoulder','cyberTrench']){
   const r=G.build({garment:{id}},{atlasSize:1024});
   assert.ok(!r.parts.some(p=>p.name==='Sewn garment edges'),id+' has no loose strip over its rolled hem');
   let rolled=0,contrasts=0;
   for(const e of entries)if(e.look.physicalBinding){assert.ok(e.look.surfaceBinding,id+' binding is painted on the cloth');assert.ok(e.look.bindingWidth>=.003&&e.look.bindingWidth<=.006);contrasts++;}
   for(const p of r.parts.filter(p=>p.fabricRefs)){
    assert.ok(r.textures[p.texture],id+' painted rim texture');
    for(let v=0;v<p.positions.length/3;v++){const e=entries[p.fabricRefs[v*2]],source=p.fabricRefs[v*2+1];if(source<e.laid.rimStart)continue;rolled++;
     assert.ok(Math.abs(p.weights.subarray(v*4,v*4+4).reduce((sum,x)=>sum+x,0)-1)<1e-5,id+' rolled edge skin weights');}
   }
   assert.ok(rolled>40,id+' keeps a real turned fabric edge');if(id==='gambeson'||id==='tabard')assert.ok(contrasts>0,id+' contrast binding remains');
  }
 }finally{D.build=build;}
});

test('standalone cloth and imported outfits have textured inward surfaces at full authoring quality',()=>{
 for(const id of ['vest','cropTop','jeans','mh_sweater','mh_viking_tunic','ss_carol_uniform','ss_vay_robes']){
  const r=G.build({garment:{id}},{atlasSize:1024}),linings=r.parts.filter(p=>p.rrLining);assert.ok(linings.length,id+' has an inward surface');
  for(const p of linings){assert.ok(p.uvs1?.length,id+' lining UVs');assert.ok(r.textures[p.normalTexture],id+' lining weave');assert.ok(p.texture&&r.textures[p.texture],id+' lining color');}
 }
});

test('neck bands and stitching measure their width from the finished edge on a shaped body',()=>{
 const D=require('../src/forge/Character3D/CharacterGarmentDetails.js'),build=D.build;let entries;
 try{
  D.build=(...args)=>{const parts=build(...args);entries=args[2];return parts;};
  G.build({garment:{id:'cropTop'},body:{gender:0,weight:.9,muscle:.8}},{atlasSize:256});
  assert.ok(entries?.length);
  let sampled=0;
  for(const entry of entries)for(const v of new Set(entry.laid.piece.border.flat())){
   assert.ok(entry.laid.edge[v]<1e-6,'the finished cut is zero distance from its own band');sampled++;
  }
  assert.ok(sampled>30);
 }finally{D.build=build;}
});

test('fresh cloth dye stays continuous when neighboring faces belong to different UV charts',()=>{
 const A=require('../src/forge/Character3D/CharacterAtlas.js'),look={pattern:'solid',material:'cloth',trimWidth:0},colors=[[.08,.12,.2],[.08,.12,.2],[.04,.05,.06]];
 for(const kind of ['denim','canvas','poplin','suiting']){
  const point={fam:3,s:.6,ang:0,cu:.1,cv:.3,y:.72,val:1,vm:.12,u:0,rest:[.1,.72,.05],surface:[.11,.73,.06],su:.3,rad:.06,px:.001};
  const a=A.shade(look,colors,point,{kind,hip:.885}),b=A.shade(look,colors,{...point,cu:1.7,cv:-.8},{kind,hip:.885});
  for(let k=0;k<3;k++)assert.ok(Math.abs(a[k]-b[k])<1e-6,kind+' dye crosses the chart seam without a color break');
 }
});

test('captain shoulder tabs and embroidered badge are small fitted patches rather than stretched projection fallback sheets',()=>{
 const r=G.build({garment:{id:'ss_carol_uniform'}},{atlasSize:256}),patch=r.parts.find(p=>p.name==='Captain tailored shoulder tabs and badge');assert.ok(patch);
 let worst=0;faces(patch,(ids,p)=>{for(let k=0;k<3;k++)worst=Math.max(worst,Math.hypot(...p[k].map((x,j)=>x-p[(k+1)%3][j])));});
 assert.ok(worst<.055,'maximum patch triangle edge '+worst.toFixed(4)+' m');
});

test('closed footwear has full inward uppers with its own woven color rather than exterior laces',()=>{
 for(const id of ['sneakers','boots','sabatons']){
  const r=G.build({garment:{id}},{atlasSize:1024}),p=r.parts.find(p=>p.rrLining&&/lining$/.test(p.name));assert.ok(p,id+' interior');
  assert.ok(p.index.length>300,id+' complete upper, not only a collar return');
  assert.equal(p.texture,'fabric-poplin-albedo.png');assert.ok(r.textures[p.texture]);
  assert.ok(p.positions.every(Number.isFinite));
 }
});

test('vertical prints cross texture charts and wrap their back seam continuously',()=>{
 const A=require('../src/forge/Character3D/CharacterAtlas.js'),look={pattern:'vstripes',scale:1.5,trimWidth:0},colors=[[.08,.12,.2],[.2,.1,.15],[.04,.05,.06]],point={fam:0,s:1.2,ang:.6,cu:.1,cv:.3,y:1.1,val:1,vm:.12,u:0,rest:[.1,1.1,.05],su:.3,rad:.13,px:.0005};
 const a=A.shade(look,colors,point),b=A.shade(look,colors,{...point,cu:1.7,cv:-.8,ang:point.ang+Math.PI*2});
 for(let k=0;k<3;k++)assert.ok(Math.abs(a[k]-b[k])<1e-6);
});

test('corset construction has attached boning, front hardware and rear cross lacing',()=>{
 const r=G.build({garment:{id:'corset'}},{atlasSize:1024});
 for(const name of ['Corset cross lacing','Garment hardware','Top-stitching']){
  const p=r.parts.find(p=>p.name===name);assert.ok(p,name);assert.ok(p.index.length>0);assert.ok(p.detailAnchors?.length||p.sewnRefs?.length||p.joints?.length,name+' bound to the cloth');
 }
});

test('smart-shirt display stays on flat cloth panels and leaves neck and shoulders solid',()=>{
 const C=require('../src/forge/Character3D/CharacterCyberwear.js'),item={id:'smartShirt',style:'hex',lightIntensity:1,lightStyle:'panels',lightWidth:1};
 for(const style of ['hex','rain','pulse'])for(const p of [{fam:0,s:3.7,ang:0,rest:[.18,1.38,.07],val:1},{fam:1,s:1.02,ang:1,rest:[.2,1.35,.02],val:1}])assert.equal(C.glowMask({...item,style},p),0);
 let active=0;for(let y=1.05;y<1.28;y+=.003)for(let x=-.10;x<.10;x+=.003)active+=C.glowMask(item,{fam:0,s:2,ang:0,rest:[x,y,.10],val:1})>.1;
 assert.ok(active>100,'the chest display remains visible');
});

test('pocket panels clear their supporting cloth between fitted corners',()=>{
 const D=require('../src/forge/Character3D/CharacterGarmentDetails.js'),build=D.build;
 try{for(const id of ['swimTrunks','cargoTrousers']){
  let entries;D.build=(...args)=>{const parts=build(...args);entries=args[2];return parts;};
  const r=G.build({garment:{id}},{atlasSize:256}),surfaces=new Map();let checked=0,worst=0;
  for(const p of r.parts.filter(p=>p.name==='Garment construction'&&p.detailAnchors))faces(p,(ids,points)=>{
   const entry=entries[p.detailAnchors[ids[0]*10]];if(!entry)return;
   const hint=[0,1,2].map(k=>ids.reduce((sum,v)=>{const a=v*10;return sum+[1,2,3].reduce((n,j)=>n+entry.laid.normals[p.detailAnchors[a+j]*3+k]*p.detailAnchors[a+3+j],0);},0));
   const axis=Math.abs(hint[0])>Math.abs(hint[2])?0:2;if(Math.abs(hint[axis])<Math.abs(hint[1])*1.3)return;
   const key=entry.laid.fabricEntry+':'+axis;let surface=surfaces.get(key);if(!surface){surface=O.projectedSurface([{positions:entry.laid.positions,index:entry.laid.piece.index}],{cell:.025,...(axis===0?{axes:[[0,0,1],[0,1,0],[1,0,0]]}:{})});surfaces.set(key,surface);}
   const side=Math.sign(hint[axis]),q=[0,1,2].map(k=>points.reduce((sum,P)=>sum+P[k],0)/3),hit=surface.sample(q[axis===0?2:0],q[1],side);if(!hit)return;
   const depth=(hit.depth-q[axis])*side;if(depth>.02)return;worst=Math.max(worst,depth);checked++;
  });
  assert.ok(checked>100,id+' sampled panel spans');assert.ok(worst<.0015,id+' deepest crossing '+worst.toFixed(5)+' m');
 }}finally{D.build=build;}
});

test('apron has a neck suspension loop and a waistband behind its front bib',()=>{
 const D=require('../src/forge/Character3D/CharacterGarmentDetails.js'),build=D.build;let entries;
 try{D.build=(...args)=>{const parts=build(...args);entries=args[2];return parts;};G.build({garment:{id:'apron'}},{atlasSize:256});}finally{D.build=build;}
 const bounds=e=>[0,1,2].map(k=>{const v=Array.from({length:e.laid.positions.length/3},(_,i)=>e.laid.positions[i*3+k]);return [Math.min(...v),Math.max(...v)];});
 const bib=bounds(entries[0]),waist=bounds(entries[2]),loop=bounds(entries[3]);
 assert.ok(waist[0][1]-waist[0][0]>.25,'waistband reaches both sides');assert.ok(waist[2][1]-waist[2][0]>.17,'waistband wraps behind the wearer');
 assert.ok(loop[1][0]<bib[1][1]-.005,'neck straps join the top of the bib');assert.ok(loop[1][1]>bib[1][1]+.07,'loop reaches the neck');
});

test('legacy carriers and armor interiors retain complete physical material charts and sewing attributes',()=>{
 for(const id of ['loincloth','tacvest','reconArmor','scrapArmor','scrapPauldrons','gauntlets','cyberChest','cyberPauldrons','cyberBracers','cyberLegs']){
  const r=G.build({garment:{id}},{atlasSize:1024});assert.ok(r.parts.some(p=>p.normalTexture),id+' surface relief');
  for(const p of r.parts){
   const n=p.positions.length/3;if(p.sewnRefs)assert.equal(p.sewnRefs.length,n*2,id+' sewing references match split vertices');if(p.detailAnchors)assert.equal(p.detailAnchors.length,n*10,id+' cloth anchors match split vertices');
   if(p.rrLining){assert.ok(p.texture&&r.textures[p.texture],id+' lining color map');assert.ok(p.normalTexture&&r.textures[p.normalTexture],id+' inward material relief');}
   if(p.normalTexCoord!==1)continue;
   // Ignore nanoscopic slivers created by offsetting welded source seams.
   faces(p,(ids,points,normal)=>{if(Math.hypot(...normal)<1e-9)return;const [a,b,c]=ids,U=p.uvs1;assert.ok(U&&Math.abs((U[b*2]-U[a*2])*(U[c*2+1]-U[a*2+1])-(U[c*2]-U[a*2])*(U[b*2+1]-U[a*2+1]))>1e-10,id+' visible face has physical material coordinates');});
  }
 }
});

test('fingerless gloves keep a real wrist opening and five separate digit ports on each hand',()=>{
 const D=require('../src/forge/Character3D/CharacterGarmentDetails.js'),build=D.build;
 try{for(const id of ['fingerlessGloves','techGloves']){
  let entry;D.build=(...args)=>{const result=build(...args);entry=args[2].find(e=>!e.lining);return result;};G.build({garment:{id}},{atlasSize:256});
  const L=entry.laid,adj=new Map();for(const [a,b]of L.piece.border){if(!adj.has(a))adj.set(a,[]);if(!adj.has(b))adj.set(b,[]);adj.get(a).push(b);adj.get(b).push(a);}
  const seen=new Set();let loops=0;for(const first of adj.keys()){
   if(seen.has(first))continue;const loop=[first];let prior=-1,at=first;
   do{seen.add(at);assert.equal(adj.get(at).length,2,id+' closed cut boundary');const next=adj.get(at).find(v=>v!==prior);prior=at;at=next;if(at!==first)loop.push(at);}while(at!==first&&loop.length<=adj.size);
   assert.equal(at,first,id+' closed port');loops++;
   const origin=Array.from(L.positions.subarray(first*3,first*3+3)),area=[0,0,0];for(let i=0;i<loop.length;i++){const a=[0,1,2].map(k=>L.positions[loop[i]*3+k]-origin[k]),b=[0,1,2].map(k=>L.positions[loop[(i+1)%loop.length]*3+k]-origin[k]);area[0]+=a[1]*b[2]-a[2]*b[1];area[1]+=a[2]*b[0]-a[0]*b[2];area[2]+=a[0]*b[1]-a[1]*b[0];}
   assert.ok(Math.hypot(...area)/2>2e-6,id+' port keeps a physical opening after finishing');
  }
  assert.equal(loops,12,id+' two wrists, two thumbs and eight finger ports');
 }}finally{D.build=build;}
});
