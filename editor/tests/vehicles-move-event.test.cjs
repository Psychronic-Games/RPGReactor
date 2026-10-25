'use strict';
// Set Vehicle Location for a map's vehicle event (runtime/reactor_vehicles.js, V.moveTo with `<mapId>:<eventId>`):
// moved on its map, sent to another map (it leaves its own and stands on the other when that map is entered), and
// brought back; one on a map not entered since the game began is put on its own map when that map is entered.
const test = require('node:test');
const assert = require('node:assert/strict');
const { boardWorld, bike, event } = require('./helpers/vehicles-board-world.cjs');

const copy = value => JSON.parse(JSON.stringify(value));
function world() { return boardWorld({ width: 60, height: 30, vehicles: [bike(31, 10, 10, { yaw: 180 })] }); }
function transfer(w, id, data, x = 20, y = 10, direction = 6) {
    w.$gamePlayer.reserveTransfer(id, x, y, direction, 0);
    w.$dataMap = copy(data);
    w.$gamePlayer.performTransfer();
    w.V.resume();
}

test('a map\'s vehicle event: moved on its map, sent to another, met there, and brought back', () => {
    const w = world(), V = w.V, home = copy(w.$dataMap), away = copy(home);
    away.events = [null, event(1, 3, 3)];
    const bikeEvent = w.$gameMap.event(31);
    // On its own map: put on the tile, as the command stores it (the event's identity in the vehicle's place).
    w.Game_Interpreter.prototype.command202.call({}, ['1:31', 0, 1, 30, 12]);
    assert.deepEqual([bikeEvent._realX, bikeEvent._realY, bikeEvent._erased], [30, 12, false]);
    // To map 2: it leaves this one.
    assert.equal(V.moveTo('1:31', 2, 5, 6), true);
    assert.equal(bikeEvent._erased, true);
    assert.deepEqual([V.where('1:31').map, V.where('1:31').x, V.where('1:31').y], [2, 5, 6]);
    // Map 2 is entered: it stands there; map 1 again: it is not at home.
    transfer(w, 2, away);
    const visiting = V.find('1:31');
    assert.ok(visiting && V.isVehicle(visiting), 'it stands on map 2');
    assert.deepEqual([visiting._realX, visiting._realY], [5, 6]);
    transfer(w, 1, home);
    assert.equal(V.find('1:31'), null);
    assert.equal(w.$gameMap.event(31)._erased, true);
    // Brought back from map 2 while the party is on map 1: it stands where it is put.
    assert.equal(V.moveTo('1:31', 1, 12, 14), true);
    const back = V.find('1:31');
    assert.ok(back && V.isVehicle(back));
    assert.deepEqual([back._realX, back._realY, back._eventId], [12, 14, 31], 'its own event, at home on its map');
    // And map 2 no longer has it.
    transfer(w, 2, away);
    assert.equal(V.find('1:31'), null);
});

test('a vehicle event of a map not entered yet is put on its own map; elsewhere it is not moved', () => {
    const w = world(), V = w.V, home = copy(w.$dataMap);
    // Map 3's event 7 is a bike the game has not read yet.
    assert.equal(V.moveTo('3:7', 2, 4, 4), false, 'to another map: its picture and pages are not known here');
    assert.equal(V.moveTo('3:7', 3, 8, 9), true);
    const there = copy(home);
    there.events = [null, null, null, null, null, null, null, bike(7, 20, 20)];
    transfer(w, 3, there, 2, 2);
    const moved = V.find('3:7');
    assert.ok(moved && V.isVehicle(moved));
    assert.deepEqual([moved._realX, moved._realY], [8, 9], 'it stands where the command put it');
    assert.equal(V.where('3:7').map, 3);
});
