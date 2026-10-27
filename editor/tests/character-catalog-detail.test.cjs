'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Q=require('./helpers/character-quality-matrix.cjs'),W=require('../src/forge/Character3D/CharacterWardrobe.js'),P=require('../src/forge/Character3D/CharacterProps.js'),D=require('../src/forge/Character3D/CharacterDetail.js');
let pack;test.before(async()=>{pack=await Q.Body.loadPack();});
const sound=(parts,bones)=>{assert.ok(parts.length);for(const p of parts){assert.ok(p.positions.every(Number.isFinite));assert.ok(p.normals.every(Number.isFinite));assert.ok(p.index.every(i=>i<p.positions.length/3));for(let v=0;v<p.positions.length/3;v++){let sum=0;for(let k=0;k<4;k++){assert.ok(p.joints[v*4+k]<bones.length);sum+=p.weights[v*4+k];}assert.ok(Math.abs(sum-1)<1e-5);}}};

test('new constructed garments and brooch fit both sexes and opposing body extremes',()=>{
 for(const gender of [0,1])for(const shape of [{},{weight:2,cup:2,shapes:{hips:2,belly:2}},{weight:0,muscle:2,height:1.5,shapes:{shoulders:2}}]){
  const body=Q.Body.build(pack,{gender,age:30,...shape});
  for(const id of ['gambeson','tabard']){
   const dressed=W.build(pack,body,[{id},{id:'jeans'}],{atlasSize:128});sound(dressed.parts,body.bones);
   const prop=P.build(pack,body,[{id:'brooch'}],[],{outfitParts:dressed.parts});sound(prop.parts,body.bones);
   const L=prop.landmarks,positions=prop.parts[0].positions;
   assert.ok(positions.length>600,'modeled bezel, facets, beading and prongs');
   for(let i=0;i<positions.length;i+=3)assert.ok(positions[i+2]>=L.frontAt0(positions[i+1],positions[i])-.012,'brooch is outside the shaped chest');
  }
 }
});

test('shirt fasteners follow the fitted garment and disappear under a closed outer layer',()=>{
 // (2026-10-24: a shirt is buttoned by the construction kit, RRCharacterGarmentDetails.construct.)
 const body=Q.Body.build(pack,{gender:1,age:30});
 const bare=W.build(pack,body,[{id:'shirt'}],{atlasSize:128}),part=bare.parts.find(p=>p.name==='Garment buttons');
 assert.ok(part&&part.index.length>600,'separate button solids, holes and stitches');sound([part],body.bones);
 const covered=W.build(pack,body,[{id:'shirt'},{id:'leatherarmor'}],{atlasSize:128});
 const outer=covered.parts.find(p=>p.name==='Garment buttons');
 assert.ok(!outer||outer.positions.length<part.positions.length,'buried shirt buttons are omitted');
});

test('joined dresses include a fitted pelvis lining independent of the free skirt',()=>{
 for(const id of ['robe','gown','dress','ballGown','qipao']){
  const body=Q.Body.build(pack,{gender:0,age:30}),out=W.build(pack,body,[{id}],{atlasSize:128});
  const lining=out.parts.find(p=>p.name.includes('lining'));assert.ok(lining,id+' has an inner yoke');
  assert.ok(!lining.hang,'the yoke stays with the hips while the skirt simulates');
  const hip=body.bones.find(b=>b.name==='Hips').head,seat=[];
  for(let i=0;i<lining.positions.length;i+=3)if(lining.positions[i+1]<hip[1]+.06&&lining.positions[i+1]>hip[1]-.08&&lining.positions[i+2]<hip[2])seat.push(i);
  assert.ok(seat.length>12,id+' has actual rear fabric over the pelvis');sound([lining],body.bones);
 }
 const body=Q.Body.build(pack,{gender:1}),open=W.build(pack,body,[{id:'tabard'}],{atlasSize:128});
 // 'Garment linings' (RRCharacterWardrobe.garmentLinings) is the dark inner face along every open edge, cuffs, hems
 // and the tabard's own split sides included; it is not a pelvis yoke, so it does not close the open panels.
 assert.ok(!open.parts.some(p=>p.name.includes('lining')&&p.name!=='Garment linings'),'split tabards retain their open panels');
});

