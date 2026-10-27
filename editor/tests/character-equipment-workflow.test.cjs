'use strict';
const assert=require('node:assert/strict'), test=require('node:test'), fs=require('node:fs'), path=require('node:path'),vm=require('node:vm');
const forge=path.join(__dirname,'../src/forge'),read=p=>fs.readFileSync(path.join(forge,p),'utf8');
const Body=require(path.join(forge,'Character3D/HumanBody.js'));
const Power=require(path.join(forge,'Character3D/CharacterPowerArmor.js'));
const Wardrobe=require(path.join(forge,'Character3D/CharacterWardrobe.js'));
const Character=require(path.join(forge,'Character3D/CharacterModel.js'));
const Props=require(path.join(forge,'Character3D/CharacterProps.js'));
const Model=require(path.join(forge,'Props/PropModel.js'));
const Accessory=require(path.join(forge,'Props/AccessoryProp.js'));
const Catalog=require(path.join(forge,'Props/PropCatalog.js'));
let pack;
test.before(async()=>{pack=await Body.loadPack();await Accessory.prepare();});
function valid(p,bones) {
    const n=p.positions.length/3;
    assert.ok(n>0&&p.index.length>0,p.name);
    for(const key of ['positions','normals','colors','weights'])for(const v of p[key])assert.ok(Number.isFinite(v),p.name+' '+key);
    assert.equal(p.normals.length,n*3);assert.equal(p.joints.length,n*4);
    for(let v=0;v<n;v++) {
        assert.ok(Math.abs(Math.hypot(...p.normals.subarray(v*3,v*3+3))-1)<.002,p.name+' unit normal');
        assert.ok(Math.abs(p.weights.subarray(v*4,v*4+4).reduce((a,b)=>a+b,0)-1)<1e-5);
    }
    for(const j of p.joints)assert.ok(j<bones);
    for(const i of p.index)assert.ok(i>=0&&i<n);
}
test('power armor fits different bodies and plates stay rigid on their carrying joints',()=>{
    for(const recipe of [{},{gender:0,cup:1},{gender:1,height:1,muscle:1.5},{gender:1,weight:3,muscle:2.2,headSize:1.6},{gender:0,weight:-.3,height:-.5,cup:4},{age:11,height:0,weight:0}]) {
        const b=Body.build(pack,recipe),item=Wardrobe.normalizeOutfit([{id:'powerarmor',bulk:1.2}])[0];
        const armor=Power.build(pack,b,item),helmet=Power.helmet(pack,b,Wardrobe.normalizeOutfit([{id:'powerhelm'}])[0]);
        assert.ok(armor.hidden.size>5000);
        for(const p of [...armor.parts,...helmet.parts])valid(p,b.bones.length);
        for(const p of [...armor.parts.slice(1),...helmet.parts]) {
            for(let k=0;k<p.weights.length;k+=4)assert.equal(p.weights[k],1);
            for(let k=0;k<p.index.length;k+=3) {
                const joints=[0,1,2].map(j=>p.joints[p.index[k+j]*4]);
                assert.equal(joints[0],joints[1]);assert.equal(joints[1],joints[2]);
            }
        }
        // Bone tails are display handles. Armor must reach toward the actual next joint.
        for(const [name,next] of [['LeftUpLeg','LeftLeg'],['RightUpLeg','RightLeg'],['LeftForeArm','LeftHand'],['RightLeg','RightFoot']]) {
            const id=b.bones.findIndex(v=>v.name===name),head=b.bones[id].head,end=b.bones.find(v=>v.name===next).head;
            const d=end.map((v,k)=>v-head[k]),len2=d.reduce((n,v)=>n+v*v,0);
            const p=armor.parts[1];let far=0;
            for(let k=0;k<p.positions.length;k+=3)if(p.joints[k/3*4]===id)far=Math.max(far,d.reduce((n,v,j)=>n+(p.positions[k+j]-head[j])*v,0)/len2);
            assert.ok(far>.8,name+' reaches '+far);
        }
    }
});
test('armor presets include the matching helmet and conceal hair and facial hair',()=>{
    for(const id of ['trooper','marine']) {
        const outfit=Wardrobe.PRESETS.find(p=>p.id===id).items;
        assert.ok(outfit.some(i=>i.id==='powerhelm'));
        const result=Character.build(pack,{outfit,hair:{style:'long',facial:{style:'fullBeard'}}},{},{quality:'preview',skinSize:64,atlasSize:128});
        // (2026-10-25: the space marine wears the sleek cyber armor set over a compression suit, not power armor.)
        assert.ok(result.parts.some(p=>p.name===(id==='marine'?'Cyber chest armor plates':'Power armor plating')));
        assert.ok(result.parts.some(p=>p.name==='Power helmet plating'));
        assert.ok(!result.parts.some(p=>/^(Hair|Beard)/.test(p.name)));
        assert.ok(result.parts.reduce((n,p)=>n+p.index.length/3,0)<40000);
    }
});
test('every accessory is searchable in the prop catalog and exports without its fitting body',()=>{
    assert.equal(Catalog.TYPES.filter(t=>t.kind==='accessory').length,Props.PROPS.length);
    for(const def of Props.PROPS) {
        const type=Catalog.TYPES.find(t=>t.id==='accessory-'+def.id),r=type.start(),snapshot=JSON.stringify(r);
        assert.equal(Catalog.typeOf(r).id,type.id);
        // Swords, daggers and books are listed once, under their own builders: their accessories stay unlisted.
        assert.equal(Catalog.grouped(def.label).some(g=>g.types.includes(type)),!type.hidden,def.id);
        const result=Model.build(r);
        assert.equal(JSON.stringify(r),snapshot,'build does not mutate '+def.id);
        assert.equal(result.bones.length,1);assert.equal(result.clips.length,0);assert.equal(Model.moves(result),false);
        assert.ok(!result.parts.some(p=>p.name==='Body'||p.cloth));
        let bottom=Infinity,minX=Infinity,maxX=-Infinity;
        for(const p of result.parts) {
            valid(p,1);
            for(let k=0;k<p.positions.length;k+=3){bottom=Math.min(bottom,p.positions[k+1]);minX=Math.min(minX,p.positions[k]);maxX=Math.max(maxX,p.positions[k]);}
        }
        assert.ok(Math.abs(bottom)<1e-6,def.id+' sits on floor');
        assert.ok(Math.abs(minX+maxX)<1e-6,def.id+' is centered');
        assert.deepEqual(Model.normalize(JSON.parse(JSON.stringify(r))),r);
    }
});
test('equipment size, rotation, material and attachment origin survive the GLB workflow',async()=>{
    const input={kind:'accessory',accessory:{id:'sword',length:1,color:'#112233',side:'left'},scale:2,pivot:'attachment',rotation:[25,45,90],material:'plastic'};
    const r=Model.normalize(input),out=Model.build(r),same=Model.build(JSON.parse(JSON.stringify(r)));
    assert.deepEqual(out.parts,same.parts);
    assert.ok(out.parts.every(p=>p.roughness===.4&&p.metalness===0));
    // Construction finish maps (relief and packed roughness/metalness) now travel with equipment.
    const encoded=[],bytes=Buffer.from(await Model.toGlb(out,'Equipment',tex=>{encoded.push(tex.name);return Uint8Array.of(137,80,78,71);}));
    assert.deepEqual(encoded.sort(),Object.keys(out.textures).sort(),'every finish map is embedded');
    assert.equal(bytes.toString('utf8',0,4),'glTF');
    const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
    assert.equal(json.images.length,encoded.length);
    assert.equal(json.skins[0].joints.length,1);
    assert.equal(json.animations?.length||0,0);
    assert.equal(json.meshes.length,out.parts.length);
    assert.ok(json.materials.every(m=>m.pbrMetallicRoughness.metallicFactor===0));
    assert.equal(Model.sidecar(out).transform.offset.length,3);
    const base=Model.build({kind:'accessory',accessory:{id:'sword'},scale:1}),double=Model.build({kind:'accessory',accessory:{id:'sword'},scale:2});
    assert.equal(double.height,base.height*2);
    assert.deepEqual(Accessory.normalize({accessory:{id:'glasses',shape:'bad'},scale:99,rotation:[Infinity,500,0]}).rotation,[0,180,0]);
});
function builderContext() {
    const ctx={RRPropModel:Model,RRPropCatalog:Catalog,console,window:{},requestAnimationFrame:()=>1};
    const code=read('Props/PropBuilder.js').split('/** A small picture of a flag design')[0];
    vm.runInNewContext(code+'\nglobalThis.Builder=PropBuilder;',ctx);
    return ctx;
}
test('equipment loading rebuilds the active view after reopen and ignores a different kind',async()=>{
    for(const change of ['reopen','kind','detach']) {
        let resolve,ready=false,queued=0,loads=0;
        const kind={id:'accessory',ready:()=>ready,prepare:()=>{loads++;return new Promise(r=>{resolve=r;});}};
        const ctx=builderContext();ctx.RRPropModel={kindOf:()=>kind};
        const builder=Object.create(ctx.Builder.prototype);
        Object.assign(builder,{recipe:{kind:'accessory'},_view:{},_t:s=>s,_status(){},_queueRebuild(){queued++;}});
        builder._rebuild();builder._rebuild();assert.equal(loads,1);
        if(change==='kind')builder.recipe={kind:'flag'};
        builder._view=change==='detach'?null:{};
        if(change==='reopen')builder._rebuild();
        ready=true;resolve();await new Promise(r=>setImmediate(r));
        assert.equal(queued,change==='reopen'?1:0);
        assert.equal(builder._preparing,null);
    }
});
test('a failed equipment load reports failure and can retry',async()=>{
    let tries=0,status='';const kind={id:'accessory',ready:()=>false,prepare:()=>{tries++;return Promise.reject(Error('missing pack'));}};
    const ctx=builderContext();ctx.console={error(){}};ctx.RRPropModel={kindOf:()=>kind};
    const b=Object.create(ctx.Builder.prototype);Object.assign(b,{recipe:{kind:'accessory'},_view:{},_t:s=>s,_status:s=>{status=s;}});
    b._rebuild();await new Promise(r=>setImmediate(r));
    assert.equal(status,'This prop could not be built.');assert.equal(b._preparing,null);
    b._rebuild();await new Promise(r=>setImmediate(r));assert.equal(tries,2);
});
test('saving equipment keeps its captured recipe when the user switches props during preparation',async()=>{
    const folder=fs.mkdtempSync('/tmp/rr-equipment-save-'),ctx=builderContext();
    ctx.require=require;ctx.Buffer=Buffer;ctx.window.dispatchEvent=()=>{};ctx.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};
    const b=Object.create(ctx.Builder.prototype),recipe=Accessory.normalize({accessory:{id:'dagger',color:'#123456'},pivot:'attachment'});
    // The dagger carries finish maps; the page encodes them with a canvas, stubbed here.
    Object.assign(b,{recipe,name:'Dagger',cache:{},_images:{},_project:()=>({path:folder}),_status(){},_png:()=>Promise.resolve(Uint8Array.of(137,80,78,71))});
    try {
        const saving=b.save();b.recipe=Model.normalize({kind:'flag'});await saving;
        const saved=JSON.parse(fs.readFileSync(path.join(folder,'3d/Props/Dagger/prop.json'),'utf8'));
        assert.deepEqual(saved.recipe,recipe);
        const glb=fs.readFileSync(path.join(folder,'3d/Props/Dagger/source/Dagger.glb'));
        const json=JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)));
        assert.equal(json.skins[0].joints.length,1);
        assert.ok(fs.existsSync(path.join(folder,'3d/Props/Dagger/model.json')));
    } finally {fs.rmSync(folder,{recursive:true,force:true});}
});
test('pose picker sorts translated names, preserves choice and refreshes for a different body plan',()=>{
    const picker={dataset:{},innerHTML:'',value:''};
    const ctx={window:{},rrEscapeHtml:s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),
        RRCharacterPoses:{POSES:[{id:'pistol',label:'Pistol aim, two hands'},{id:'walk',label:'Walk'},{id:'attack',label:'Attack'}]}};
    vm.runInNewContext(read('Character3D/Character3DBuilder.js'),ctx);
    const b=Object.create(ctx.window.Character3DBuilder.prototype);
    Object.assign(b,{pose:'pistol',root:{querySelector:()=>picker},_t:s=>s==='Walk'?'A walk':s});
    b._syncPose();
    assert.equal(picker.value,'pistol');
    const labels=[...picker.innerHTML.matchAll(/<option[^>]*>(.*?)<\/option>/g)].map(m=>m[1]);
    assert.deepEqual(labels,labels.slice().sort((a,b)=>a.localeCompare(b)));
    assert.ok(labels.includes('Pistol aim, two hands'));
    b.pose='unavailable';b._syncPose();assert.equal(b.pose,'idle');assert.equal(picker.value,'idle');
    ctx.RRCharacterPoses.POSES=[{id:'new',label:'A new pose'}];b._syncPose();
    assert.ok(picker.innerHTML.includes('A new pose')&&!picker.innerHTML.includes('Pistol aim'));
    b._t=s=>s==='Idle'?'& <Idle>':s;b._syncPose();assert.ok(picker.innerHTML.includes('&amp; &lt;Idle>'));
    ctx.cancelAnimationFrame=()=>{};ctx.RRCreatureBody={POSES:[{id:'trot',label:'Trot'}],posesFor(){return this.POSES;}};
    b._view={plan:'quadruped',bones:[],group:{position:{y:0}}};b._poseAction=()=>null;b._draw=()=>{};
    b.pose='new';b._syncPose();assert.equal(picker.value,'idle');assert.ok(picker.innerHTML.includes('Trot')&&!picker.innerHTML.includes('A new pose'));
    ctx.RRSlimeBody={POSES:[{id:'wobble',label:'Wobble'}]};b._view.plan='slime';b._syncPose();
    assert.ok(picker.innerHTML.includes('Still')&&picker.innerHTML.includes('Wobble')&&!picker.innerHTML.includes('Trot'));
    assert.ok(read('Character3D/Character3DBuilder.js').includes('data-rr-search="always"'));
});
test('the themed pose dropdown filters long labels and selects a matching pose with the keyboard',()=>{
    const dom=require('./helpers/mini-dom.cjs'),context=dom.createContext();
    const select=dom.createSelect([{value:'idle',text:'Idle'},{value:'pistol',text:'Pistol aim, two hands'},{value:'walk',text:'Walk'}],'idle');
    select.dataset.rrSearch='always';context.document.body.appendChild(select);
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/utils/SelectThemingShim.js'),'utf8'),context);
    context.document.body.querySelector('.rr-shim-trigger').fire('click');
    const popup=context.document.body.querySelector('.rr-shim-popup'),search=popup.querySelector('input');
    assert.ok(search);search.value='two hands';search.fire('input');
    const rows=popup.querySelectorAll('[data-option-index]');
    assert.equal(rows[0].style.display,'none');assert.equal(rows[1].style.display,'');assert.equal(rows[2].style.display,'none');
    context.document.fire('keydown',{key:'ArrowDown',target:search,preventDefault(){},stopPropagation(){}});
    context.document.fire('keydown',{key:'Enter',target:search,preventDefault(){},stopPropagation(){}});
    assert.equal(select.value,'pistol');
    assert.equal(context.document.body.querySelector('.rr-shim-popup'),null);
});
test('prop preview preserves the transparent accessory lenses',()=>{
    const ctx=builderContext();ctx.THREE=require('../node_modules/three');
    const b=Object.create(ctx.Builder.prototype),result=Accessory.build({accessory:{id:'glasses'}});
    const lens=result.parts.find(p=>p.name==='Lenses');assert.ok(lens);
    const material=b._material(lens,result);
    assert.equal(material.opacity,.18);assert.equal(material.transparent,true);assert.equal(material.depthWrite,false);
    b._view={meshes:[{material}]};b._applyMaterials({parts:[{...lens,opacity:1}],recipe:result.recipe});
    assert.equal(material.opacity,1);assert.equal(material.transparent,false);assert.equal(material.depthWrite,true);
    material.dispose();
});
test('small equipment fills the preview and its origin never buries it under the floor',()=>{
    const ctx=builderContext(),T=require('../node_modules/three');ctx.THREE=T;
    const b=Object.create(ctx.Builder.prototype),view={target:new T.Vector3(),floor:new T.Object3D(),blob:new T.Object3D(),wall:new T.Object3D(),scene:new T.Scene(),key:new T.DirectionalLight(),camera:new T.PerspectiveCamera(32,1,.05,200)};
    Object.assign(b,{_view:view,_draw(){}});
    b._result=Accessory.build({accessory:{id:'glasses'},pivot:'center'});b._stage(b._result);
    const near=view.distance;assert.ok(near<.8&&near>.04);assert.ok(view.camera.near<.01);assert.ok(view.floor.position.y<0);
    for(const p of b._result.parts)for(let i=1;i<p.positions.length;i+=3)assert.ok(p.positions[i]>view.floor.position.y);
    b._result=Accessory.build({accessory:{id:'glasses'},pivot:'attachment',scale:4});b._stage(b._result);
    assert.ok(view.distance>near*3,'scaling an existing mesh reframes it');
    b._result=Model.build({kind:'flag'},{},{textureSize:64});b._stage(b._result);
    assert.equal(view.floor.position.y,0);assert.ok(view.distance>6,'large props still frame their full height');
});
