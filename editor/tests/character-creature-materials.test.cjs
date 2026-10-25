'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const Q=require('./helpers/character-quality-matrix.cjs'),Forms=require('../src/forge/Character3D/CreatureForms.js');
const hash=a=>require('node:crypto').createHash('sha256').update(a).digest('hex');
const span=(a,channel)=>{let lo=255,hi=0;for(let i=channel;i<a.length;i+=4){lo=Math.min(lo,a[i]);hi=Math.max(hi,a[i]);}return hi-lo;};

test('fish have overlapping scale relief and varying polish; Goauld folds and pebbled skin survive thumbnails',()=>{
 for(const [name,r]of [['fish',Q.Creature.kindRecipe('fish')],['goauld',Q.Creature.withVariant(Q.Creature.kindRecipe('worm'),'wormType','goauld')]]){
  for(const options of [{quality:'preview'},{quality:'preview',static:true},{quality:'save'}]){
   const b=Q.Model.build(null,r,{},options),p=b.parts.find(p=>p.name==='Body');
   const size=options.quality==='save'?1024:options.static?256:512;
   assert.equal(b.textures[p.texture].width,size);assert.equal(b.textures[p.normalTexture].width,size);
   assert.ok(span(b.textures[p.texture].data,0)>35,'readable cell edges and folds');
   assert.ok(span(b.textures[p.normalTexture].data,0)>35,'relief changes surface directions');
   assert.ok(span(b.textures[p.metallicRoughnessTexture].data,1)>40,'wet highlights break up over the surface');
   assert.equal(Q.inspect(b,{recipe:r}).issues.length,0);
   if(name==='fish'){assert.ok(p.iridescence>0&&p.iridescence<.6);assert.equal(p.iridescenceThicknessTexture,p.metallicRoughnessTexture);}
  }
 }
 // Sharks and cetaceans do not acquire bony-fish scales or rainbow metal skin.
 for(const kind of ['shark','dolphin','whale']){const b=Q.Model.build(null,Q.Creature.kindRecipe(kind),{},{quality:'preview'});assert.equal(b.parts[0].iridescence,undefined);assert.ok(span(b.textures[b.parts[0].texture].data,0)<10);}
});

test('surface map derivatives retain their strength at save resolution',()=>{
 for(const kind of ['scales','symbioteSkin','chitin','annuli']){
  const rms=size=>{const n=Forms.surfacePictures(kind,size)['creature-surface-normal.png'].data;let s=0;for(let i=0;i<n.length;i+=4)s+=(n[i]-127.5)**2+(n[i+1]-127.5)**2;return Math.sqrt(s/(n.length/4));};
  const ratio=rms(1024)/rms(512);assert.ok(ratio>.7&&ratio<1.5,kind+' consistent relief '+ratio.toFixed(2));
 }
});

