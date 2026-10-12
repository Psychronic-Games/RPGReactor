'use strict';
// Several vehicles of one kind, and the followers that ride them behind the leader (runtime/reactor_vehicles.js
// `Convoy`, reactor_3d_vehicles.js `startsOf`): a record's copies each have a place and an identity of their own;
// a follower takes the nearest free vehicle when the leader is seated and rides the leader's own trail; the ride's
// end parks each where it stands. And Set Vehicle Location for a vehicle of the Vehicles page (`moveTo`).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { boardWorld, bike } = require('./helpers/vehicles-board-world.cjs');
const RRVehicles = require('../src/event/VehicleSetup.js');
const R = require(path.resolve(__dirname, '..', '..', 'runtime', 'reactor_3d.js'));

const plain = value => JSON.parse(JSON.stringify(value));
const record = () => ({ id: 1, name: 'Motorcycle', kind: 'motorcycle', startMapId: 5, startX: 10, startY: 4, startDirection: 6,
    copies: [{ id: 2, startMapId: 5, startX: 10, startY: 6 }, { id: 4, startMapId: 8, startX: 3, startY: 3, startDirection: 8 }, { id: 5, startMapId: 0, startX: 0, startY: 0 }] });

test('a record is placed once by its own start and once by each copy, each under an identity of its own', () => {
    const V = R.Vehicles, types = [null, record()];
    const here = V.startingEvents(types, 5), there = V.startingEvents(types, 8);
    assert.deepEqual(here.map(e => [e.name, e.x, e.y, e._rrVehicleIdentity, e._rrDatabaseVehicle]), [['Motorcycle 1', 10, 4, '0:1', 1], ['Motorcycle 2', 10, 6, '0:10001', 1]]);
    assert.deepEqual(there.map(e => [e.name, e._rrVehicleIdentity, e.rrVehicle.yaw]), [['Motorcycle 3', '0:30001', 0]]);
    assert.deepEqual(V.startingEvents(types, 9), []);
    // A record with no copy is what it always was.
    assert.deepEqual(V.startingEvents([null, { name: 'Tank', startMapId: 5, startX: 1, startY: 1 }], 5).map(e => [e.name, e._rrVehicleIdentity]), [['Tank', '0:1']]);
    // An identity names its placement wherever it starts, an unplaced copy too.
    assert.deepEqual([V.placementOf(types, '0:30001').x, V.placementOf(types, '0:40001').x, V.placementOf(types, '0:20001'), V.placementOf(types, '5:2')], [3, 0, null, null]);
    // The editor reads a record the same way.
    assert.deepEqual(RRVehicles.startsOf(types[1]).map(s => [s.copy, s.mapId, s.x, s.y, s.direction]), plain(V.startsOf(types[1])).map(s => [s.copy, s.mapId, s.x, s.y, s.direction]));
    assert.deepEqual(RRVehicles.placedVehicles(types).map(v => v.value), ['0:1', '0:10001', '0:30001', '0:40001']);
    assert.equal(RRVehicles.identityOf(1, 2), V.identityOf(1, 2));
});

const three = (extra = {}) => boardWorld(Object.assign({ width: 120, height: 30, party: [1, 2, 3], vehicles: [bike(31, 20, 10, { yaw: 90 }), bike(32, 20, 12, { yaw: 90 }), bike(33, 20, 8, { yaw: 90 })] }, extra));
const riders = w => Array.from(w.V.Convoy.riders(), r => [r.follower._memberIndex, r.event._eventId]);
function rideEast(w, ticks) {
    const p = w.$gamePlayer;
    for (let t = 0; t < ticks; t++) { p._rrDrive.yaw = Math.PI / 2; p._rrDrive.v = Math.max(p._rrDrive.v, 12); w.run(1); }
}

