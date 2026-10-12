'use strict';
// What a save holds of a vehicle and a ride (runtime/reactor_vehicles.js): plain numbers, strings and plain
// objects on $gamePlayer, on the event and on $gameMap. A ride comes back from a save on foot, aboard, in the
// middle of a hop and in the air, and a save made before the feature loads and plays.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { boardWorld, bike, event, DEG } = require('./helpers/vehicles-board-world.cjs');

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const world = (extra = {}) => boardWorld(Object.assign({ width: 60, height: 30, vehicles: [bike(31, 10, 10, { yaw: 180 })] }, extra));
const plain = value => JSON.parse(JSON.stringify(value));

/** The ride put somewhere by its player's own place, as a script's `locate` does it. */
function rideTo(w, x, y, degrees) {
    const p = w.$gamePlayer;
    p._realX = x; p._realY = y; p._x = Math.round(x); p._y = Math.round(y);
    p._rrDrive.yaw = degrees * DEG;
    w.run(2);
}

/** Saved, loaded, and the map scene started. */
function reload(w) {
    w.saveAndLoad();
    w.V.resume();
}

/** Every object under `value` (cycles excluded): none may be a character. */
function noCharacter(w, value, where, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    assert.equal(value instanceof w.Game_CharacterBase, false, where + ' holds a character');
    for (const key of Object.keys(value)) noCharacter(w, value[key], where + '.' + key, seen);
}

test('on foot: the vehicle, its marks and the registry come back from a save', () => {
    const w = world();
    w.V.setLocation(31, 22.5, 8.25, 300);
    const before = plain(w.$gameMap._rrVehicles);
    reload(w);
    const e = w.vehicle(31), p = w.$gamePlayer;
    assert.deepEqual(plain(w.$gameMap._rrVehicles), before);
    assert.deepEqual([e._rrVehicle, e._realX, e._realY, e._rrFree], [1, 22.5, 8.25, 1]);
    assert.deepEqual(Array.from(e._rrHome), [10, 10, 180]);
    assert.ok(near(e._rrYaw, 300 * DEG));
    assert.equal(p._vehicleType, 'walk');
    assert.equal(w.V.ridden(), null);
    assert.equal(e.constructor.name, 'Game_Event', 'it is an event again, with its methods');
    assert.equal(e.isLowest(), true);
    // It can be ridden.
    w.stand(23, 7, 2);
    w.run(1);
    assert.equal(w.board(31), true);
    assert.equal(w.V.ridden(), e);
});

test('aboard: the ride goes on from a save, the vehicle carried, and its end is said once', () => {
    const w = world();
    const got = [];
    w.ReactorEvents.on('vehicleGetOn', payload => got.push(['on', payload.vehicle, payload.type]));
    w.ReactorEvents.on('vehicleGetOff', payload => got.push(['off', payload.vehicle, payload.type]));
    w.stand(11, 10, 4);
    w.board(31);
    rideTo(w, 40.25, 12.5, 37);
    const was = plain(w.$gamePlayer._rrDrive);
    reload(w);
    const p = w.$gamePlayer, e = w.vehicle(31);
    assert.equal(p._vehicleType, 'reactor');
    assert.deepEqual(plain(p._rrRide), { map: 1, id: 31 });
    assert.deepEqual([p._rrFree, p._rrSeated, p._rrMount], [1, true, null]);
    assert.equal(p.isInVehicle(), true);
    assert.equal(p.vehicle(), e);
    assert.deepEqual([e._rrBoarded, e._rrFree, e._through], [true, 2, true]);
    assert.deepEqual([p._realX, p._realY, e._realX, e._realY], [40.25, 12.5, 40.25, 12.5]);
    assert.ok(near(p._rrDrive.yaw, 37 * DEG) && near(e._rrYaw, 37 * DEG));
    assert.equal(p._rrDrive.v, was.v);
    assert.equal(p._rrDrive.leave, '');
    assert.deepEqual(plain(p._rrWas), { speed: 4, transparent: false });
    // It goes on: frames run, the place is kept, and getting off ends the ride once.
    w.run(30);
    assert.deepEqual([p._realX, p._realY], [40.25, 12.5]);
    assert.equal(w.V.getOff({ instant: true }), true);
    assert.deepEqual(got, [['on', '1:31', 1], ['off', '1:31', 1]]);
    assert.equal(p._moveSpeed, 4);
});