test('skirt prints stay continuous across the rear hip chart instead of stretching into a fan',()=>{
 const body=Q.Body.build(pack,{gender:1,age:30});
 for(const id of ['kilt','pleatedSkirt'])for(const shape of [body,Q.Body.build(pack,{gender:0,weight:2,shapes:{hips:2}})]){
  const out=W.build(pack,shape,[{id}],{atlasSize:256});
  for(const p of out.parts.filter(p=>p.texture==='outfit.png'))for(let t=0;t<p.index.length;t+=3){const u=[0,1,2].map(k=>p.uvs[p.index[t+k]*2]);assert.ok(Math.max(...u)-Math.min(...u)<.10,id+' has local UV edges around the rear seam');}
  // The hem is the skirt's own turned cloth: it shares the skirt's cloth rig (a contrast band, when there is one, too).
  const skirt=out.parts.find(p=>p.texture==='outfit.png'&&p.hang);assert.ok(skirt&&skirt.hang.some(v=>v>=0),'the turned hem shares the skirt cloth rig');sound([skirt],shape.bones);
  const edge=out.parts.find(p=>p.name==='Sewn garment edges');if(edge){assert.ok(edge.hang?.some(v=>v>=0),'a trim band shares the skirt cloth rig');sound([edge],shape.bones);}
 }
});

test('tufts sample their own coat texels and interpolate attachment weights across a triangle',()=>{
 const fake={skinJoints:Uint8Array.from([0,0,0,0,1,0,0,0,2,0,0,0]),skinWeights:Float32Array.from([1,0,0,0,1,0,0,0,1,0,0,0])};
 const s={tri:[0,1,2],w:[.2,.3,.5],uv:[0,0],flow:[0,-1,0],twist:0,lane:2,shade:1,len:.02,lean:.2,curl:0};
 const part=D.hairPart(fake,Float32Array.from([0,0,0,1,0,0,0,1,0]),Float32Array.from([0,0,1,0,0,1,0,0,1]),[s],'#ff0000',{picture:{width:1,height:2,data:Uint8Array.from([0,255,0,255,0,0,255,255])}});
 assert.equal(part.colors[0],0);assert.ok(part.colors[1]>.7);assert.equal(part.colors[2],0,'UV row zero samples green, not the inverted blue row');
 for(let v=0;v<part.positions.length/3;v++){const weights=new Map(Array.from({length:4},(_,k)=>[part.joints[v*4+k],part.weights[v*4+k]]).filter(([,w])=>w>0));for(const[j,w]of [[0,.2],[1,.3],[2,.5]])assert.ok(Math.abs(weights.get(j)-w)<1e-6);}
});

test('short fur uses a stable alpha cut in the actual preview material',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),THREE=require('three'),context=vm.createContext({THREE,window:{}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/forge/Character3D/Character3DBuilder.js'),'utf8')+'\nglobalThis.Builder=Character3DBuilder;',context);
 const b=Object.create(context.Builder.prototype),material=b._material({kind:'hair',cutout:true,onSkin:true,roughness:.8},{textures:{}},null,null);
 assert.equal(material.alphaToCoverage,false,'short tufts must not expand into bright card rectangles');assert.equal(material.alphaTest,.3);material.dispose();
});

test('the Face view aims at Slimefolk eyes instead of zooming inside the goo',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),THREE=require('three'),context=vm.createContext({THREE,window:{}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/forge/Character3D/Character3DBuilder.js'),'utf8')+'\nglobalThis.Builder=Character3DBuilder;',context);
 const b=Object.create(context.Builder.prototype);b._view={camera:{fov:35,aspect:1}};
 for(const form of [0,.5,1]){const r=Q.Model.build(null,{plan:'slime',species:'slimefolk',form},{},{quality:'preview',static:true});b._faceFrame(r);
  const eyes=r.parts.find(p=>p.kind==='eye'),z=[];for(let i=2;i<eyes.positions.length;i+=3)z.push(eyes.positions[i]);
  assert.ok(b._view.faceCenter[2]>=Math.min(...z)-.02&&b._view.faceCenter[2]<=Math.max(...z)+.02);assert.ok(b._view.faceDistance>=.5);
 }
});

