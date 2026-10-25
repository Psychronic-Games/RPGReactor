'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const THREE=global.THREE=require('three'),F=require('../src/forge/Props/FurnitureProp.js'),M=require('../src/forge/Props/PropModel.js'),Catalog=require('../src/forge/Props/PropCatalog.js'),C=require('../src/forge/Props/ContainerProp.js');
const Optimizer=require('../src/utils/GlbOptimizer.js'),{PNG}=require('pngjs');
const encode=t=>{const p=new PNG({width:t.width,height:t.height});p.data=Buffer.from(t.data);return PNG.sync.write(p);};
function builder(){const context={RRPropModel:M,RRPropCatalog:Catalog,THREE,sessionStorage:{getItem:()=>null},window:{},rrEscapeHtml:s=>String(s),console};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/forge/Props/PropBuilder.js'),'utf8')+'\nglobalThis.Builder=PropBuilder;',context);return new context.Builder();}
test('all sixteen furniture types register, normalize, build at meter dimensions and stand on the floor',()=>{
 for(const [id,label]of F.FORMS){const recipe=F.fromPreset(id),type=Catalog.typeOf(recipe);assert.equal(type.label,label);assert.equal(M.kindOf(recipe).id,'furniture');
  for(const style of ['modern','rustic','scifi']){
   const r=M.build({...recipe,style},{},{textureSize:256});let low=Infinity,triangles=0;
   for(const p of r.parts){triangles+=p.index.length/3;const n=p.positions.length/3;assert.equal(p.normals.length,p.positions.length);assert.equal(p.uvs.length,n*2);assert.equal(p.joints.length,n*4);
    for(const key of ['positions','normals','uvs','weights'])assert.ok(p[key].every(Number.isFinite),id+' '+key);
    assert.ok(p.index.every(i=>i<n),id+' indices');for(let i=1;i<p.positions.length;i+=3)low=Math.min(low,p.positions[i]);
    for(let v=0;v<n;v++)assert.ok(Math.abs(p.weights[v*4]+p.weights[v*4+1]+p.weights[v*4+2]+p.weights[v*4+3]-1)<1e-6,id+' weights');
    for(const key of ['texture','normalTexture','emissiveTexture'])if(p[key])assert.ok(r.textures[p[key]],id+' '+key);
   }
   assert.ok(Math.abs(low)<1e-6,id+' floor');assert.ok(triangles<180000,id+' budget '+triangles);assert.equal(r.bones.length,1);assert.equal(r.clips.length,0);
  }
 }
 assert.ok(Catalog.grouped('couch').some(g=>g.types.some(t=>t.id==='furniture-sofa')));
});
test('furniture randomization preserves the selected type and settings outside its scope',()=>{
 for(const [id]of F.FORMS){const r=F.fromPreset(id),source=JSON.stringify(r);for(const scope of ['shape','colors','details','all']){
  const next=F.random(67,r,scope);assert.equal(next.form,id);assert.equal(JSON.stringify(r),source);
  if(scope==='colors')for(const k of ['width','height','depth','style','details','screen'])assert.equal(next[k],r[k]);
  if(scope==='details')for(const k of ['color','frame','trim','width','height','depth'])assert.equal(next[k],r[k]);
 }}
});
test('furniture saves its actual mesh, separate material finishes, relief maps and screen artwork',async()=>{
 for(const id of ['sofa','computer','console','wallPanel']){
  const result=M.build(F.fromPreset(id),{}),bytes=await M.toGlb(result,id,encode),{json}=Optimizer.parseGlb(bytes);
  assert.ok(json.meshes.length>=3);assert.ok(json.nodes.some(n=>n.name==='Prop'));assert.ok(Math.abs(M.sidecar(result).transform.offset[1])<1e-6);
  if(id==='sofa')assert.ok(json.materials.some(m=>m.normalTexture),'fabric relief exported');
  else assert.ok(json.images.some(i=>i.name==='furniture-screen.png'),'screen image exported');
 }
});
test('reusing prop materials retains halo alpha, emission and repeating surface maps',()=>{
 const b=builder(),r=C.build(C.fromPreset('data-crate'),{},{textureSize:128});
 b._view={meshes:r.parts.map(()=>({material:new THREE.MeshStandardMaterial()}))};b._applyMaterials(r);
 const index=r.parts.findIndex(p=>p.blend),m=b._view.meshes[index].material;assert.ok(m.transparent);assert.equal(m.depthWrite,false);assert.equal(m.opacity,1);
 b._view.textures=new Map();const t=b._texture('woven',{width:1,height:1,data:Uint8Array.of(128,128,255,255),repeat:true},false);assert.equal(t.wrapS,THREE.RepeatWrapping);assert.equal(t.wrapT,THREE.RepeatWrapping);
 assert.ok(r.parts.some(p=>p.name==='Painted lettering'&&!p.texture&&p.index.length>100),'lettering has a crisp independent silhouette');
});
test('prop framing contains wide furniture across portrait and landscape windows',()=>{
 for(const aspect of [.65,1,1.7]){
  const b=builder(),r=F.build(F.fromPreset('sofa'),{}),camera=new THREE.PerspectiveCamera(35,aspect,.001,100);b._result=r;b._draw=()=>{};b._view={camera,target:new THREE.Vector3()};b._frame('all');
  const {distance,target}=b._view;
  for(const yaw of [0,.65,Math.PI/2]){camera.position.copy(target).add(new THREE.Vector3(Math.sin(yaw)*distance,.15*distance,Math.cos(yaw)*distance));camera.lookAt(target);camera.updateMatrixWorld(true);
   for(const p of r.parts)for(let i=0;i<p.positions.length;i+=9){const v=new THREE.Vector3(...p.positions.subarray(i,i+3)).project(camera);assert.ok(Math.abs(v.x)<1&&Math.abs(v.y)<1,'furniture fits the viewport');}
  }
 }
});

test('every furniture tab renders real controls and new labels have all seventeen reviewed translations',()=>{
 const b=builder(),source=require('../src/I18nReviewedTranslations.js');
 for(const [id]of F.FORMS){b.recipe=F.fromPreset(id);for(const [tab]of Catalog.UI.furniture.tabs){const html=Catalog.UI.furniture.panel.call(b,tab);assert.ok(html.includes('data-path='),id+'/'+tab);assert.ok(!html.includes('NaN'));}}
 for(const locale of Object.values(globalThis.RR_REVIEWED_TRANSLATIONS.text))for(const key of ['Furniture','Appliances','Dining chair','Refrigerator','Microwave','Television','Desktop computer','Sci-fi wall panel','Computer console','Server rack'])assert.ok(locale[key],key+' translated');
});

/** Sweep a vertical support line through actual triangle surfaces. Overlapping
 * solids keep the winding count nonzero; a zero interval is a physical gap. */
function supportGaps(result,x,z,until){
 const ray=new THREE.Ray(new THREE.Vector3(x,-.02,z),new THREE.Vector3(0,1,0)),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),hit=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3(),n=new THREE.Vector3(),events=[];
 for(const p of result.parts)for(let k=0;k<p.index.length;k+=3){a.fromArray(p.positions,p.index[k]*3);b.fromArray(p.positions,p.index[k+1]*3);c.fromArray(p.positions,p.index[k+2]*3);if(!ray.intersectTriangle(a,b,c,false,hit))continue;n.crossVectors(ab.subVectors(b,a),ac.subVectors(c,a));if(Math.abs(n.y)<1e-12)continue;events.push([hit.y,n.y<0?1:-1]);}
 events.sort((a,b)=>a[0]-b[0]);const grouped=[];for(const e of events){const last=grouped.at(-1);if(last&&Math.abs(last[0]-e[0])<1e-5)last[1]+=e[1];else grouped.push(e.slice());}
 let inside=0,end=null,started=false;const gaps=[];
 for(const [y,change]of grouped){if(y>until)break;if(started&&inside===0&&end!==null&&y-end>.006)gaps.push(y-end);inside+=change;if(inside>0)started=true;if(inside===0)end=y;}
 return gaps;
}
test('seating, bed, console and monitor supports meet their actual bodies without floating gaps',()=>{
 for(const id of ['sofa','armchair','bed','console','computer'])for(const extra of [{},{padding:1.4,deckAngle:50}]){
  const recipe={...F.fromPreset(id),...extra},r=F.build(recipe,{}),W=recipe.width,D=recipe.depth;
  const rays=id==='computer'?[[-W*.17,-D*.16]]:id==='console'?[-1,1].flatMap(s=>[[s*W*.34,-D*.31],[s*W*.34,D*.24]]):[-1,1].flatMap(s=>[[s*W*.4,-D*.38],[s*W*.4,D*.38]]);
  for(const [x,z]of rays)assert.equal(supportGaps(r,x,z,recipe.height*(id==='computer'?.4:id==='console'?.5:.38)).length,0,id+' support has an air gap');
 }
});
