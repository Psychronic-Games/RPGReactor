'use strict';
// The 2026-10-10 audit of the vehicle runtime (runtime/reactor_vehicles.js, reactor_vehicles_drive.js): each test is a
// failure a player meets, played in the world of helpers/vehicles-board-world.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const { boardWorld, bike, motorcycle, event, page } = require('./helpers/vehicles-board-world.cjs');
const { floor } = require('./helpers/vehicles-drive-world.cjs');

const copy = value => JSON.parse(JSON.stringify(value));
const sprite = { characterName: 'Vehicle', characterIndex: 0 };
const town = { name: 'Town', volume: 90, pitch: 100, pan: 0 };
/** A Transfer Player to another map, as the map scene carries it out. */
function transfer(w, mapId, data, x = 20, y = 10, direction = 6) {
    w.$gamePlayer.reserveTransfer(mapId, x, y, direction, 0);
    w.$dataMap = copy(data);
    w.$gamePlayer.performTransfer();
    w.V.resume();
}
const hold = (w, key, ticks) => { w.keys[key] = true; w.run(ticks); w.keys[key] = false; };
/** A type placed by the database on map 1 at (10, 10), facing east. */
const placed = (extra = {}) => [null, motorcycle(Object.assign({ startMapId: 1, startX: 10, startY: 10, startDirection: 6, sheet: sprite }, extra))];
/** A 2D map with one vehicle event at (10, 10), heading east. */
const flat = (extra = {}, options = {}) => boardWorld(Object.assign({ flat: true, model: false, width: 40, height: 30,
    vehicles: [bike(31, 10, 10, { yaw: 90 })], types: [null, motorcycle(Object.assign({ sheet: sprite }, extra))] }, options));
/** The music asked for, by name. */
function music(w) {
    const played = [];
    w.AudioManager.playBgm = bgm => { played.push(bgm ? bgm.name : ''); };
    return played;
}

test('a map that plays its music on arrival plays it for a party aboard a vehicle with no music of its own', () => {
    const w = boardWorld({ width: 60, vehicles: [bike(31, 10, 10)] }), away = copy(w.$dataMap);
    away.events = [null];
    away.autoplayBgm = true;
    away.bgm = town;
    const played = music(w);
    w.stand(11, 10, 4);
    assert.equal(w.board(31), true);
    transfer(w, 2, away);
    w.$gameMap.autoplay();
    assert.equal(w.V.isRiding(), true, 'the party arrived aboard');
    assert.deepEqual(played, ['Town'], 'the destination\'s music plays');
});

test('the same for a boat that plays no music; a vehicle with music of its own keeps it until the party is on foot', () => {
    const w = boardWorld({});
    const played = music(w), boat = w.$gameMap.boat();
    boat.setLocation(1, 5, 5);
    w.$gamePlayer._vehicleType = 'boat';
    boat.getOn();
    w.$dataMap.autoplayBgm = true;
    w.$dataMap.bgm = town;
    w.$gameMap.autoplay();
    assert.deepEqual(played, ['Town']);

    const own = boardWorld({ width: 60, vehicles: [bike(31, 10, 10)], types: [null, motorcycle({ bgm: { name: 'Ride', volume: 90, pitch: 100, pan: 0 } })] });
    const away = copy(own.$dataMap);
    away.events = [null];
    away.autoplayBgm = true;
    away.bgm = town;
    const heard = music(own);
    own.stand(11, 10, 4);
    assert.equal(own.board(31), true);
    transfer(own, 2, away);
    own.$gameMap.autoplay();
    assert.deepEqual(heard, ['Ride'], 'its own music plays on');
    assert.equal(own.V.getOff({ instant: true }), true);
    assert.deepEqual(heard, ['Ride', 'Town'], 'and the map\'s comes back with the party on foot');
});

