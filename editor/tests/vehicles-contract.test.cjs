'use strict';
// A new vehicle and the engine's own vehicle code (runtime/reactor_vehicles.js): what an event answers when it is
// asked as a vehicle, the one invariant that keeps `vehicle()` from being null while `isInVehicle()` is true, and
// the boat, the ship and the airship left exactly as they are.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { boardWorld, bike, talker, event, page } = require('./helpers/vehicles-board-world.cjs');

const METHODS = ['canMove', 'isLandOk', 'isLowest', 'isHighest', 'maxAltitude', 'isBoat', 'isShip', 'isAirship', 'getOn', 'getOff', 'syncWithPlayer'];
const world = (extra = {}) => boardWorld(Object.assign({ vehicles: [bike(31, 10, 10, { yaw: 180 })], events: [event(32, 20, 20)] }, extra));

test('every method asked of a vehicle is answered by a plain event, a vehicle event and the stock three', () => {
    const w = world();
    const plain = w.vehicle(32), vehicle = w.vehicle(31);
    for (const name of METHODS) {
        assert.equal(typeof plain[name], 'function', name + ' on a plain event');
        for (const stock of Array.from(w.$gameMap.vehicles())) assert.equal(typeof stock[name], 'function', name + ' on ' + stock._type);
    }
    // A plain event answers as something that is no vehicle.
    assert.equal(plain.canMove(), true);
    assert.equal(plain.isLandOk(20, 21, 2), false);
    assert.equal(plain.isLowest(), true);
    assert.equal(plain.isHighest(), true);
    assert.equal(plain.maxAltitude(), 1);
    assert.deepEqual([plain.isBoat(), plain.isShip(), plain.isAirship()], [false, false, false]);
    assert.equal(plain.getOn(), undefined);
    assert.equal(plain.getOff(), undefined);
    const before = [plain._x, plain._y, plain._realX, plain._realY];
    plain.syncWithPlayer();
    assert.deepEqual([plain._x, plain._y, plain._realX, plain._realY], before, 'a plain event does not follow the player');
    // A vehicle event.
    assert.equal(vehicle.canMove(), true);
    assert.equal(vehicle.isLowest(), true);
    assert.equal(vehicle.isHighest(), true);
    assert.equal(vehicle.maxAltitude(), 1);
    assert.deepEqual([vehicle.isBoat(), vehicle.isShip(), vehicle.isAirship()], [false, false, false], 'no kind answers to the three names');
    w.run(1);
    assert.equal(vehicle.isLandOk(11, 10, 2), true, 'a free tile beside it');
    assert.equal(vehicle.isLandOk(10, 10, 2), false, 'its own tile');
    assert.equal(vehicle.isLandOk(10, 11, 2), false, 'a tile of its body');
    assert.equal(vehicle.isLandOk(20, 20, 2), false, 'a tile somebody stands on');
    assert.equal(vehicle.isLandOk(-1, 10, 2), false, 'off the map');
    // The stock three keep their own answers.
    const [boat, ship, airship] = Array.from(w.$gameMap.vehicles());
    assert.deepEqual([boat.isBoat(), ship.isShip(), airship.isAirship()], [true, true, true]);
    assert.equal(airship.maxAltitude(), 48);
});

test('aboard a new vehicle the player is in a vehicle that is none of the three', () => {
    const w = world();
    const p = w.$gamePlayer, vehicle = w.vehicle(31);
    w.stand(11, 10, 4);
    assert.equal(w.board(31), true);
    assert.equal(p._vehicleType, 'reactor');
    assert.equal(p.isInVehicle(), true);
    assert.deepEqual([p.isInBoat(), p.isInShip(), p.isInAirship()], [false, false, false]);
    assert.equal(p.isNormal(), false, 'no steps are counted aboard');
    assert.equal(p.vehicle(), vehicle);
    assert.equal(w.$gameMap.vehicle('reactor'), vehicle);
    assert.equal(w.$gameMap.vehicle('walk'), null);
    assert.equal(p._vehicleGettingOn, false);
    assert.equal(p._vehicleGettingOff, false);
    assert.equal(w.V.ridden(), vehicle);
    // On foot nothing answers for the fourth type.
    assert.equal(w.V.getOff({ instant: true }), true);
    assert.equal(p._vehicleType, 'walk');
    assert.equal(p.isInVehicle(), false);
    assert.equal(p.vehicle(), null);
    assert.equal(w.$gameMap.vehicle('reactor'), null);
});

