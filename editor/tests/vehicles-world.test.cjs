'use strict';
// A vehicle in the world (runtime/reactor_vehicles.js): which events are vehicles, what each looks like, where
// each stands once it has left its authored tile (the registry in $gameMap._rrVehicles), the words the player
// reads, and the maps this version does not ride on.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { boardWorld, bike, motorcycle, event, page, DEG, BIKE_MODEL } = require('./helpers/vehicles-board-world.cjs');

const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
const world = (extra = {}) => boardWorld(Object.assign({ width: 60, height: 30, vehicles: [bike(31, 10, 10, { yaw: 180 })] }, extra));

/** The party leaves for another map (with no events) and comes back: both set-ups run as a transfer runs them. */
function leaveAndReturn(w, away) {
    const home = w.$dataMap;
    w.$dataMap = Object.assign({}, home, { events: [null], reactor3d: Object.assign({}, home.reactor3d, { events: undefined, eventZ: undefined, pieces: undefined }) });
    w.$gameMap.setup(2);
    if (away) away();
    w.$dataMap = home;
    w.$gameMap.setup(1);
}

/** Aboard, the ride put somewhere by its player's own place, as a script's `locate` does it. */
function rideTo(w, x, y, degrees) {
    const p = w.$gamePlayer;
    p._realX = x; p._realY = y; p._x = Math.round(x); p._y = Math.round(y);
    p._rrDrive.yaw = degrees * DEG;
    w.run(2);
}

test('the types file is read once; a missing or broken file is an empty list and no error', () => {
    // Where the file is asked for and how it answers, as the page's own request does.
    const answer = body => function XMLHttpRequest() {
        this.open = (method, url) => { this.url = url; };
        this.overrideMimeType = () => {};
        this.send = () => { asked.push(this.url); if (body === null) this.onerror(); else { this.status = body === undefined ? 404 : 200; this.responseText = body || ''; this.onload(); } };
    };
    const asked = [];
    for (const [name, body, expected] of [['a list', '[null,{"id":1,"name":"Motorcycle","kind":"motorcycle"}]', 2], ['no file', undefined, 1], ['a broken file', '{oops', 1],
        ['something that is no list', '{"id":1}', 1], ['no answer', null, 1]]) {
        const w = world();
        w.XMLHttpRequest = answer(body);
        delete w.$dataReactorVehicles;
        assert.equal(w.V._state, undefined, 'nothing is read before the boot asks');
        assert.doesNotThrow(() => w.V.load(), name);
        assert.equal(w.V.isReady(), true, name);
        assert.equal(Array.isArray(w.$dataReactorVehicles) || w.$dataReactorVehicles.length >= 1, true, name);
        assert.equal(w.$dataReactorVehicles.length, expected, name);
        assert.equal(w.$dataReactorVehicles[0], null, name);
        w.V.load();
    }
    assert.deepEqual(asked, new Array(5).fill('data/ReactorVehicles.json'), 'asked for once each time, under data/');
    // With no list at all nothing is a vehicle and nothing throws.
    const none = world();
    delete none.$dataReactorVehicles;
    assert.doesNotThrow(() => none.$gameMap.setup(1));
    assert.equal(none.V.type(1), null);
    assert.equal(none.V.any(), false);
    // The boot scene asks for the file when it is made, and is not ready until the answer has come.
    let send = null;
    const boot = world({ before(ctx) {
        vm.runInContext('Scene_Boot = function Scene_Boot() {}; Scene_Boot.prototype.create = function() { this.made = true; }; Scene_Boot.prototype.isReady = function() { return true; };', ctx);
    } });
    boot.XMLHttpRequest = function XMLHttpRequest() {
        this.open = () => {};
        this.overrideMimeType = () => {};
        this.send = () => { send = () => { this.status = 200; this.responseText = '[null,{"id":1,"name":"Motorcycle","kind":"motorcycle"}]'; this.onload(); }; };
    };
    delete boot.$dataReactorVehicles;
    const scene = vm.runInContext('new Scene_Boot()', boot);
    scene.create();
    assert.equal(scene.made, true, 'the scene\'s own create ran');
    assert.equal(typeof send, 'function', 'the file was asked for');
    assert.equal(scene.isReady(), false, 'the database is in, the types are not: the boot waits');
    send();
    assert.equal(scene.isReady(), true);
    assert.equal(boot.$dataReactorVehicles.length, 2);
});