test('a database vehicle taken out of the world is put back by its identity, at once and after the map was left', () => {
    const w = boardWorld({ types: placed() });
    assert.equal(w.V.remove('0:1'), true);
    assert.equal(w.V.find('0:1'), null);
    assert.equal(w.V.setLocation('0:1', 15, 12, 90), true, 'put back on the map it was taken from');
    assert.deepEqual([w.V.find('0:1')._realX, w.V.find('0:1')._realY], [15, 12]);

    const later = boardWorld({ types: placed() }), home = copy(later.$dataMap), away = copy(home);
    away.events = [null];
    assert.equal(later.V.remove('0:1'), true);
    transfer(later, 2, away);
    transfer(later, 1, home);
    assert.equal(later.V.find('0:1'), null, 'it stays out of the world');
    assert.equal(later.V.list().filter(e => later.V.isVehicle(e)).length, 0);
    assert.equal(later.V.setLocation('0:1', 15, 12, 90), true, 'until a command puts it back');
    assert.deepEqual([later.V.find('0:1')._realX, later.V.find('0:1')._realY], [15, 12]);
    assert.equal(later.V.where('0:1').map, 1);
});

test('a vehicle taken out of the world on a map it was ridden to is put back there, and only under its own identity', () => {
    const w = boardWorld({ width: 60, vehicles: [bike(31, 10, 10, { key: 'bike' })] }), away = copy(w.$dataMap);
    away.events = [null];
    w.stand(11, 10, 4);
    assert.equal(w.board(31), true);
    transfer(w, 2, away);
    assert.equal(w.V.getOff({ instant: true }), true);
    const visiting = w.V.find('1:31');
    assert.equal(w.V.remove('1:31'), true);
    assert.equal(w.V.setLocation(w.$gameMap.mapId() + ':' + visiting.eventId(), 30, 12, 90), false, 'the event id it has on this map is no identity of its own');
    assert.equal(w.V.setLocation('1:31', 30, 12, 90), true);
    assert.deepEqual([w.V.find('1:31')._realX, w.V.find('1:31')._realY, w.V.where('1:31').map], [30, 12, 2]);
});

test('what the ride reports of a database vehicle names it as boarding does', () => {
    const w = boardWorld({ types: placed() });
    const seen = [];
    w.ReactorEvents.on('vehicleGetOn', payload => seen.push('on ' + payload.vehicle));
    w.ReactorEvents.on('vehicleLand', payload => seen.push('land ' + payload.vehicle));
    w.stand(11, 10, 4);
    assert.equal(w.V.getOn(w.V.find('0:1'), { instant: true }), true);
    w.run(2);
    // A hop off the ground.
    const d = w.$gamePlayer._rrDrive;
    d.air = 1; d.vz = 0.05; d.peak = d.alt;
    w.run(60);
    assert.deepEqual(seen, ['on 0:1', 'land 0:1']);
});

test('one press of Cancel gets the party off a vehicle that takes longer to stop than the press is kept', () => {
    // An airship at top speed brakes for two seconds, then comes down.
    const w = boardWorld({ width: 200, height: 30, vehicles: [bike(31, 10, 10, { yaw: 90 })], types: [null, motorcycle({ kind: 'airship', medium: 'air', flight: { height: 3 } })] });
    w.stand(9, 10, 6);
    assert.equal(w.V.getOn(31, { instant: true }), true);
    hold(w, 'right', 300);
    assert.ok(w.$gamePlayer._rrDrive.v > 13, 'at top speed: ' + w.$gamePlayer._rrDrive.v);
    w.press('cancel');
    w.run(400, () => !w.V.isRiding());
    assert.equal(w.V.isRiding(), false);
    assert.equal(w.$gamePlayer._vehicleType, 'walk');
});

test('a vehicle that flies high comes all the way down for the party to get off', () => {
    const w = boardWorld({ width: 60, height: 30, vehicles: [bike(31, 10, 10, { yaw: 90 })], types: [null, motorcycle({ kind: 'airship', medium: 'air', flight: { height: 12 } })] });
    w.stand(9, 10, 6);
    assert.equal(w.V.getOn(31, { instant: true }), true);
    w.run(5);
    assert.equal(w.$gamePlayer._rrDrive.alt, 12);
    w.press('cancel');
    w.run(400, () => !w.V.isRiding());
    assert.equal(w.V.isRiding(), false, 'down from 12 tiles on one press');
});