test('the three stay three, in order, before, during and after a ride', () => {
    const w = world();
    const order = () => Array.from(w.$gameMap._vehicles).map(v => v._type + ':' + v.constructor.name);
    const three = ['boat:Game_Vehicle', 'ship:Game_Vehicle', 'airship:Game_Vehicle'];
    assert.deepEqual(order(), three);
    w.stand(11, 10, 4);
    w.board(31);
    assert.deepEqual(order(), three);
    assert.equal(w.$gameMap.vehicles(), w.$gameMap._vehicles);
    for (const [n, name] of [[0, 'boat'], [1, 'ship'], [2, 'airship']]) {
        assert.equal(w.$gameMap.vehicle(n), w.$gameMap._vehicles[n]);
        assert.equal(w.$gameMap.vehicle(name), w.$gameMap._vehicles[n]);
    }
    w.V.getOff({ instant: true });
    assert.deepEqual(order(), three);
    assert.equal(w.$gameMap._rrVehicles.v, 1, 'new vehicles are kept apart from the three');
});

// Each way the ridden vehicle can go from under the party: nothing throws and the party is on foot.
for (const [name, lose] of [
    ['erased', w => w.vehicle(31).erase()],
    ['deleted from the map\'s data', w => { w.$dataMap.events[31] = null; }],
    ['on another map', w => { w.$gamePlayer._rrRide.map = 7; }],
    ['with no page in force', w => { w.$dataMap.events[31].pages[0].conditions.switch1Valid = true; w.$dataMap.events[31].pages[0].conditions.switch1Id = 9; w.vehicle(31).refresh(); }],
    ['gone from the map\'s events', w => { delete w.$gameMap._events[31]; }],
    ['no longer boarded by its own word', w => { w.vehicle(31)._rrBoarded = false; }]
]) {
    test('the ridden vehicle ' + name + ': nothing throws and the party is on foot', () => {
        const w = world();
        const p = w.$gamePlayer;
        w.stand(11, 10, 4);
        p.setMoveSpeed(5);
        w.board(31);
        assert.equal(p.isInVehicle(), true);
        assert.equal(p._transparent, true, 'a leader with no model is hidden aboard');
        const speed = 5;
        lose(w);
        assert.doesNotThrow(() => p.canMove());
        assert.doesNotThrow(() => p.locate(12, 12));
        assert.doesNotThrow(() => w.run(3));
        assert.equal(p._vehicleType, 'walk');
        assert.equal(p.isInVehicle(), false);
        assert.equal(p.vehicle(), null);
        assert.deepEqual([p._rrFree, p._rrSeated, p._rrDrive, p._rrMount, p._rrRide, p._reactorRiding], [0, false, null, null, null, false]);
        assert.equal(p._moveSpeed, speed);
        assert.equal(p._transparent, false, 'the rider who was hidden aboard is seen again');
        assert.equal(p._rrWas, null);
        // He walks again.
        w.keys.right = true; w.Input.dir4 = 6;
        const x = p._realX;
        w.run(20);
        assert.ok(p._realX > x, 'the leader walks');
    });
}

test('a ride that never began ends without a word: the vehicle gone in the middle of the hop on', () => {
    const w = world();
    const p = w.$gamePlayer, e = w.vehicle(31);
    let on = 0, off = 0, got = 0;
    w.ReactorEvents.on('vehicleGetOn', () => on++);
    w.ReactorEvents.on('vehicleGetOff', () => off++);
    e.getOff = function() { got++; };
    w.stand(11, 10, 4);
    w.run(1);
    w.press('ok');
    w.run(1);
    w.run(5);
    assert.equal(p._rrMount.t, 5);
    e.erase();
    assert.doesNotThrow(() => w.run(3));
    assert.deepEqual([p._vehicleType, p._rrMount, p._rrFree, p._rrSeated], ['walk', null, 0, false]);
    assert.deepEqual([on, off, got], [0, 0, 0], 'getOn() never ran, so neither does getOff()');
    // On foot, a vehicle that other code has taken out of the map's events shows no label and is not boarded.
    const gone = world();
    gone.stand(11, 10, 4);
    gone.run(1);
    assert.equal(gone.V.offered(true), gone.vehicle(31));
    delete gone.$gameMap._events[31];
    assert.equal(gone.V.offered(true), null);
    gone.press('ok');
    assert.doesNotThrow(() => gone.run(3));
    assert.equal(gone.$gamePlayer._vehicleType, 'walk');
    // And the on-foot list asked twice says nothing twice.
    w.V.putOnFoot();
    assert.deepEqual([on, off, got], [0, 0, 0]);
});