test('an event with a vehicle row is marked with its type, its home and its heading; a plain event is not', () => {
    const w = world({ vehicles: [bike(31, 10, 10, { yaw: 180 }), bike(32, 20, 10, {}, { pages: [page({ priorityType: 1, trigger: 0, image: { tileId: 0, characterName: '', characterIndex: 0, direction: 6, pattern: 1 } })] }),
        bike(33, 30, 10, { yaw: 37 }), bike(34, 40, 10, { type: 9 })], events: [event(35, 5, 5)] });
    const V = w.V;
    assert.deepEqual(Array.from(V.list()).map(e => e._eventId), [31, 32, 33]);
    const a = w.vehicle(31), b = w.vehicle(32), c = w.vehicle(33);
    assert.equal(a._rrVehicle, 1);
    assert.deepEqual(Array.from(a._rrHome), [10, 10, 180]);
    assert.ok(near(a._rrYaw, Math.PI));
    assert.deepEqual([a._direction, a._reactorDir8, a._rrFree], [2, 2, undefined], 'never moved, it is on the stock grid');
    // With no `yaw` it faces as its event does.
    assert.deepEqual(Array.from(b._rrHome), [20, 10, 90]);
    assert.equal(b._direction, 6);
    // A heading between the eight: its body and model take the nearest of eight, its grid facing the nearest of four.
    assert.ok(near(c._rrYaw, 37 * DEG));
    assert.deepEqual([c._direction, c._reactorDir8], [8, 9]);
    // A type that does not exist and an event with no row are no vehicles.
    assert.equal(w.vehicle(34)._rrVehicle, undefined);
    assert.equal(w.vehicle(35)._rrVehicle, undefined);
    assert.equal(V.isVehicle(a), true);
    assert.equal(V.isVehicle(w.vehicle(35)), false);
    assert.equal(V.idOf(a), '1:31');
    assert.equal(V.idOf(null), '');
});

test('an event whose page conditions fail is no vehicle until they are met', () => {
    const gated = bike(31, 10, 10, { yaw: 180 });
    gated.pages[0].conditions.switch1Valid = true;
    gated.pages[0].conditions.switch1Id = 7;
    const w = world({ vehicles: [gated] });
    const e = w.vehicle(31), V = w.V;
    assert.equal(V.isVehicle(e), false);
    assert.equal(V.find(31), null);
    w.stand(11, 10, 4);
    w.run(1);
    assert.equal(V.offered(true), null);
    assert.equal(V.getOn(31), false);
    // "You get the bike when the smith has fixed it."
    w.$gameSwitches.setValue(7, true);
    w.run(2);
    assert.equal(V.isVehicle(e), true);
    assert.equal(V.offered(true), e);
    assert.deepEqual([e._direction, e._reactorDir8], [2, 2], 'the page coming into force does not turn it');
});

test('find: an event, an id, an identity, ridden, nearest and a name; two events with one name are two vehicles', () => {
    const w = world({ vehicles: [bike(31, 10, 10, { yaw: 180, key: 'bike' }), bike(32, 30, 10, { yaw: 180, key: 'bike' }), bike(33, 45, 20, { key: 'spare' })] });
    const V = w.V, a = w.vehicle(31), b = w.vehicle(32), c = w.vehicle(33);
    // (The leader alone: followers who take the other vehicles are the convoy's tests.)
    w.$gamePlayer.hideFollowers();
    assert.equal(V.find(a), a);
    assert.equal(V.find(32), b);
    assert.equal(V.find('1:33'), c);
    assert.equal(V.find('2:33'), null, 'another map\'s identity is nothing here');
    assert.equal(V.find('spare'), c);
    assert.equal(V.find('nobody'), null);
    assert.equal(V.find('ridden'), null);
    // The name answers the nearest of those that carry it.
    w.stand(12, 10, 4);
    assert.equal(V.find('bike'), a);
    assert.equal(V.find('nearest'), a);
    w.stand(28, 10, 6);
    assert.equal(V.find('bike'), b);
    // Each keeps its own place: the registry is keyed by identity, never by the name.
    w.stand(29, 10, 6);
    w.board(32);
    assert.equal(V.find('ridden'), b);
    assert.equal(V.isRiding('bike'), true);
    assert.equal(V.isRiding('1:32'), true);
    assert.equal(V.isRiding('1:31'), false);
    assert.equal(V.isRiding({ type: 1 }), true);
    assert.equal(V.isRiding({ type: 2 }), false);
    rideTo(w, 34.5, 14.25, 90);
    assert.equal(V.getOff({ instant: true }), true);
    const at = w.$gameMap._rrVehicles.at;
    assert.deepEqual(Object.keys(at), ['1:32']);
    assert.deepEqual([at['1:32'].x, at['1:32'].y, at['1:32'].yaw], [34.5, 14.25, 90]);
    assert.deepEqual([a._realX, a._realY], [10, 10], 'its twin did not move');
});

