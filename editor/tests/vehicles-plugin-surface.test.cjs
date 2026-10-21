'use strict';
// The surface plugins and imported games read of vehicles, with a new vehicle on the map and one being ridden
// (runtime/reactor_vehicles.js). The patterns are those the survey of the plugins on disk looked for: the three in
// `$gameMap._vehicles`, their names and numbers, what is called on `$gamePlayer.vehicle()` with no null test, and
// the stock functions plugins replace.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { boardWorld, bike, event } = require('./helpers/vehicles-board-world.cjs');
const { runtimeRoot } = require('./helpers/runtime-source.cjs');

const source = fs.readFileSync(path.join(runtimeRoot, 'reactor_vehicles.js'), 'utf8');
const code = source.split('\n').filter(line => !/^\s*(\/\/|\/?\*)/.test(line)).join('\n');
const world = () => boardWorld({ vehicles: [bike(31, 10, 10, { yaw: 180 })], events: [event(32, 20, 20)] });
const aboard = w => { w.stand(11, 10, 4); w.board(31); return w.$gamePlayer; };

test('native vehicles keep their list, class, movement and interpreter commands', () => {
    // Nothing of the stock vehicles is named in code: their list, their class, the functions that make, refresh and
    // update them, their tile flags, their four commands and the two bodies plugins replace.
    for (const name of ['_vehicles', 'Game_Vehicle', 'createVehicles', 'refereshVehicles', 'updateVehicles', 'isCollidedWithVehicles', 'command202', 'command206', 'command140', 'command323', 'updateVehicleGetOn', 'updateVehicleGetOff',
        '_vehicleGettingOn', '_vehicleGettingOff', '_altitude', '_driving', '_shadowSprite']) {
        assert.equal(code.includes(name), false, name + ' is not touched');
    }
    assert.equal(/prototype\.getOffVehicle\s*=|proto\.getOffVehicle\s*=/.test(code), false, 'native dismounting stays unchanged');
    assert.equal(code.includes('return nativeGetOn.apply(this,arguments);'),true,'unconfigured native boarding delegates unchanged');
    assert.deepEqual(Array.from(code.matchAll(/prototype\.(command\d+)\s*=/g), match => match[1]), ['command123'], 'only a visiting vehicle self switch keeps its original identity');
    assert.equal(/Game_Map\.prototype\.(?:isBoatPassable|isShipPassable|isAirshipLandOk)\s*=/.test(code),false,'tile passage rules are only read');
});

test('$gameMap answers for the three exactly as before, on foot and aboard a new vehicle', () => {
    const w = world();
    const check = when => {
        const map = w.$gameMap, list = map._vehicles;
        assert.equal(list.length, 3, when);
        assert.deepEqual(Array.from(list).map(v => v._type), ['boat', 'ship', 'airship'], when);
        for (const v of Array.from(list)) {
            assert.equal(v instanceof w.Game_Vehicle, true, when);
            assert.equal(v.constructor.name, 'Game_Vehicle', when);
            for (const field of ['_type', '_mapId', '_driving', '_altitude']) assert.notEqual(v[field], undefined, field + ' ' + when);
            for (const method of ['isBoat', 'isShip', 'isAirship', 'update', 'refresh', 'isTransparent']) assert.equal(typeof v[method], 'function', method + ' ' + when);
        }
        assert.equal(map.vehicles(), list, when);
        assert.equal(map.boat(), list[0], when);
        assert.equal(map.ship(), list[1], when);
        assert.equal(map.airship(), list[2], when);
        assert.deepEqual([map.vehicle(0), map.vehicle(1), map.vehicle(2)], Array.from(list), when);
        assert.deepEqual([map.vehicle('boat'), map.vehicle('ship'), map.vehicle('airship')], Array.from(list), when);
        assert.equal(map.vehicle('walk'), null, when);
        assert.equal(map.vehicle(3), null, when);
        assert.equal(map.vehicles().indexOf(w.vehicle(31)), -1, 'a new vehicle is no entry of the list ' + when);
    };
    check('on foot');
    aboard(w);
    check('aboard');
    w.V.getOff({ instant: true });
    check('after the ride');
});

test('Game_Vehicle is untouched by the file', () => {
    const w = world();
    const stock = boardWorld({ types: [null] });
    // The prototype's own functions are the stock ones, text for text, in a world with a vehicle and in one without.
    const names = Object.getOwnPropertyNames(w.Game_Vehicle.prototype).sort();
    assert.deepEqual(names, Object.getOwnPropertyNames(stock.Game_Vehicle.prototype).sort());
    for (const name of names) {
        if (typeof w.Game_Vehicle.prototype[name] !== 'function') continue;
        assert.equal(String(w.Game_Vehicle.prototype[name]), String(stock.Game_Vehicle.prototype[name]), name);
    }
    const made = vm.runInContext('new Game_Vehicle("boat")', w);
    assert.equal(made._type, 'boat');
    assert.equal(made.maxAltitude(), 48);
});