test('while no map\'s data is loaded the ride goes on: the data decides once it is back', () => {
    const w = world();
    const p = w.$gamePlayer, e = w.vehicle(31);
    w.stand(11, 10, 4);
    w.board(31);
    // A scene that reads the map again (back from the menu, from a battle, a load) leaves no data for a moment.
    const data = w.$dataMap;
    w.$dataMap = null;
    assert.equal(p.isInVehicle(), true);
    assert.equal(p.vehicle(), e);
    assert.equal(w.V.ridden(), e);
    assert.deepEqual([p._vehicleType, p._rrSeated, e._rrBoarded, e._rrFree], ['reactor', true, true, 2]);
    w.$dataMap = data;
    assert.equal(p.isInVehicle(), true);
    w.run(3);
    assert.equal(p.vehicle(), e);
    // Back, with the event no longer in it: that is the vehicle gone.
    w.$dataMap = null;
    assert.equal(p.isInVehicle(), true);
    data.events[31] = null;
    w.$dataMap = data;
    assert.equal(p.isInVehicle(), false);
    assert.equal(p._vehicleType, 'walk');
});

test('the vehicle type written over from outside ends the ride in full: on foot beside the parked bike, and walking', () => {
    const w = world();
    const p = w.$gamePlayer, e = w.vehicle(31);
    const ended = [];
    w.ReactorEvents.on('vehicleGetOff', payload => ended.push(payload.vehicle));
    w.stand(11, 10, 4);
    p.setMoveSpeed(5);
    w.board(31);
    w.run(5);
    assert.equal(p._transparent, true, 'a leader with no model is hidden aboard');
    // The usual script line to force a party out of a vehicle.
    p._vehicleType = 'walk';
    w.run(1);
    assert.deepEqual([p._vehicleType, p._rrFree, p._rrSeated, p._rrRide, p._rrDrive, p._rrMount, p._rrWas, p._reactorRiding], ['walk', 0, false, null, null, null, null, false]);
    assert.deepEqual([p._moveSpeed, p._transparent], [5, false], 'his speed and his look are his own again');
    assert.deepEqual([e._rrBoarded, e._rrFree, e._through, e._reactorRiding], [false, 1, false, false], 'the bike is parked where it was, solid');
    assert.deepEqual([e._realX, e._realY], [10, 10]);
    assert.deepEqual([p._x, p._y, p._realX, p._realY], [11, 10, 11, 10], 'the leader is beside it, on its left');
    assert.equal(w.Reactor3D.eventBodyCovers(e, p._x, p._y), false);
    assert.deepEqual(JSON.parse(JSON.stringify(w.$gameMap._rrVehicles.at['1:31'])), { map: 1, x: 10, y: 10, z: 0, yaw: 180, type: 1, home: [10, 10] });
    assert.deepEqual(ended, ['1:31'], 'the end of the ride is said once');
    assert.deepEqual(w.sounds, ['start', 'stop']);
    assert.equal(p.isInVehicle(), false);
    assert.equal(p.canMove(), true);
    // He walks away, and the bike is boarded again like any parked one.
    w.keys.right = true; w.Input.dir4 = 6;
    w.run(40);
    w.keys.right = false; w.Input.dir4 = 0;
    assert.ok(p._realX > 12, 'a held direction moves him: ' + p._realX);
    w.run(20);
    w.stand(11, 10, 4);
    w.run(1);
    assert.equal(w.V.offered(true), e);
    assert.deepEqual(ended, ['1:31']);
    // After a load, before anything has asked for the vehicle: found by the saved ride.
    w.board(31);
    w.saveAndLoad();
    const q = w.$gamePlayer, f = w.vehicle(31);
    q._vehicleType = 'walk';
    w.run(1);
    assert.deepEqual([q._rrFree, q._rrSeated, q._rrRide, q._rrMount], [0, false, null, null]);
    assert.deepEqual([f._rrBoarded, f._rrFree, f._through], [false, 1, false], 'the event the save brought is the one parked');
    assert.deepEqual([q._x, q._y], [11, 10]);
});