test('quilted padding adds relief independently of the color map and survives GLB export',()=>{
 const body=Q.Body.build(pack,{gender:1,age:30}),built=W.build(pack,body,[{id:'gambeson'}],{atlasSize:1024});
 // The padding is the cloth's own repeating tile on the second coordinates (RRCharacterFabric), not the outfit picture's.
 const padded=built.parts.find(p=>p.fabric==='quilted');assert.ok(padded&&padded.normalTexCoord===1&&padded.uvs1);
 const normal=built.textures.find(t=>t.name===padded.normalTexture);assert.ok(normal&&normal.repeat);
 assert.ok(normal.data.some((v,i)=>i%4===0&&Math.abs(v-128)>25),'broad diagonal padding relief');
 const Glb=require('../src/forge/Character3D/CharacterGlb.js'),Opt=require('../src/utils/GlbOptimizer.js');
 const textures=Object.fromEntries(built.textures.map(t=>[t.name,t]));if(built.texture)textures[built.texture.name]=built.texture;
 const result={...body,plan:'human',parts:built.parts,textures};
 const {PNG}=require('pngjs'),images=Object.fromEntries(Object.entries(textures).map(([name,t])=>[name,PNG.sync.write({width:t.width,height:t.height,data:Buffer.from(t.data)})]));
 const parsed=Opt.parseGlb(Glb.toGlb(result,{name:'Padded coat',images}));
 assert.ok(parsed.json.materials.some(m=>m.normalTexture&&m.normalTexture.texCoord===1),'saved material retains padded relief on its tile coordinates');
});

test('bird and bat eye centers stay embedded in their head rather than floating outside',()=>{
 const recipes=['owl','crow','sparrow','pigeon','duck','chicken','parrot','flamingo','hummingbird','penguin'].map(type=>Q.Creature.withVariant(Q.Creature.kindRecipe('avian'),'birdType',type));
 for(const type of ['littleBrownBat','flyingFox','vampireBat'])recipes.push(Q.Creature.withVariant(Q.Creature.kindRecipe('bat'),'batType',type));
 for(const kind of ['avian','bat'])for(const headSize of [.6,1.8])for(const eyeSize of [.6,1.5])recipes.push({...Q.Creature.withVariant(Q.Creature.kindRecipe(kind),kind==='avian'?'birdType':'batType',kind==='avian'?'owl':'flyingFox'),headSize,eyeSize});
 for(const recipe of recipes){const b=Q.Creature.build(recipe,{quality:'preview'});
  for(const eye of b.parts.filter(p=>/^Eye -?1$/.test(p.name))){
   const head=b.parts.find(p=>p.name==='Facial disk '+eye.name.slice(4))||b.parts.find(p=>p.name==='Head'),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
   for(let i=0;i<head.positions.length;i++){lo[i%3]=Math.min(lo[i%3],head.positions[i]);hi[i%3]=Math.max(hi[i%3],head.positions[i]);}
   const center=lo.map((v,k)=>(v+hi[k])/2),radii=lo.map((v,k)=>(hi[k]-v)/2),at=[0,0,0];for(let i=0;i<144*3;i++)at[i%3]+=eye.positions[i]/144;
   const q=at.reduce((s,v,k)=>s+((v-center[k])/radii[k])**2,0);assert.ok(q<1.04,(recipe.birdType||recipe.batType)+' eye center '+q);
  }
 }
});

test('parrot and flamingo bills have a bent upper mandible and seated lower jaw',()=>{
 for(const type of ['parrot','flamingo']){const b=Q.Creature.build(Q.Creature.withVariant(Q.Creature.kindRecipe('avian'),'birdType',type),{quality:'preview'}),bill=b.parts.find(p=>p.name==='Beak'),centers=Array.from({length:33},(_,row)=>[0,1,2].map(k=>{let sum=0;for(let col=0;col<24;col++)sum+=bill.positions[(row*24+col)*3+k]/24;return sum;}));
  const a=centers[8].map((v,k)=>v-centers[0][k]),z=centers[32].map((v,k)=>v-centers[24][k]),dot=a.reduce((s,v,k)=>s+v*z[k],0)/Math.hypot(...a)/Math.hypot(...z);assert.ok(dot<.8,type+' upper bill must curve');
  assert.ok(bill.index.length/3>1600,'upper shell, mandible, gape and nostrils are modeled');sound([bill],b.bones);
 }
});

test('the additional garment and companion-wear choices have explicit locale labels',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),scope={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/I18nReviewedTranslations.js'),'utf8'),scope);
 for(const [locale,catalog]of Object.entries(scope.RR_REVIEWED_TRANSLATIONS.text))for(const label of ['Bandana','Weather coat','Companion wear','Travel companion','Gambeson','Heraldic tabard','Gem brooch'])assert.ok(catalog[label]?.length,locale+'/'+label);
});
