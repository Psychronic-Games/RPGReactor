const test = require('node:test');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, 'runtime', name), 'utf8');
const Reactor3D = require('../../runtime/reactor_3d.js');

function navigation({width=40,height=24,loop=false}={}) {
    const blocked = new Set();
    let checks = 0;
    const map = {
        width:()=>width,mapId:()=>1,
        roundXWithDirection:(x,d)=>(x+(d===6?1:d===4?-1:0)+width)%width,
        roundYWithDirection:(y,d)=>y+(d===2?1:d===8?-1:0),
        deltaX:(a,b)=>loop && Math.abs(a-b)>width/2 ? a-b-Math.sign(a-b)*width : a-b,
        deltaY:(a,b)=>a-b,
        distance(a,b,c,d){return Math.abs(this.deltaX(a,c))+Math.abs(b-d);}
    };
    const context = {Game_Character:function(){},Game_Temp:function(){},$gameMap:map};
    vm.createContext(context);
    const source=runtimeSource('reactor_objects.js');
    vm.runInContext(source.slice(source.indexOf('Game_Temp.prototype.setDestination'),source.indexOf('Game_Temp.prototype.setTouchState')),context);
    vm.runInContext(source.slice(source.indexOf('Game_Character._touchRoutes ='),source.indexOf('//-----------------------------------------------------------------------------\n// Game_Player')),context);
    const temp=new context.Game_Temp(); temp._destinationX=temp._destinationY=null;
    context.$gameTemp=temp;
    const player = new context.Game_Character();
    Object.assign(player,{x:1,y:1,deltaXFrom(x){return map.deltaX(this.x,x);},deltaYFrom(y){return this.y-y;},
        canPass(x,y,d){checks++;const nx=x+(d===6?1:d===4?-1:0),ny=map.roundYWithDirection(y,d);
            return (loop || nx>=0&&nx<width)&&ny>=0&&ny<height&&!blocked.has(map.roundXWithDirection(x,d)+','+ny);}});
    context.$gamePlayer=player;
    return {player,temp,map,blocked,checks:()=>checks,context,step(d){player.x=map.roundXWithDirection(player.x,d);player.y=map.roundYWithDirection(player.y,d);}};
}

test('click routes reuse the path, finish on the requested tile and replan for moving obstacles',()=>{
    const n=navigation();n.temp.setDestination(15,1);
    let d=n.player.findDirectionTo(15,1);assert.equal(d,6);
    const initial=n.checks();assert.ok(initial>14);
    n.step(d);let before=n.checks();d=n.player.findDirectionTo(15,1);
    assert.equal(n.checks()-before,1,'cached step performs one collision check');
    n.blocked.add('3,1');d=n.player.findDirectionTo(15,1);assert.notEqual(d,6,'new obstruction invalidates cached route');
    for(let count=0;count<40 && (n.player.x!==15||n.player.y!==1);count++) n.step(n.player.findDirectionTo(15,1));
    assert.deepEqual([n.player.x,n.player.y],[15,1]);assert.equal(n.player.findDirectionTo(15,1),0);
    n.temp.setDestination(14,1);assert.equal(n.player.findDirectionTo(14,1),4);
    n.temp.clearDestination();assert.equal(n.temp.isDestinationValid(),false);
});

test('a click can plan a detour beyond the old twelve-step horizon',()=>{
    const n=navigation();for(let y=0;y<10;y++)n.blocked.add('5,'+y);
    n.temp.setDestination(10,1);const visited=new Set();
    for(let i=0;i<40 && (n.player.x!==10||n.player.y!==1);i++) {
        const key=n.player.x+','+n.player.y;assert.equal(visited.has(key),false,'route does not oscillate');visited.add(key);
        const d=n.player.findDirectionTo(10,1);assert.ok(n.player.canPass(n.player.x,n.player.y,d));n.step(d);
    }
    assert.deepEqual([n.player.x,n.player.y],[10,1]);
});