test('a pasted copy of the bike is ridden away, parked and saved apart from the first', () => {
    const w = world({ vehicles: [bike(31, 10, 10, { yaw: 180 }), bike(32, 12, 10, { yaw: 180 })] });
    const V = w.V;
    // (The leader alone: with its followers in the line, one of them would ride the first bike after it.)
    w.$gamePlayer.hideFollowers();
    w.stand(13, 10, 4);
    w.board(32);
    assert.equal(V.ridden(), w.vehicle(32));
    rideTo(w, 40.25, 12.5, 37);
    assert.equal(V.getOff({ instant: true }), true);
    w.saveAndLoad();
    V.resume();
    const first = w.vehicle(31), copy = w.vehicle(32);
    assert.deepEqual([first._realX, first._realY, first._rrFree], [10, 10, undefined]);
    assert.deepEqual([copy._realX, copy._realY, copy._rrFree], [40.25, 12.5, 1]);
    assert.ok(near(V.where(32).yaw, 37));
    assert.deepEqual(Array.from(V.list()).map(e => e._eventId), [31, 32], 'the list is found again after a load');
    // And after the map is entered again. From the other map it is found by its identity, where the registry has it.
    leaveAndReturn(w, () => {
        assert.equal(V.find('1:32'), null, 'no event of the map the party is on');
        const at = V.where('1:32');
        assert.deepEqual([at.map, at.x, at.y], [1, 40.25, 12.5]);
        assert.ok(near(at.yaw, 37));
        assert.equal(V.where('1:31'), null, 'one that never left its tile has no entry');
        assert.equal(V.where('1:99'), null);
    });
    const again = w.vehicle(32);
    assert.deepEqual([again._realX, again._realY, again._x, again._y, again._rrFree], [40.25, 12.5, 40, 13, 1]);
    assert.ok(near(again._rrYaw, 37 * DEG, 1e-6));
    assert.deepEqual([w.vehicle(31)._realX, w.vehicle(31)._realY], [10, 10]);
});

test('a vehicle moved to (40.25, 12.5) at 37 degrees is there after the map is set up again and after a save', () => {
    const w = world();
    const V = w.V;
    assert.equal(V.setLocation(31, 40.25, 12.5, 37), true);
    const check = when => {
        const e = w.vehicle(31), at = V.where(31);
        assert.deepEqual([e._realX, e._realY, e._x, e._y, e._rrFree], [40.25, 12.5, 40, 13, 1], when);
        assert.ok(near(e._rrYaw, 37 * DEG, 1e-6), when);
        assert.deepEqual([e._direction, e._reactorDir8], [8, 9], when);
        assert.deepEqual([at.map, at.x, at.y, at.yaw], [1, 40.25, 12.5, 37], when);
    };
    check('placed');
    w.$gameMap.setup(1);
    check('the map set up again');
    w.saveAndLoad();
    V.resume();
    check('saved and loaded');
    leaveAndReturn(w);
    check('left and entered again');
    // It stays put: nothing glides it to its tile's middle.
    w.run(120);
    check('two seconds later');
    assert.equal(w.vehicle(31).isMoving(), false);
});

test('where and setLocation agree: degrees in, degrees out, to a thousandth of a tile', () => {
    const w = world();
    const V = w.V;
    V.setLocation(31, 21.3337, 7.25, 123.4);
    const at = V.where(31);
    assert.deepEqual([at.x, at.y], [21.334, 7.25]);
    assert.ok(near(at.yaw, 123.4, 0.1));
    assert.equal(V.setLocation(31, at.x, at.y, at.yaw), true);
    const again = V.where(31);
    assert.ok(near(again.x, at.x) && near(again.y, at.y) && near(again.yaw, at.yaw, 0.1), 'it is where it was');
    // The identity always works, and so does a name.
    assert.equal(V.setLocation('1:31', 25, 9, 0), true);
    assert.deepEqual([V.where('1:31').x, V.where('1:31').y, V.where('1:31').yaw], [25, 9, 0]);
});

test('a vehicle moved by Set Event Location is at its new tile after leaving and entering the map again', () => {
    const w = world();
    const e = w.vehicle(31);
    // What the command does: the event located, then turned.
    e.locate(22, 14);
    e.setDirection(6);
    w.run(2);
    leaveAndReturn(w);
    const again = w.vehicle(31);
    assert.deepEqual([again._realX, again._realY, again._x, again._y], [22, 14, 22, 14]);
    assert.equal(again._direction, 6, 'and it faces as the command left it');
    assert.equal(w.$gameMap._rrVehicles.at['1:31'].yaw, 90);
    // One that never left its home writes nothing.
    const still = world();
    leaveAndReturn(still);
    assert.equal(still.$gameMap._rrVehicles, undefined);
});

