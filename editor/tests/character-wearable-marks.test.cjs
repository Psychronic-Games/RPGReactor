'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const B=require('../src/forge/Character3D/HumanBody.js'),P=require('../src/forge/Character3D/CharacterProps.js'),M=require('../src/forge/Character3D/CharacterMarks.js');
const A=require('../src/forge/Props/AccessoryProp.js'),G=require('../src/forge/Props/GarmentProp.js');
const Model=require('../src/forge/Character3D/CharacterModel.js'),Cloth=require('../src/forge/Character3D/CharacterCloth.js'),Poses=require('../src/forge/Character3D/CharacterPoses.js');
let pack,built;test.before(async()=>{pack=await B.loadPack();built=B.build(pack,B.normalizeRecipe({gender:1}));await A.prepare();await G.prepare();});
const hash=t=>crypto.createHash('sha256').update(t.data).digest('hex');
const pixel=(t,u,v)=>Array.from(t.data.subarray((Math.floor(v*t.height)*t.width+Math.floor(u*t.width))*4,(Math.floor(v*t.height)*t.width+Math.floor(u*t.width))*4+3));
const badge={width:4,height:2,data:Uint8Array.from([255,0,0,255,255,0,0,255,0,0,255,255,0,0,255,255,255,0,0,255,255,0,0,255,0,0,255,255,0,0,255,255])};

test('prints validate picture references, retain alpha/aspect, and face the reader on the back',()=>{
    for(const picture of ['../outside.png','https://example.test/p.png','/tmp/a.png','a/../b.png','custom+scheme:picture','a'.repeat(513)])assert.equal(M.normalize({picture}).picture,'');
    const plain=[.2,.3,.4],m=M.prepare({shape:'picture',picture:'Badge',place:'back'},new Map([['Badge',badge]]));
    const red=M.garment(plain,m,{fam:0,rest:[.09,1.255,-.1]}),blue=M.garment(plain,m,{fam:0,rest:[-.09,1.255,-.1]});
    assert.ok(red[0]>.8&&red[2]<.1,'rear left is the picture’s left');assert.ok(blue[2]>.8&&blue[0]<.1);
    assert.ok(M.blend(plain,m,0,.9)===plain,'letterbox preserves the cloth');
    const transparent=M.prepare({shape:'picture',picture:'Clear'},new Map([['Clear',{width:1,height:1,data:Uint8Array.of(255,0,0,0)}]]));
    assert.ok(M.blend(plain,transparent,0,0)===plain,'transparent pixels leave fabric intact');
});

test('cape hem has a defined boundary, a readable outside print and a separate plain lining',()=>{
    const result=P.build(pack,built,[{id:'cape',trimWidth:.04,mark:{shape:'eagle'}}],[]),outer=result.parts.find(p=>p.name==='Cape'),inner=result.parts.find(p=>p.name==='Cape lining'),texture=result.textures[outer.texture];
    assert.equal(texture.width,1024);assert.ok(outer.colors.every(v=>v===1),'color does not interpolate across the hem');
    assert.deepEqual(pixel(texture,.5,.9),[138,26,42]);assert.deepEqual(pixel(texture,.5,.99),[212,175,55]);
    // Preview 60 gave linings a woven surface: the neutral shared weave tinted by the lining color, never the printed cape picture.
    assert.equal(inner.texture,'construction-fabric-albedo.png');assert.notEqual(inner.texture,outer.texture);assert.ok(outer.cloth&&inner.sewnRoots&&!inner.cloth);assert.equal(outer.doubleSided,false);assert.equal(inner.doubleSided,false);
    const prop=A.build({accessory:{id:'cape',mark:{shape:'eagle'}}});
    assert.equal(prop.parts.find(p=>p.name==='Cape').doubleSided,false,'standalone builder respects the two separate faces');
    assert.equal(prop.parts.find(p=>p.name==='Cape lining').doubleSided,false);
    assert.ok(A.usesAccent(prop.recipe),'printed trim remains editable');
});