test('route invalidation handles teleports and a looping map edge',()=>{
    const n=navigation({width:20,loop:true});n.player.x=0;n.temp.setDestination(18,1);
    assert.equal(n.player.findDirectionTo(18,1),4);n.step(4);assert.equal(n.player.x,19);
    assert.equal(n.player.findDirectionTo(18,1),4);
    n.player.x=17;assert.equal(n.player.findDirectionTo(18,1),6);
    const revision=n.temp._destinationVersion;n.temp.setDestination(18,1);assert.equal(n.temp._destinationVersion,revision);
    n.temp.clearDestination();n.temp.setDestination(18,1);assert.ok(n.temp._destinationVersion>revision);
});

test('held clicks retarget only when the pointer moves, and use the live 3D camera',()=>{
    const source=read('reactor_scenes.js');
    const context={Scene_Map:function(){},TouchInput:{x:100,y:120,isTriggered:()=>true,isPressed:()=>true},Reactor3D:{screenToGroundTile:()=>({x:4,y:7})},$dataMap:{},$gameTemp:{setDestination(x,y){this.goal=[x,y];}}};
    vm.createContext(context);
    vm.runInContext(source.slice(source.indexOf('Scene_Map.prototype.processMapTouch'),source.indexOf('Scene_Map.prototype.isSceneChangeOk')),context);
    const scene=new context.Scene_Map();scene._touchCount=0;scene._spriteset={_reactor3d:{camera:{}}};
    let picks=0;const original=scene.onMapTouch;scene.onMapTouch=function(){picks++;original.call(this);};
    for(let i=0;i<60;i++)scene.processMapTouch();assert.equal(picks,1);assert.deepEqual(context.$gameTemp.goal,[4,7]);
    context.TouchInput.x++;scene.processMapTouch();assert.equal(picks,2);
    scene._reactor3dTouchConsumed=true;context.TouchInput.x++;scene.processMapTouch();assert.equal(picks,2,'pointer-lock click is consumed only once');
    context.TouchInput.isPressed=()=>false;scene.processMapTouch();scene.processMapTouch();assert.equal(scene._touchCount,0);
});

test('3D ground picking handles perspective, elevation, the horizon and off-map clicks',()=>{
    const map={width:4,height:4,reactor3d:{elevation:Array(16).fill(0)}};map.reactor3d.elevation[5]=2;
    assert.deepEqual(Reactor3D.groundTileFromRay(map,{x:1.5,y:8,z:1.5},{x:0,y:-1,z:0}),{x:1,y:1});
    assert.deepEqual(Reactor3D.groundTileFromRay(map,{x:.5,y:4,z:4.5},{x:0,y:-1,z:-1}),{x:0,y:0});
    assert.equal(Reactor3D.groundTileFromRay(map,{x:1,y:2,z:1},{x:1,y:0,z:0}),null);
    assert.equal(Reactor3D.groundTileFromRay(map,{x:8,y:4,z:8},{x:0,y:-1,z:0}),null);
});

test('ground destination mesh lies flat at elevation, pulses, hides and disposes',()=>{
    require('../../runtime/libs/three.js');
    const scene=Object.create(Reactor3D.MapScene.prototype);
    Object.assign(scene,{_meshes:[],_materials:[],_textures:[],_scene:new THREE.Scene()});
    const temp={isDestinationValid:()=>true,destinationX:()=>1,destinationY:()=>1};
    const map={width:2,height:2,reactor3d:{elevation:[0,0,0,2]}};
    scene.updateDestination(temp,map,100);const mesh=scene._destinationMarker;
    assert.equal(mesh.rotation.x,-Math.PI/2);assert.deepEqual(mesh.position.toArray(),[1.5,2.015,1.5]);
    assert.equal(mesh.material.depthWrite,false);scene.updateDestination(temp,map,110);assert.equal(mesh.scale.x,1.5);
    temp.isDestinationValid=()=>false;scene.updateDestination(temp,map,111);assert.equal(mesh.visible,false);
    let disposed=0;mesh.geometry.addEventListener('dispose',()=>disposed++);mesh.material.addEventListener('dispose',()=>disposed++);
    scene.clear();assert.equal(disposed,2);assert.equal(scene._destinationMarker,null);assert.equal(mesh.parent,null);
});
