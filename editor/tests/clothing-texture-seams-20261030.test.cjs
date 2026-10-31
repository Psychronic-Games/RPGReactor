'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../src/forge/Character3D/CharacterFabric.js'),A=require('../src/forge/Character3D/CharacterAtlas.js');

test('edge stitch phase follows the physical perimeter across corners and closes at a whole stitch',()=>{
 const P=Float32Array.of(0,0,0,.061,0,0,.061,.061,0,0,.061,0),piece={verts:[0,1,2,3],border:[[0,1],[1,2],[2,3],[3,0]],neighbors:[[1,3],[0,2],[1,3],[0,2]]};
 const edge=A.edgeField(null,piece,.02,{positions:P}),phase=p=>{const detail={};assert.ok(edge.at(p,null,detail)<1e-5);return detail.edgeAlong;};
 const a=phase([.061-.00001,0,0]),b=phase([.061,.00001,0]);
 assert.ok(Math.abs(b-a)<.00003,'phase crosses a panel corner without restarting');
 const end=phase([0,.00001,0]);assert.ok(Math.abs(end/.003-Math.round(end/.003))<.005,'closing phase fits an integer stitch count');
 assert.ok(phase([.02,0,0])>phase([.01,0,0]),'stitches advance along the actual edge');
});

test('quilting and yarn dye stay continuous through torso and sleeve texture charts',()=>{
 const p={fam:0,s:2,ang:.5,cu:.1,cv:.5,y:1.31,val:1,vm:.06,rest:[.18,1.3,.04],surface:[.19,1.31,.05],px:.0007,rad:.08,su:.23};
 const colors=[[.6,.5,.3],[.25,.2,.1],[.1,.1,.1]],look={pattern:'quilted',material:'cloth'};
 const a=A.shade(look,colors,p,{kind:'quilted'}),b=A.shade(look,colors,{...p,fam:1,ang:p.ang+Math.PI*2,cu:-.9,cv:3,s:8},{kind:'quilted'});
 for(let k=0;k<3;k++)assert.ok(Math.abs(a[k]-b[k])<1e-8,'shoulder chart preserves quilting color');
 for(const kind of ['suiting','jersey','canvas','poplin','felt','cordura']){
  let lo=Infinity,hi=-Infinity,roughLo=Infinity,roughHi=-Infinity;
  for(let i=0;i<400;i++){const R=[i%20*.0008,1.2+Math.floor(i/20)*.0008,.03],v=F.dye(kind,R,.0004);lo=Math.min(lo,v);hi=Math.max(hi,v);const r=F.dye(kind,R,.008);roughLo=Math.min(roughLo,r);roughHi=Math.max(roughHi,r);}
  assert.ok(hi-lo>.045,kind+' has visible yarn variation');assert.ok(hi-lo<.24,kind+' variation preserves chosen cloth color');
  assert.ok(roughHi-roughLo<hi-lo,kind+' finer variation filters with distance');
 }
});

test('tailored wool relief carries visible twill with a bounded physical slope',()=>{
 const t=F.tile('suiting'),d=t.normal.data;let sum=0,worst=0;
 for(let i=0;i<d.length;i+=4){const slope=Math.hypot(d[i]-127.5,d[i+1]-127.5)/127.5;sum+=slope;worst=Math.max(worst,slope);}
 assert.ok(sum/(d.length/4)>.17,'fine twill has enough relief to catch light');assert.ok(worst<.95,'no extreme faceted normal spikes');
});

test('printed checks and plaid do not change when the atlas uses a different packing projection',()=>{
 const p={fam:0,s:2,ang:.7,cu:.1,cv:.5,printU:.124,printV:.88,y:1.2,val:1,vm:.06,rest:[.1,1.2,.05],surface:[.1,1.2,.05],px:.0006,rad:.13,su:.23},colors=[[.2,.3,.1],[.4,.04,.02],[.3,.3,.2]];
 for(const pattern of ['checker','plaid','studs','floral','paisley']){const look={pattern,material:'cloth'},a=A.shade(look,colors,p),b=A.shade(look,colors,{...p,cu:-.7,cv:2.7});
  for(let k=0;k<3;k++)assert.ok(Math.abs(a[k]-b[k])<1e-8,pattern+' has stable paint through an atlas chart join');}
});

