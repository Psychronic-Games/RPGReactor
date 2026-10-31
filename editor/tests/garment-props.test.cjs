'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Body=require('../src/forge/Character3D/HumanBody.js');
const Wardrobe=require('../src/forge/Character3D/CharacterWardrobe.js');
const Garment=require('../src/forge/Props/GarmentProp.js');
const Catalog=require('../src/forge/Props/PropCatalog.js');
const Model=require('../src/forge/Props/PropModel.js');
const Glb=require('../src/forge/Character3D/CharacterGlb.js');
const Optimizer=require('../src/utils/GlbOptimizer.js');
require('../../runtime/libs/three.js');
const T=global.THREE,R=require('../../runtime/reactor_3d.js');
let pack;
test.before(async()=>{await Garment.prepare();pack=await Body.loadPack();});
const bytesEqual=(a,b)=>a.constructor===b.constructor&&a.length===b.length&&Buffer.from(a.buffer,a.byteOffset,a.byteLength).equals(Buffer.from(b.buffer,b.byteOffset,b.byteLength));

test('every built-in outfit component is searchable under Wearables, and remains a creator garment',()=>{
    const types=Catalog.grouped('clothing').flatMap(s=>s.types);
    for(const g of Wardrobe.GARMENTS.filter(g=>Garment.supports(g.id))) {
        const type=types.find(t=>t.id==='garment-'+g.id);
        assert.ok(type,g.id);assert.equal(Catalog.topOf(type.category).id,'wearables');
        assert.equal(Model.normalize(type.start()).garment.id,g.id);
        assert.equal(Wardrobe.normalizeItem({id:g.id}).id,g.id);
    }
    assert.ok(Catalog.grouped('office').flatMap(s=>s.types).some(t=>t.id==='garment-shirt'),'find components by outfit name');
});

test('standalone garments retain the wardrobe geometry, materials, pictures and full joint weights',()=>{
    for(const id of ['shirt','jeans','boots','reconArmor']) {
        const result=Garment.build({garment:{id,sleeves:1},body:{gender:0,weight:.65}}),r=result.recipe;
        assert.equal(r.garment.id,id);
        const built=Body.build(pack,r.body),wardrobe=Wardrobe.build(pack,built,[r.garment],{fullLining:true});
        require('../src/forge/Props/PropArmorInterior.js').apply(wardrobe.parts,built.height/1.7);
        assert.equal(result.parts.length,wardrobe.parts.length);
        assert.ok(result.parts.length>0,id);
        const bones=new Set();
        result.parts.forEach((p,i)=>{
            const q=wardrobe.parts[i];
            for(const key of ['positions','normals','joints','weights','index'])assert.ok(bytesEqual(p[key],q[key]),id+' '+key);
            for(const key of ['texture','normalTexture','metallicRoughnessTexture','emissiveTexture'])if(p[key])assert.ok(result.textures[p[key]],id+' '+key);
            for(let j=0;j<p.joints.length;j++)if(p.weights[j]>.01)bones.add(result.bones[p.joints[j]].name);
        });
        assert.ok(bones.size>=2,id+' uses more than a single rigid attachment');
        assert.equal(Model.sidecar(result).wear.mode,'skinned');
        assert.equal(Model.normalize(JSON.parse(JSON.stringify(r))).garment.id,id);
    }
});

function template(result) {
    const raw=Glb.toGlb(result,{clips:result.clips,images:{}}),{json,bin}=Optimizer.parseGlb(raw);
    return R.buildGlbTemplate(json,bin,'',{});
}
function wearer(recipe) {
    const built=Body.build(pack,recipe.recipe.body),object=template({...built,clips:recipe.clips});
    for(const def of recipe.sidecarExtra.wear.bones) {
        const bone=object.getObjectByName(def.name);
        if(def.part&&bone){bone.userData.__reactorRigBone=true;bone.userData.parts=[{name:def.part}];}
    }
    return {object,wornRest:R.Worn.rest(object)};
}
const skinned=root=>{const out=[];root.traverse(n=>{if(n.isSkinnedMesh)out.push(n);});return out;};
const at=(mesh,i)=>mesh.applyBoneTransform(i,new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i)).applyMatrix4(mesh.matrixWorld);

