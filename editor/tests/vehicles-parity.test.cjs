'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {boardWorld,bike,motorcycle,event}=require('./helpers/vehicles-board-world.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const sprite={characterName:'Vehicle',characterIndex:0};
function flat(extra={}) {
 return boardWorld({flat:true,model:false,width:40,height:30,vehicles:[bike(31,10,10,{yaw:90})],types:[null,motorcycle({sheet:sprite,...extra})],prepare(data,w){w.THREE=undefined;}});
}
function hold(w,key,ticks){w.Input.isPressed=name=>name===key;w.run(ticks);w.Input.isPressed=()=>false;}
test('flat vehicle inherits its sprite, boards by Confirm, drives without THREE, and exits with Cancel',()=>{
 const w=flat(),p=w.stand(9,10,6),e=w.vehicle(31);
 assert.equal(e.characterName(),'Vehicle');assert.equal(e.characterIndex(),0);
 assert.equal(w.THREE,undefined);assert.equal(w.V.offered(true),e);
 w.press('ok');w.run(w.V.HOP+1);assert.equal(w.V.isRiding(),true);assert.equal(p.isTransparent(),true);
 hold(w,'right',40);assert.ok(p._realX>12);assert.equal(w.V.ridden(),e);assert.equal(e._realX,p._realX);
 w.press('cancel');w.run(100);assert.equal(w.V.isRiding(),false);assert.equal(p.isTransparent(),false);
 assert.equal(e.characterName(),'Vehicle');
});
test('2D ground vehicles stop at directional tile walls and solid events',()=>{
 for(const obstacle of ['wall','event']){
  const w=flat(),p=w.stand(9,10,6);assert.equal(w.V.getOn(31,{instant:true}),true);
  if(obstacle==='wall'){const pass=w.$gameMap.isPassable;w.$gameMap.isPassable=function(x,y,d){if((x===12 && d===6)||(x===13 && d===4))return false;return pass.call(this,x,y,d);};}
  else{const source=event(32,13,10);w.$dataMap.events[32]=source;w.$gameMap._events[32]=new w.Game_Event(1,32);}
  hold(w,'right',90);assert.ok(p._realX<12.51,obstacle+': '+p._realX);assert.equal(w.V.isRiding(),true);
 }
});
test('travel medium and rideability are settings for every preset',()=>{
 for(const kind of ['motorcycle','tank','car','boat','airship','shuttle','hover']){
  const w=flat({kind,medium:'ground'});w.stand(9,10,6);assert.equal(w.V.scenery(w.vehicle(31)),'',kind);
  assert.equal(w.V.getOn(31,{instant:true}),true,kind);hold(w,'right',30);assert.ok(w.$gamePlayer._realX>10,kind);
 }
 const disabled=flat({ridable:false});assert.equal(disabled.V.scenery(disabled.vehicle(31)),'disabled');assert.equal(disabled.V.getOn(31),false);
});
test('the 2D graphic choice retains the model but does not bind it for rendering',()=>{
 const model={name:'Vehicles/Bike',size:3};
 const w=flat({model,graphic3d:false}),record=w.$dataReactorVehicles[1];
 assert.equal(w.Reactor3D.Vehicles.typeOf(record).model,null);
 assert.equal(w.vehicle(31).characterName(),'Vehicle');
 assert.deepEqual(plain(record.model),model);
 record.graphic3d=true;
 assert.equal(w.Reactor3D.Vehicles.typeOf({...record}).model.name,model.name);
 assert.equal(w.vehicle(31).characterName(),'Vehicle');
});
test('2D boat/ship passage and air travel follow the selected medium',()=>{
 const water=flat({kind:'boat',medium:'water',passability:'ship'});water.stand(9,10,6);
 water.$gameMap.isBoatPassable=()=>false;water.$gameMap.isShipPassable=(x,y)=>x<13 && y===10;
 assert.equal(water.V.getOn(31,{instant:true}),true);hold(water,'right',90);assert.ok(water.$gamePlayer._realX>10);assert.ok(water.$gamePlayer._realX<12.51);
 const air=flat({kind:'airship',medium:'air'});air.stand(9,10,6);air.$gameMap.checkPassage=()=>false;
 assert.equal(air.V.getOn(31,{instant:true}),true);hold(air,'right',60);assert.ok(air.$gamePlayer._realX>12);
});
test('2D loops wrap the vehicle and allow getting off at the edge',()=>{
 const w=flat(),p=w.stand(9,10,6);w.$dataMap.scrollType=3;
 assert.equal(w.V.getOn(31,{instant:true}),true);p._realX=p._x=39;w.V.Drive.seat(p);
 hold(w,'right',30);assert.ok(p._realX<10);assert.ok(w.vehicle(31)._realX<10);
 assert.equal(w.V.getOff({instant:true}),true);
});
test('3D boats use authored water and flying vehicles land before Cancel dismounts',()=>{
 const make=extra=>boardWorld({width:40,height:30,vehicles:[bike(31,10,10,{yaw:90})],types:[null,motorcycle(extra)]});
 const water=make({kind:'boat',medium:'water'});water.stand(9,10,6);
 water.Reactor3D.waterSurfaceAt=(_map,x,y)=>x<13 && y>=9 && y<12?1:null;
 water.$gameMap.isBoatPassable=()=>false;
 assert.equal(water.V.getOn(31,{instant:true}),true);hold(water,'right',90);
 assert.ok(water.$gamePlayer._realX>10);assert.ok(water.$gamePlayer._realX<13);assert.equal(water.$gamePlayer._rrDrive.alt,1);
 const air=make({kind:'airship',medium:'air',flight:{height:3}});air.stand(9,10,6);
 assert.equal(air.V.getOn(31,{instant:true}),true);hold(air,'right',45);
 assert.ok(air.$gamePlayer._realX>10);assert.equal(air.$gamePlayer._rrDrive.alt,3);
 air.press('cancel');air.run(120);assert.equal(air.V.isRiding(),false);
});
test('a class is optional for intrinsic vehicle traits and learned skills',()=>{
 const w=flat({traits:[{code:21,dataId:0,value:2}],learnings:[{level:1,skillId:1}]});
 const battler=w.V.battler(31);assert.equal(battler.currentClass().id,0);assert.equal(battler.mhp,2);assert.equal(battler.isLearnedSkill(1),true);
 w.saveAndLoad();assert.equal(w.V.battler('1:31').isLearnedSkill(1),true);
});
test('riding between 2D and 3D retains the identity, loadout, skills, states and parked location',()=>{
 const w=boardWorld({width:40,height:30,vehicles:[bike(31,10,10)],types:[null,motorcycle({sheet:sprite,classId:1,learnings:[{level:1,skillId:1}],traits:[{code:51,dataId:1,value:1}],equips:[1]})]});
 const home=plain(w.$dataMap),away=plain(home);away.note='';delete away.reactor3d;away.events=[null];
 w.stand(9,10,6);const b=w.V.battler(31);assert.equal(b.isLearnedSkill(1),true);b.gainHp(-5);const hp=b.hp;
 assert.equal(w.V.getOn(31,{instant:true}),true);w.$gamePlayer.reserveTransfer(2,10,10,6,0);w.$dataMap=away;w.$gamePlayer.performTransfer();w.V.resume();
 assert.equal(w.V.isRiding(),true);assert.equal(w.V.idOf(w.V.ridden()),'1:31');hold(w,'right',30);assert.ok(w.$gamePlayer._realX>10);
 w.saveAndLoad();w.V.resume();assert.equal(w.V.isRiding(),true);assert.equal(w.V.battler('1:31').hp,hp);
 w.$gamePlayer.reserveTransfer(1,10,10,6,0);w.$dataMap=home;w.$gamePlayer.performTransfer();w.V.resume();assert.equal(w.V.isRiding(),true);assert.equal(w.V.idOf(w.V.ridden()),'1:31');
});
test('stock vehicles keep native commands and optionally reuse class, equipment, traits and skills',()=>{
 const w=flat();assert.equal(w.V.battler('boat'),null);
 w.$dataSystem.boat.reactorVehicle={name:'Boat',classId:1,initialLevel:2,learnings:[{level:1,skillId:1}],traits:[{code:51,dataId:1,value:1}],equips:[1]};
 const b=w.V.battler(w.$gameMap.boat());assert.equal(b.currentClass(),w.$dataClasses[1]);assert.equal(b.isLearnedSkill(1),true);assert.equal(b._rrVehicleIdentity,'stock:boat');
 b.gainHp(-5);const hp=b.hp;w.saveAndLoad();assert.equal(w.V.battler('stock:boat').hp,hp);
 w.$gameMap.boat().setLocation(1,10,10);w.stand(9,10,6);w.$dataSystem.boat.reactorVehicle.ridable=false;assert.equal(w.$gamePlayer.getOnVehicle(),false);
 w.$dataSystem.boat.reactorVehicle.ridable=true;assert.equal(w.$gamePlayer.getOnVehicle(),true);assert.equal(w.$gamePlayer._vehicleType,'boat');
});