test('an entry whose event is now another type, or stands on another authored tile, is dropped', () => {
    const w = world({ types: [null, motorcycle(), motorcycle({ id: 2, name: 'Trail bike' })] });
    w.V.setLocation(31, 30, 12, 90);
    assert.ok(w.$gameMap._rrVehicles.at['1:31']);
    // A later version of the game makes event 31 another vehicle.
    w.$dataMap.events[31].rrVehicle.type = 2;
    w.$gameMap.setup(1);
    assert.equal(w.$gameMap._rrVehicles.at['1:31'], undefined);
    assert.deepEqual([w.vehicle(31)._realX, w.vehicle(31)._realY, w.vehicle(31)._rrVehicle], [10, 10, 2], 'it stands on its authored tile');
    // Or moves its authored tile.
    w.V.setLocation(31, 30, 12, 90);
    w.$dataMap.events[31].x = 11;
    w.$gameMap.setup(1);
    assert.equal(w.$gameMap._rrVehicles.at['1:31'], undefined);
    assert.deepEqual([w.vehicle(31)._realX, w.vehicle(31)._realY], [11, 10]);
});

test('the parked body\'s long side lies along its heading', () => {
    const w = world();
    const R = w.Reactor3D, e = w.vehicle(31);
    w.run(1);
    const south = R.eventBody(e);
    assert.ok(south.h >= 3 && south.w === 1, 'facing south it is ' + south.w + ' by ' + south.h);
    w.V.setLocation(31, 30, 12, 90);
    w.run(1);
    const east = R.eventBody(w.vehicle(31));
    assert.ok(east.w >= 3 && east.h === 1, 'facing east it is ' + east.w + ' by ' + east.h);
    // Its tiles are solid for a walker, and the tile beside it is free.
    assert.equal(R.bodyBlocksTile(w.$gamePlayer, 31, 12, true), true);
    assert.equal(R.bodyBlocksTile(w.$gamePlayer, 30, 13, true), false);
});

test('a vehicle placed with a lift is drawn at the same height before the ride, during it and after it', () => {
    const pieces = [];
    for (let x = 6; x <= 14; x++) for (let y = 6; y <= 14; y++) pieces.push({ id: pieces.length + 1, kind: 'floor', x, y, z: 2, rot: 0, material: 'Wood' });
    const w = world({ sidecar: { pieces, eventZ: { 31: 2.1 } } });
    const R = w.Reactor3D, p = w.$gamePlayer, e = w.vehicle(31);
    const drawn = () => R.characterGround(w.$dataMap, e) + (e._reactorLift || 0) + (e._reactorAir || 0);
    w.run(2);
    assert.equal(e._reactorLift, 2.1);
    assert.ok(near(drawn(), 2.1), 'before: ' + drawn());
    // The leader walks up to it on the deck.
    w.stand(11, 10, 4);
    p._reactorGround = 2.1; p._reactorAlt = 2.1;
    w.run(2);
    assert.equal(w.V.offered(true), e, 'on its floor he is in reach');
    w.press('ok');
    w.run(1);
    for (let tick = 1; tick <= w.V.HOP; tick++) {
        w.run(1);
        assert.ok(near(drawn(), 2.1), 'tick ' + tick + ' of the hop: ' + drawn());
    }
    assert.equal(e._reactorLift, 0, 'its lift is spent');
    assert.ok(near(e._reactorGround, 2.1));
    w.run(30);
    assert.ok(near(drawn(), 2.1), 'during: ' + drawn());
    assert.ok(near(p._reactorGround, 2.1), 'and the rider is on its floor');
    assert.equal(w.V.getOff({ instant: true }), true);
    w.run(30);
    assert.ok(near(drawn(), 2.1), 'after: ' + drawn());
    assert.ok(near(w.V.where(31).z, 2.1));
    // Under the deck he is out of its reach.
    w.stand(11, 10, 4);
    w.run(2);
    assert.equal(w.V.offered(true), null);
});

