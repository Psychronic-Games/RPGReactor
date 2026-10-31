'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const B=require('../src/forge/Character3D/HumanBody.js'),O=require('../src/forge/Character3D/CharacterOutfit.js'),W=require('../src/forge/Character3D/CharacterWardrobe.js');
const G=require('../src/forge/Props/GarmentProp.js');
let pack;
test.before(async()=>{pack=await B.loadPack();await G.prepare();});
const bodies=[{gender:0},{gender:1},{gender:0,weight:2},{gender:1,shapes:{footSize:2}}];
const ids=['boots','magboots','workBoots','shoes','sneakers','sabatons'];
const styleOf=id=>W.BY_ID.get(id).pieces(W.normalizeItem({id})).find(p=>p.shoe).shoe;
function rings(result,ring){
    const ids=result.template.paint.attrs.map((a,i)=>a.region==='sole'&&a.ring===ring?i:-1).filter(i=>i>=0),cols=result.template.cols;
    assert.equal(ids.length,(cols+1)*2,'both closed sole contours');
    return [0,1].map(side=>ids.slice(side*(cols+1),side*(cols+1)+cols).map(i=>[result.positions[i*3],result.positions[i*3+1],result.positions[i*3+2]]));
}
const same=(a,b)=>a.byteLength===b.byteLength&&Buffer.from(a.buffer,a.byteOffset,a.byteLength).equals(Buffer.from(b.buffer,b.byteOffset,b.byteLength));
function inside(point,polygon){let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];if((a[2]>point[2])!==(b[2]>point[2])&&point[0]<(b[0]-a[0])*(point[2]-a[2])/(b[2]-a[2])+a[0])hit=!hit;
}return hit;}

test('boot, shoe and welt contours turn smoothly without abrupt sole notches on contrasting feet',()=>{
    for(const body of bodies){const built=B.build(pack,B.normalizeRecipe(body));for(const id of ids){
        const result=O.shoes(pack,built,styleOf(id));
        for(let ring=0;ring<=4;ring++)for(const contour of rings(result,ring)){
            let worst=0;
            for(let k=0;k<contour.length;k++){
                const a=contour[(k+contour.length-1)%contour.length],b=contour[k],c=contour[(k+1)%contour.length];
                const u=[b[0]-a[0],b[2]-a[2]],v=[c[0]-b[0],c[2]-b[2]];
                worst=Math.max(worst,Math.abs(Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1])));
            }
            assert.ok(worst<Math.PI/4,id+' ring '+ring+' turns '+(worst*180/Math.PI).toFixed(1)+' degrees; '+JSON.stringify(body));
        }
    }}
});

test('smoothed soles still enclose both actual footprints and retain finite skinned geometry',()=>{
    const an=O.anatomy(pack),source=[...new Set(pack.body.source)];
    for(const body of bodies){const built=B.build(pack,B.normalizeRecipe(body));for(const id of ids){
        const result=O.shoes(pack,built,styleOf(id)),contours=rings(result,0);
        for(const key of ['positions','normals','weights'])assert.ok(result[key].every(Number.isFinite),id+' finite '+key);
        for(let v=0;v<result.positions.length/3;v++){
            let total=0;for(let k=0;k<4;k++){total+=result.weights[v*4+k];assert.ok(result.joints[v*4+k]<built.bones.length);}
            assert.ok(Math.abs(total-1)<.001,id+' normalized binding');
        }
        for(const side of [0,1]){
            const ankle=O.footFrame(built,side).a;let checked=0;
            for(const v of source){
                const point=Array.from(built.shaped.subarray(v*3,v*3+3));
                if(an.member[v*5+(side?4:3)]<.55||point[1]>ankle*1.35)continue;
                checked++;assert.ok(inside(point,contours[side]),id+' footprint vertex '+v+' outside the sole; '+JSON.stringify(body));
            }
            assert.ok(checked>20,id+' both footprints checked');
        }
    }}
});

test('the same smooth boots build in Wearables and Character Builder, with stable body-dependent fits and UVs',()=>{
    for(const id of ['boots','magboots']){
        const a=G.build({garment:{id},body:{gender:1}},{atlasSize:128}),b=G.build({garment:{id},body:{gender:0}},{atlasSize:128});
        const body=B.build(pack,a.recipe.body),wardrobe=W.build(pack,body,[a.recipe.garment],{atlasSize:128});
        const outer=a.parts.filter(p=>!p.rrLining),shared=wardrobe.parts.filter(p=>!p.rrLining);
        assert.equal(outer.length,shared.length,'the same exterior parts');
        assert.ok(a.parts.some(p=>p.rrLining),'standalone shoes add their complete inward upper');
        for(const part of outer){const other=shared.find(p=>p.name===part.name);assert.ok(other,id+' shared exterior');for(const key of ['positions','normals','joints','weights','uvs','index'])if(part[key])assert.ok(same(part[key],other[key]),id+' shared '+key);}
        const first=O.shoes(pack,body,styleOf(id)),other=O.shoes(pack,B.build(pack,b.recipe.body),styleOf(id)),again=O.shoes(pack,body,styleOf(id));
        assert.ok(first.template===other.template&&first.template===again.template,'body changes keep one layout');
        assert.ok(same(first.positions,again.positions),'a body change does not mutate previous fits');
        assert.ok(!same(first.positions,other.positions),'each body keeps its own size');
    }
});