test('the same with no free side, and in the middle of the hop on', () => {
    // Somebody on each tile the leader could get off onto: he is on the bike's tile, and then clear of its body.
    const boxed = world({ events: [[11, 10], [9, 10], [10, 7], [10, 13]].map((at, i) => event(50 + i, at[0], at[1])) });
    const q = boxed.$gamePlayer, b = boxed.vehicle(31);
    boxed.stand(30, 20, 2);
    assert.equal(boxed.board(31), true);
    q._vehicleType = 'walk';
    boxed.run(2);
    assert.deepEqual([q._vehicleType, q._rrFree, q._rrSeated, q._rrMount], ['walk', 0, false, null]);
    assert.deepEqual([b._rrBoarded, b._rrFree, b._through], [false, 1, false]);
    assert.equal(boxed.Reactor3D.eventBodyCovers(b, q._x, q._y), false, 'clear of the parked body: (' + q._x + ', ' + q._y + ')');
    const hop = world();
    const r = hop.$gamePlayer;
    hop.stand(11, 10, 4);
    hop.run(1);
    hop.press('ok');
    hop.run(1);
    hop.run(5);
    assert.equal(r._rrMount.on, true);
    r._vehicleType = 'walk';
    hop.run(1);
    assert.deepEqual([r._vehicleType, r._rrFree, r._rrSeated, r._rrMount, r._rrRide], ['walk', 0, false, null, null]);
    assert.deepEqual([hop.vehicle(31)._rrBoarded, hop.vehicle(31)._rrFree, hop.vehicle(31)._through], [false, 1, false]);
    assert.deepEqual(hop.sounds, [], 'a ride that never began ends without a sound');
    // Written as another vehicle's type, that type is kept: this file ends its own ride and decides nothing more.
    const other = world();
    const o = other.$gamePlayer;
    other.stand(11, 10, 4);
    other.board(31);
    o._vehicleType = 'boat';
    other.run(1);
    assert.deepEqual([o._vehicleType, o._rrFree, o._rrSeated, o._rrRide], ['boat', 0, false, null]);
    assert.equal(other.vehicle(31)._rrBoarded, false);
});

test('the map set up again under a ride: the party is aboard the event that was made again', () => {
    const w = world();
    const p = w.$gamePlayer, old = w.vehicle(31);
    w.stand(11, 10, 4);
    w.board(31);
    assert.doesNotThrow(() => w.$gameMap.setup(1));
    const again = w.vehicle(31);
    assert.notEqual(again, old);
    assert.doesNotThrow(() => p.canMove());
    assert.doesNotThrow(() => p.locate(10, 10));
    assert.doesNotThrow(() => w.run(3));
    assert.equal(p._vehicleType, 'reactor');
    assert.equal(p.vehicle(), again);
    assert.equal(again._rrBoarded, true);
    assert.equal(again._rrFree, 2);
    assert.equal(again._through, true);
});

test('the stock boat is boarded, rides and lands as ever with a new vehicle on the same map', () => {
    const w = world();
    const p = w.$gamePlayer, boat = w.$gameMap.boat(), vehicle = w.vehicle(31);
    boat.setLocation(1, 16, 5);
    w.stand(15, 5, 6);
    w.run(1);
    // A script line as an imported game writes it still moves the boat.
    w.$gameMap.vehicle(0).setPosition(16, 5);
    assert.deepEqual([boat.x, boat.y], [16, 5]);
    assert.equal(p.getOnOffVehicle(), true);
    assert.equal(p._vehicleType, 'boat');
    assert.equal(p._vehicleGettingOn, true);
    w.run(120, () => !p._vehicleGettingOn && !p.isMoving());
    assert.equal(p.isInBoat(), true);
    assert.equal(p.isTransparent(), true, 'the party is hidden in the boat');
    assert.equal(boat._driving, true);
    assert.deepEqual([p.x, p.y], [16, 5]);
    assert.equal(p.vehicle(), boat);
    // It sails a tile east and the boat goes with the player.
    w.Input.dir4 = 6;
    w.run(120, () => p.x === 17 && !p.isMoving());
    w.Input.dir4 = 0;
    w.run(2);
    assert.deepEqual([boat.x, boat.y], [p.x, p.y]);
    assert.equal(p.getOnOffVehicle(), true, 'it lands on the tile ahead');
    w.run(200, () => p._vehicleType === 'walk' && !p.isMoving());
    assert.equal(p._vehicleType, 'walk');
    assert.equal(p.isTransparent(), false);
    assert.equal(p._moveSpeed, 4);
    assert.equal(boat._driving, false);
    assert.equal(boat.direction(), 4, 'the boat faces left after a landing');
    // The new vehicle was not touched by any of it.
    assert.equal(vehicle._rrBoarded, undefined);
    assert.deepEqual([vehicle.x, vehicle.y, vehicle._rrFree], [10, 10, undefined]);
});