test('a lift a little off a floor is spent on that floor; with no floor near it is kept as the height it stands at', () => {
    const pieces = [];
    for (let x = 6; x <= 14; x++) for (let y = 6; y <= 14; y++) pieces.push({ id: pieces.length + 1, kind: 'floor', x, y, z: 2, rot: 0, material: 'Wood' });
    // The deck's top is 2.1; one bike was typed 0.3 above it, the other 4 tiles up over open ground.
    const w = world({ vehicles: [bike(31, 10, 10, { yaw: 180 }), bike(32, 30, 10, { yaw: 180 })], sidecar: { pieces, eventZ: { 31: 2.4, 32: 4 } } });
    const p = w.$gamePlayer, V = w.V;
    w.run(2);
    assert.deepEqual([w.vehicle(31)._reactorLift, w.vehicle(32)._reactorLift], [2.4, 4]);
    w.stand(30, 20, 2);
    assert.equal(V.getOn(31, { instant: true }), true);
    assert.ok(near(w.vehicle(31)._reactorGround, 2.1), 'on the deck under it: ' + w.vehicle(31)._reactorGround);
    assert.equal(w.vehicle(31)._reactorLift, 0);
    assert.ok(near(p._reactorGround, 2.1));
    V.putOnFoot();
    assert.equal(V.getOn(32, { instant: true }), true);
    assert.ok(near(w.vehicle(32)._reactorGround, 4), 'no floor within half a tile of it: ' + w.vehicle(32)._reactorGround);
    assert.equal(w.vehicle(32)._reactorLift, 0);
});

test('Set Vehicle Location on a tile with two floors: the ground floor whatever height it came from, and the floor a height names', () => {
    // A deck 4 tiles up over x 20 to 30, and a plateau 8 tiles up from x 40 on.
    const pieces = [];
    for (let x = 20; x <= 30; x++) for (let y = 4; y <= 16; y++) pieces.push({ id: pieces.length + 1, kind: 'floor', x, y, z: 4, rot: 0, material: 'Wood' });
    const elevation = new Array(60 * 30).fill(0);
    for (let y = 0; y < 30; y++) for (let x = 40; x < 60; x++) elevation[y * 60 + x] = 8;
    const w = world({ sidecar: { pieces, elevation } });
    const V = w.V, P = w.ReactorPhysics, e = w.vehicle(31);
    w.run(1);
    const floors = P.levelsAt(w.$dataMap, 25, 10).filter(level => level.stand).map(level => level.top);
    assert.equal(floors.length, 2, 'the tile has two floors: ' + floors);
    const deck = floors[1];
    assert.ok(near(floors[0], 0) && deck > 4);
    // From its home on the ground.
    assert.equal(V.setLocation(31, 25, 10, 0), true);
    assert.ok(near(V.where(31).z, 0), 'from the ground: ' + V.where(31).z);
    // From the plateau, twice as near the deck as the ground: the ground floor all the same.
    assert.equal(V.setLocation(31, 50, 10, 0), true);
    assert.ok(near(V.where(31).z, 8));
    assert.equal(V.setLocation(31, 25, 10, 0), true);
    assert.ok(near(V.where(31).z, 0), 'from 8 tiles up: ' + V.where(31).z);
    assert.ok(near(e._reactorGround, 0));
    // At the deck's east edge, heading east: the ground floor takes its whole body, the deck does not (its nose
    // would hang over the edge). Whether it fits is asked of the floor it arrives on, not of the height it comes from.
    assert.equal(V.setLocation(31, 50, 10, 0), true);
    assert.equal(V.setLocation(31, 30, 10, 90), true, 'from 8 tiles up, onto the ground under the deck\'s edge');
    assert.ok(near(V.where(31).z, 0));
    assert.deepEqual([V.where(31).x, V.where(31).y], [30, 10]);
    assert.equal(V.setLocation(31, 30, 10, 90, 4), false, 'and not onto the deck there');
    assert.ok(near(V.where(31).z, 0), 'a refusal moves nothing');
    // A height names the floor: the one nearest it.
    assert.equal(V.setLocation(31, 25, 10, 0, 4), true);
    assert.ok(near(V.where(31).z, deck), 'z 4 is the deck: ' + V.where(31).z);
    assert.equal(V.setLocation(31, 25, 10, 0, '0.5'), true, 'a dialog\'s string');
    assert.ok(near(V.where(31).z, 0));
    // where() and setLocation() agree in height too: put back by what where() answered, it is on its floor.
    V.setLocation(31, 26, 12, 90, 4);
    const at = V.where(31);
    assert.equal(V.setLocation(31, 12, 12, 0), true);
    assert.equal(V.setLocation(31, at.x, at.y, at.yaw, at.z), true);
    assert.deepEqual([V.where(31).x, V.where(31).y, V.where(31).yaw], [26, 12, 90]);
    assert.ok(near(V.where(31).z, deck));
    // The command: `z` from a script, none from the form.
    const call = args => vm.runInContext('(function(args) { const i = new Game_Interpreter(); i.setup([{ code: 0, indent: 0, parameters: [] }], 31); PluginManager.callCommand(i, "RPGReactor", "SetVehicleLocation", args); })', w)(args);
    call({ vehicle: '1:31', x: 24, y: 8, yaw: 0, z: 4 });
    assert.deepEqual([V.where(31).x, V.where(31).y], [24, 8]);
    assert.ok(near(V.where(31).z, deck));
    call({ vehicle: '1:31', x: 24, y: 8, yaw: 0 });
    assert.ok(near(V.where(31).z, 0));
});

