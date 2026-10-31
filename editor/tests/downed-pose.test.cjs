'use strict';
const assert = require('node:assert/strict'), path = require('node:path'), test = require('node:test');
const root = path.resolve(__dirname, '../..');
global.self = global; global.window = global;
require(path.join(root, 'runtime/libs/three.js'));
const T = global.THREE, R = global.Reactor3D = require(path.join(root, 'runtime/reactor_3d.js'));
const { fightWorld, event } = require('./helpers/fight-world.cjs');
function body() {
    const object = new T.Group(), scene = new T.Scene(); scene.add(object);
    const joint = (name, parent, x, y, z, size) => {
        const b = new T.Bone(); b.name = name; b.userData.parts = [{ name }]; b.position.set(x,y,z); parent.add(b);
        if (size) b.add(new T.Mesh(new T.BoxGeometry(...size), new T.MeshBasicMaterial()));
        return b;
    };
    const hips = joint('Hips',object,0,1,0,[0.4,0.3,0.3]);
    const chest = joint('Chest',hips,0,0.45,0,[0.6,0.5,0.35]);
    joint('Head',chest,0,0.45,0,[0.3,0.35,0.3]);
    const arms=[];
    for(const [side,sign] of [['Right',-1],['Left',1]]) {
        const upper=joint(side+'UpperArm',chest,sign*0.35,0.1,0,[0.15,0.35,0.15]);
        const lower=joint(side+'LowerArm',upper,0,-0.35,0,[0.13,0.3,0.13]);
        joint(side+'Hand',lower,0,-0.3,0,[0.15,0.15,0.1]); arms.push(upper,lower);
        const thigh=joint(side+'UpperLeg',hips,sign*0.15,-0.2,0,[0.18,0.45,0.18]);
        const shin=joint(side+'LowerLeg',thigh,0,-0.4,0,[0.15,0.4,0.15]);
        joint(side+'Foot',shin,0,-0.35,0.05,[0.18,0.15,0.3]);
    }
    const binding=R.prepareModelInstance(object,[]), holder={object,binding,cameraBaseY:0};
    const character={_eventId:78,_reactorKnockedOut:true,_reactorPosePitch:1,_reactorGround:0};
    object.rotation.x=-Math.PI/2;
    return{object,holder,character,binding,arms};
}

test('a knockout releases the armed pose, removes a second animated fall and rests above the ground',()=>{
    const b=body();
    b.arms.forEach(n=>n.rotation.x=-Math.PI/2);
    b.binding.root.rotation.x=Math.PI/2;
    R.DownedPose.update(b.holder,b.character);
    assert.ok(b.binding.root.quaternion.angleTo(new T.Quaternion())<1e-6,'only the combat root rotates the body');
    assert.ok(Math.abs(b.arms[0].rotation.x)<0.2,'the upper arm no longer holds an invisible weapon out');
    b.object.updateMatrixWorld(true);
    const box=new T.Box3().setFromObject(b.object,true);
    assert.ok(box.min.y>=0.014,'the posed body is not buried: '+box.min.y);
    const height=b.object.position.y;
    for(let i=0;i<12;i++)R.DownedPose.update(b.holder,b.character);
    assert.ok(Math.abs(b.object.position.y-height)<1e-6,'a settled body does not rise every frame');
    R.DownedPose.restore(b.holder);
    assert.equal(b.holder.downedPose,null);
    for(const arm of b.arms)assert.ok(arm.quaternion.angleTo(new T.Quaternion())<1e-6,'revival returns the animation its original joints');
});

test('a stowed weapon is excluded from ground support even before its visibility is updated',()=>{
    const b=body(),weapon=new T.Group();
    weapon.add(new T.Mesh(new T.BoxGeometry(1,1,20),new T.MeshBasicMaterial()));b.arms[1].add(weapon);
    const key=R.modelInstanceKey(b.character);R.MapHeld.states.set(key,{character:b.character,record:{object:weapon}});
    try{R.DownedPose.update(b.holder,b.character);assert.ok(b.object.position.y<0.7,'a rifle does not lift the entire body into the air');}
    finally{R.MapHeld.states.delete(key);}
});

test('combat marks fallen enemies and heroes for the resting pose and clears it on revival',()=>{
    const w=fightWorld({tactical:true,events:[event(1,6,2,{note:'<unit: enemy 1>'})]}),f=w.$gameFight;
    assert.ok(f.start({mode:'tactical'})>0);
    const enemy=f.unitOfEvent(1),hero=f._units.find(u=>u.actorId===1);
    for(const unit of [enemy,hero]){
        const c=f.character(unit);f.battler(unit).setHp(0);f.defeat(unit);
        assert.equal(c._reactorKnockedOut,true);
        f.battler(unit).setHp(1);f.raise(unit);
        assert.equal(c._reactorKnockedOut,false);assert.equal(c._reactorPosePitch||0,0);
    }
});


