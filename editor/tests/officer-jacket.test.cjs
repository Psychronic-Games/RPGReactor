'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Body=require('../src/forge/Character3D/HumanBody.js');
const W=require('../src/forge/Character3D/CharacterWardrobe.js');
const O=require('../src/forge/Character3D/CharacterOutfit.js');
const D=require('../src/forge/Character3D/CharacterGarmentDetails.js');
const A=require('../src/forge/Character3D/CharacterAtlas.js');
const G=require('../src/forge/Props/GarmentProp.js');
const Glb=require('../src/forge/Character3D/CharacterGlb.js');
const Optimizer=require('../src/utils/GlbOptimizer.js');
let pack;
test.before(async()=>{pack=await Body.loadPack();await G.prepare();});
const command=()=>W.PRESETS.find(p=>p.id==='commandOfficer').items;
function make(body,outfit,fullLining=false){
    const built=Body.build(pack,Body.normalizeRecipe(body)),original=D.build;let entries;
    D.build=(p,b,e)=>{entries=e;return original(p,b,e);};
    try{const result=W.build(pack,built,outfit,{atlasSize:128,quality:'preview',fullLining});return {built,result,entries};}
    finally{D.build=original;}
}
const sameBytes=(a,b)=>a.byteLength===b.byteLength&&Buffer.from(a.buffer,a.byteOffset,a.byteLength).equals(Buffer.from(b.buffer,b.byteOffset,b.byteLength));

test('officer jacket uses one fitted construction in both Creator and Wearables, with no chest overlay or duplicate closures',()=>{
    const prop=G.build({garment:{id:'officerJacket'},body:{gender:1}},{atlasSize:128,quality:'preview'});
    const {result}=make(prop.recipe.body,[prop.recipe.garment],true);
    assert.ok(!prop.parts.some(p=>['Tailored seams and pockets','Garment zipper teeth','Garment fasteners'].includes(p.name)));
    assert.ok(prop.parts.some(p=>p.name==='Officer insignia'));
    assert.equal(prop.parts.length,result.parts.length);
    for(let i=0;i<prop.parts.length;i++)for(const key of ['positions','index','joints','weights'])assert.ok(sameBytes(prop.parts[i][key],result.parts[i][key]),key+' matches shared wardrobe');
    assert.ok(prop.triangles<10000,'simpler garment remains bounded');
});

test('officer construction stays on the finished fabric across body shapes and an open front',()=>{
    for(const body of [{gender:1},{gender:0},{gender:0,weight:1.4,cup:1.5},{gender:1,height:-.3,muscle:1.2}])for(const open of [0,.45]){
        const {built,result,entries}=make(body,[{id:'officerJacket',open}]),scale=built.height/1.7;
        const laid=entries.find(e=>e.garment==='officerJacket').laid;
        const surface=O.projectedSurface([laid],{cell:.04*scale,accept:(p,ids)=>ids.reduce((sum,v)=>sum+p.normals[v*3+2],0)>.6});
        let checked=0,buried=0,worst=0;const failures=[];
        for(const part of result.parts.filter(p=>p.detailAnchors)){
            assert.ok(part.positions.every(Number.isFinite),part.name+' finite');
            const rest=part.positions.slice();D.follow([part],entries);let drift=0;
            for(let k=0;k<rest.length;k++)drift=Math.max(drift,Math.abs(rest[k]-part.positions[k]));
            assert.ok(drift<.000005,part.name+' retains its fitted cloth anchors');
            for(let t=0;t<part.index.length;t+=3){
                const ids=Array.from(part.index.subarray(t,t+3));
                if(ids.reduce((sum,v)=>sum+part.normals[v*3+2],0)<.6)continue;
                for(const bary of [[1/3,1/3,1/3],[.5,.5,0],[.5,0,.5],[0,.5,.5]]){
                    const p=[0,1,2].map(k=>ids.reduce((sum,v,j)=>sum+part.positions[v*3+k]*bary[j],0)),hit=surface.sample(p[0],p[1]);
                    if(!hit)continue;checked++;const depth=hit.depth-p[2];worst=Math.max(worst,depth);if(depth>.0008*scale){buried++;if(failures.length<4)failures.push({part:part.name,depth,p,offsets:ids.map(v=>part.detailAnchors[v*10+9])});}
                }
            }
        }
        assert.ok(checked>100,'sampled detail interiors');
        assert.equal(buried,0,'buried detail samples '+buried+'; worst '+worst.toFixed(5)+' m; '+JSON.stringify({body,open,failures}));
    }
});

test('an officer jacket hides underlying suit pockets while retaining details visible through its opening',()=>{
    const counts=[];
    for(const open of [null,0,.45]){
        const outfit=open===null?[{id:'starshipUniform',lightIntensity:0}]:command().map(i=>({...i,...(i.id==='officerJacket'?{open}:{})}));
        const {result}=make({gender:0},outfit);
        counts.push(result.parts.filter(p=>p.name==='Tailored seams and pockets').reduce((n,p)=>n+p.index.length/3,0));
    }
    assert.ok(counts[0]>counts[1]+100,'covered suit pockets are removed');
    assert.ok(counts[2]>counts[1]&&counts[2]<counts[0],'open front reveals only the exposed inner details: '+counts.join('/'));
});

test('officer panels join across shoulder charts, cover the collar and leave a plain chest below the yoke',()=>{
    const look={pattern:'officer'},colors=[[.8,.8,.8],[.03,.06,.11],[.6,.4,.1]];
    const sample=(fam,x,y)=>A.shade(look,colors,{fam,rest:[x,y,.1],s:1.2,ang:0,vm:.04,val:1,cu:.1,cv:.2,y,rad:.13,px:.0005},null);
    const trunk=sample(0,.17,1.31);
    for(const fam of [1,2])assert.deepEqual(sample(fam,.17,1.31),trunk,'same neutral point across chart boundary');
    // Different physical points carry quiet dye grain; chart changes at one
    // point must remain exact, while nearby same-color panels stay within 2.5%.
    const sameDye=(a,b,label)=>{for(let k=0;k<3;k++)assert.ok(Math.abs(a[k]-b[k])<=Math.max(a[k],b[k])*.025+1e-6,label);};
    sameDye(sample(0,.04,1.44),sample(0,.04,1.34),'collar continues the shoulder color');
    sameDye(sample(0,-.022,1.235),sample(0,.022,1.235),'no painted offset zipper or diagonal chest slash');
});

test('the fitted officer indicator preserves brightness and off settings in saved equipment',()=>{
    for(const lightIntensity of [0,.35,1]){
        const result=G.build({garment:{id:'officerJacket',lightColor:'#ffffff',lightIntensity}},{atlasSize:64});
        const indicator=result.parts.find(p=>p.name==='Officer badge indicator');assert.equal(indicator.emissiveIntensity,lightIntensity);
        assert.ok(!result.textures['outfit-glow.png'],'no duplicate painted badge');
        const {json}=Optimizer.parseGlb(Glb.toGlb(result,{images:{},clips:result.clips}));
        const material=json.materials.find(m=>m.name==='Officer badge indicator');
        assert.deepEqual(material.emissiveFactor,[lightIntensity,lightIntensity,lightIntensity]);
    }
});