test('scarf stripes have crisp painted edges and independent pattern/color choices',()=>{
    const make=pattern=>A.build({accessory:{id:'scarf',pattern}}),striped=make('stripes'),plain=make('solid'),checked=make('checks');
    const part=striped.parts.find(p=>p.name==='Scarf'),texture=striped.textures[part.texture];
    assert.ok(part.colors.every(v=>v===1),'pattern is not interpolated over the coarse vertex colors');
    assert.deepEqual(pixel(texture,.5,.52),[138,42,42]);assert.deepEqual(pixel(texture,.5,.56),[200,160,64]);
    assert.notEqual(hash(texture),hash(plain.textures[part.texture]));assert.notEqual(hash(texture),hash(checked.textures[part.texture]));
    assert.ok(A.usesAccent(striped.recipe),'scarf stripe color remains available');
});

test('symbols are independent of a garment’s fabric pattern and wait for actual picture pixels',()=>{
    const cache={atlasSize:256},recipe={garment:{id:'shirt',pattern:'stripes',mark:{shape:'picture',picture:'Badge',place:'back'}}};
    const missing=G.build(recipe,cache);assert.equal(missing.imageMissing,true);assert.equal(missing.imageName,'Badge');
    const marked=G.build(recipe,cache,{images:{Badge:badge}});assert.equal(marked.imageMissing,false);assert.equal(marked.recipe.garment.pattern,'stripes');
    assert.notEqual(hash(missing.textures['outfit.png']),hash(marked.textures['outfit.png']));
    const accessory=A.build({accessory:{id:'cape',mark:{shape:'picture',picture:'Badge'}}},{},{images:{Badge:badge}});
    assert.equal(accessory.imageMissing,false);assert.equal(accessory.recipe.accessory.mark.picture,'Badge');
});

test('cape print and lining share their cloth movement without exposing the print on the inside',()=>{
    const r=Model.build(pack,{gender:1,hair:{style:'bald'},outfit:[{id:'jeans'}],props:[{id:'cape',mark:{shape:'star'}}]},{},{quality:'preview',skinSize:32,atlasSize:128,hairBudget:.1});
    const a=r.parts.find(p=>p.name==='Cape'),b=r.parts.find(p=>p.name==='Cape lining');assert.ok(r.cloth);assert.equal(a.positions.length,b.positions.length);
    assert.equal(r.cloth.regions.filter(g=>g.kind==='cape').length,1,'one simulation drives both faces');
    assert.ok(a.joints.every((v,k)=>v===b.joints[k])&&a.weights.every((v,k)=>v===b.weights[k]),'lining follows the exact same cloth bindings');
    const raw=Poses.clip(r.bones,'walk',r.parts.find(p=>p.name==='Body')),clip=Cloth.bake(r,raw,{quality:'preview'}),pose=Cloth.pose(r.bones,clip,clip.times.at(-1)*.35);
    const x=Cloth.skin(a,r.bones,pose),y=Cloth.skin(b,r.bones,pose);let max=0;for(let k=0;k<x.length;k++)max=Math.max(max,Math.abs(x[k]-y[k]));
    assert.ok(max<.0005,'two faces remain together: '+max);assert.ok(x.every(Number.isFinite));
});

test('lengthening a scarf keeps its symbol’s physical proportions instead of reusing a stretched print',()=>{
    const heights=[];
    for(const length of [.2,1]){
        const r=A.build({accessory:{id:'scarf',length,color:'#000000',color2:'#000000',mark:{shape:'star',color:'#ffffff'}}});
        const texture=r.textures['scarf-cloth.png'];let rows=0;
        for(let y=texture.height/2;y<texture.height;y++)if(texture.data[(y*texture.width+texture.width/4)*4]>200)rows++;
        heights.push(rows*(.12+length*.35)/(texture.height/2));
    }
    assert.ok(heights.every(h=>h>.01),'a visible symbol on both scarf lengths');
    assert.ok(Math.abs(heights[0]-heights[1])<.003,'physical symbol heights: '+heights.map(h=>h.toFixed(4)).join(', '));
});
