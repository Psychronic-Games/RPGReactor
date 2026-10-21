'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { boardWorld, bike, event } = require('./helpers/vehicles-board-world.cjs');
const copy = value => JSON.parse(JSON.stringify(value));
function world() { return boardWorld({ width:60, height:30, vehicles:[bike(31,10,10,{yaw:180,key:'bike'})] }); }
function transfer(w, id, data, x=20, y=10, direction=6) {
    w.$gamePlayer.reserveTransfer(id,x,y,direction,0);
    w.$dataMap = copy(data);
    w.$gamePlayer.performTransfer();
    w.V.resume();
}
test('one vehicle travels, parks on the destination, returns without duplicating, and survives a fresh save load', () => {
    const w = world(), home = copy(w.$dataMap), away = copy(home);
    away.events = [null,event(1,3,3)];
    w.stand(11,10,4); assert.equal(w.board(31),true);
    transfer(w,2,away);
    const visiting = w.V.ridden();
    assert.ok(visiting, 'the player is still aboard');
    assert.equal(w.V.idOf(visiting),'1:31');
    assert.equal(w.V.find('1:31'),visiting);
    assert.equal(w.V.find('bike'),visiting);
    assert.deepEqual([visiting._realX,visiting._realY,w.$gameMap.mapId()],[20,10,2]);
    assert.equal(w.V.where('1:31').map,2);
    assert.equal(w.V.getOff({instant:true}),true);
    const parked = copy(w.V.where('1:31'));
    w.saveAndLoad(); w.V.resume();
    assert.equal(w.V.find('1:31').event().rrVehicle.key,'bike');
    transfer(w,1,home);
    assert.equal(w.V.find('1:31'),null, 'the home event is hidden while the bike is elsewhere');
    assert.equal(w.$gameMap.event(31)._erased,true);
    assert.deepEqual(copy(w.V.where('1:31')),parked);
    transfer(w,2,away);
    const returned = w.V.find('1:31');
    assert.ok(returned); assert.equal(w.V.list().filter(e=>w.V.isVehicle(e)).length,1);
    assert.deepEqual(copy(w.V.where('1:31')),parked);
    w.stand(20,9,2); assert.equal(w.V.getOn(returned,{instant:true}),true);
    transfer(w,1,home,25,15,8);
    assert.equal(w.V.ridden(),w.$gameMap.event(31));
    assert.equal(w.V.idOf(w.V.ridden()),'1:31');
    assert.deepEqual([w.V.ridden()._realX,w.V.ridden()._realY],[25,15]);
    transfer(w,2,away,20,10);
    assert.equal(w.V.list().filter(e=>w.V.isVehicle(e)).length,1);
});
test('a parked vehicle stays behind when the player transfers on foot', () => {
    const w=world(), home=copy(w.$dataMap), away=copy(home); away.events=[null];
    w.V.setLocation('1:31',20,10,90);
    transfer(w,2,away);
    assert.equal(w.V.list().filter(e=>w.V.isVehicle(e)).length,0);
    assert.equal(w.V.where('1:31').map,1);
    transfer(w,1,home);
    assert.equal(w.V.find('1:31')._realX,20);
});
test('a visiting vehicle keeps source self switches while ordinary events keep local self switches', () => {
    const w=world(), away=copy(w.$dataMap);away.events=[null,event(1,3,3)];
    w.stand(11,10,4);assert.equal(w.board(31),true);transfer(w,2,away);
    const visiting=w.V.ridden(), interpreter=new w.Game_Interpreter();
    interpreter._mapId=2;interpreter._eventId=visiting.eventId();
    assert.equal(interpreter.command123(['A',0]),true);
    assert.equal(w.$gameSelfSwitches.value([1,31,'A']),true);
    assert.equal(w.$gameSelfSwitches.value([2,visiting.eventId(),'A']),false);
    const conditional=copy(visiting.event().pages[0]);
    conditional.conditions.selfSwitchValid=true;conditional.conditions.selfSwitchCh='A';
    assert.equal(visiting.meetsConditions(conditional),true);
    w.$gameSelfSwitches.setValue([1,31,'A'],false);
    assert.equal(visiting.meetsConditions(conditional),false);
    interpreter._eventId=1;assert.equal(interpreter.command123(['B',0]),true);
    assert.equal(w.$gameSelfSwitches.value([2,1,'B']),true);
    assert.equal(w.$gameSelfSwitches.value([1,1,'B']),false);
});
test('a transfer to a loop map parks the carried vehicle and restores the player to walking', () => {
    const w=world(), away=copy(w.$dataMap);away.events=[null];away.scrollType=3;
    w.stand(11,10,4);assert.equal(w.board(31),true);transfer(w,2,away);
    assert.equal(w.V.ridden(),null);
    assert.equal(w.$gamePlayer._vehicleType,'walk');
    assert.equal(w.V.where('1:31').map,2);
    assert.ok(w.V.find('1:31'));
});
test('a rider asked about between a transfer reserved and performed, with the next map\'s data already loaded, stays aboard', () => {
    const w = world(), away = copy(w.$dataMap);
    away.events = [null, event(1, 3, 3)];
    w.stand(11, 10, 4); assert.equal(w.board(31), true);
    w.$gamePlayer.reserveTransfer(2, 20, 10, 6, 0);
    // A border crossed without a break hands the game the next map's data before the step is performed.
    w.$dataMap = copy(away);
    assert.equal(w.$gamePlayer.isInVehicle(), true);
    assert.ok(w.V.ridden(), 'still aboard');
    w.$gamePlayer.performTransfer();
    w.V.resume();
    assert.ok(w.V.ridden());
    assert.equal(w.V.idOf(w.V.ridden()), '1:31');
    assert.equal(w.$gameMap.mapId(), 2);
});
