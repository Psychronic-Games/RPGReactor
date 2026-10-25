'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
global.THREE=require('three');
const Rules=require('../src/forge/Character3D/ConstructionPatterns.js'),Surface=require('../src/forge/Character3D/ConstructionSurface.js'),F=require('../src/forge/Props/FurnitureProp.js'),C=require('../src/forge/Props/ContainerProp.js'),M=require('../src/forge/Props/PropModel.js'),A=require('../src/forge/Props/AccessoryProp.js'),CP=require('../src/forge/Props/ContainerPaint.js'),Catalog=require('../src/forge/Props/PropCatalog.js');
const hash=(parts,fields=['positions','index'])=>{const h=crypto.createHash('sha256');for(const p of parts)for(const k of fields)if(p[k])h.update(Buffer.from(p[k].buffer,p[k].byteOffset,p[k].byteLength));return h.digest('hex');};
function builder(){const box={window:{},RRPropModel:M,RRPropCatalog:Catalog,THREE:global.THREE,sessionStorage:{getItem:()=>null},console};vm.createContext(box);vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/forge/Props/PropBuilder.js'),'utf8')+';globalThis.Builder=PropBuilder;',box);return new box.Builder();}
test('construction rules match recipe traits in order, consume explicit controls and require finite anchors',()=>{
 const bank=Rules.bank([{id:'frame',when:{kind:'furniture'},controls:['width'],build:c=>c.parts.push('frame')},{id:'joinery',when:{style:['rustic','scifi']},controls:['style'],build:c=>c.parts.push('joinery')}]);
 for(const style of ['modern','rustic','scifi']){const ctx={recipe:{kind:'furniture',style},parts:[]};assert.deepEqual(bank.assemble(ctx),style==='modern'?['frame']:['frame','joinery']);assert.deepEqual(ctx.parts,style==='modern'?['frame']:['frame','joinery']);}
 assert.deepEqual(Rules.anchor({deck:[0,1,0]},'deck',[.1,0,.2]),[.1,1,.2]);assert.throws(()=>Rules.anchor({deck:[0,NaN,0]},'deck'),/anchor/);assert.throws(()=>Rules.bank([{id:'x',build(){}},{id:'x',build(){}}]),/pattern/);
});
test('all sixteen furniture styles select different actual construction, including with details disabled',()=>{
 for(const [form]of F.FORMS)for(const details of [false,true]){const hashes=new Set();for(const style of ['modern','rustic','scifi']){const r=F.build({...F.fromPreset(form),style,details},{});hashes.add(hash(r.parts));assert.ok(r.construction.length,form+' construction plan');}assert.equal(hashes.size,3,form+' styles must change the mesh, details='+details);}
});
test('upholstery settings deform the cushion surface, with finite normals and original skin support',()=>{
 for(const form of ['chair','armchair','sofa','bench','bed']){const hashes=new Set();for(const upholstery of ['plain','tufted','channel']){const r=F.build({...F.fromPreset(form),upholstery},{}),parts=r.parts.filter(p=>p.kind==='cloth');hashes.add(hash(parts,['positions','normals']));assert.ok(parts.every(p=>p.normals.every(Number.isFinite)),form);}assert.equal(hashes.size,3,form+' upholstery must change its shape');}
});
test('surface packing preserves every late region and the existing pixel locations during growth',()=>{
 const a=CP.atlas(32,32),first=CP.region(a,20,20);CP.fill(a,first,(_,__,out)=>{out[0]=1;out[1]=out[2]=0;});const index=(first.y*a.width+first.x)*4,red=a.data[index];
 for(let k=0;k<30;k++){const r=CP.region(a,20,20);assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=a.width&&r.y+r.h<=a.height);}
 assert.ok(a.height>32);assert.equal(a.data[index],red);
});
test('all container atlases contain every region with valid final UVs at catalog and selected-view resolutions',()=>{
 for(const {id}of C.PRESETS)for(const textureSize of [128,1024]){const r=C.build(C.fromPreset(id),{},{textureSize}),a=r.textures['body.png'];for(const q of r.atlasRegions)assert.ok(q.x+q.w<=a.width&&q.y+q.h<=a.height,id+' region outside atlas');for(const p of r.parts.filter(p=>p.texture==='body.png'))assert.ok(p.uvs.every(v=>v>=-1e-6&&v<=1.000001),id+' UV outside final atlas');}
});
test('container cap and valve colors affect real pixels at full resolution and through cache reuse',()=>{
 const fingerprint=r=>{const h=crypto.createHash('sha256');for(const t of Object.values(r.textures))if(t)h.update(Buffer.from(t.data));return h.digest('hex');};
 for(const [id,key]of [['oil-drum','trim'],['explosive-barrel','trim'],['treasure-chest','trim'],['fuel-canister','accent']]){const cache={},base=C.fromPreset(id),a=C.build({...base,[key]:'#223344'},cache),b=C.build({...base,[key]:'#dd9955'},cache),fresh=C.build({...base,[key]:'#dd9955'},{});assert.ok(fingerprint(a)!==fingerprint(b),id+' '+key+' has no visible effect');assert.equal(fingerprint(b),fingerprint(fresh),id+' stale surface cache');}
});
test('equipment glass, cloth and metal choices change actual finish and opacity, preserving authored colors',async()=>{
 await A.prepare();const recipe={accessory:{id:'cap'}},values=['metal','leather','plastic','fabric','velvet','glass'];
 for(const material of values){const r=A.build({...recipe,material}),p=r.parts[0];assert.equal(p.opacity,material==='glass'?.30:1);assert.equal(p.kind==='cloth',material==='fabric'||material==='velvet');assert.equal(!!p.normalTexture,material!=='glass');if(p.normalTexture)assert.ok(r.textures[p.normalTexture]);assert.ok(p.colors?.length>0);}
});
test('preview refresh recognizes map and shader changes on identical equipment geometry',async()=>{
 await A.prepare();const b=builder(),recipe={accessory:{id:'cap'}},cloth=A.build({...recipe,material:'fabric'}),metal=A.build({...recipe,material:'metal'}),glass=A.build({...recipe,material:'glass'});
 assert.equal(hash(cloth.parts),hash(metal.parts));assert.equal(hash(cloth.parts),hash(glass.parts));assert.ok(b._structure(cloth)!==b._structure(metal));assert.ok(b._structure(metal)!==b._structure(glass));
 b._view={textures:new Map()};const material=b._material(metal.parts[0],metal);assert.ok(material.roughnessMap&&material.metalnessMap);assert.equal(material.roughnessMap.colorSpace,THREE.NoColorSpace);assert.equal(material.normalMap.colorSpace,THREE.NoColorSpace);material.dispose();for(const t of b._view.textures.values())t.texture.dispose();
});
test('shared finish maps are periodic resources and do not grow when reused across many assemblies',()=>{
 const a=Surface.maps('metal');for(let i=0;i<100;i++)assert.ok(Surface.maps('metal')===a);assert.equal(a.normal.width,256);assert.ok(a.normal.repeat&&a.surface.repeat);assert.equal(a.surface.data.length,256*256*4);
});