test('ground support has bounded work on a large model and reuses a settled contact',()=>{
    const scene=new T.Scene(),object=new T.Group(),geometry=new T.BufferGeometry();scene.add(object);
    geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(60000*3),3));
    const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial());object.add(mesh);
    let reads=0;const get=mesh.getVertexPosition;mesh.getVertexPosition=function(){reads++;return get.apply(this,arguments);};
    const holder={object,cameraBaseY:0},c={_reactorKnockedOut:true,_reactorPosePitch:1};
    try{
        R.DownedPose.update(holder,c);assert.ok(reads<4096,'support must not walk all 60,000 vertices: '+reads);
        const once=reads;for(let i=0;i<20;i++)R.DownedPose.update(holder,c);
        assert.equal(reads,once,'settled bodies do not resample the mesh');
    }finally{geometry.dispose();mesh.material.dispose();}
});

test('3D combat enables directional limb physics, respects the setting and clears it on revival',()=>{
    for(const [three,enabled] of [[true,true],[true,false],[false,true]]){
        const w=fightWorld({tactical:true,events:[event(1,6,2,{note:'<unit: enemy 1>'})]});
        w.ReactorPhysics={settings:()=>({ragdoll:enabled})};
        w.Reactor3D={isMap3D:map=>map===w.$dataMap&&three};
        const f=w.$gameFight;assert.ok(f.start({mode:'tactical'})>0);
        const unit=f.unitOfEvent(1),c=f.character(unit);unit.struck={x:5,y:2};c._reactorGrapple={};
        f.battler(unit).setHp(0);f.defeat(unit);
        if(three&&enabled){assert.equal(c._reactorRagdoll.combat,true);assert.ok(c._reactorRagdoll.vx>0.05,'the blow carries the body away');assert.equal(c._reactorGrapple,null);}
        else assert.equal(c._reactorRagdoll,undefined);
        f.battler(unit).setHp(1);f.raise(unit);assert.equal(c._reactorRagdoll||null,null);
    }
});

test('a combat ragdoll bends its limbs, keeps the skin above ground, sleeps and restores its rig',()=>{
    const b=body();b.object.quaternion.identity();b.character._reactorPosePitch=0;
    b.character._reactorRagdoll={combat:true,vx:0.035,vy:-0.08,vz:0};
    const hidden=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial());hidden.visible=false;b.object.add(hidden);
    R.DownedPose.update(b.holder,b.character);
    let samples=0;for(const s of b.holder.downedPose.support){const get=s.mesh.getVertexPosition;s.mesh.getVertexPosition=function(){samples++;return get.apply(this,arguments);};}
    try{
        for(let i=0;i<1000&&!b.holder.ragdoll?.asleep;i++){global.Graphics={frameCount:i};R.stepRagdoll(b.holder,b.character);}
        const doll=b.holder.ragdoll;assert.equal(doll.rigid,undefined);assert.equal(doll.asleep,true);
        const box=new T.Box3();b.object.updateMatrixWorld(true);b.object.traverseVisible(n=>{if(n.isMesh)box.union(new T.Box3().setFromObject(n,true));});
        assert.ok(box.min.y>=0.02,'skin, not just joint centers, rests on the ground: '+box.min.y);
        assert.ok(box.max.y<1.2,'the body has collapsed');
        const upper=doll.drive.find(d=>d.name==='RightUpperArm'),lower=doll.drive.find(d=>d.name==='RightLowerArm');
        const rotation=d=>d.node.getWorldQuaternion(new T.Quaternion()).multiply(d.rest.clone().invert());
        assert.ok(rotation(upper).angleTo(rotation(lower))>0.05,'the arm joints do not rotate as one stiff board');
        const reads=samples;for(let i=1000;i<1020;i++){global.Graphics.frameCount=i;R.stepRagdoll(b.holder,b.character);}assert.equal(samples,reads,'sleeping corpses perform no contact sampling');
        R.DownedPose.restore(b.holder);assert.equal(b.holder.ragdoll,null);assert.equal(b.object.userData.rrNoCull,undefined);assert.equal(hidden.frustumCulled,true);
        for(const arm of b.arms)assert.ok(arm.quaternion.angleTo(new T.Quaternion())<1e-6);
    }finally{delete global.Graphics;}
});