test('an exported shirt loads live, fits at rest, bends at the elbow and follows a moving scaled wearer once',()=>{
    const result=Garment.build({garment:{id:'shirt',sleeves:1},body:{gender:1}}),source=template(result),holder=wearer(result);
    const worn=R.Worn.put(holder,source,Model.sidecar(result),{name:'shirt',scale:1},null);
    assert.ok(worn);holder.worn=[worn];holder.object.updateMatrixWorld(true);
    const meshes=skinned(worn);assert.ok(meshes.length);
    assert.ok(meshes.every(m=>m.material.userData.baseColor?.isColor),'runtime lighting keeps a real base color');
    assert.ok(meshes.every(m=>m.boundingSphere),'bounds are ready before the first GPU draw');
    let elbowProbe;
    for(let m=0;m<meshes.length;m++) {
        const mesh=meshes[m],p=result.parts[m];
        assert.ok(mesh.geometry!==skinned(source)[m].geometry,'template geometry is immutable');
        for(let v=0;v<p.positions.length/3;v+=31) {
            const expected=new T.Vector3().fromArray(p.positions,v*3).add(new T.Vector3().fromArray(holder.object.userData.glbRecentre));
            assert.ok(at(mesh,v).distanceTo(expected)<2e-5,'same-body fit preserves the authored silhouette: '+JSON.stringify({m,v,got:at(mesh,v).toArray(),expected:expected.toArray(),mesh:mesh.name,source:result.parts[m].name}));
        }
        const J=mesh.geometry.attributes.skinIndex.array,W=mesh.geometry.attributes.skinWeight.array;
        for(let v=0;v<J.length/4;v++)if([0,1,2,3].some(k=>W[v*4+k]>.7&&mesh.skeleton.bones[J[v*4+k]].name==='RightForeArm')){elbowProbe={mesh,v,before:at(mesh,v)};break;}
    }
    assert.ok(elbowProbe,'long sleeve has forearm weights');
    holder.object.getObjectByName('RightForeArm').rotation.z=.9;holder.object.updateMatrixWorld(true);
    const posed=at(elbowProbe.mesh,elbowProbe.v);assert.ok(posed.distanceTo(elbowProbe.before)>.03,'elbow bends the sleeve');
    holder.object.position.set(4,2,-3);holder.object.rotation.y=.65;holder.object.scale.setScalar(1.8);holder.object.updateMatrixWorld(true);
    assert.ok(at(elbowProbe.mesh,elbowProbe.v).distanceTo(posed.clone().applyMatrix4(holder.object.matrixWorld))<2e-5,'placement applied once');
    assert.equal(source.getObjectByName('RightForeArm').rotation.z,0);
    R.Worn.clear(holder);assert.equal(worn.parent,null);
});

test('missing weighted joints reject a garment; equipment copies and materials are released independently',()=>{
    const result=Garment.build({garment:{id:'jeans'}}),source=template(result),a=wearer(result),b=wearer(result),scene={_materials:[]};
    const worn=R.Worn.put(a,source,Model.sidecar(result),{},scene);assert.ok(worn);a.worn=[worn];
    const other=R.Worn.put(b,source,Model.sidecar(result),{},null);assert.ok(other);
    assert.ok(skinned(worn)[0].skeleton!==skinned(other)[0].skeleton);
    let disposed=0;skinned(worn)[0].geometry.addEventListener('dispose',()=>disposed++);
    R.Worn.clear(a);assert.equal(disposed,1);assert.equal(scene._materials.length,0);assert.equal(other.parent,b.object);
    const broken={object:new T.Group(),wornRest:{joints:{},bones:{},named:{}}};
    assert.equal(R.Worn.put(broken,source,Model.sidecar(result),{},null),null);
});

test('covered skin is hidden on this wearer only, combines across equipment, and is restored on removal',()=>{
    const shirt=Garment.build({garment:{id:'shirt'}}),jeans=Garment.build({garment:{id:'jeans'}}),holder=wearer(shirt);
    const body=skinned(holder.object).find(m=>m.geometry.userData.rrBodyUV==='reactor-human-1');assert.ok(body);
    const original=body.geometry,index=original.getIndex(),other=wearer(shirt),otherBody=skinned(other.object).find(m=>m.geometry.userData.rrBodyUV);
    const a=R.Worn.put(holder,template(shirt),Model.sidecar(shirt),{},null);holder.worn=[a];
    assert.ok(body.geometry!==original);const shirtCount=body.geometry.drawRange.count;
    assert.ok(shirtCount<index.count&&shirtCount>index.count*.25);
    const b=R.Worn.put(holder,template(jeans),Model.sidecar(jeans),{},null);holder.worn.push(b);
    assert.ok(body.geometry.drawRange.count<shirtCount,'combined coverage');
    assert.equal(otherBody.geometry.getIndex().count,index.count,'another character keeps its skin');
    assert.equal(index.count,original.getIndex().count,'source indices unchanged');
    a.parent.remove(a);R.Worn.maskSkin(holder);assert.ok(body.geometry.drawRange.count>index.count*.25);
    let disposed=0;body.geometry.addEventListener('dispose',()=>disposed++);
    R.Worn.clear(holder);assert.ok(body.geometry===original);assert.equal(disposed,1);
});