test('cross position changes tall banners and repeated emblems fit their painted field',()=>{
 const D=require('../src/forge/Props/FlagDesign.js'),pixels=(offset,a)=>{const p=D.prepare({field:{layout:'cross',offset,colors:['#123456','#fedcba']},layers:[]},a,{}),out=[0,0,0,0],data=[];for(let y=0;y<40;y++)for(let x=0;x<40;x++){D.colorAt(p,(x+.5)/40,(y+.5)/40,out);data.push(...out);}return data.join(',');};
 for(const aspect of [.3,1,3,5])assert.ok(pixels('center',aspect)!==pixels('nordic',aspect),'cross position ignored on aspect '+aspect);
 for(const aspect of [.3,1,3,5])for(const repeat of ['row','ring'])for(const count of [3,8,24]){const p=D.prepare({layers:[{shape:'star',size:.8,repeat,count,spread:1.2}]},aspect,{}),copies=p.layers[0].copies;assert.equal(copies.length,count);for(const [x,y,r]of copies)assert.ok(x-r>=0&&x+r<=1&&y-r>=0&&y+r<=aspect,'repeated emblem clipped outside its field');}
});

test('keycap assemblies have fitted modifier widths, engraved legends and a real space bar',()=>{
 const K=require('../src/forge/Props/PropKeycaps.js');for(const n of [3,4,5,6]){const rows=K.layout(n);assert.equal(rows.length,n);if(n>=4)assert.ok(rows.flat().some(([name,width])=>name==='SPACE'&&width>4));}
 for(const form of ['computer','console']){const r=F.build(F.fromPreset(form),{}),p=r.parts.find(p=>p.name.endsWith(' legends'));assert.ok(p&&p.cutout&&p.texture);const t=r.textures[p.texture];assert.ok(t.data.some((v,i)=>i%4===3&&v===0));assert.ok(t.data.some((v,i)=>i%4===3&&v>200));assert.ok(p.uvs.every(v=>v>=-1e-6&&v<=1.000001));}
});