test('a type that names no model is scenery: marked, standing there, with no label and no boarding', () => {
    for (const [name, record] of [['no model', { id: 1, name: 'Ghost', kind: 'motorcycle' }], ['a model that is a string', { id: 1, name: 'Ghost', kind: 'motorcycle', model: 'Vehicles/test-bike' }],
        ['a model with no name', { id: 1, name: 'Ghost', kind: 'motorcycle', model: { size: 3 } }]]) {
        const w = world({ types: [null, record] });
        const V = w.V, e = w.vehicle(31), p = w.$gamePlayer;
        assert.equal(V.isVehicle(e), true, name + ': it is a vehicle');
        assert.equal(V.scenery(e), 'model', name);
        w.stand(11, 10, 4);
        w.run(1);
        assert.equal(V.offered(true), null, name + ': no label');
        assert.equal(V.prompt(), null, name);
        w.press('ok');
        w.run(2);
        assert.equal(p._vehicleType, 'walk', name + ': OK does not board it');
        assert.equal(V.getOn(31, { instant: true }), false, name + ': nor does a command');
    }
});

test('the look: its own model first, then its type\'s; one kept spec per type with the model\'s own front', () => {
    const w = world({ vehicles: [bike(31, 10, 10, { yaw: 180 }), bike(32, 20, 10), bike(33, 30, 10)], sidecar: { events: { 33: { 0: { name: 'Vehicles/painted-bike', file: 'painted', ext: '.glb', size: 4 } } } } });
    const R = w.Reactor3D;
    const a = R.characterModelSpec(w.vehicle(31)), b = R.characterModelSpec(w.vehicle(32));
    assert.equal(a.name, BIKE_MODEL);
    assert.equal(a.file, 'test-bike');
    assert.equal(a.ext, '.glb');
    assert.equal(a.size, 3.5);
    assert.equal(a, b, 'two vehicles of one type wear the same spec object');
    assert.equal(R.characterModelSpec(w.vehicle(31)), a, 'and it is the same every time');
    // The model's own front (its vehicle block says -x) is the spec's front mark.
    assert.deepEqual(Array.from(a.faces.front), [-1, 0, 0]);
    // A second bike in another paint: the map's own entry for the event wins.
    assert.equal(R.characterModelSpec(w.vehicle(33)).name, 'Vehicles/painted-bike');
    // An event with a picture of its own keeps it.
    w.vehicle(32).setImage('Vehicle', 0);
    assert.equal(R.characterModelSpec(w.vehicle(32)), null);
    // An erased vehicle shows nothing.
    w.vehicle(31).erase();
    assert.equal(R.characterModelSpec(w.vehicle(31)), null);
    // The models preload with the map, and a map whose only model is a vehicle's counts as having models.
    const only = world();
    const specs = only.Reactor3D.collectMapModelSpecs(only.$dataMap);
    assert.deepEqual(Array.from(specs).map(spec => spec.name), [BIKE_MODEL]);
    assert.equal(only.Reactor3D._hasEventModelsNow(only.$dataMap), true);
    const none = boardWorld({ types: [null], vehicles: [bike(31, 10, 10)] });
    assert.equal(none.Reactor3D._hasEventModelsNow(none.$dataMap), false);
    assert.equal(none.Reactor3D.collectMapModelSpecs(none.$dataMap).length, 0);
});

test('a front the model\'s file does not name comes from the model file\'s reader, once the model is there', () => {
    const w = world({ prepare(map, ctx) { ctx.Reactor3D._sidecarJson[BIKE_MODEL] = null; } });
    const R = w.Reactor3D;
    const spec = R.characterModelSpec(w.vehicle(31));
    assert.equal(spec.name, BIKE_MODEL);
    if (R.Vehicles && typeof R.Vehicles.read === 'function') {
        assert.ok(spec.faces && spec.faces.front, 'the reader\'s guess is the front mark');
        assert.ok(Math.abs(spec.faces.front[0]) === 1 && spec.faces.front[2] === 0, 'along the box\'s longer side: ' + Array.from(spec.faces.front));
    }
});

