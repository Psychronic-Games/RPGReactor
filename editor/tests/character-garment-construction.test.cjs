'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Q=require('./helpers/character-quality-matrix.cjs'),W=require('../src/forge/Character3D/CharacterWardrobe.js'),Cloth=require('../src/forge/Character3D/CharacterCloth.js'),Poses=require('../src/forge/Character3D/CharacterPoses.js');
let pack;test.before(async()=>{pack=await Q.Body.loadPack();});
const options={quality:'preview',skinSize:32,atlasSize:128,hairBudget:.1,eyeSource:{width:1,height:1,data:Uint8Array.of(90,65,45,255)}};
const make=(outfit,extra={})=>Q.Model.build(pack,{gender:1,hair:{style:'bald'},outfit,...extra},{},options);
const outfit=id=>W.PRESETS.find(p=>p.id===id).items;

test('a gladiator has broad front and rear aprons with a stable cloth root',()=>{
    const r=make(outfit('gladiator')),panel=r.parts.find(p=>p.name==='Leather apron panels'),s=r.height/1.7;
    assert.ok(panel&&r.cloth,'real cloth panel and cloth rig');
    const areas=[0,0];
    for(let t=0;t<panel.index.length;t+=3){const [a,b,c]=[0,1,2].map(k=>panel.index[t+k]*3),P=panel.positions;
        areas[P[a+2]>0?0:1]+=Math.abs((P[b]-P[a])*(P[c+1]-P[a+1])-(P[c]-P[a])*(P[b+1]-P[a+1]))/2;
    }
    for(const [i,area] of areas.entries())assert.ok(area>.055*s*s,(i?'rear':'front')+' panel area '+area.toFixed(4));
    assert.ok(areas[1]/areas[0]>.85,'rear coverage is comparable to front coverage');
    const raw=Poses.clip(r.bones,'walk',r.parts[0]),clip=Cloth.bake(r,raw,{quality:'preview'});
    let previous,maxStep=0;
    for(const time of clip.times){const posed=Cloth.skin(panel,r.bones,Cloth.pose(r.bones,clip,time));
        if(previous)for(let i=0;i<posed.length;i+=3)maxStep=Math.max(maxStep,Math.hypot(posed[i]-previous[i],posed[i+1]-previous[i+1],posed[i+2]-previous[i+2]));
        previous=posed;
    }
    assert.ok(maxStep<.08*s,'no whipping apron vertices: '+maxStep.toFixed(4)+' m/frame');
});

test('fine chest geometry and relief are available on each humanoid species',()=>{
    for(const species of ['human','elf','dwarf','vulcan','klingon','lizardfolk']){
        const r=make([],Q.Model.withSpecies({anatomy:{detail:true}},species));
        assert.ok(r.parts.some(p=>p.name==='Chest detail'),species+' localized geometry');
        const overlay=r.parts.find(p=>p.name==='Areolas');assert.equal(overlay.normalTexture,'areola_n.png');
        assert.equal(r.textures['areola.png'].width,512);assert.equal(r.textures['areola_n.png'].width,512);
    }
});

test('new coats and utility harnesses fit, skin and export as original procedural parts',async()=>{
    for(const id of ['courier','pathfinder'])for(const gender of [0,1]){
        const recipe={gender,weight:gender===0?1.4:0,outfit:outfit(id),props:[{id:'utilityHarness'}],hair:{style:'bald'}};
        const r=make(recipe.outfit,recipe);assert.deepEqual(Q.inspect(r,{recipe:r.recipe},pack).issues,[],id+'/'+gender);
        assert.ok(r.parts.some(p=>p.name==='Tailored seams and pockets'));
        assert.ok(r.parts.some(p=>p.name==='Garment zipper teeth'));
        assert.ok(r.recipe.props.some(p=>p.id==='utilityHarness'));
        assert.ok(r.cloth,'coat has simulated tails');
        assert.ok(r.parts.reduce((s,p)=>s+p.index.length/3,0)<65000,'bounded geometry');
    }
    const r=make(outfit('courier'),{props:[{id:'utilityHarness'}]});
    const bytes=await Q.Model.toGlb(r,'Courier',()=>new Uint8Array([137,80,78,71]));
    assert.ok(bytes.length>10000,'constructed details survive GLB export');
});

test('sci-fi cloth construction adds fitted relief and pressure bellows',()=>{
    for(const id of ['flightCrew','surveyTeam','astronaut','evaCrew']){
        const r=make(outfit(id)),p=r.parts.find(p=>p.name==='Tailored seams and pockets');
        assert.ok(p?.index.length>1000,id+' sewn geometry');
        assert.ok(p.positions.every(Number.isFinite)&&p.normals.every(Number.isFinite),id+' finite detail');
        assert.ok(r.parts.some(p=>p.name==='Garment zipper teeth'));
    }
});

test('hard armor has tiled surface relief and exports its finish maps',async()=>{
    const r=make(outfit('trooper')),armor=r.parts.filter(p=>/^Power .*plating$/.test(p.name));
    assert.ok(armor.length>=2);
    for(const p of armor){assert.equal(p.normalTexture,'armor-grain-normal.png');assert.equal(p.metallicRoughnessTexture,'armor-finish.png');assert.equal(p.uvs.length,p.positions.length/3*2);}
    for(const name of ['armor-grain-normal.png','armor-finish.png']){assert.equal(r.textures[name].width,128);assert.equal(r.textures[name].repeat,true);}
    const bytes=await Q.Model.toGlb(r,'Trooper',()=>new Uint8Array([137,80,78,71]));
    const length=new DataView(bytes.buffer,bytes.byteOffset).getUint32(12,true),json=JSON.parse(Buffer.from(bytes.subarray(20,20+length)).toString());
    assert.ok(json.materials.some(m=>m.normalTexture&&m.pbrMetallicRoughness.metallicRoughnessTexture),'PBR finish exported');
    assert.ok(json.samplers.some(s=>(s.wrapS??10497)===10497&&(s.wrapT??10497)===10497),'finish repeats in exported model (also the glTF default)');
});

test('recon shoulders wrap the upper arms and remain close to the fitted sleeves',()=>{
    for(const gender of [0,1]){
        const r=make(outfit('reconTeam'),{gender}),p=r.parts.find(p=>p.name==='Recon formed plating'),s=r.height/1.7;
        const fabric=r.parts.filter(p=>p.texture==='outfit.png'),{surfaceDistance}=require('./quality/character-outfit-accessory-quality.cjs');
        for(const side of ['Left','Right']){
            const joint=r.bones.findIndex(b=>b.name===side+'Arm'),vertices=[];
            for(let v=0;v<p.positions.length/3;v++)if(p.joints[v*4]===joint)vertices.push(Array.from(p.positions.subarray(v*3,v*3+3)));
            assert.ok(vertices.length>50,'curved shoulder surface');
            const depth=Math.max(...vertices.map(p=>p[2]))-Math.min(...vertices.map(p=>p[2]));
            assert.ok(depth>.065*s,'shoulder wraps toward the back instead of floating at the front');
            let worst=0;
            // Measure the fabric triangles: helper-mesh vertices can be
            // widely spaced even when the continuous sleeve is very close.
            for(let v=0;v<vertices.length;v+=3)worst=Math.max(worst,surfaceDistance(fabric,vertices[v],.10*s));
            assert.ok(worst<.025*s,side+' shoulder is '+worst.toFixed(4)+' m off its sleeve');
        }
    }
});