test('when the leader is seated each follower takes the nearest free vehicle; they ride its trail a gap apart, and are parked where they stand when it gets off', () => {
    const w = three(), V = w.V, p = w.$gamePlayer;
    w.stand(19, 10, 6);
    const members = p._followers._data.filter(f => f.actor()).length;
    assert.ok(members >= 2, 'a party of three or more: ' + members);
    assert.equal(V.getOn(31, { instant: true }), true);
    assert.deepEqual(riders(w).map(r => r[1]).sort(), [32, 33], 'the two others are taken');
    assert.equal(riders(w).length, 2);
    const [a, b] = V.Convoy.riders();
    assert.equal(a.follower.isVisible(), true, 'a follower that rides is seen');
    assert.deepEqual([a.event._rrBoarded, a.event._rrFree, a.follower._rrSeated], [true, 2, true]);
    rideEast(w, 240);
    // Behind one another on the leader's line (y 10), each its length and the gap behind the one ahead.
    const lead = w.vehicle(31), length = 3.5, apart = length + V.CONVOY_GAP;
    const xs = Array.from(V.Convoy.riders(), r => r.event._realX);
    assert.ok(p._realX > 50, 'it rode: ' + p._realX);
    assert.ok(Math.abs(lead._realX - xs[0] - apart) < 0.3, 'the first is ' + (lead._realX - xs[0]) + ' behind');
    assert.ok(Math.abs(xs[0] - xs[1] - apart) < 0.3, 'the second ' + (xs[0] - xs[1]) + ' behind it');
    for (const rider of V.Convoy.riders()) {
        assert.ok(Math.abs(rider.event._realY - 10) < 0.05, 'on the leader\'s line');
        assert.deepEqual([rider.follower._realX, rider.follower._realY], [rider.event._realX, rider.event._realY], 'its rider is on it');
        assert.ok(rider.event._rrTravel > 20, 'its wheels rolled the road: ' + rider.event._rrTravel);
    }
    // The ride ends: all three stand where they were, nobody on them, and the followers are on foot with the leader.
    p._rrDrive.v = 0;
    w.run(5);
    const at = [32, 33].map(id => [w.vehicle(id)._realX, w.vehicle(id)._realY]);
    assert.equal(V.getOff({ instant: true }), true);
    assert.deepEqual(riders(w), []);
    for (const id of [32, 33]) {
        const e = w.vehicle(id);
        assert.deepEqual([e._rrBoarded, e._rrFree, e._erased], [false, 1, false]);
    }
    assert.deepEqual([32, 33].map(id => [w.vehicle(id)._realX, w.vehicle(id)._realY]), at, 'parked where they stood');
    for (const follower of p._followers._data) assert.deepEqual([!!follower._rrSeated, follower._rrRide || null], [false, null]);
    // And each is its own vehicle again: boarded by the leader, the others follow anew.
    w.run(30);
    assert.equal(V.getOn(32, { instant: true }), true);
    assert.equal(riders(w).length, 2);
});

test('vehicles parked along a street are in reach: each follower takes one, however many tiles under the reach apart they stand', () => {
    // Where the Demo's stand by North Haven's gate: 13.6 and 14.1 tiles from the one boarded.
    const w = boardWorld({ width: 120, height: 40, party: [1, 2, 3], vehicles: [bike(31, 20, 9, { yaw: 90 }), bike(32, 22, 23, { yaw: 90 }), bike(33, 31, 17, { yaw: 90 })] }), V = w.V;
    assert.equal(V.CONVOY_REACH, 20);
    w.stand(19, 9, 6);
    assert.equal(V.getOn(31, { instant: true }), true);
    assert.deepEqual(riders(w).map(r => r[1]).sort(), [32, 33], 'both followers ride');
});