test('the words: English in the runtime, a project\'s own over them, a type\'s prompt over both', () => {
    const w = world({ vehicles: [bike(31, 10, 10, { yaw: 180 }), bike(32, 30, 10, { type: 2 })], types: [null, motorcycle(), motorcycle({ id: 2, prompt: 'Saddle up' })] });
    const V = w.V;
    assert.deepEqual(Object.assign({}, V.TERMS), { ride: 'Ride', drive: 'Drive', board: 'Board', fly: 'Fly', getOff: 'Get off', getOut: 'Get out', go: 'Go', brake: 'Brake',
        steer: 'Steer', jump: 'Jump', turnRound: 'Turn round', noRoom: 'No room to get off here' });
    assert.equal(V.term('ride'), 'Ride');
    assert.equal(V.term('nothing'), '');
    w.stand(11, 10, 4);
    w.run(1);
    assert.equal(V.offered(true), w.vehicle(31));
    assert.equal(V.prompt().word, 'Ride');
    assert.equal(V.prompt().action, 'ok');
    assert.equal(V.prompt().event, w.vehicle(31));
    // The project's own word.
    w.$dataSystem.reactorVehicles = { terms: { ride: 'Mount', getOff: '' } };
    assert.equal(V.term('ride'), 'Mount');
    assert.equal(V.term('getOff'), 'Get off', 'an empty word is not a word');
    assert.equal(V.prompt().word, 'Mount');
    // The word for leaving is the kind's own term: off a saddle, out of a cabin.
    assert.equal(V.words(V.type(1)).leave, 'Get off');
    assert.equal(V.words({ leaveTerm: 'getOut', promptTerm: 'drive' }).leave, 'Get out');
    assert.equal(V.words({ leaveTerm: 'getOut', promptTerm: 'drive' }).prompt, 'Drive');
    w.$dataSystem.reactorVehicles = { terms: { ride: 'Mount', getOff: '', getOut: 'Climb out' } };
    assert.equal(V.words({ leaveTerm: 'getOut' }).leave, 'Climb out');
    // A type's prompt wins over the kind's term.
    w.stand(31, 10, 4);
    w.run(1);
    assert.equal(V.offered(true), w.vehicle(32));
    assert.equal(V.prompt().word, 'Saddle up');
    // Game text never comes from an editor translation table.
    const i18n = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'I18nManager.js'), 'utf8');
    assert.equal(i18n.includes('Saddle up'), false);
    assert.equal(i18n.includes('No room to get off here'), false);
    const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'runtime', 'reactor_vehicles.js'), 'utf8');
    assert.equal(/I18n|translate\(/.test(source), false);
});

test('the kill switch and the maps this version does not ride on: scenery, with no label', () => {
    const w = world();
    const V = w.V, e = w.vehicle(31);
    w.stand(11, 10, 4);
    w.run(1);
    assert.equal(V.scenery(e), '');
    assert.equal(V.offered(true), e);
    // System.json reactorVehicles.free: false.
    w.$dataSystem.reactorVehicles = { free: false };
    assert.equal(V.free(), false);
    assert.equal(V.scenery(e), 'free');
    assert.equal(V.offered(true), null);
    assert.equal(V.getOn(31), false);
    w.$dataSystem.reactorVehicles = {};
    assert.equal(V.offered(true), e);
    // A first person camera in force.
    w.$gameMap._reactorCamera3d = { mode: 'firstPerson' };
    assert.equal(V.scenery(e), 'firstPerson');
    assert.equal(V.offered(true), null);
    w.$gameMap._reactorCamera3d = { mode: 'thirdPerson' };
    assert.equal(V.scenery(e), '');
    // A 3D map that loops.
    w.$dataMap.scrollType = 3;
    assert.equal(V.scenery(e), 'loop');
    w.$dataMap.scrollType = 0;
    // A model whose file could not be read: scenery, and no error.
    const R = w.Reactor3D;
    R._glbCache[R.modelCacheKey(BIKE_MODEL, '.glb', 'test-bike')].failed = true;
    assert.equal(V.scenery(e), 'model');
    assert.equal(V.offered(true), null);
    R._glbCache[R.modelCacheKey(BIKE_MODEL, '.glb', 'test-bike')].failed = false;
    // A flat map.
    const flat = boardWorld({ flat: true, vehicles: [bike(31, 10, 10)] });
    flat.stand(11, 10, 4);
    flat.run(1);
    assert.equal(flat.V.isVehicle(flat.vehicle(31)), true, 'it is a vehicle, and it stands there');
    assert.equal(flat.V.scenery(flat.vehicle(31)), 'image', 'a flat vehicle needs a sprite');
    assert.equal(flat.V.offered(true), null);
    assert.equal(flat.V.getOn(31), false);
    // A preset is rideable by default; settings disable it.
    const later = boardWorld({ types: [null, motorcycle({ kind: 'tank' })], vehicles: [bike(31, 10, 10)] });
    if (later.Reactor3D.Vehicles && typeof later.Reactor3D.Vehicles.typeOf === 'function') {
        later.stand(11, 10, 4);
        later.run(1);
        assert.equal(later.V.scenery(later.vehicle(31)), '');
        assert.equal(later.V.offered(true), later.vehicle(31));
    }
});