test('a save made aboard at (40.25, 12.5) at 37 degrees loads there after the project\'s version changed', () => {
    const w = world();
    w.stand(11, 10, 4);
    w.board(31);
    rideTo(w, 40.25, 12.5, 37);
    w.saveAndLoad();
    // The game was edited since: the loaded map is entered again on the tile the player stands on.
    w.$dataSystem.versionId++;
    const p = w.$gamePlayer;
    p.reserveTransfer(w.$gameMap.mapId(), p.x, p.y, p.direction(), 0);
    p.requestMapReload();
    assert.doesNotThrow(() => p.performTransfer());
    w.V.resume();
    const e = w.vehicle(31);
    assert.equal(p._vehicleType, 'reactor');
    assert.equal(p.vehicle(), e);
    assert.deepEqual([p._realX, p._realY], [40.25, 12.5]);
    assert.deepEqual([e._realX, e._realY, e._rrBoarded, e._rrFree], [40.25, 12.5, true, 2]);
    assert.ok(near(p._rrDrive.yaw, 37 * DEG) && near(e._rrYaw, 37 * DEG));
    w.run(20);
    assert.deepEqual([p._realX, p._realY], [40.25, 12.5], 'and it stays there');
    assert.equal(w.V.getOff({ instant: true }), true);
    assert.deepEqual([w.V.where(31).x, w.V.where(31).y, w.V.where(31).yaw], [40.25, 12.5, 37]);
});

test('a press to get off that a save carried is kept on in the game that loads it, and runs out 90 ticks later', () => {
    // Without the ride's own file nothing slows the bike: the press is kept for as long as this file keeps it.
    const w = world({ drive: false });
    w.stand(11, 10, 4);
    w.board(31);
    w.$gamePlayer._rrDrive.v = 20;
    w.press('cancel');
    w.run(1);
    assert.equal(w.$gamePlayer._rrDrive.leave, 'ok');
    w.run(30);
    const saved = vm.runInContext('JsonEx.stringify(DataManager.makeSaveContents())', w);
    // Another run of the game: nothing of the first is in memory but what the save holds.
    const fresh = world({ drive: false });
    vm.runInContext('(function(text) { DataManager.createGameObjects(); DataManager.extractSaveContents(JsonEx.parse(text)); })', fresh)(saved);
    fresh.V.resume();
    const p = fresh.$gamePlayer;
    assert.deepEqual([p._vehicleType, p._rrDrive.leave, p._rrDrive.v], ['reactor', 'ok', 20]);
    assert.equal(fresh.V.isBusy(), true);
    assert.equal(fresh.V.prompt().word, 'Get off', 'the label still says what OK did');
    fresh.run(fresh.V.KEEP - 2);
    assert.equal(p._rrDrive.leave, 'ok', 'kept for its 90 ticks from the tick the game goes on');
    assert.equal(p._rrMount, null);
    fresh.run(3);
    assert.equal(p._rrDrive.leave, '', 'and then let go');
    // Slow under a tile a second while it is kept, the hop starts.
    const slow = world({ drive: false });
    vm.runInContext('(function(text) { DataManager.createGameObjects(); DataManager.extractSaveContents(JsonEx.parse(text)); })', slow)(saved);
    slow.V.resume();
    slow.run(10);
    slow.$gamePlayer._rrDrive.v = 0.5;
    slow.run(1);
    assert.equal(slow.$gamePlayer._rrMount.on, false);
    slow.run(slow.V.HOP);
    assert.equal(slow.$gamePlayer._vehicleType, 'walk');
});

test('in mid-hop: the hop goes on from its tick and seats the party once', () => {
    const w = world();
    let on = 0;
    w.ReactorEvents.on('vehicleGetOn', () => on++);
    w.stand(11, 10, 4);
    w.run(1);
    w.press('ok');
    w.run(1);
    w.run(5);
    assert.equal(w.$gamePlayer._rrMount.t, 5);
    const mount = plain(w.$gamePlayer._rrMount), x = w.$gamePlayer._realX;
    reload(w);
    const p = w.$gamePlayer, e = w.vehicle(31);
    assert.deepEqual(plain(p._rrMount), mount);
    assert.equal(p._realX, x);
    assert.equal(p.isInVehicle(), true);
    assert.equal(p.canMove(), false, 'the hop still holds the player');
    assert.deepEqual([e._rrBoarded, e._rrFree, e._through], [true, 1, false], 'the vehicle stands by itself until the hop ends');
    w.run(8);
    assert.equal(p._rrMount.t, 13);
    w.run(1);
    assert.equal(p._rrMount, null);
    assert.deepEqual([p._realX, p._realY, e._rrFree], [10, 10, 2]);
    assert.equal(on, 1);
    // The hop off, likewise.
    w.press('cancel');
    w.run(1);
    w.run(4);
    assert.equal(p._rrMount.on, false);
    const tick = p._rrMount.t;
    reload(w);
    const q = w.$gamePlayer;
    assert.equal(q._rrMount.t, tick);
    assert.equal(q.isInVehicle(), true, 'still aboard while the hop off plays');
    w.run(w.V.HOP - tick);
    assert.equal(q._vehicleType, 'walk');
    assert.equal(q._rrMount, null);
    assert.deepEqual([q._x, q._y, q._realX, q._realY], [11, 10, 11, 10]);
    assert.deepEqual([w.vehicle(31)._rrBoarded, w.vehicle(31)._rrFree], [false, 1]);
});