test('a different named humanoid uses canonical segments without collapsing intermediate chest joints',()=>{
    const result=Garment.build({garment:{id:'shirt'}}),source=template(result),holder=wearer(result);
    holder.object.traverse(n=>{if(n.userData.parts?.length)n.name='Other_'+n.name;});
    holder.wornRest=R.Worn.rest(holder.object);
    const worn=R.Worn.put(holder,source,Model.sidecar(result),{},null);assert.ok(worn);
    holder.object.updateMatrixWorld(true);
    for(const mesh of skinned(worn))for(let v=0;v<mesh.geometry.attributes.position.count;v+=41)assert.ok(at(mesh,v).toArray().every(Number.isFinite));
    assert.ok(!holder.wornRest.named.Spine1,'fallback path exercised');
});

test('equipment hides covered head hair and beard, then restores their original visibility',()=>{
    const result=Garment.build({garment:{id:'greathelm'}}),holder=wearer(result);
    const hair=new T.Group(),beard=new T.Group(),brows=new T.Group();hair.name='Hair';beard.name='Facial_hair';brows.name='Brows';
    holder.object.add(hair,beard,brows);
    const worn=R.Worn.put(holder,template(result),Model.sidecar(result),{},null);holder.worn=[worn];assert.ok(worn);
    assert.equal(hair.visible,false);assert.equal(beard.visible,false);assert.equal(brows.visible,true);
    R.Worn.clear(holder);assert.equal(hair.visible,true);assert.equal(beard.visible,true);
});

test('garment randomization keeps the garment and body, with independent shape and color scopes',()=>{
    const r=Garment.normalize({garment:{id:'shirt'},body:{gender:0,weight:2}});
    const colors=Garment.random(21,r,'colors'),shape=Garment.random(21,r,'shape');
    assert.deepEqual(colors.body,r.body);assert.deepEqual(shape.body,r.body);
    assert.equal(colors.garment.sleeves,r.garment.sleeves);assert.equal(shape.garment.color,r.garment.color);
    assert.notEqual(colors.garment.color,r.garment.color);assert.equal(shape.garment.id,'shirt');
});

test('garment edits reuse the body without changing it, and switching back reproduces the garment',()=>{
    const cache={},a=Garment.build({garment:{id:'shirt'}},cache),body=cache.garmentBody.built;
    Garment.build({garment:{id:'jeans'}},cache);
    const again=Garment.build({garment:{id:'shirt'}},cache);
    assert.ok(cache.garmentBody.built===body);
    a.parts.forEach((p,i)=>assert.ok(bytesEqual(p.positions,again.parts[i].positions),'repeat geometry'));
    Garment.build({garment:{id:'shirt'},body:{weight:.8}},cache);assert.ok(cache.garmentBody.built!==body);
});

test('switching garment types preserves the reference body for the same character',()=>{
    const recipe=Garment.normalize({garment:{id:'shirt'},body:{gender:1,weight:2,muscle:.8}});
    const boots=Catalog.TYPES.find(t=>t.id==='garment-boots').start(recipe);
    assert.equal(boots.garment.id,'boots');assert.deepEqual(boots.body,recipe.body);
});

test('authored garments offer color randomization without an inactive Shape option',()=>{
    assert.ok(Garment.randomScopes({garment:{id:'shirt'}}).some(s=>s[0]==='shape'));
    assert.ok(!Garment.randomScopes({garment:{id:'mh_jacket_jeans'}}).some(s=>s[0]==='shape'));
    assert.ok(Garment.random(5,{garment:{id:'shoes'}},'shape').garment.bulk>0,'zero-valued shape controls can change');
});
