'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const THREE=global.THREE=require('./helpers/three.cjs'),F=require('../src/forge/Props/FurnitureProp.js'),V=require('../src/forge/Props/VehicleProp.js'),CM=require('../src/forge/Props/ContainerMesh.js'),Flight=require('../src/forge/Props/FlightCraft.js');
const Model=require('../src/forge/Props/PropModel.js'),assets=require('../src/utils/AssetFiles.js');
function builder(window={}){const ctx={window,require,Buffer,console,THREE,RRPropModel:Model,RRPropCatalog:{ui(){}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/forge/Props/PropBuilder.js'),'utf8')+'\nglobalThis.Builder=PropBuilder;',ctx);return{ctx,proto:ctx.Builder.prototype};}
test('smart toilets default to polished chrome, keep tint editable, and can switch back to ceramic',()=>{
 const r=F.fromPreset('smartToilet');assert.equal(r.shellFinish,'chrome');assert.equal(F.normalize(JSON.parse(JSON.stringify(r))).shellFinish,'chrome');
 const chrome=F.build({...r,color:'#adbcd1'});for(const role of ['ceramic','seatShell','paint']){const p=chrome.parts.find(p=>p.name.endsWith(' '+role));assert.equal(p.metalness,1);assert.equal(p.roughness,.12);assert.equal(p.color,'#adbcd1');}
 const ceramic=F.build({...r,shellFinish:'standard'}).parts.find(p=>p.name.endsWith(' ceramic'));assert.equal(ceramic.metalness,0);assert.equal(F.fromPreset('toilet').shellFinish,'standard');
 assert.equal(F.normalize({...r,roughness:.01}).roughness,.06);
});
test('color drag updates the swatch cheaply, with one undo entry and rebuild on release',()=>{
 const {ctx,proto}=builder();let picker,rebuilds=0,commits=0;ctx.RRColorPopover={open:(b,o)=>picker=o};
 const swatches=[],b={dataset:{act:'color',path:'color'},style:{setProperty:(k,v)=>swatches.push(v)}};
 const state={recipe:F.fromPreset('smartToilet'),_shownColor:()=> '#c5d3dc',_set:(k,v)=>state.recipe[k]=v,_commit:()=>commits++,_queueRebuild:()=>rebuilds++};
 proto._onClick.call(state,{target:{closest:()=>b},preventDefault(){}});
 for(let i=0;i<30;i++)picker.onInput('#123456');assert.equal(rebuilds,0);assert.equal(commits,0);assert.equal(state.recipe.color,'#c5d3dc');assert.equal(swatches.length,30);
 picker.onChange('#123456');assert.equal(state.recipe.color,'#123456');assert.equal(commits,1);assert.equal(rebuilds,1);assert.equal(b.title,'#123456');
});
test('own-picture import creates the project folder and preserves colliding names across image formats',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rr-picture-import-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const {proto}=builder({RRAssetFiles:assets}),state={_project:()=>({path:dir})},file={name:'Badge.PNG',arrayBuffer:async()=>Uint8Array.of(1,2,3).buffer};
 const a=await proto._importPictureFile.call(state,file);assert.equal(a,'Badge');
 const b=await proto._importPictureFile.call(state,{...file,name:'badge.jpg'});assert.equal(b,'badge-2');assert.equal(fs.readFileSync(path.join(dir,'img/pictures/Badge.png')).toString('hex'),'010203');
 const source=path.join(dir,'Original.webp');fs.writeFileSync(source,'native');const c=await proto._importPictureFile.call(state,{name:'native.webp',path:source});assert.equal(c,'native');assert.equal(fs.readFileSync(path.join(dir,'img/pictures/native.webp'),'utf8'),'native');
 assert.equal(await proto._importPictureFile.call(state,file,dir+'-other'),null);await assert.rejects(()=>proto._importPictureFile.call(state,{...file,name:'Badge.exe'}));
});
test('an empty project picture chooser still offers import and ignores a stale authoring context',()=>{
 let options,picked=0,selected;const state={recipe:{id:1},_picturesFolder:()=>'/project/img/pictures',_project:()=>({path:'/project'}),_t:t=>t,_importPicture:()=>picked++};
 const {proto}=builder({RRAssetFiles:{listImageReferences:()=>[],imageUrlFor:()=>''},reactor:{databaseEditorUI:{showImagePicker:(title,files,onPick,url,current,o)=>{options=o;selected=onPick;assert.equal(files.length,0);}}}});
 proto._choosePicture.call(state,'',()=>picked++);assert.equal(typeof options.onImport,'function');options.onImport();assert.equal(picked,1);selected('Own');assert.equal(picked,2);
 state.recipe={id:2};selected('Stale');assert.equal(picked,2);
});
function rawCraft(form){const r=V.fromPreset(form),parts=[];Flight.build({r,W:r.width,H:r.height,L:r.length,groups:new Map(),put:(role,m,name)=>parts.push({...m,role,name}),box(){},tube(){},sheet(){}});return parts;}
function hits(parts,o,d){const ray=new THREE.Raycaster(new THREE.Vector3(...o),new THREE.Vector3(...d)),dist=[];for(const p of parts){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p.positions,3));g.setIndex(new THREE.BufferAttribute(p.index,1));const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(g,material);mesh.updateMatrixWorld();dist.push(...ray.intersectObject(mesh).map(h=>h.distance));g.dispose();material.dispose();}return dist.sort((a,b)=>a-b);}
test('helicopter windshield, pilot windows and cabin skin form a sealed compartment',()=>{
 const parts=rawCraft('helicopter').filter(p=>/^(Rotorcraft cabin shell|Panoramic cockpit glazing|Pilot side window)$/.test(p.name)),edges=new Map(),point=(p,v)=>Array.from(p.positions.subarray(v*3,v*3+3),x=>Math.round(x*1e5)).join(',');
 for(const p of parts)for(let i=0;i<p.index.length;i+=3){const vs=Array.from(p.index.subarray(i,i+3)),q=vs.map(v=>point(p,v));if(new Set(q).size<3)continue;for(let k=0;k<3;k++){const a=q[k],b=q[(k+1)%3],key=[a,b].sort().join('|');edges.set(key,(edges.get(key)||0)+1);}}
 const open=[...edges].filter(([,n])=>n===1);assert.equal(open.length,0,'unsealed cabin edges: '+open.slice(0,4).map(([k])=>k).join('; '));
 // A pilot sees through the forward glass, without an opaque shell in the sightline.
 const r=V.fromPreset('helicopter'),origin=[.36,r.height*.43+.35,r.length*.18],glass=hits(parts.filter(p=>p.role==='flightGlass'),origin,[0,0,1]),skin=hits(parts.filter(p=>p.role==='paint'),origin,[0,0,1]);assert.ok(glass.length);assert.ok(!skin.length||glass[0]<skin[0]);
});
test('airliner pilots have real forward windows in front of the opaque pressure hull',()=>{
 const parts=rawCraft('airliner'),r=V.fromPreset('airliner');for(const x of [-.36,.36]){const eye=[x,r.height*.43+.40,r.length*.405],glass=hits(parts.filter(p=>p.name==='Cockpit windscreen'),eye,[0,0,1]),shell=hits(parts.filter(p=>p.name==='Airliner pressure shell'||p.name==='Passenger cabin lining'),eye,[0,0,1]);assert.ok(glass.length,'pilot sees the windshield');assert.ok(!shell.length||glass[0]<shell[0],'opaque hull must not cover the glass');}
});
test('finish and picture-import controls are translated in every reviewed locale',()=>{
 require('../src/I18nReviewedTranslations.js');for(const [locale,row]of Object.entries(global.RR_REVIEWED_TRANSLATIONS.text))for(const key of ['Shell finish','Chrome','Import picture','Could not import picture.'])assert.ok(row[key],locale+' '+key);
});