test('smart-shirt hex edges meet on the center lattice rather than forming stray star diagonals',()=>{
 const C=require('../src/forge/Character3D/CharacterCyberwear.js'),item={id:'smartShirt',style:'hex',lightStyle:'panels',lightIntensity:1,lightWidth:1},a=.024,cx=a*2,cy=a*Math.sqrt(3)/2*58;
 for(const angle of [0,Math.PI/3,-Math.PI/3]){
  const R=[cx+Math.cos(angle)*a*.5,cy+Math.sin(angle)*a*.5,.1],m=C.glowMask(item,{fam:0,s:2,ang:0,rest:R,val:1});
  assert.ok(m>.05,'shared hex edge is lit at '+angle.toFixed(3)+' rad: '+m.toFixed(4));
 }
});

test('small shoulder faces keep enough texture area for stable cloth normals',async()=>{
 const G=require('../src/forge/Props/GarmentProp.js'),D=require('../src/forge/Character3D/CharacterGarmentDetails.js');await G.prepare();const build=D.build;let entries;
 try{D.build=(...a)=>{entries=a[2];return build(...a);};const result=G.build({garment:{id:'officerJacket'}},{atlasSize:1024}),p=result.parts[0],P=p.positions,U=p.uvs1,span=F.tile(p.fabric).span;let worst=Infinity,count=0;
  for(let t=0;t<p.index.length;t+=3){const ids=Array.from(p.index.subarray(t,t+3));if(ids.some(v=>p.fabricRefs[v*2+1]>=entries[p.fabricRefs[v*2]].laid.rimStart))continue;const [a,b,c]=ids,u=[0,1,2].map(k=>P[b*3+k]-P[a*3+k]),v=[0,1,2].map(k=>P[c*3+k]-P[a*3+k]),area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);if(area<1e-10)continue;
   const uv=Math.abs((U[b*2]-U[a*2])*(U[c*2+1]-U[a*2+1])-(U[c*2]-U[a*2])*(U[b*2+1]-U[a*2+1]))*span[0]*span[1];worst=Math.min(worst,uv/area);count++;}
  assert.ok(count>2000,'sampled curved garment panels');assert.ok(worst>.55,'minimum physical UV-area ratio '+worst.toFixed(6));
 }finally{D.build=build;}
});

test('a pale torso fold cannot repaint a separate navy shoulder in the same projection plane',async()=>{
 const G=require('../src/forge/Props/GarmentProp.js'),D=require('../src/forge/Character3D/CharacterGarmentDetails.js');await G.prepare();const build=D.build;let entries;
 try{D.build=(...a)=>{entries=a[2];return build(...a);};const r=G.build({garment:{id:'officerJacket'}},{atlasSize:2048}),p=r.parts[0],image=r.textures[p.texture],P=p.positions,U=p.uvs;let count=0,bright=0,worst=0;
  for(let t=0;t<p.index.length;t+=3){const ids=Array.from(p.index.subarray(t,t+3));if(ids.some(v=>p.fabricRefs[v*2+1]>=entries[p.fabricRefs[v*2]].laid.rimStart))continue;
   const entry=entries[p.fabricRefs[ids[0]*2]],f=entry.look.printFrame,pos=[0,1,2].map(k=>ids.reduce((sum,v)=>sum+P[v*3+k]/3,0)),y=(pos[1]-f.offset[1])/f.scale;
   if(y<1.35||Math.abs(pos[0])>.3)continue;
   const u=ids.reduce((sum,v)=>sum+U[v*2]/3,0),v=ids.reduce((sum,v)=>sum+U[v*2+1]/3,0),x=Math.min(image.width-1,Math.floor(u*image.width)),z=Math.min(image.height-1,Math.floor(v*image.height)),red=image.data[(z*image.width+x)*4];
   worst=Math.max(worst,red);if(red>130)bright++;count++;
  }
  assert.ok(count>100,'checked actual upper-panel paint');assert.equal(bright,0,'unexpected pale shoulder texels '+bright+'; maximum red '+worst);
 }finally{D.build=build;}
});