test('OK with no label is the stock press: an event beside the leader starts, and command 206 with nothing near starts nothing', () => {
    const w = world({ events: [talker(33, 20, 21, 5)] });
    const p = w.$gamePlayer;
    w.stand(20, 20, 2);
    w.run(1);
    assert.equal(w.V.offered(true), null);
    assert.equal(p.getOnOffVehicle(), false, 'nothing to board');
    w.press('ok');
    w.run(3);
    assert.equal(w.$gameSwitches.value(5), true, 'the event the leader faces ran');
    assert.equal(p._vehicleType, 'walk');
});

test('a project with no vehicle types runs none of it', () => {
    const w = boardWorld({ types: [null], vehicles: [bike(31, 10, 10)] });
    const p = w.$gamePlayer, e = w.vehicle(31);
    assert.equal(w.V.any(), false);
    assert.equal(e._rrVehicle, undefined, 'a row with no type that exists marks nothing');
    assert.equal(w.$gameMap._rrVehicles, undefined, 'no registry is made');
    w.stand(11, 10, 4);
    w.run(1);
    assert.equal(w.V.offered(true), null);
    assert.equal(w.V.prompt(), null);
    w.press('ok');
    w.run(3);
    assert.equal(p._vehicleType, 'walk');
    assert.equal(w.V.getOn(31), false);
});

test('the wrappers stand down for anything that is not theirs: one own property decides', () => {
    const w = world();
    const p = w.$gamePlayer, plain = w.vehicle(32);
    // An ordinary event is where its body is, turns to whoever speaks to it, and keeps its page's facing.
    assert.equal(plain.pos(20, 20), true);
    assert.equal(plain.pos(21, 20), false);
    w.stand(20, 21, 8);
    plain._direction = 4;
    plain.lock();
    assert.equal(plain._direction, 2, 'it turned to the player');
    plain.unlock();
    assert.equal(plain._direction, 4);
    // A vehicle that is spoken to keeps its heading (it faces south; the speaker stands north of it, clear of the
    // tiles its body would sweep, where nothing else refuses the turn).
    const vehicle = w.vehicle(31);
    w.stand(10, 7, 2);
    vehicle.lock();
    assert.deepEqual([vehicle._direction, vehicle._reactorDir8, vehicle._locked], [2, 2, true]);
    vehicle.unlock();
    assert.deepEqual([vehicle._direction, vehicle._reactorDir8, vehicle._locked], [2, 2, false]);
    assert.equal(p._rrMount, undefined, 'on foot the player carries no hop');
});

test('the carried vehicle is one tile to the grid; parked, it is every tile of its body', () => {
    const w = world();
    const e = w.vehicle(31);
    w.run(1);
    assert.deepEqual([e.pos(10, 9), e.pos(10, 10), e.pos(10, 11)], [true, true, true], 'parked: its whole body');
    w.stand(11, 10, 4);
    w.board(31);
    assert.equal(e._rrFree, 2);
    assert.deepEqual([e.pos(10, 9), e.pos(10, 10), e.pos(10, 11)], [false, true, false], 'carried: the tile under its middle');
    assert.deepEqual(Array.from(w.$gameMap.eventsXy(10, 11)), [], 'nothing of it is found on the tile ahead');
    w.V.getOff({ instant: true });
    w.run(1);
    assert.deepEqual([e.pos(10, 9), e.pos(10, 10), e.pos(10, 11)], [true, true, true], 'parked again');
});