test('Node worker and browser worker entry retain color, relief, roughness and iridescence for fish thumbnails',async t=>{
 const r=Q.Creature.kindRecipe('fish'),options={quality:'preview',static:true,atlasSize:256};
 const expected=Q.Model.build(null,r,{},options);
 const {PreviewWorker}=require('../src/forge/Character3D/CharacterPreviewWorker.cjs'),pool=new PreviewWorker();t.after(()=>pool.dispose());pool.configure({});
 const native=await pool.build({key:'fish-materials',recipe:r,options});
 const messages=[],scope={console,setTimeout,clearTimeout,Uint8Array,Float32Array,Uint32Array,ArrayBuffer,DataView,Map,Set,performance,structuredClone,URL,OffscreenCanvas:function(){},createImageBitmap(){},location:{href:"https://example.test/CharacterPreviewBrowserEntry.js"}};scope.self=scope;scope.window=scope;scope.postMessage=m=>messages.push(m);scope.importScripts=(...files)=>{for(const file of files)vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../src/forge/Character3D',file),'utf8'),scope,{filename:file});};
 // Browser entry runs its actual module loader and serialization path.
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../src/forge/Character3D/CharacterPreviewBrowserEntry.js'),'utf8'),scope);
 scope.RRHumanBody.loadPack=async()=>({});scope.RRCharacterClothes.preload=async()=>{};
 scope.onmessage({data:{type:'context',context:{}}});await new Promise(resolve=>{scope.postMessage=m=>{messages.push(m);resolve();};scope.onmessage({data:{type:'build',id:1,recipe:r,options}});});
 const browser=messages.find(m=>m.id===1);assert.ok(!browser.error,JSON.stringify(browser.error));
 for(const result of [native,browser.result]){
  const body=result.parts.find(p=>p.name==='Body'),src=expected.parts.find(p=>p.name==='Body');
  assert.equal(body.iridescence,src.iridescence);assert.equal(body.metallicRoughnessTexture,src.metallicRoughnessTexture);
  for(const key of ['texture','normalTexture','metallicRoughnessTexture','iridescenceThicknessTexture'])assert.equal(hash(result.textures[body[key]].data),hash(expected.textures[src[key]].data),key);
 }
});

test('GLB exports standard roughness and optional iridescence alongside skin bindings and animations',async()=>{
 const r=Q.Creature.kindRecipe('fish'),b=Q.Model.build(null,r,{},{quality:'save'}),{PNG}=require('pngjs');
 const glb=await Q.Model.toGlb(b,'Fish scales',p=>Uint8Array.from(PNG.sync.write({width:p.width,height:p.height,data:Buffer.from(p.data)})));
 const {json}=require('../src/utils/GlbOptimizer.js').parseGlb(glb),m=json.materials.find(m=>m.name==='Body');
 assert.ok(m.normalTexture&&m.pbrMetallicRoughness.metallicRoughnessTexture);assert.equal(m.extensions.KHR_materials_iridescence.iridescenceFactor,.38);assert.ok(m.extensions.KHR_materials_iridescence.iridescenceThicknessTexture);
 assert.ok(json.extensionsUsed.includes('KHR_materials_iridescence'));assert.ok(!json.extensionsRequired?.includes('KHR_materials_iridescence'),'fallback keeps ordinary PBR readable');
 const p=json.meshes.find(m=>m.name==='Body').primitives[0];assert.ok(p.attributes.JOINTS_0!=null&&p.attributes.WEIGHTS_0!=null);assert.ok(json.animations.length>0);
});

test('clothed extreme animal neck joins and covered android caps remain valid',async()=>{
 const pack=await Q.Body.loadPack(),eyeSource=require('pngjs').PNG.sync.read(fs.readFileSync(path.resolve(__dirname,'../src/forge/Character3D/data/eye-brown.png'))),P=require('./quality/character-outfit-accessory-quality.cjs').FRESH_PROFILES,W=require('../src/forge/Character3D/CharacterWardrobe.js');
 for(const [species,i,j]of [['catfolk',16,0],['dragonborn',14,1],['android',32,0]]){
  const p=P[(i+j*2)%P.length],r=Q.Model.normalize({...Q.Model.withSpecies({age:35},species),...p.patch,outfit:W.PRESETS[(i*7+j*13)%W.PRESETS.length].items});
  const b=Q.Model.build(pack,r,{},{quality:'preview',static:true,skinSize:64,atlasSize:128,hairBudget:0,eyeSource});
  assert.equal(Q.inspect(b,{recipe:r},pack).issues.length,0,species+' valid attachment and meshes');
 }
});

test('clothed audit inventory covers each species and clothing preset with three distinct mixed body recipes',()=>{
 const fixtures=require('./quality/character-clothed-extremes.cjs').inventory(),W=require('../src/forge/Character3D/CharacterWardrobe.js');
 for(const s of Q.Species.SPECIES.filter(s=>!s.plan))assert.equal(fixtures.filter(f=>f.id.startsWith('deep-species-'+s.id+'-')).length,3,s.id);
 for(const p of W.PRESETS){const rows=fixtures.filter(f=>f.id.startsWith('deep-outfit-'+p.id+'-'));assert.equal(rows.length,3,p.id);assert.equal(new Set(rows.map(f=>JSON.stringify(f.recipe.shapes))).size,3,p.id+' varied shapes');}
 assert.equal(fixtures.filter(f=>f.entity==='creature').length,Q.Creature.KINDS.reduce((n,k)=>n+(Q.Creature.variantsFor(Q.Creature.kindRecipe(k.kind))[0]?.choices.length||1)*3,0));assert.equal(new Set(fixtures.map(f=>f.id)).size,fixtures.length);
});

test('cloth hoods use a continuous head envelope and pack harness buckles retain nonzero surface normals',async()=>{
 const pack=await Q.Body.loadPack(),W=require('../src/forge/Character3D/CharacterWardrobe.js'),G=require('../src/forge/Character3D/CreatureGear.js');
 for(const patch of [{},{gender:1,weight:4,shapes:{belly:2.7,neck:2}},{gender:0,headSize:2,shapes:{neckLength:-2}}]){
  const body=Q.Body.build(pack,Q.Body.normalizeRecipe(patch)),spec=W.BY_ID.get('hood').pieces(W.normalizeItem({id:'hood'}))[0];assert.equal(spec.helm.clothHood,true);
  const built=W.build(pack,body,[{id:'hood'},{id:'shirt'}],{atlasSize:64}),hood=built.parts.find(p=>p.name==='Hood');assert.ok(hood.index.length>100&&hood.positions.every(Number.isFinite));assert.equal(hood.texture,'hood-hood.png');
 }
 for(const kind of ['horse','wolf']){const r=Q.Creature.normalizeRecipe({...Q.Creature.kindRecipe(kind),gear:G.presetGear('pack')}),b=Q.Model.build(null,r,{},{quality:'preview',static:true});assert.equal(Q.inspect(b,{recipe:r}).issues.length,0,kind+' pack straps and buckles');}
});

test('selected previews bind physical fish maps as linear data and keep them linear after a size change',()=>{
 require('../../runtime/libs/three.js');const THREE=global.THREE,scope={window:{RRMerfolkBody:Q.Merfolk},RRMerfolkBody:Q.Merfolk,THREE,console};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../src/forge/Character3D/Character3DBuilder.js'),'utf8'),scope);
 const b=Object.create(scope.window.Character3DBuilder.prototype);b._view={textures:new Map(),meshes:[]};b._weak=false;
 const result=Q.Model.build(null,Q.Creature.kindRecipe('fish'),{},{quality:'preview'}),part=result.parts[0],material=b._material(part,result,null,new THREE.Scene());b._view.meshes=[{material}];
 assert.equal(material.iridescence,part.iridescence);assert.ok(material.roughnessMap===material.iridescenceThicknessMap);
 for(const texture of [material.normalMap,material.roughnessMap,material.metalnessMap,material.iridescenceThicknessMap])assert.equal(texture.colorSpace,THREE.NoColorSpace);
 assert.equal(material.map.colorSpace,THREE.SRGBColorSpace);
 const key=b._structure(result);assert.notEqual(key,b._structure({...result,parts:result.parts.map(p=>({...p,iridescence:.1}))}),'changed finish rebuilds materials');
 const thumb=Q.Model.build(null,result.recipe,{},{quality:'preview',static:true});b._swapTextures(thumb);
 assert.equal(material.normalMap.image.width,256);assert.equal(material.normalMap.colorSpace,THREE.NoColorSpace);assert.equal(material.roughnessMap.image.width,256);assert.equal(material.roughnessMap.colorSpace,THREE.NoColorSpace);
 const thumbnail=b._thumbnailMaterial(part,result,(name,pic)=>b._texture(name,pic),null);
 assert.ok(thumbnail.isMeshPhongMaterial);assert.ok(thumbnail.normalMap);assert.equal(thumbnail.normalMap.colorSpace,THREE.NoColorSpace);assert.equal(thumbnail.normalScale.x,part.normalScale);thumbnail.dispose();
 material.dispose();for(const {texture}of b._view.textures.values())texture.dispose();
});
