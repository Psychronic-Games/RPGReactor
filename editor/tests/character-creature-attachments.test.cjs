'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../node_modules/three'),Q=require('./helpers/character-quality-matrix.cjs'),Cloth=require('../src/forge/Character3D/CharacterCloth.js');
function inside(part,point){
    const ray=new T.Ray(new T.Vector3(...point),new T.Vector3(.932,.271,.239).normalize()),hit=new T.Vector3(),hits=[];
    const p=part.positions,index=part.index,at=i=>new T.Vector3(p[i*3],p[i*3+1],p[i*3+2]);
    for(let i=0;i<index.length;i+=3)if(ray.intersectTriangle(at(index[i]),at(index[i+1]),at(index[i+2]),false,hit)){
        const d=hit.distanceTo(ray.origin);if(d>1e-7&&!hits.some(x=>Math.abs(x-d)<1e-7))hits.push(d);
    }
    return hits.length%2===1;
}
function anchor(part,point){let best=Infinity,id=-1;for(let i=0;i<part.positions.length;i+=3){const d=Math.hypot(...point.map((v,k)=>v-part.positions[i+k]));if(d<best){best=d;id=i;}}assert.ok(best<1e-6,part.name+' has a real shared pivot');return id;}

test('crab and lobster forearms share exact claw socket pivots throughout locomotion and attack',()=>{
    for(const kind of ['crab','lobster'])for(const type of Q.Creature.variantsFor(Q.Creature.kindRecipe(kind))[0].choices){
        const r=Q.Creature.withVariant(Q.Creature.kindRecipe(kind),kind+'Type',type[0]);if(r.lobsterType==='spinyLobster')continue;
        const b=Q.Creature.build(r,{quality:'preview'}),body=b.parts.find(p=>p.name==='Body');
        for(const s of [-1,1]){
            const wrist=b.bones.find(x=>x.name==='Chela'+s).head,forearm=b.parts.find(p=>p.name==='Cheliped forearm '+s),socket=b.parts.find(p=>p.name==='Palm socket '+s);
            const ia=anchor(forearm,wrist),ib=anchor(socket,wrist),palm=b.parts.find(p=>p.name==='Claw palm '+s),end=b.bones.find(x=>x.name==='Chela'+s).tail;
            assert.ok(inside(palm,end),'socket ends inside the claw palm');
            assert.ok(inside(body,b.bones.find(x=>x.name==='Leg'+s+'_0_0').head),'upper arm starts inside carapace');
            for(const motion of ['idle','crawl','attack']){
                const clip=Q.Creature.poseClip(b.bones,motion,r);
                for(let f=0;f<=12;f++){
                    const pose=Cloth.pose(b.bones,clip,clip.times.at(-1)*f/12),a=Cloth.skin(forearm,b.bones,pose),c=Cloth.skin(socket,b.bones,pose);
                    assert.ok(Math.hypot(...[0,1,2].map(k=>a[ia+k]-c[ib+k]))<1e-6,type[0]+'/'+motion+' keeps the carpal connection');
                }
            }
        }
    }
});

test('stingers emerge from the actual bee and wasp abdomen and share its animation binding',()=>{
    for(const kind of ['bee','wasp']){
        const r=Q.Creature.kindRecipe(kind),b=Q.Creature.build(r,{quality:'preview'}),stinger=b.parts.find(p=>p.name==='Stinger'),abdomen=b.parts.find(p=>p.name==='Segmented abdomen');
        // The first tube ring is embedded; the pointed end extends beyond the abdomen.
        assert.ok(Array.from({length:12},(_,i)=>i).some(i=>inside(abdomen,Array.from(stinger.positions.slice(i*3,i*3+3)))),kind+' stinger enters abdomen');
        const bone=b.bones.findIndex(x=>x.name==='Abdomen');
        for(let i=0;i<stinger.positions.length/3;i++)assert.ok(stinger.joints[i*4]===bone&&stinger.weights[i*4]===1);
    }
});

test('wing roots stay embedded at contrasting dimensions and bat membrane seams remain welded during flight',()=>{
    for(const kind of ['bee','wasp','avian','bat'])for(const scale of [.65,1,1.5]){
        const r=Q.Creature.normalizeRecipe({...Q.Creature.kindRecipe(kind),girth:scale,chestDepth:scale}),b=Q.Creature.build(r,{quality:'preview'}),body=b.parts.find(p=>p.name==='Body');
        for(const bone of b.bones.filter(x=>x.role==='wing'))assert.ok(inside(body,bone.head),kind+'/'+scale+' wing starts in torso');
    }
    const r=Q.Creature.kindRecipe('bat'),b=Q.Creature.build(r,{quality:'preview'}),clip=Q.Creature.poseClip(b.bones,'fly',r);
    for(const part of b.parts.filter(p=>p.name.startsWith('Patagium '))){
        const grouped=new Map();for(let i=0;i<part.positions.length;i+=3){const key=Array.from(part.positions.slice(i,i+3)).map(v=>v.toFixed(7)).join(',');if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(i);}
        const seams=[...grouped.values()].filter(x=>x.length>1);assert.ok(seams.length>40,'shared panel boundaries exist');
        for(let f=0;f<=12;f++){
            const posed=Cloth.skin(part,b.bones,Cloth.pose(b.bones,clip,clip.times.at(-1)*f/12));
            for(const ids of seams)for(const i of ids.slice(1))assert.ok(Math.hypot(...[0,1,2].map(k=>posed[ids[0]+k]-posed[i+k]))<1e-6,'membrane panels stay joined during flight');
        }
    }
});