test('a sewn internal waist cannot stamp a second contrast binding onto the joined cloth',()=>{
 const P=Float32Array.of(0,0,0,.061,0,0,.061,.061,0,0,.061,0),piece={verts:[0,1,2,3],border:[[0,1],[1,2],[2,3],[3,0]],neighbors:[[1,3],[0,2],[1,3],[0,2]]};
 const edge=A.edgeField(null,piece,.02,{positions:P,internalHem:Uint8Array.of(1,1,0,0)});
 assert.equal(edge.at([.03,0,0]),Infinity,'joined waist is no longer an open edge');
 assert.ok(edge.at([.03,.061,0])<1e-8,'the genuine exposed cut keeps its binding');
});

// Folded returns have their own distance coordinates, so the internal-join
// mask must survive atlas interpolation as well as edge-field construction.
test('a folded return at a joined waist keeps cloth color instead of a stray gold stripe',()=>{
 const p={fam:0,s:2,ang:0,cu:.1,cv:.001,y:1,val:-.001,vm:.03,rest:[.1,1,.03],surface:[.1,1,.03],px:.0003};
 const look={material:'cloth',physicalBinding:true,surfaceBinding:true,trimWidth:.035,bindingWidth:.0035},colors=[[.3,.04,.18],[.3,.04,.18],[.9,.7,.1]];
 const exposed=A.shade(look,colors,p),joined=A.shade(look,colors,{...p,trimSuppressed:1});
 assert.ok(exposed[1]>joined[1]*10,'exposed rolled edge retains gold binding');
 assert.ok(joined[1]<.08,'sewn waist return retains the garment dye');
});

test('supporting pelvis cloth never repeats the outer gown decoration',async()=>{
 const G=require('../src/forge/Props/GarmentProp.js'),D=require('../src/forge/Character3D/CharacterGarmentDetails.js');await G.prepare();const build=D.build;let entries;
 try{D.build=(...a)=>{entries=a[2];return build(...a);};G.build({garment:{id:'gown'}},{atlasSize:256});const inner=entries.filter(e=>e.lining);assert.ok(inner.length);for(const e of inner){assert.equal(e.look.trimWidth,0);assert.equal(e.look.surfaceBinding,false);}}
 finally{D.build=build;}
});

test('an open suit jacket joins its waist without extending its finished hem',async()=>{
 const G=require('../src/forge/Props/GarmentProp.js'),D=require('../src/forge/Character3D/CharacterGarmentDetails.js');await G.prepare();const build=D.build;let entries;
 try{D.build=(...a)=>{entries=a[2];return build(...a);};for(const open of [0,.25,.65]){G.build({garment:{id:'suitjacket',open}},{atlasSize:256});const top=entries.find(e=>!e.skirt&&!e.lining).laid,skirt=entries.find(e=>e.skirt).laid;assert.ok(skirt.sewnWaist,'open '+open+' has a joined waist');const P=top.positions,roots=top.piece.border.flat().filter(v=>top.internalHem[v]),start=Math.min(...skirt.field.slice(0,skirt.rimStart).map(f=>f.u));let checked=0,worst=0,minY=Infinity;
 for(let v=0;v<skirt.rimStart;v++){minY=Math.min(minY,skirt.positions[v*3+1]);if(!skirt.piece.onBorder[v]||skirt.field[v].u>start+.03)continue;let best=Infinity;for(const w of roots)best=Math.min(best,Math.hypot(...[0,1,2].map(k=>skirt.positions[v*3+k]-P[w*3+k])));worst=Math.max(worst,best);checked++;}
 assert.ok(checked>15);assert.ok(worst<.04,'waist gap '+worst.toFixed(4)+' m at open '+open);assert.ok(minY>.72,'jacket retains its short hem: '+minY.toFixed(3));}}
 finally{D.build=build;}
});