test('every call a plugin or the stock flow makes on vehicle() is answered aboard', () => {
    const w = world();
    const p = aboard(w), v = p.vehicle();
    assert.ok(v, 'vehicle() is not null while isInVehicle() is true');
    // Called with no null test by Game_Player.canMove, locate and updateVehicle, the Action driver, follower plugins.
    for (const method of ['canMove', 'refresh', 'syncWithPlayer', 'isLandOk', 'getOn', 'getOff', 'direction', 'moveSpeed', 'isLowest', 'isHighest', 'isMapPassable',
        'isBoat', 'isShip', 'isAirship', 'maxAltitude', 'forceMoveRoute', 'setPosition', 'setImage', 'screenX', 'screenY', 'isTransparent', 'update']) {
        assert.equal(typeof v[method], 'function', method);
    }
    assert.doesNotThrow(() => v.refresh());
    assert.doesNotThrow(() => v.syncWithPlayer());
    assert.equal(typeof v.canMove(), 'boolean');
    assert.equal(typeof v.isLandOk(p.x, p.y, p.direction()), 'boolean');
    assert.equal(typeof v.isMapPassable(p.x, p.y, 2), 'boolean');
    assert.equal(typeof v.direction(), 'number');
    assert.equal(typeof v.moveSpeed(), 'number');
    // A plugin that asks the map with the player's own type gets the same event.
    assert.equal(w.$gameMap.vehicle(p._vehicleType), v);
    assert.equal(p._vehicleType, 'reactor');
    assert.equal(typeof p._vehicleGettingOn, 'boolean');
    assert.equal(typeof p._vehicleGettingOff, 'boolean');
    // The three names are false, so none of the three's special rules is taken blindly.
    assert.deepEqual([p.isInBoat(), p.isInShip(), p.isInAirship()], [false, false, false]);
    assert.equal(p.canStartLocalEvents(), true);
    assert.equal(p.isOnDamageFloor(), false);
    // A new vehicle is a full character: an event command addresses it by its event id.
    assert.equal(vm.runInContext('(function() { const i = new Game_Interpreter(); i.setup([{ code: 0, indent: 0, parameters: [] }], 0); return i; })()', w).character(31), w.vehicle(31));
});

test('the stock getOnOffVehicle contract: it answers whether a change began', () => {
    const w = world();
    const p = w.$gamePlayer;
    w.stand(20, 10, 2);
    w.run(1);
    assert.equal(p.getOnOffVehicle(), false, 'nothing near');
    w.stand(11, 10, 4);
    w.run(w.V.LOOK);
    assert.equal(p.getOnOffVehicle(), true, 'the vehicle the label shows for is boarded');
    assert.equal(p._vehicleType, 'reactor');
    w.run(w.V.HOP + 1);
    assert.equal(p.getOnOffVehicle(), true, 'aboard it gets off');
    w.run(w.V.HOP + 1);
    assert.equal(p._vehicleType, 'walk');
});

test('the save holds no class of the file and no character: ids and plain data', () => {
    const w = world();
    aboard(w);
    const walk = (value, where, seen) => {
        if (!value || typeof value !== 'object' || seen.has(value)) return;
        seen.add(value);
        assert.equal(value instanceof w.Game_CharacterBase, false, where + ' holds a character');
        for (const key of Object.keys(value)) walk(value[key], where + '.' + key, seen);
    };
    const p = w.$gamePlayer, e = w.vehicle(31);
    for (const field of ['_rrRide', '_rrDrive', '_rrMount', '_rrWas']) walk(p[field], '$gamePlayer.' + field, new Set());
    walk(w.$gameMap._rrVehicles, '$gameMap._rrVehicles', new Set());
    for (const key of Object.keys(e)) if (key.startsWith('_rr')) walk(e[key], 'event.' + key, new Set());
    // The event carries the fields of the saved table, and this file writes no other `_rr` field on anything.
    for (const key of ['_rrVehicle', '_rrHome', '_rrYaw', '_rrBoarded', '_rrFree', '_rrPose']) assert.ok(Object.keys(e).includes(key), key);
    const table = ['_rrBoarded', '_rrFree', '_rrHome', '_rrLean', '_rrPose', '_rrSink', '_rrSpeed', '_rrSteer', '_rrVehicle', '_rrYaw',
        // The convoy: a follower's own ride, and its vehicle's place on the leader's trail.
        '_rrConvoy', '_rrOnTrail', '_rrPitch', '_rrTravel', '_rrLeave', '_rrAppear',
        '_rrRide', '_rrDrive', '_rrMount', '_rrWas', '_rrSeated', '_rrVehicles', '_rrVehicleType', '_rrVehicleIdentity', '_rrIdentity', '_rrAuthored', '_rrAway', '_rrVehicleTransfer', '_rrVehicleSubject'];
    const written = new Set(Array.from(code.matchAll(/\._(rr[A-Za-z]+)\s*=(?!=)/g), m => '_' + m[1]));
    for (const key of written) assert.ok(table.includes(key), key + ' is in the saved table');
});