test('character chokers follow the actual neck below the jaw instead of a displaced lower-neck ellipse',async()=>{
 const B=require('../src/forge/Character3D/HumanBody.js'),P=require('../src/forge/Character3D/CharacterProps.js'),T=global.THREE,pack=await B.loadPack();
 for(const profile of [{gender:0},{gender:1},{gender:0,weight:1.4,headSize:1.2},{gender:1,height:-.3,shapes:{neck:.6}}])for(const width of [1,3]){
  const built=B.build(pack,B.normalizeRecipe(profile)),r=P.build(pack,built,[{id:'choker',shape:'velvet',width,charm:'none'}],[]),band=r.parts[0],body=built.parts[0],lo=Math.min(...band.positions.filter((_,i)=>i%3===1)),hi=Math.max(...band.positions.filter((_,i)=>i%3===1));
  assert.ok(hi<=r.landmarks.chin-.0059,'band reaches the jaw');const triangles=[];
  for(let k=0;k<body.index.length;k+=3){const pts=[0,1,2].map(j=>new T.Vector3(...body.positions.subarray(body.index[k+j]*3,body.index[k+j]*3+3)));if(Math.min(...pts.map(p=>p.y))>hi+.01||Math.max(...pts.map(p=>p.y))<lo-.01)continue;triangles.push(new T.Triangle(...pts));}
  for(let j=0;j<64;j+=4){const p=new T.Vector3(...band.positions.subarray(j*3,j*3+3)),q=new T.Vector3(),nearest=new T.Vector3(),normal=new T.Vector3();let distance=Infinity;for(const tri of triangles){tri.closestPointToPoint(p,q);const d=p.distanceTo(q);if(d<distance){distance=d;nearest.copy(q);tri.getNormal(normal);}}assert.ok(distance>.0001&&distance<.006,'band root is not fitted: '+JSON.stringify({profile,width,j,distance,point:p.toArray(),nearest:nearest.toArray()}));assert.ok(p.clone().sub(nearest).dot(normal)>0,'band root inside the skin');}
 }
});

test('cap crown contains sampled crew hair above its lower band on both body types',async()=>{
 const B=require('../src/forge/Character3D/HumanBody.js'),P=require('../src/forge/Character3D/CharacterProps.js'),Hair=require('../src/forge/Character3D/CharacterHair.js'),T=global.THREE,pack=await B.loadPack();
 for(const gender of [0,1]){const built=B.build(pack,B.normalizeRecipe({gender})),hair=Hair.build(pack,built,{style:'crew'},{seed:11,budget:.5,gender}),r=P.build(pack,built,[{id:'cap'}],hair),cap=r.parts[0],tris=[];
  for(let k=0;k<cap.index.length;k+=3)tris.push(new T.Triangle(...[0,1,2].map(j=>new T.Vector3(...cap.positions.subarray(cap.index[k+j]*3,cap.index[k+j]*3+3)))));
  let checked=0;for(const part of hair.filter(p=>/^Hair/.test(p.name)))for(let v=0;v<part.positions.length/3;v+=Math.max(1,Math.ceil(part.positions.length/3/160))){const p=new T.Vector3(...part.positions.subarray(v*3,v*3+3));if(p.y<r.landmarks.brow+.03)continue;const ray=new T.Ray(p,new T.Vector3(.913,.271,.303).normalize()),q=new T.Vector3(),hits=[];for(const tri of tris)if(ray.intersectTriangle(tri.a,tri.b,tri.c,false,q)){const d=p.distanceTo(q);if(!hits.some(x=>Math.abs(x-d)<1e-5))hits.push(d);}assert.equal(hits.length%2,1,'hair pierces cap on body '+gender+' at '+p.toArray().join(','));checked++;}assert.ok(checked>10,'crew coverage not sampled');
 }
});