test('a press to get off is still let go where the vehicle cannot come down', () => {
    const w = boardWorld({ width: 60, height: 30, vehicles: [bike(31, 10, 10, { yaw: 90 })], types: [null, motorcycle({ kind: 'airship', medium: 'air', flight: { height: 3 } })] });
    w.stand(9, 10, 6);
    assert.equal(w.V.getOn(31, { instant: true }), true);
    w.run(5);
    w.$gameMap.isAirshipLandOk = () => false;
    w.press('cancel');
    w.run(1);
    assert.equal(w.$gamePlayer._rrDrive.leave, 'ok');
    w.run(w.V.KEEP + 2);
    assert.equal(w.$gamePlayer._rrDrive.leave, '', 'let go after its 90 ticks');
    assert.equal(w.V.isRiding(), true);
    assert.equal(w.V.isBusy(), false, 'and a command that waits for it goes on');
});

test('on a 2D map, a Player Touch event the vehicle is driven into starts, once for the contact', () => {
    const touch = event(40, 14, 10, { pages: [page({ priorityType: 1, trigger: 1,
        list: [{ code: 122, indent: 0, parameters: [1, 1, 1, 0, 1] }, { code: 0, indent: 0, parameters: [] }] })] });
    const w = flat({}, { events: [touch] });
    w.stand(9, 10, 6);
    assert.equal(w.V.getOn(31, { instant: true }), true);
    hold(w, 'right', 180);
    assert.ok(w.$gamePlayer._realX < 13.51, 'it stops at the event: ' + w.$gamePlayer._realX);
    assert.equal(w.$gameVariables.value(1), 1, 'and the event ran once while the key was held against it');
    // Put back down the road and driven into it again, it runs again.
    const p = w.$gamePlayer;
    p._realX = p._x = 11;
    w.V.Drive.seat(p);
    hold(w, 'right', 180);
    assert.ok(p._realX > 13 && p._realX < 13.51, 'at the event again: ' + p._realX);
    assert.equal(w.$gameVariables.value(1), 2);
});

test('on a 2D map, a parked boat stops a vehicle on the ground as an event does', () => {
    const w = flat();
    w.$gameMap.boat().setLocation(1, 14, 10);
    w.stand(9, 10, 6);
    assert.equal(w.V.getOn(31, { instant: true }), true);
    hold(w, 'right', 180);
    assert.ok(w.$gamePlayer._realX < 13.51, 'it stops at the boat: ' + w.$gamePlayer._realX);
    assert.equal(w.V.isRiding(), true);
});

test('on a 2D map, a ride stops at the edge of the map and slides along it', () => {
    const w = flat();
    const p = w.stand(9, 10, 6), e = w.vehicle(31);
    assert.equal(w.V.getOn(31, { instant: true }), true);
    hold(w, 'left', 200);
    assert.deepEqual([p._realX, p._x, e._realX], [0, 0, 0], 'its middle is on the first column, not half a tile off the map');
    assert.equal(p._rrDrive.v, 0, 'met square, it stops');
    // Turned along the edge it drives on, and stops in the corner.
    hold(w, 'up', 900);
    assert.ok(p._realX < 0.5, 'still at the edge: ' + p._realX);
    assert.equal(p._realY, 0, 'north along it to the corner');
    const far = flat();
    far.stand(9, 10, 6);
    assert.equal(far.V.getOn(31, { instant: true }), true);
    hold(far, 'right', 400);
    assert.equal(far.$gamePlayer._realX, 39, 'the last column on the other side');
});

/** A map 100 wide: a ledge 3 high, and from x = 82 a lake two deep. */
const lakeMap = () => copy(boardWorld(floor({ width: 100, height: 20, ground: x => (x < 80 ? 3 : x < 82 ? 0 : -2),
    water: [{ x0: 82, y0: 0, x1: 99, y1: 19, level: 0 }] })).$dataMap);
/** Rides the vehicle the party is aboard off the ledge at speed until the ride is over; answers the darkest the screen got. */
function intoTheLake(w, ticks) {
    const p = w.$gamePlayer;
    p._rrDrive.v = 20;
    w.keys.right = true;
    let dark = 255;
    for (let t = 0; t < ticks && p._vehicleType === 'reactor'; t++) {
        w.run(1);
        w.$gameScreen.update();
        dark = Math.min(dark, w.$gameScreen.brightness());
    }
    w.keys.right = false;
    return { dark };
}