test('tone-on-tone binding shares the rolled garment texture and tinted sheen without a loose helper strip',async()=>{
 const G=require('../src/forge/Props/GarmentProp.js'),D=require('../src/forge/Character3D/CharacterGarmentDetails.js');await G.prepare();const build=D.build;let entries,r;
 try{D.build=(...a)=>{entries=a[2];return build(...a);};r=G.build({garment:{id:'vest'}},{atlasSize:1024});}finally{D.build=build;}
 assert.ok(!r.parts.some(p=>p.name==='Sewn garment edges'),'no overlapping strip over the leather hem');
 const part=r.parts.find(p=>p.fabricRefs);assert.ok(part&&part.texture&&part.sheen?.texture===part.texture,'the binding and leather share color and sheen painting');
 let count=0,red=0,blue=0;const pic=r.textures[part.texture];
 for(let v=0;v<part.positions.length/3;v++){const e=entries[part.fabricRefs[v*2]],source=part.fabricRefs[v*2+1];if(source>=e.laid.rimStart||!e.laid.piece.onBorder[source])continue;
  const x=Math.min(pic.width-1,Math.floor(part.uvs[v*2]*pic.width)),y=Math.min(pic.height-1,Math.floor(part.uvs[v*2+1]*pic.height)),at=(y*pic.width+x)*4;red+=pic.data[at];blue+=pic.data[at+2];count++;
 }
 assert.ok(count>30&&red>blue*1.6,'leather binding retains its brown tint');
 const proto=builder().proto,context={_weak:false,_texture:proto._texture,_view:{textures:new Map()}},material=proto._material.call(context,part,r);
 assert.ok(material.sheenColorMap===material.map,'grazing sheen uses the same tinted leather map');material.dispose();for(const t of context._view.textures.values())t.texture.dispose();
});

test('balanced inspection reflections include lit walls and broad cards on both shadow-facing sides',()=>{
 let capture,disposed=0;const ProbeTHREE={...THREE,PMREMGenerator:class{fromScene(room){capture=room.children.map(m=>({position:m.position.toArray(),color:m.material.color.toArray(),width:m.geometry.parameters.width}));return{texture:{}};}dispose(){disposed++;}}};
 const ctx={THREE:ProbeTHREE};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/utils/ModelPreview3D.js'),'utf8')+'\nglobalThis.Preview=ModelPreview3D;',ctx);
 ctx.Preview.studioEnvironment({},{});const oldWall=capture[0].color.reduce((a,b)=>a+b,0),oldCount=capture.length;
 ctx.Preview.studioEnvironment({},{balanced:true});assert.equal(capture.length,oldCount+6);assert.ok(capture[0].color.reduce((a,b)=>a+b,0)>oldWall*5,'walls reflect room light instead of near-black');
 for(const side of [-1,1])assert.ok(capture.some(m=>Math.sign(m.position[0])===side&&m.width>=5&&m.position[1]<2),'broad reflected side fill '+side);assert.equal(disposed,2,'PMREM generators are released');
});