test('a page change does not turn a vehicle, and one the mover parked or carries runs no movement of its own', () => {
    // A vehicle heading east whose second page (behind a switch) draws its event facing west and walks about.
    const roaming = bike(31, 10, 10, { yaw: 90 });
    roaming.pages.push(page({ priorityType: 1, trigger: 0, moveType: 1, moveFrequency: 5, image: { tileId: 0, characterName: '', characterIndex: 0, direction: 4, pattern: 1 },
        conditions: Object.assign({}, roaming.pages[0].conditions, { switch1Valid: true, switch1Id: 8 }) }));
    const w = boardWorld({ vehicles: [roaming] });
    const e = w.vehicle(31);
    assert.deepEqual([e._direction, e._reactorDir8], [6, 6]);
    assert.equal(w.V.setLocation(31, 20.25, 12.5, 90), true);
    w.$gameSwitches.setValue(8, true);
    w.run(2);
    assert.equal(e._pageIndex, 1, 'the second page is in force');
    assert.deepEqual([e._direction, e._reactorDir8], [6, 6], 'it still heads east');
    assert.equal(e._moveType, 1);
    // Parked by a command, it takes no step of its own in ten seconds.
    w.run(600);
    assert.deepEqual([e._realX, e._realY, e._x, e._y, e._rrFree], [20.25, 12.5, 20, 13, 1]);
    // Boarded, neither.
    w.stand(20, 11, 2);
    assert.equal(w.board(31), true);
    w.run(600);
    assert.deepEqual([e._realX, e._realY], [20.25, 12.5]);
    assert.equal(w.$gamePlayer.vehicle(), e);
});

test('a vehicle that is spoken to keeps the facing a command gave it as its heading, and does not turn to the speaker', () => {
    const w = world();
    const e = w.vehicle(31), p = w.$gamePlayer;
    const DEG = Math.PI / 180;
    assert.ok(Math.abs(e._rrYaw - 180 * DEG) < 1e-9);
    // A route turns it east where it stands on the grid; then the leader, south of it, speaks to it.
    e.setDirection(6);
    w.stand(10, 12, 8);
    e.lock();
    assert.ok(Math.abs(e._rrYaw - 90 * DEG) < 1e-9, 'its heading is the facing it was given: ' + e._rrYaw / DEG);
    assert.deepEqual([e._direction, e._locked], [6, true], 'and it has not turned to him');
    e.unlock();
    assert.equal(e._direction, 6, 'nor is it turned back afterwards');
    assert.equal(w.V.where(31).yaw, 90);
    assert.equal(p._vehicleType, 'walk');
});

test('a vehicle whose data is another map\'s is left as it is by a refresh', () => {
    const w = world();
    const e = w.vehicle(31);
    w.stand(11, 10, 4);
    w.board(31);
    const state = () => [e._pageIndex, e._rrVehicle, e._rrBoarded, e._rrFree, e._through, e._direction];
    const before = state();
    // A transfer has loaded the next map\'s data while this map\'s events are still there.
    const home = w.$dataMap;
    w.$dataMap = Object.assign({}, home, { events: [null] });
    assert.doesNotThrow(() => e.refresh());
    assert.deepEqual(state(), before);
    w.$dataMap = home;
    assert.doesNotThrow(() => e.refresh());
    assert.deepEqual(state(), before);
});

test('a press of OK aboard is always the vehicle\'s: it never falls through to what stands beside the player', () => {
    const w = world();
    const p = w.$gamePlayer;
    w.stand(11, 10, 4);
    w.board(31);
    // With nobody to interact with the press is still taken: a door wrapper outside this one is not asked.
    const landingSpot = w.V.landingSpot;
    w.pressed = { ok: true };
    assert.equal(p.triggerButtonAction(), true);
    w.pressed = {};
    assert.equal(p.triggerButtonAction(), false, 'with no press there is nothing to take');
    assert.equal(typeof landingSpot, 'function');
});

test('getting off by the stock body is refused: its own tile is no place to land', () => {
    const w = world();
    const p = w.$gamePlayer;
    w.stand(11, 10, 4);
    w.board(31);
    // What the stock `getOffVehicle` asks first, on the player's own tile.
    assert.equal(p.vehicle().isLandOk(p.x, p.y, p.direction()), false);
    const off = vm.runInContext('Game_Player.prototype.getOffVehicle', w);
    assert.equal(off.call(p), false);
    assert.equal(p._vehicleGettingOff, false);
    assert.equal(p._vehicleType, 'reactor');
});