test('ridden to another map and off a ledge into deep water there: the ride ends in the water, the vehicle goes down to the bed, nothing fades and nothing is put back', () => {
    // Boarded at (150, 10) on a map 200 wide; the destination is 100 wide.
    const w = boardWorld({ width: 200, height: 20, vehicles: [bike(31, 150, 10, { yaw: 90 })] });
    const p = w.stand(151, 10, 4);
    assert.equal(w.board(31), true);
    transfer(w, 2, lakeMap(), 76, 10, 6);
    assert.equal(w.V.isRiding(), true);
    const sunk = [];
    w.ReactorEvents.on('vehicleSink', payload => sunk.push(payload));
    const { dark } = intoTheLake(w, 300);
    assert.equal(dark, 255, 'the screen never dipped');
    assert.equal(p._vehicleType, 'walk', 'the party is on foot');
    assert.equal(w.V.isRiding(), false);
    assert.equal(sunk.length, 1, 'said once');
    assert.ok(p._realX >= 82 && w.$gameMap.isValid(p._x, p._y), 'in the lake where it came down, not put back: ' + p._realX);
    assert.equal(p._rrDrive, null);
    const e = w.V.list().find(event => event._rrVehicle > 0);
    assert.equal(e._rrBoarded, false);
    assert.deepEqual([e._x, e._y], [p._x, p._y], 'the vehicle is where it went in');
    // Down to the bed, two under the surface, a little each tick; then it stays.
    const first = e._reactorAlt;
    assert.ok(first > -2 && first <= 0.01, 'it starts at the surface: ' + first);
    w.run(1);
    assert.ok(e._reactorAlt < first, 'and goes down');
    w.run(200);
    assert.deepEqual([e._reactorAlt, e._reactorGround, e._rrSink], [-2, -2, undefined]);
    // The rider is in the water, over the bed. The vehicle stays where it sank: left and come back to, it is there.
    assert.ok(p._reactorAlt >= -2 - 1e-6 && p._reactorAlt <= 0.01, 'the rider is in the water: ' + p._reactorAlt);
    assert.equal(w.V.sunk(e), true);
    assert.equal(w.V.scenery(e), '', 'it is still a vehicle');
    const kept = w.V.where(w.V.idOf(e));
    assert.deepEqual([kept.map, Math.round(kept.x), kept.z], [2, e._x, -2], 'what is kept of it is its place on the bed');
});