test('a follower with no vehicle near rides unseen as before; a sunk, a ridden or a far vehicle is not taken', () => {
    const w = boardWorld({ width: 120, height: 30, party: [1, 2, 3], vehicles: [bike(31, 20, 10, { yaw: 90 }), bike(32, 20, 12, { yaw: 90 }), bike(33, 60, 10, { yaw: 90 })] }), V = w.V, p = w.$gamePlayer;
    w.stand(19, 10, 6);
    assert.equal(V.getOn(31, { instant: true }), true);
    assert.deepEqual(riders(w).map(r => r[1]), [32], 'the one within reach; the one 40 tiles off stays');
    const walking = p._followers._data.filter(f => f.actor() && !f._rrSeated);
    assert.ok(walking.length >= 1);
    w.run(40);
    assert.equal(walking[0].isVisible(), false, 'the follower without one is unseen, aboard with the leader');
    assert.equal(w.vehicle(33)._rrBoarded, undefined);
    // The followers hidden by the game ride nothing.
    const alone = three();
    alone.$gamePlayer.hideFollowers();
    alone.stand(19, 10, 6);
    assert.equal(alone.V.getOn(31, { instant: true }), true);
    assert.deepEqual(riders(alone), []);
});

test('Set Vehicle Location for a vehicle of the Vehicles page: moved on its map, sent to another map, and brought from one', () => {
    const w = boardWorld({ width: 60, height: 30, vehicles: [] }), V = w.V, map = w.$gameMap;
    w.$dataReactorVehicles[1] = Object.assign(w.$dataReactorVehicles[1] || {}, { startMapId: map.mapId(), startX: 10, startY: 10, startDirection: 6,
        copies: [{ id: 2, startMapId: 99, startX: 4, startY: 4 }] });
    map.setupEvents();
    const first = V.list().find(e => V.idOf(e) === '0:1');
    assert.ok(first, 'the first copy stands on this map');
    // On its own map it is put on the tile.
    assert.equal(V.moveTo('0:1', map.mapId(), 30, 12), true);
    assert.deepEqual([first._realX, first._realY, first._erased], [30, 12, false]);
    // Sent to another map it leaves this one, and what is kept of it says where it waits.
    assert.equal(V.moveTo('0:1', 7, 5, 6), true);
    assert.equal(first._erased, true);
    assert.deepEqual([V.where('0:1').map, V.where('0:1').x, V.where('0:1').y], [7, 5, 6]);
    // And back: it stands here again.
    assert.equal(V.moveTo('0:1', map.mapId(), 12, 12), true);
    assert.deepEqual([first._erased, first._realX, first._realY], [false, 12, 12]);
    // The second copy starts on map 99: brought here it is an event of this map from now on.
    assert.equal(V.list().some(e => V.idOf(e) === '0:10001'), false);
    assert.equal(V.moveTo('0:10001', map.mapId(), 20, 20), true);
    const second = V.list().find(e => V.idOf(e) === '0:10001');
    assert.ok(second && V.isVehicle(second));
    assert.deepEqual([second._realX, second._realY], [20, 20]);
    assert.deepEqual([V.where('0:10001').map, V.where('0:10001').x], [map.mapId(), 20]);
    // A ridden one is not moved, and a name the Database does not have moves nothing.
    w.stand(11, 12, 6);
    assert.equal(V.getOn(first, { instant: true }), true);
    assert.equal(V.moveTo('0:1', map.mapId(), 40, 12), false);
    assert.equal(V.moveTo('0:70001', map.mapId(), 40, 12), false);
    // The command itself, as the editor stores it: the identity in the vehicle's place.
    assert.equal(V.getOff({ instant: true }), true);
    w.run(10);
    w.Game_Interpreter.prototype.command202.call({}, ['0:10001', 0, map.mapId(), 25, 21]);
    assert.deepEqual([second._realX, second._realY], [25, 21]);
});

