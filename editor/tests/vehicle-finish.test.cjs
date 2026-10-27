'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const V=require('../src/forge/Props/VehicleProp.js'),M=require('../src/forge/Props/PropModel.js'),Glb=require('../src/utils/GlbOptimizer.js'),{PNG}=require('pngjs');
const hash=bytes=>crypto.createHash('sha256').update(Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength)).digest('hex');
const surfaceHash=r=>hash(r.textures['vehicle-coating-albedo.png'].data);
const geometryHash=r=>{const h=crypto.createHash('sha256');for(const p of r.parts){h.update(Buffer.from(p.positions.buffer,p.positions.byteOffset,p.positions.byteLength));h.update(Buffer.from(p.index.buffer,p.index.byteOffset,p.index.byteLength));}return h.digest('hex');};
test('coatings have bounded color, normal and packed material maps with complete UV charts',()=>{
 const r=V.build(V.fromPreset('rover'));
 for(const suffix of ['albedo','normal','surface']){const t=r.textures['vehicle-coating-'+suffix+'.png'];assert.ok(t);assert.ok(t.width<=2048&&t.height<=2048,'2026-10-24 phase 2: the coating atlas carries the panel layer at up to 2048×2048');assert.equal(t.data.length,t.width*t.height*4);}
 for(const p of r.parts){assert.ok(p.positions.every(Number.isFinite)&&p.normals.every(Number.isFinite));for(const key of ['texture','normalTexture','metallicRoughnessTexture'])if(p[key]){const t=r.textures[p[key]];assert.ok(t,p.name+' missing '+key);if(!t.repeat)assert.ok(p.uvs.every(v=>v>=-1e-5&&v<=1.00001),p.name+' UV outside its complete atlas');}}
 const ink=r.textures['vehicle-markings.png'];assert.ok(ink.data.some((v,i)=>i%4===3&&v===0),'markings must keep a transparent background');assert.ok(ink.data.some((v,i)=>i%4===3&&v>200));
});
test('enamel, powder coat, brushed alloy and woven composite change painted pixels and material maps',()=>{
 const cache={},color=new Set(),normal=new Set(),surface=new Set();
 for(const finish of ['enamel','powder','brushed','composite']){const r=V.build({...V.fromPreset('sport'),finish},cache);for(const [set,key]of [[color,'albedo'],[normal,'normal'],[surface,'surface']])set.add(hash(r.textures['vehicle-coating-'+key+'.png'].data));}
 assert.equal(color.size,4);assert.equal(normal.size,4);assert.equal(surface.size,4);
});
test('wear, dirt and surface variation affect baked pixels without deforming the vehicle',()=>{
 const cache={},base=V.fromPreset('drone'),a=V.build({...base,wear:0,grime:0},cache),shape=geometryHash(a),clean=surfaceHash(a);
 for(const extra of [{wear:.8,grime:0},{wear:0,grime:.8},{wear:.8,grime:.8,surfaceSeed:812}]){const r=V.build({...base,...extra},cache);assert.notEqual(surfaceHash(r),clean);assert.equal(geometryHash(r),shape);}
});
test('quick and full texture builds do not mutate earlier results or reuse stale palettes',()=>{
 const cache={},recipe=V.fromPreset('compact'),a=V.build(recipe,cache,{textureSize:512}),uv=hash(a.parts.find(p=>p.texture==='vehicle-coating-albedo.png').uvs),pixels=surfaceHash(a),positions=geometryHash(a);
 const b=V.build(recipe,cache,{textureSize:1024});assert.equal(hash(a.parts.find(p=>p.texture==='vehicle-coating-albedo.png').uvs),uv);assert.equal(surfaceHash(a),pixels);assert.equal(geometryHash(a),positions);assert.ok(b.textures['vehicle-coating-albedo.png'].width>a.textures['vehicle-coating-albedo.png'].width);
 const glazingDrag=V.build({...recipe,windowOpacity:.85},cache,{textureSize:512});assert.ok(glazingDrag.textures['vehicle-coating-albedo.png'].data===b.textures['vehicle-coating-albedo.png'].data,'glazing drag should retain the full cached coating');
 const again=V.build(recipe,cache);assert.ok(again.textures['vehicle-coating-albedo.png'].data===b.textures['vehicle-coating-albedo.png'].data,'repeat builds should reuse the immutable coating resource');
 const changed=V.build({...recipe,paint:'#ac392a'},cache),fresh=V.build({...recipe,paint:'#ac392a'},{});assert.equal(surfaceHash(changed),surfaceHash(fresh));assert.notEqual(surfaceHash(changed),surfaceHash(b));assert.equal(surfaceHash(a),pixels);
});
test('custom marking and each paint scheme change the actual ink, including through cache reuse',()=>{
 const cache={},base=V.fromPreset('rover'),inks=new Set();
 for(const livery of ['plain','stripe','rally','service']){const r=V.build({...base,livery,markings:'RANGER 17'},cache);inks.add(hash(r.textures['vehicle-markings.png'].data));assert.equal(JSON.parse(JSON.stringify(r.recipe)).markings,'RANGER 17');}
 assert.equal(inks.size,4);const a=V.build({...base,markings:'CREW 42'},cache),b=V.build({...base,markings:'CREW 42'},{});assert.equal(hash(a.textures['vehicle-markings.png'].data),hash(b.textures['vehicle-markings.png'].data));assert.equal(hash(a.parts.find(p=>p.name==='Vehicle lettering').positions),hash(b.parts.find(p=>p.name==='Vehicle lettering').positions));const different=V.build({...base,markings:'UNIT 18'},cache);assert.notEqual(hash(a.parts.find(p=>p.name==='Vehicle lettering').positions),hash(different.parts.find(p=>p.name==='Vehicle lettering').positions));
});
test('cabins contain fitted seats and controls; the hide option restores opaque windows',()=>{
 for(const form of ['compact','shuttle']){const recipe=V.fromPreset(form),a=V.build(recipe),b=V.build({...recipe,interior:false});assert.ok(a.parts.some(p=>p.name==='Cabin seat upholstery'));assert.ok(a.parts.some(p=>p.name==='Cabin steering wheel'));assert.ok(a.parts.some(p=>p.opacity===recipe.windowOpacity));assert.ok(!b.parts.some(p=>p.name==='Cabin seat upholstery'));assert.ok(!b.parts.some(p=>p.surfaceRole==='glass'&&p.opacity<1));}
});
test('saved vehicles retain embedded surface maps, cutout ink and transparent glazing',async()=>{
 const r=V.build(V.fromPreset('compact')),encode=t=>{const p=new PNG({width:t.width,height:t.height});p.data=Buffer.from(t.data);return PNG.sync.write(p);},bytes=await M.toGlb(r,'VehicleFinish',encode),{json}=Glb.parseGlb(bytes);
 const ink=json.meshes.find(m=>m.name==='Vehicle markings'),glass=json.meshes.find(m=>m.name==='Compact car glass'),body=json.meshes.find(m=>m.name==='Sculpted body shell');assert.ok(ink&&glass&&body);
 const material=m=>json.materials[m.primitives[0].material];assert.equal(material(ink).alphaMode,'MASK');assert.equal(material(glass).alphaMode,'BLEND');assert.ok(material(body).normalTexture);assert.ok(material(body).pbrMetallicRoughness.baseColorTexture);assert.ok(material(body).pbrMetallicRoughness.metallicRoughnessTexture);assert.ok(json.images.length>=8);const lettering=json.meshes.find(m=>m.name==='Vehicle lettering');assert.ok(lettering);assert.ok(!material(lettering).pbrMetallicRoughness.baseColorTexture);assert.equal(material(lettering).alphaMode,undefined);assert.ok(lettering.primitives[0].attributes.COLOR_0!==undefined);
});

test('marking contrast follows the panel color when equipment bays use secondary paint',()=>{
 const recipe={...V.fromPreset('shuttle'),paint:'#172d3d',wear:0,grime:0},a=V.build({...recipe,secondary:'#e5e5e5'}),b=V.build({...recipe,secondary:'#223344'});
 assert.notEqual(hash(a.textures['vehicle-markings.png'].data),hash(b.textures['vehicle-markings.png'].data),'letters on a light equipment bay must change to dark ink');
});