test('a sunk vehicle is boarded where it lies and walked out along the bed: slow and silent under water, itself again out of it', () => {
    // A bank that goes down a tile in ten from x = 60; the water stands at 0.
    const w = boardWorld(Object.assign(floor({ width: 100, height: 20, ground: x => (x < 60 ? 0.2 : Math.max(-3, 0.2 - (x - 60) * 0.1)),
        water: [{ x0: 60, y0: 0, x1: 99, y1: 19, level: 0 }] }), { vehicles: [bike(31, 50, 10, { yaw: 90 })] }));
    const p = w.stand(49, 10, 6), e = w.vehicle(31);
    assert.equal(w.V.getOn(31, { instant: true }), true);
    intoTheLake(w, 600);
    assert.equal(p._vehicleType, 'walk');
    assert.equal(w.V.sunk(e), true);
    const sunkAt = e._realX;
    // Offered to the party standing in the water beside it, and boarded: no second sinking.
    w.run(30);
    assert.equal(w.V.offered(true), e, 'OK boards it where it lies');
    assert.equal(w.V.getOn(e, { instant: true }), true);
    assert.equal(p._rrDrive.flooded, true);
    w.run(30);
    assert.equal(p._vehicleType, 'reactor', 'still aboard in the water');
    // Got off under water (no tile beside it to step onto there): the rider is in the water, the vehicle stays, nothing is said to have sunk.
    const sunk = [];
    w.ReactorEvents.on('vehicleSink', payload => sunk.push(payload));
    assert.equal(w.V.getOff({ instant: true }), true);
    assert.equal(p._vehicleType, 'walk');
    assert.deepEqual([w.V.sunk(e), sunk.length, e._rrBoarded], [true, 0, false]);
    w.run(10);
    assert.equal(w.V.getOn(e, { instant: true }), true);
    w.run(30);
    // Backed out up the bank: a walk under water, and once the water is no deeper than it wades it is a motorcycle again.
    w.keys.left = false; w.keys.right = false; w.keys.down = true;
    let fastest = 0, out = -1;
    for (let t = 0; t < 900 && out < 0; t++) {
        w.run(1);
        if (p._rrDrive.flooded) fastest = Math.max(fastest, Math.abs(p._rrDrive.v)); else out = t;
    }
    w.keys.down = false;
    assert.ok(out > 0, 'it came out of the water');
    assert.ok(fastest > 0.5 && fastest <= 2 + 1e-9, 'walked under water at ' + fastest);
    assert.ok(p._realX < sunkAt, 'back toward the bank: ' + p._realX);
    assert.equal(p._vehicleType, 'reactor');
    assert.equal(w.V.sunk(e), false);
    // And ridden forward into the deep again, it sinks again.
    p._rrDrive.yaw = Math.PI / 2; p._rrDrive.v = 20;
    for (let t = 0; t < 300 && p._vehicleType === 'reactor'; t++) w.run(1);
    assert.equal(p._vehicleType, 'walk');
    assert.equal(w.V.sunk(e), true);
});

test('ridden down a bank into water: it stops being a vehicle where the water is deeper than it wades', () => {
    // A bank that goes down a tile in ten from x = 60; the water stands at 0.
    const w = boardWorld(Object.assign(floor({ width: 100, height: 20, ground: x => (x < 60 ? 0.2 : Math.max(-3, 0.2 - (x - 60) * 0.1)),
        water: [{ x0: 60, y0: 0, x1: 99, y1: 19, level: 0 }] }), { vehicles: [bike(31, 50, 10, { yaw: 90 })] }));
    const p = w.stand(49, 10, 6);
    assert.equal(w.V.getOn(31, { instant: true }), true);
    const { dark } = intoTheLake(w, 600);
    assert.equal(dark, 255);
    assert.equal(p._vehicleType, 'walk');
    const e = w.vehicle(31);
    // Ridden in, not refused at the shore: its middle is where the water is just over its wade (0.45).
    const depth = 0 - e._reactorAlt;
    assert.ok(depth > 0.45 && depth < 0.75, 'in ' + depth + ' of water');
    assert.ok(e._realX > 66 && e._realX < 70, 'at x ' + e._realX);
    assert.equal(w.V.sunk(e), true);
    assert.equal(p._reactorSwim, false, 'water to wade in: the rider stands');
});

test('a ride that ends while the screen is dipped for a put-back gives the screen back', () => {
    const w = boardWorld(Object.assign(floor({ width: 100, height: 20, ground: x => (x < 80 ? 3 : x < 82 ? 0 : -2),
        water: [{ x0: 82, y0: 0, x1: 99, y1: 19, level: 0 }] }), { vehicles: [bike(31, 70, 10, { yaw: 90 })] }));
    const p = w.stand(69, 10, 6);
    assert.equal(w.V.getOn(31, { instant: true }), true);
    // The screen dipped to put it back (it was stuck); in the dip, an event takes the vehicle away.
    w.run(2);
    p._rrDrive.back = 20; p._rrDrive.fade = 20;
    w.$gameScreen.startFadeOut(20);
    for (let t = 0; t < 5; t++) { w.run(1); w.$gameScreen.update(); }
    assert.ok(p._rrDrive.back > 0 && p._rrDrive.fade > 0 && w.$gameScreen.brightness() < 255, 'the dip is under way');
    w.$gameMap.event(31).erase();
    for (let t = 0; t < 60; t++) { w.run(1); w.$gameScreen.update(); }
    assert.equal(p._vehicleType, 'walk');
    assert.equal(w.$gameScreen.brightness(), 255, 'the screen is not left dark');
});