test('the convoy ends with a follower\'s vehicle in the air (the trail went off a bank): it falls to the ground, and one out over a lake falls to the water and goes down to the bed', () => {
    const { floor } = require('./helpers/vehicles-drive-world.cjs');
    // A ledge 3 high, and from x = 82 a lake two deep.
    const w = boardWorld(Object.assign(floor({ width: 100, height: 20, ground: x => (x < 80 ? 3 : x < 82 ? 0 : -2), water: [{ x0: 82, y0: 0, x1: 99, y1: 19, level: 0 }] }),
        { party: [1, 2, 3], vehicles: [bike(31, 60, 10, { yaw: 90 }), bike(32, 60, 12, { yaw: 90 }), bike(33, 60, 8, { yaw: 90 })] }));
    const V = w.V;
    w.stand(59, 10, 6);
    assert.equal(V.getOn(31, { instant: true }), true);
    const seated = V.Convoy.riders();
    assert.equal(seated.length, 2);
    // As the trail leaves them when the leader has gone over the edge: one three above the lake, one four above the ledge, each with its rider.
    const [lake, land] = seated;
    Object.assign(lake.event, { _realX: 90, _realY: 10, _reactorAlt: 3, _reactorGround: 3 });
    Object.assign(lake.follower, { _realX: 90, _realY: 10, _reactorAlt: 3 });
    Object.assign(land.event, { _realX: 70, _realY: 12, _reactorAlt: 7, _reactorGround: 7 });
    V.Convoy.disband();
    assert.deepEqual([lake.event._rrBoarded, land.event._rrBoarded, lake.follower._rrSeated, land.follower._rrSeated], [false, false, false, false]);
    assert.deepEqual([lake.event._rrSink, land.event._rrSink], [-2, 3], 'each is going down to what is under it');
    assert.deepEqual([lake.event._reactorAlt, land.event._reactorAlt], [3, 7], 'from where it was left, not put there at once');
    assert.ok(lake.follower._reactorAir > 0, 'the rider is in the air over the lake, for the map\'s fall and swim to take');
    // Through the air it falls, faster each tick.
    const drops = [];
    for (let t = 0; t < 4; t++) { const from = land.event._reactorAlt; V.sinkTick(land.event); drops.push(from - land.event._reactorAlt); }
    assert.ok(drops[0] > 0 && drops[1] > drops[0] && drops[3] > drops[2], 'it gathers speed: ' + drops.map(d => d.toFixed(3)).join(' '));
    for (let t = 0; t < 60 && land.event._rrSink !== undefined; t++) V.sinkTick(land.event);
    assert.deepEqual([land.event._reactorAlt, land.event._reactorGround, land.event._rrSink], [3, 3, undefined], 'down on the ledge well inside a second');
    // Over the lake: to the surface at a fall, never through it at that speed; then down at the water's pace.
    let ticks = 0;
    while (lake.event._reactorAlt > 0 && ticks < 60) { V.sinkTick(lake.event); ticks++; }
    assert.ok(ticks < 30 && Math.abs(lake.event._reactorAlt) < 1e-9, 'it meets the water at the surface after ' + ticks + ' ticks: ' + lake.event._reactorAlt);
    V.sinkTick(lake.event);
    assert.ok(Math.abs(lake.event._reactorAlt + V.SINK) < 1e-9, 'one tick under: ' + lake.event._reactorAlt);
    for (let t = 0; t < 200 && lake.event._rrSink !== undefined; t++) V.sinkTick(lake.event);
    assert.deepEqual([lake.event._reactorAlt, lake.event._rrSink, V.sunk(lake.event)], [-2, undefined, true], 'on the bed, where it can be dived to and walked out');
    // One that stood on the ground when the convoy ended is left alone.
    const w2 = boardWorld({ width: 120, height: 30, party: [1, 2, 3], vehicles: [bike(31, 20, 10, { yaw: 90 }), bike(32, 20, 12, { yaw: 90 }), bike(33, 20, 8, { yaw: 90 })] });
    w2.stand(19, 10, 6);
    w2.V.getOn(31, { instant: true });
    const stood = w2.V.Convoy.riders().map(r => r.event);
    w2.V.Convoy.disband();
    assert.deepEqual(Array.from(stood, e => e._rrSink === undefined), [true, true]);
});