test('in mid-air: the height, the speed and the heading come back, and the party is still aboard', () => {
    const w = world();
    w.stand(11, 10, 4);
    w.board(31);
    const p = w.$gamePlayer, d = p._rrDrive;
    // As the ride leaves it half way through a jump.
    d.v = 14.5; d.vz = 0.031; d.yaw = 1.25; d.pitch = -0.1; d.travel = 33.2; d.air = 1; d.alt = 1.4;
    p._reactorAir = 1.4; p._reactorVz = 0.031;
    const was = plain(d);
    w.saveAndLoad();
    const q = w.$gamePlayer;
    assert.deepEqual(plain(q._rrDrive), was);
    assert.equal(q._reactorAir, 1.4);
    assert.equal(q._reactorVz, 0.031);
    assert.equal(q._vehicleType, 'reactor');
    w.V.resume();
    assert.equal(q.vehicle(), w.vehicle(31));
    assert.equal(w.V.speed(), 14.5);
    // A press to get off in the air is kept, and no hop starts until it is down and slow.
    assert.equal(w.V.getOff(), true);
    assert.equal(q._rrDrive.leave, 'ok');
    assert.equal(q._rrMount, null);
});

test('no saved object holds a character, and every saved field of a ride is plain data', () => {
    const w = world();
    w.stand(11, 10, 4);
    w.run(1);
    w.press('ok');
    w.run(3);
    const p = w.$gamePlayer, e = w.vehicle(31);
    for (const field of ['_rrRide', '_rrDrive', '_rrMount', '_rrWas']) {
        noCharacter(w, p[field], '$gamePlayer.' + field);
        assert.deepEqual(plain(p[field]), JSON.parse(JSON.stringify(p[field])), field);
        assert.equal(Object.getPrototypeOf(p[field]), Object.getPrototypeOf(vm.runInContext('({})', w)), field + ' is a plain object');
    }
    w.run(w.V.HOP);
    w.V.getOff({ instant: true });
    noCharacter(w, w.$gameMap._rrVehicles, '$gameMap._rrVehicles');
    for (const key of Object.keys(e)) if (key.startsWith('_rr')) noCharacter(w, e[key], 'event.' + key);
    // The whole save goes through JsonEx and back with nothing lost of it.
    const text = vm.runInContext('JsonEx.stringify(DataManager.makeSaveContents())', w);
    assert.equal(text.includes('"@":"Game_Event"'), true);
    assert.equal(/"_rrRide":\{[^}]*"@"/.test(text), false, 'the ride names its vehicle by ids');
    assert.match(text, /"_rrVehicles":\{"v":1,"at":\{"1:31":\{/);
});

test('a save from before the feature loads and plays: every new field reads as its default', () => {
    const w = world({ events: [event(32, 20, 20)] });
    const p = w.$gamePlayer, e = w.vehicle(31);
    for (const character of [p, e, w.vehicle(32)]) for (const key of Object.keys(character)) if (key.startsWith('_rr')) delete character[key];
    delete w.$gameMap._rrVehicles;
    w.saveAndLoad();
    const q = w.$gamePlayer;
    assert.equal(q._rrRide, undefined);
    assert.equal(q._rrMount, undefined);
    assert.doesNotThrow(() => w.run(10));
    assert.equal(q.isInVehicle(), false);
    assert.equal(q.canMove(), true);
    assert.equal(w.V.ridden(), null);
    assert.equal(w.V.speed(), 0);
    assert.equal(w.V.isRiding(), false);
    assert.equal(w.V.prompt(), null);
    assert.equal(w.V.isBusy(), false);
    assert.doesNotThrow(() => w.V.settle());
    assert.doesNotThrow(() => w.V.putOnFoot());
    assert.equal(w.$gameMap._rrVehicles, undefined, 'no registry is made until a vehicle leaves its home');
    // The map has since gained the vehicle: it is there when the scene starts.
    w.V.resume();
    assert.equal(w.vehicle(31)._rrVehicle, 1);
    assert.equal(w.vehicle(32)._rrVehicle, undefined);
});

test('the ridden vehicle\'s place is written when the map is set up again, and the ride is bound to the new event', () => {
    const w = world();
    w.stand(11, 10, 4);
    w.board(31);
    rideTo(w, 25.5, 9.75, 270);
    const old = w.vehicle(31);
    w.$gameMap.setup(1);
    const again = w.vehicle(31), p = w.$gamePlayer;
    assert.notEqual(again, old);
    assert.deepEqual([w.$gameMap._rrVehicles.at['1:31'].x, w.$gameMap._rrVehicles.at['1:31'].y, w.$gameMap._rrVehicles.at['1:31'].yaw], [25.5, 9.75, 270]);
    assert.equal(p.vehicle(), again);
    assert.deepEqual([again._rrBoarded, again._rrFree, again._through, again._realX, again._realY], [true, 2, true, 25.5, 9.75]);
    assert.ok(near(again._rrYaw, 270 * DEG));
});