test('a vehicle taken out of the world stays out across maps, and is put back by a location', () => {
    const w = world();
    const V = w.V;
    assert.equal(V.remove(31), true);
    assert.equal(w.vehicle(31)._erased, true);
    assert.equal(V.find(31), null);
    assert.equal(V.where(31), null);
    leaveAndReturn(w);
    assert.equal(w.vehicle(31)._erased, true);
    assert.equal(V.setLocation('1:31', 14, 12, 270), true);
    assert.equal(w.vehicle(31)._erased, false);
    assert.equal(V.isVehicle(w.vehicle(31)), true);
    assert.deepEqual([V.where(31).x, V.where(31).y, V.where(31).yaw], [14, 12, 270]);
    leaveAndReturn(w);
    assert.equal(w.vehicle(31)._erased, false);
    assert.deepEqual([w.vehicle(31)._realX, w.vehicle(31)._realY], [14, 12]);
});

test('setLocation is refused where the body does not fit, for the ridden vehicle and without a place', () => {
    const w = world({ events: [event(40, 30, 12)] });
    const V = w.V, e = w.vehicle(31);
    w.run(1);
    assert.equal(V.setLocation(31, 30, 13, 0), false, 'its body would lie over somebody');
    assert.equal(V.setLocation(31, 70, 12, 0), false, 'off the map');
    assert.equal(V.setLocation(31, 59, 12, 90), false, 'its nose over the border');
    assert.equal(V.setLocation(31, undefined, 12, 0), false);
    assert.equal(V.setLocation(31, '', '', 0), false, 'an empty string is no place');
    assert.equal(V.setLocation('nobody', 20, 12, 0), false);
    assert.deepEqual([e._realX, e._realY, e._rrFree], [10, 10, undefined], 'a refusal moves nothing');
    assert.equal(V.fits(e, 20, 12, 0), true);
    assert.deepEqual([e._x, e._y, e._realX, e._realY, e._direction], [10, 10, 10, 10, 2], 'asking moves nothing');
    assert.equal(V.fits(e, 70, 12, 0), false, 'off the map');
    assert.equal(V.fits(e, -1, 12, 0), false);
    // On a flat map only the map's own bounds say so.
    const flat = boardWorld({ flat: true, vehicles: [bike(31, 10, 10)] });
    assert.equal(flat.V.fits(flat.vehicle(31), 12, 12, 0), true);
    assert.equal(flat.V.fits(flat.vehicle(31), -1, 12, 0), false, 'off a flat map');
    assert.equal(flat.V.fits(flat.vehicle(31), 12, 99, 0), false);
    w.stand(11, 10, 4);
    w.board(31);
    assert.equal(V.setLocation(31, 20, 12, 0), false, 'the ridden vehicle is the player\'s to move');
    assert.equal(V.remove(31), false);
});

test('a save from before the feature: no registry, no fields, and a vehicle the map has since gained is there', () => {
    const w = world();
    // The save was made when event 31 was an ordinary event and nothing of this file existed.
    const e = w.vehicle(31);
    for (const key of Object.keys(e)) if (key.startsWith('_rr')) delete e[key];
    delete w.$gameMap._rrVehicles;
    w.saveAndLoad();
    const loaded = w.vehicle(31);
    assert.equal(loaded._rrVehicle, undefined);
    assert.equal(w.$gameMap._rrVehicles, undefined);
    // The map scene starts.
    assert.doesNotThrow(() => w.V.resume());
    assert.equal(loaded._rrVehicle, 1);
    assert.deepEqual(Array.from(loaded._rrHome), [10, 10, 180]);
    assert.deepEqual(Array.from(w.V.list()), [loaded]);
    w.stand(11, 10, 4);
    w.run(1);
    assert.equal(w.V.offered(true), loaded);
    assert.equal(w.board(31), true);
    assert.equal(w.$gamePlayer.isInVehicle(), true);
    // And an event the data no longer makes a vehicle is an ordinary event again.
    w.V.getOff({ instant: true });
    delete w.$dataMap.events[31].rrVehicle;
    w.V.resume();
    assert.equal(loaded._rrVehicle, 0);
    assert.equal(w.V.any(), false);
});
