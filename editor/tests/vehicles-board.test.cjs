'use strict';
// Getting on and off a vehicle (runtime/reactor_vehicles.js): which vehicle OK boards (the label is the truth),
// the two hops tick by tick, OK aboard to interact and Cancel to get off, the place to stand beside it, the followers'
// calls, the three plugin commands with their wait mode, and the script calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { boardWorld, bike, talker, motorcycle, event, page, DEG, BIKE_MODEL, hasDrive } = require('./helpers/vehicles-board-world.cjs');
const { runtimeSource, runtimeRoot } = require('./helpers/runtime-source.cjs');

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const driven = hasDrive && process.env.VEH_NO_DRIVE !== '1';
const needsDrive = driven ? false : 'needs runtime/reactor_vehicles_drive.js';
// The bike stands at (10, 10) facing south: its body is tiles (10, 9), (10, 10), (10, 11); its left is east.
const world = (extra = {}) => boardWorld(Object.assign({ width: 60, height: 30, vehicles: [bike(31, 10, 10, { yaw: 180 })] }, extra));
const command = (name, args) => ({ code: 357, indent: 0, parameters: ['RPGReactor', name, name, args] });
const END = { code: 0, indent: 0, parameters: [] };
const switchOn = id => ({ code: 121, indent: 0, parameters: [id, id, 0] });

/** The leader beside the bike presses OK; the frame of the press is tick 0 of the hop. */
function pressBeside(w, x = 11, y = 10, d = 4) {
    w.stand(x, y, d);
    w.run(1);
    w.press('ok');
    w.run(1);
}
/** Aboard and seated. */
function aboard(w) {
    pressBeside(w);
    w.run(w.V.HOP);
    assert.equal(w.$gamePlayer._rrMount, null);
    return w.$gamePlayer;
}

//-----------------------------------------------------------------------------
// The label's pick (4.1)

test('the pick: within reach of its body and faced; the one he faces of two; out of reach, none', () => {
    // A second bike lies east to west south of the first: its body is tiles (10, 13), (11, 13), (12, 13).
    const w = world({ vehicles: [bike(31, 10, 10, { yaw: 180 }), bike(32, 11, 13, { yaw: 90 })] });
    const V = w.V, a = w.vehicle(31), b = w.vehicle(32);
    w.run(1);
    // Beside its middle, facing it.
    w.stand(11, 10, 4);
    assert.equal(V.offered(true), a);
    // Beside its tail, a tile of its body is in reach.
    w.stand(11, 11, 4);
    assert.equal(V.offered(true), a);
    // Both in reach: the one he faces is picked, though the other is nearer.
    w.stand(11, 12, 2);
    assert.equal(V.offered(true), b, 'facing south, the one ahead of him');
    w.stand(11, 12, 4);
    assert.equal(V.offered(true), a, 'facing west, the first one, half a tile further off');
    // Faced by neither, the nearer answers.
    w.stand(11, 12, 6);
    assert.equal(V.offered(true), b);
    // A tile and a half off its body: out of reach.
    w.stand(7, 10, 6);
    assert.equal(V.offered(true), null);
    w.stand(8, 10, 6);
    assert.equal(V.offered(true), null, '1.5 tiles from its body');
    w.stand(9, 10, 6);
    assert.equal(V.offered(true), a);
    // From any side: north of its nose facing south, south of its tail facing north.
    w.stand(10, 12, 8);
    assert.equal(V.offered(true), a);
    w.stand(10, 8, 2);
    assert.equal(V.offered(true), a);
    // More than 75 degrees off his facing it is not faced, but with nothing else to act on it still answers.
    w.stand(11, 10, 6);
    assert.equal(V.offered(true), a, 'his back to it, and nothing else the press could do');
});

test('the pick: an NPC on the faced tile keeps the press, and so does anyone under the leader when he looks away', () => {
    // The grocer stands east of the leader, the bike west of him.
    const w = world({ events: [talker(40, 12, 10, 5)] });
    const V = w.V, e = w.vehicle(31), p = w.$gamePlayer;
    w.stand(11, 10, 6);
    w.run(1);
    assert.equal(V.offered(true), null, 'facing the grocer, OK is the grocer\'s');
    w.press('ok');
    w.run(3);
    assert.equal(w.$gameSwitches.value(5), true, 'OK talked to the grocer');
    assert.equal(p._vehicleType, 'walk');
    w.run(5);
    // He turns to the bike: OK boards.
    w.stand(11, 10, 4);
    w.run(1);
    assert.equal(V.offered(true), e);
    w.press('ok');
    w.run(1);
    assert.equal(p._vehicleType, 'reactor');
});

test('the pick: a big body that lies over the faced tile keeps the press too', () => {
    // Somebody three tiles long stands at (12, 9): the tile the leader faces, (12, 10), is a tile of that body and not its own.
    const w = world({ events: [talker(40, 12, 9, 5)], sidecar: { eventSize: { 40: [1, 3] } } });
    const V = w.V;
    w.run(1);
    assert.equal(w.vehicle(40).pos(12, 10), true);
    w.stand(11, 10, 6);
    w.run(1);
    assert.equal(V.offered(true), null, 'facing a tile of that body, OK is that event\'s');
    w.press('ok');
    w.run(3);
    assert.equal(w.$gameSwitches.value(5), true);
    w.stand(11, 10, 4);
    w.run(8);
    assert.equal(V.offered(true), w.vehicle(31));
    // Which bodies are more than a tile is looked up again every BODIES ticks: a body that grows is seen then.
    const g = world({ events: [talker(40, 12, 9, 5)] });
    g.stand(11, 10, 6);
    g.run(1);
    assert.equal(g.V.offered(true), g.vehicle(31), 'one tile at (12, 9): the faced tile is free, and the bike answers');
    g.$dataMap.reactor3d.eventSize = { 40: [1, 3] };
    g.run(g.V.BODIES + 1);
    assert.equal(g.vehicle(40).pos(12, 10), true);
    assert.equal(g.V.offered(true), null);
});

test('the pick: not faced, an event under the leader or a door beside him keeps the press', () => {
    const under = event(41, 11, 10, { pages: [page({ priorityType: 0, trigger: 0, list: [switchOn(6), END] })] });
    const w = world({ events: [under] });
    const V = w.V;
    w.stand(11, 10, 6);
    w.run(1);
    assert.equal(V.offered(true), null, 'the press is for what he stands on');
    w.stand(11, 10, 4);
    assert.equal(V.offered(true), w.vehicle(31), 'faced, the vehicle is what the label shows');
    // A counter passes the stock reach on: someone behind it keeps the press too.
    const counter = world({ events: [talker(42, 13, 10, 5)] });
    counter.$gameMap.isCounter = (x, y) => x === 12 && y === 10;
    counter.stand(11, 10, 6);
    counter.run(1);
    assert.equal(counter.V.offered(true), null);
    // A door beside him.
    const door = world();
    door.Reactor3D.doorAt = (map, x, y) => (x === 12 && y === 10 ? { id: 1 } : null);
    door.stand(11, 10, 6);
    door.run(1);
    assert.equal(door.V.offered(true), null, 'not faced, a door takes the press');
    door.stand(11, 10, 4);
    assert.equal(door.V.offered(true), door.vehicle(31));
});

test('the pick: no label for a command vehicle, during an event, a message, a jump, a swim or a climb', () => {
    const w = world({ vehicles: [bike(31, 10, 10, { yaw: 180, board: 'command' })] });
    w.stand(11, 10, 4);
    w.run(1);
    assert.equal(w.V.offered(true), null, 'board: "command" shows none');
    assert.equal(w.V.prompt(), null);
    const v = world();
    const V = v.V, p = v.$gamePlayer, e = v.vehicle(31);
    v.stand(11, 10, 4);
    v.run(1);
    assert.equal(V.offered(true), e);
    // A message.
    v.$gameMessage.add('Hello');
    assert.equal(V.offered(), null, 'gone the moment a message is open');
    assert.equal(V.prompt(), null);
    v.$gameMessage.clear();
    assert.equal(V.offered(), e);
    // An event running.
    v.$gameMap._interpreter.setup([{ code: 230, indent: 0, parameters: [30] }, END], 0);
    assert.equal(V.offered(), null, 'gone while an event runs');
    v.$gameMap._interpreter.clear();
    // In the air, swimming, on a ladder.
    p._reactorAir = 0.6; p._reactorVz = 0.01;
    assert.equal(V.offered(true), null);
    p._reactorAir = 0; p._reactorVz = 0;
    p._reactorSwim = true;
    assert.equal(V.offered(true), null);
    p._reactorSwim = false;
    p._reactorOnLadder = true;
    assert.equal(V.offered(true), null);
    p._reactorOnLadder = false;
    p._reactorMantle = true;
    assert.equal(V.offered(true), null, 'none while he pulls himself up a ledge');
    p._reactorMantle = false;
    assert.equal(V.offered(true), e);
    // A map that loops, and a first person view: this version rides no vehicle there, so the label shows none.
    v.$dataMap.scrollType = 3;
    assert.equal(V.offered(true), null, 'none on a map that loops');
    v.$dataMap.scrollType = 0;
    v.$gameMap._reactorCamera3d = { mode: 'firstPerson' };
    assert.equal(V.offered(true), null, 'none in first person');
    v.$gameMap._reactorCamera3d = { mode: 'thirdPerson' };
    assert.equal(V.offered(true), e);
    // More than a tile and a half over or under it.
    p._reactorGround = 2;
    assert.equal(V.offered(true), null);
});

test('a quick turn to someone and OK is his: the press and the click look afresh, whatever the label last showed', () => {
    // The grocer stands east of the leader, the bike west of him; the label is asked every drawn frame, as the hints ask.
    const w = world({ events: [talker(40, 12, 10, 5)] });
    const p = w.$gamePlayer, V = w.V, e = w.vehicle(31);
    for (const gap of [0, 1, 2, 3, 5]) {
        w.$gameSwitches.setValue(5, false);
        w.stand(11, 10, 4);
        for (let i = 0; i < 13; i++) { V.prompt(); w.run(1); }
        assert.equal(V.prompt().event, e, 'facing the bike, the label is the bike\'s');
        // He turns to the grocer and presses `gap` ticks later: inside the six ticks a look is kept for.
        p._direction = 6; p._reactorDir8 = 6;
        for (let i = 0; i < gap; i++) { V.prompt(); w.run(1); }
        w.press('ok');
        w.run(1);
        w.run(3);
        assert.equal(p._vehicleType, 'walk', 'OK ' + gap + ' ticks after the turn does not board the bike behind him');
        assert.equal(w.$gameSwitches.value(5), true, 'OK ' + gap + ' ticks after the turn talks to the grocer');
        w.run(5);
    }
    // The same turn and a click on a tile of the bike: the click is not the bike's either.
    w.stand(11, 10, 4);
    for (let i = 0; i < 13; i++) { V.prompt(); w.run(1); }
    p._direction = 6; p._reactorDir8 = 6;
    w.$gameTemp.setDestination(10, 10);
    w.TouchInput.isTriggered = () => true;
    p.triggerTouchAction();
    w.TouchInput.isTriggered = () => false;
    assert.equal(p._vehicleType, 'walk');
    // And the other way: he turns from the grocer to the bike and presses at once, before the label has looked again.
    w.$gameTemp.clearDestination();
    w.stand(11, 10, 6);
    for (let i = 0; i < 13; i++) { V.prompt(); w.run(1); }
    assert.equal(V.prompt(), null, 'facing the grocer there is no label');
    p._direction = 4; p._reactorDir8 = 4;
    w.press('ok');
    w.run(1);
    assert.equal(p._vehicleType, 'reactor', 'the press is for what he faces now');
});

test('the look is every sixth tick, kept in between, and a map with no vehicle looks at nothing', () => {
    // Three vehicles in reach of the leader, a fourth 28 tiles away, and somebody three tiles long 20 tiles away.
    // One event is numbered as a map's props are, from 10000 up (North Haven's go to 10026): the map's own array of
    // events then has ten thousand empty slots, and anything that walks it by index pays for each of them.
    const w = world({ vehicles: [bike(31, 10, 10, { yaw: 180 }), bike(32, 12, 12, { yaw: 180 }), bike(33, 12, 8, { yaw: 180 }), bike(34, 38, 20, { yaw: 180 })],
        events: [talker(40, 30, 20, 5), event(10004, 50, 25)], sidecar: { eventSize: { 40: [3, 3] } } });
    const V = w.V, R = w.Reactor3D;
    assert.ok(w.$gameMap._events.length > 10000 && w.$gameMap.events().length === 6);
    w.stand(11, 10, 4);
    w.run(2);
    let bodies = 0, farBodies = 0;
    const eventBody = R.eventBody;
    R.eventBody = function(character) { if (character._rrVehicle) { bodies++; if (character._eventId === 34) farBodies++; } return eventBody.call(this, character); };
    for (let i = 0; i < 60; i++) { V.prompt(); w.run(1); }
    R.eventBody = eventBody;
    assert.ok(bodies > 0 && bodies <= 12 * 3, bodies + ' body reads in 60 ticks of a label that is asked every tick');
    assert.ok(farBodies <= 1, 'a vehicle too far for any part of it to be in reach is asked for its body by no look (' + farBodies + ' reads: the look-up of big bodies, every ' + V.BODIES + ' ticks)');
    // Between two looks, asking lists the map's events at no time; a look with a vehicle in reach lists them once.
    // Neither asks the map whether an event is starting (which goes through them all).
    let lists = 0, starting = 0;
    const eventsOf = w.$gameMap.events, runningOf = w.$gameMap.isEventRunning;
    V.offered(true);
    w.$gameMap.events = function() { lists++; return eventsOf.call(this); };
    w.$gameMap.isEventRunning = function() { starting++; return runningOf.call(this); };
    for (let i = 0; i < 60; i++) { V.prompt(); V.offered(); }
    assert.deepEqual([lists, starting], [0, 0], 'the map\'s event list was made ' + lists + ' times in 120 asks between looks');
    for (let i = 0; i < 60; i++) V.offered(true);
    assert.deepEqual([lists, starting], [60, 0], 'sixty looks listed the map\'s events ' + lists + ' times');
    // With no vehicle in reach a look lists nothing.
    w.stand(25, 25, 4);
    for (let i = 0; i < 60; i++) V.offered(true);
    assert.equal(lists, 60, 'far from every vehicle a look lists nothing');
    w.stand(11, 10, 4);
    w.$gameMap.events = eventsOf;
    w.$gameMap.isEventRunning = runningOf;
    // The cost of one look with three vehicles in reach, and of a tick between two looks: the best of many short
    // batches, so the other tests running beside this one do not decide it. (In this test's world every read of a
    // game global costs about a tenth of a microsecond, which a browser does not pay: the game itself measured 0.9
    // to 1.3 microseconds for a look repeated in a frame on North Haven with one motorcycle in reach, and a median
    // of 18.5 to 28.3 for the first thing asked in a frame, of which 11 to 12 are the engine's own check of the
    // model's body.) The numbers are printed. What fails the test is a look that has become several times dearer
    // than it is, measured against the engine's own question of who stands on one tile (`$gameMap.eventsXy`),
    // taken the same way at the same moment: a busy machine slows both alike. With the map's own array of events
    // walked by index the look costs about 150 microseconds here, 25 times that question.
    const best = fn => {
        for (let i = 0; i < 3000; i++) fn();
        let least = Infinity;
        for (let batch = 0; batch < 40; batch++) {
            const rounds = 1000, t0 = process.hrtime.bigint();
            for (let i = 0; i < rounds; i++) fn();
            least = Math.min(least, Number(process.hrtime.bigint() - t0) / 1000 / rounds);
        }
        return least;
    };
    const look = best(() => V.offered(true)), reference = best(() => w.$gameMap.eventsXy(11, 10)), between = best(() => V.offered());
    // The first look of a frame, which is what a tick pays: every body is read again for the frame.
    const firsts = [];
    for (let i = 0; i < 400; i++) { w.run(1); const t0 = process.hrtime.bigint(); V.offered(true); firsts.push(Number(process.hrtime.bigint() - t0) / 1000); }
    firsts.sort((x, y) => x - y);
    const first = firsts[40];
    console.log('# vehicles: one look for the label with three vehicles in reach: ' + first.toFixed(2) + ' microseconds as the first of its frame (the fastest tenth), ' + look.toFixed(2) + ' repeated in a frame; a tick between two looks: ' + between.toFixed(2));
    assert.ok(look < reference * 6, 'a look costs ' + look.toFixed(2) + ' microseconds, ' + (look / reference).toFixed(1) + ' times one eventsXy (it is under three)');
    assert.ok(between < look / 4, 'a tick between looks costs ' + between.toFixed(2) + ' microseconds against ' + look.toFixed(2) + ' for a look');
    assert.ok(first < look * 6, 'the first look of a frame costs ' + first.toFixed(2) + ' microseconds against ' + look.toFixed(2) + ' repeated');
    // And what a look asks of the map: no event is asked where it is but a body bigger than a tile that is near
    // enough to the faced tile for a tile of it to lie there. The one on this map is 20 tiles off.
    let places = 0, counters = 0;
    const pos = w.Game_Event.prototype.pos, isCounter = w.$gameMap.isCounter;
    w.Game_Event.prototype.pos = function(x, y) { places++; return pos.call(this, x, y); };
    w.$gameMap.isCounter = function(x, y) { counters++; return isCounter.call(this, x, y); };
    for (let i = 0; i < 60; i++) V.offered(true);
    w.$gameMap.isCounter = isCounter;
    assert.equal(places, 0, 'sixty looks ask no event where it is');
    assert.equal(counters, 0, 'nor the map whether the faced tile is a counter, with nobody standing past it (the map makes a list to answer)');
    // Brought beside the faced tile it is asked, once a look.
    w.vehicle(40).locate(8, 12);
    w.run(V.BODIES + 1);
    places = 0;
    for (let i = 0; i < 60; i++) V.offered(true);
    w.Game_Event.prototype.pos = pos;
    assert.ok(places >= 60 && places <= 120, 'near the faced tile the big body is asked: ' + places + ' times in sixty looks');
    // Taken out of the map's events by other code, it is not asked any more, though the list of big bodies is not looked up yet.
    w.Game_Event.prototype.pos = function(x, y) { places++; return pos.call(this, x, y); };
    delete w.$gameMap._events[40];
    places = 0;
    for (let i = 0; i < 60; i++) V.offered(true);
    w.Game_Event.prototype.pos = pos;
    assert.equal(places, 0, 'one that has left the map is not asked where it is');
    // A map with no vehicle event: the list is empty and nothing is asked of the map.
    const none = boardWorld({ types: [null, motorcycle()], vehicles: [] });
    let asked = 0;
    const running = none.$gameMap._interpreter.isRunning, busy = none.$gameMessage.isBusy, isMap3D = none.Reactor3D.isMap3D;
    none.$gameMap._interpreter.isRunning = function() { asked++; return running.call(this); };
    none.$gameMessage.isBusy = function() { asked++; return busy.call(this); };
    none.Reactor3D.isMap3D = function(data) { asked++; return isMap3D.call(this, data); };
    for (let i = 0; i < 100; i++) { none.V.offered(true); none.V.prompt(); }
    assert.equal(asked, 0, 'neither the interpreter, the message nor the map is asked anything');
    assert.equal(none.V.any(), false);
});

//-----------------------------------------------------------------------------
// Getting on (4.2)

for (const [side, x, y, d] of [['its left', 11, 10, 4], ['its right', 9, 10, 6], ['behind it', 10, 8, 2], ['ahead of it', 10, 12, 8]]) {
    test('boarding from ' + side + ': aboard at tick 14, held from tick 0 to 13', () => {
        const w = world({ action: true });
        const p = w.$gamePlayer, e = w.vehicle(31);
        // The stock function, as the file ships it, under every wrapper.
        const stock = vm.runInContext('(' + runtimeSource('reactor_objects.js').match(/Game_Player\.prototype\.canMove = (function\(\) \{[\s\S]*?\n\});/)[1] + ')', w);
        let got = 0;
        e.getOn = function() { got++; return w.Game_Event.prototype.getOn.call(this); };
        // The strip's owner is told when the party is seated.
        const told = [];
        w.V.Hints = { note(name) { told.push(name); } };
        w.stand(x, y, d);
        w.run(1);
        assert.equal(w.V.offered(true), e);
        assert.equal(p.canMove(), true);
        w.press('ok');
        w.run(1);
        // Tick 0.
        assert.equal(p._vehicleType, 'reactor');
        assert.deepEqual(JSON.parse(JSON.stringify(p._rrRide)), { map: 1, id: 31 });
        assert.deepEqual([p._rrSeated, p._rrFree, p._x, p._y], [true, 1, 10, 10]);
        assert.deepEqual([p._realX, p._realY], [x, y], 'he has not moved yet');
        assert.deepEqual([e._rrBoarded, e._rrFree, e._through, e._realX, e._realY], [true, 1, false, 10, 10], 'the vehicle stays where it is, solid');
        assert.deepEqual([p._vehicleGettingOn, p._vehicleGettingOff], [false, false]);
        const from = Math.hypot(x - 10, y - 10);
        for (let tick = 0; tick < w.V.HOP; tick++) {
            assert.equal(p._rrMount.t, tick);
            assert.equal(p.isInVehicle(), true);
            assert.equal(p.vehicle().canMove(), false, 'tick ' + tick);
            assert.equal(p.canMove(), false, 'every wrapper, tick ' + tick);
            assert.equal(stock.call(p), false, 'the stock function, tick ' + tick);
            if (tick === 7) {
                const left = Math.hypot(p._realX - 10, p._realY - 10);
                assert.ok(left > 0.05 && left < from - 0.05, 'half way he is between where he stood and the saddle: ' + left);
            }
            assert.equal(got, 0, 'the ride has not begun');
            assert.deepEqual(told, []);
            w.run(1);
        }
        // Tick 14: seated.
        assert.equal(p._rrMount, null);
        assert.deepEqual([p._realX, p._realY, p._x, p._y], [10, 10, 10, 10]);
        assert.deepEqual([p._direction, p._reactorDir8], [2, 2], 'he faces as the vehicle does');
        assert.deepEqual([e._rrFree, e._through, e._rrBoarded], [2, true, true], 'the vehicle is carried, and walked through');
        assert.equal(p.vehicle().canMove(), true);
        assert.equal(p.canMove(), true);
        assert.equal(stock.call(p), true);
        assert.equal(got, 1, 'getOn() ran once');
        assert.deepEqual(w.sounds, ['start']);
        assert.deepEqual(told, ['boarded'], 'the hint strip is asked for as he sits down');
        w.run(30);
        assert.equal(got, 1);
        assert.deepEqual(w.sounds, ['start']);
        assert.deepEqual(told, ['boarded']);
    });
}

test('the Action driver\'s own copy of canMove asks the vehicle, as the stock function does', () => {
    const source = fs.readFileSync(path.join(runtimeRoot, 'reactor_fight_action.js'), 'utf8');
    const copy = source.slice(source.indexOf('Game_Player.prototype.canMove = function() {'));
    assert.match(copy.slice(0, 900), /this\.isInVehicle\(\) && !this\.vehicle\(\)\.canMove\(\)/);
});

test('settle() at tick 5 leaves the state of tick 14', () => {
    const w = world();
    const p = w.$gamePlayer, e = w.vehicle(31);
    let got = 0;
    w.ReactorEvents.on('vehicleGetOn', () => got++);
    pressBeside(w);
    w.run(5);
    assert.equal(p._rrMount.t, 5);
    w.V.settle();
    assert.equal(p._rrMount, null);
    assert.deepEqual([p._realX, p._realY, e._rrFree, e._through, p._rrSeated], [10, 10, 2, true, true]);
    assert.equal(got, 1);
    assert.equal(p.canMove(), true);
    w.V.settle();
    assert.equal(got, 1, 'with no hop it does nothing');
    // And a hop off: on foot on its tile.
    w.press('cancel');
    w.run(1);
    w.run(3);
    assert.equal(p._rrMount.on, false);
    w.V.settle();
    assert.deepEqual([p._vehicleType, p._x, p._y, p._realX, p._realY, p._rrMount], ['walk', 11, 10, 11, 10, null]);
});

test('throttle held at tick 5 moves the bike from tick 14', { skip: needsDrive }, () => {
    const w = world();
    const p = w.$gamePlayer;
    w.$gameMap._reactorCamera3d = { mode: 'thirdPerson' };
    pressBeside(w);
    w.run(5);
    w.keys.up = true;
    w.run(w.V.HOP - 5 - 1);
    assert.deepEqual([p._realX, p._realY], [p._realX, p._realY]);
    assert.ok(p._rrMount && p._rrMount.t === w.V.HOP - 1);
    const y = 10;
    w.run(1);
    assert.equal(p._rrMount, null);
    assert.equal(p._realY, y, 'seated on the vehicle\'s place');
    w.run(12);
    assert.ok(w.V.speed() > 0.5, 'the key held through the hop acts: ' + w.V.speed());
    assert.ok(p._realY > y, 'and the bike has moved south: ' + p._realY);
    assert.deepEqual([w.vehicle(31)._realX, w.vehicle(31)._realY], [p._realX, p._realY], 'the vehicle goes with the player');
});

test('the rider nobody can draw is hidden aboard and shown again on leaving', () => {
    // A leader with no 3D model.
    const w = world();
    const p = aboard(w);
    assert.equal(p._transparent, true);
    assert.deepEqual(JSON.parse(JSON.stringify(p._rrWas)), { speed: 4, transparent: false });
    w.press('cancel');
    w.run(1);
    assert.equal(p._transparent, false, 'he is seen from the first tick of the hop off');
    // A leader with a model sits in view.
    const m = world({ prepare(map, ctx) { ctx.Reactor3D._databaseSidecar = { actors: { 1: { name: 'Actors/hero', file: 'hero', ext: '.glb', size: 3 } } }; } });
    const q = aboard(m);
    assert.equal(q._transparent, false);
    // A type whose rider is inside hides him whatever he is.
    const inside = world({ types: [null, motorcycle({ rider: 'inside' })], prepare(map, ctx) { ctx.Reactor3D._databaseSidecar = { actors: { 1: { name: 'Actors/hero', file: 'hero', ext: '.glb', size: 3 } } }; } });
    assert.equal(aboard(inside)._transparent, true);
});

test('the player\'s move speed and look come back as they were, not as the stock flow leaves them', () => {
    const w = world();
    const p = w.$gamePlayer;
    p.setMoveSpeed(5);
    aboard(w);
    assert.equal(w.V.getOff({ instant: true }), true);
    assert.equal(p._moveSpeed, 5, '5 stays 5');
    assert.equal(p.isThrough(), false);
});

//-----------------------------------------------------------------------------
// Confirm aboard, and Cancel to get off (4.3)

// Use the real map menu methods so Escape's shared Cancel/Menu meaning is exercised with the riding hooks.
const mapScenes = runtimeSource('reactor_scenes.js');
function menuWorld(extra = {}) {
    return world(Object.assign({}, extra, { before(ctx) {
        vm.runInContext(`function Scene_Map() { this.menuCalling = false; this.opened = 0; }
            Scene_Map.prototype.start = function() {};
            Scene_Map.prototype.isMenuEnabled = function() { return true; };
            Scene_Map.prototype.callMenu = function() { this.opened++; };
            ${['updateCallMenu', 'isMenuCalled'].map(name => {
                const start = mapScenes.indexOf(`Scene_Map.prototype.${name} = function()`);
                assert.ok(start >= 0, name);
                return mapScenes.slice(start, mapScenes.indexOf('\n};', start) + 3);
            }).join('\n')}`, ctx);
    }}));
}

test('Cancel owns the shared menu press while riding; after dismount the next press opens the menu', () => {
    const w = menuWorld();
    const p = aboard(w), scene = new w.Scene_Map();
    w.pressed = { cancel: true, menu: true }; // Escape answers to both; a remapped Cancel answers to cancel alone.
    w.run(1);
    scene.menuCalling = true; // Even a previously queued menu request must not survive this press.
    scene.updateCallMenu();
    assert.equal(scene.opened, 0);
    assert.equal(scene.menuCalling, false);
    assert.equal(p._rrMount.on, false);
    w.run(w.V.HOP - 1);
    w.pressed = { cancel: true, menu: true };
    w.run(1); // A second press on the last dismount tick still belongs to the vehicle.
    assert.equal(p._vehicleType, 'walk');
    scene.updateCallMenu();
    assert.equal(scene.opened, 0);
    w.run(1);
    w.pressed = { cancel: true, menu: true };
    scene.updateCallMenu();
    assert.equal(scene.opened, 1, 'the menu works normally on foot');
});

test('a separate Menu button still opens the menu aboard; Cancel during a message does not dismount', () => {
    const w = menuWorld();
    const p = aboard(w), scene = new w.Scene_Map();
    w.pressed = { menu: true };
    scene.updateCallMenu();
    assert.equal(scene.opened, 1, 'a dedicated Menu binding keeps its purpose');
    w.$gameMessage.setChoices(['Wait.'], 0, 0);
    w.press('cancel');
    w.run(1);
    scene.updateCallMenu();
    assert.equal(p._rrMount, null);
    assert.equal(p._rrDrive.leave, '', 'Cancel belongs to the message while it is busy');
    assert.equal(scene.opened, 1);
});

test('touch Cancel dismounts once, and a blocked dismount consumes Escape without opening the menu', () => {
    const w = menuWorld();
    const p = aboard(w), scene = new w.Scene_Map();
    w.TouchInput.isCancelled = () => true;
    w.run(1);
    scene.updateCallMenu();
    assert.equal(p._rrMount.on, false);
    assert.equal(scene.opened, 0);
    w.TouchInput.isCancelled = () => false;
    w.run(w.V.HOP);
    const blocked = menuWorld({ events: [[11, 10], [9, 10], [10, 7], [10, 13]].map((at, i) => event(50 + i, at[0], at[1])) });
    const q = aboard(blocked), blockedScene = new blocked.Scene_Map();
    blocked.pressed = { cancel: true, menu: true };
    blocked.run(1);
    blockedScene.updateCallMenu();
    assert.equal(q._vehicleType, 'reactor');
    assert.equal(q._rrMount, null);
    assert.equal(blocked.buzzes, 1, 'one landing attempt per press');
    assert.equal(blockedScene.opened, 0);
    assert.equal(blocked.V.prompt().word, 'No room to get off here');
});

test('Cancel is read while a vehicle is still taking a tile step', () => {
    const w = world();
    const p = aboard(w);
    p.processMoveCommand({ code: 1, parameters: [] });
    assert.equal(p.isMoving(), true);
    w.press('cancel');
    w.run(1);
    assert.ok(p._rrMount || p._rrDrive.leave === 'ok', 'the request does not depend on the nonmoving action update');
});

test('OK aboard beside an NPC three tiles ahead of the bike\'s middle starts his event, and the party stays aboard', () => {
    const w = world({ events: [talker(40, 10, 13, 5)] });
    const p = aboard(w);
    w.press('ok');
    w.run(3);
    assert.equal(w.$gameSwitches.value(5), true);
    assert.equal(p._vehicleType, 'reactor');
    assert.equal(p._rrMount, null);
    assert.equal(p._rrDrive.leave, '', 'that was the press: nobody gets off');
    // Four tiles ahead is out of the reach (half its length and a tile and a half).
    const far = world({ events: [talker(40, 10, 14, 5)] });
    aboard(far);
    far.press('ok');
    far.run(3);
    assert.equal(far.$gameSwitches.value(5), false);
    assert.equal(far.$gamePlayer._rrMount, null, 'with nobody to act on, OK keeps the party aboard');
    // While an event runs nobody is started from the saddle, as nobody is on foot: the running event is not cut short.
    far.V.settle();
    far.stand(11, 10, 4);
    far.board(31);
    far.vehicle(40).locate(10, 13);
    far.$gameMap._interpreter.setup([{ code: 230, indent: 0, parameters: [20] }, switchOn(6), END], 0);
    far.run(2);
    far.pressed = { ok: true };
    far.$gamePlayer.triggerButtonAction();
    far.pressed = {};
    far.run(40);
    assert.equal(far.$gameSwitches.value(5), false, 'the man in reach was not started');
    assert.equal(far.$gameSwitches.value(6), true, 'and the event that ran went on to its end');
});

test('OK aboard reaches the same tiles whichever way the vehicle heads: three ahead of a bike 2.9 long, two to either side', () => {
    // The Demo's motorcycle is drawn 2.9 tiles long: its reach ahead is 2.95 tiles from its middle, and the tile three
    // ahead begins 2.5 tiles from it on every heading.
    const types = [null, motorcycle({ model: { name: BIKE_MODEL, file: 'test-bike', size: 2.9 } })];
    const w = boardWorld({ width: 60, height: 40, types, vehicles: [bike(31, 20, 20, { yaw: 0 })], events: [talker(40, 5, 5, 5)] });
    const V = w.V, p = w.$gamePlayer, npc = w.vehicle(40);
    w.stand(30, 30, 2);
    /** The bike parked on (20, 20) at a heading, with nobody near it. */
    const head = yaw => {
        V.settle();
        if (p._vehicleType === 'reactor') assert.equal(V.getOff({ instant: true }), true);
        npc.locate(5, 5);
        w.stand(30, 30, 2);
        assert.equal(V.setLocation(31, 20, 20, yaw), true);
    };
    /** Whether OK from the saddle, stopped, talks to somebody (dx, dy) tiles from the bike's middle. */
    const talks = (dx, dy) => {
        V.settle();
        if (p._vehicleType !== 'reactor') assert.equal(V.getOn(31, { instant: true }), true);
        npc.locate(20 + dx, 20 + dy);
        w.$gameSwitches.setValue(5, false);
        w.run(2);
        w.press('ok');
        w.run(1);
        w.run(3);
        return w.$gameSwitches.value(5);
    };
    for (const [name, yaw, fx, fy] of [['north', 0, 0, -1], ['east', 90, 1, 0], ['south', 180, 0, 1], ['west', 270, -1, 0]]) {
        head(yaw);
        assert.equal(talks(fx * 2, fy * 2), true, 'heading ' + name + ', two tiles ahead of its middle');
        assert.equal(talks(fx * 3, fy * 3), true, 'heading ' + name + ', three tiles ahead of its middle');
        assert.equal(p._vehicleType === 'reactor' && !p._rrMount, true, 'and the party stays aboard');
        assert.equal(talks(fx * 4, fy * 4), false, 'heading ' + name + ', four tiles ahead is out of reach');
        assert.equal(p._vehicleType === 'reactor' && !p._rrMount, true, 'with nobody in reach OK keeps the party aboard');
        // Its left is (fy, -fx) and its right (-fy, fx).
        for (const [side, k] of [['left', 1], ['right', -1]]) {
            assert.equal(talks(fy * k, -fx * k), true, 'heading ' + name + ', one tile to its ' + side);
            assert.equal(talks(fy * k * 2, -fx * k * 2), true, 'heading ' + name + ', two tiles to its ' + side + ' (that tile begins a tile and a half from its middle)');
            assert.equal(talks(fy * k * 3, -fx * k * 3), false, 'heading ' + name + ', three tiles to its ' + side);
        }
    }
    // By distance, not by counting tiles: with its middle 0.03 of a tile past a tile's west edge, the third tile west
    // begins 2.03 tiles from it and the third tile east 2.97, which is past its reach of 2.95.
    const off = (yaw, x, y) => {
        V.settle();
        if (p._vehicleType === 'reactor') assert.equal(V.getOff({ instant: true }), true);
        npc.locate(5, 5);
        w.stand(30, 30, 2);
        assert.equal(V.setLocation(31, x, y, yaw), true);
    };
    off(270, 19.53, 20);
    assert.equal(talks(-3, 0), true, 'heading west from (20.03, 20.5): the third tile west');
    assert.equal(talks(-4, 0), false);
    off(90, 19.53, 20);
    assert.equal(talks(2, 0), true, 'heading east from there: the second tile east');
    assert.equal(talks(3, 0), false, 'and not the third, which begins 2.97 tiles from its middle');
    off(0, 20, 19.53);
    assert.equal(talks(0, -3), true, 'heading north from (20.5, 20.03): the third tile north');
    assert.equal(talks(0, -4), false);
    off(180, 20, 19.53);
    assert.equal(talks(0, 2), true, 'heading south from there: the second tile south');
    assert.equal(talks(0, 3), false);
    // Between the four: the second tile along its line and not the third.
    for (const [name, yaw, sx, sy] of [['north-east', 45, 1, -1], ['south-east', 135, 1, 1], ['south-west', 225, -1, 1], ['north-west', 315, -1, -1]]) {
        head(yaw);
        assert.equal(talks(sx * 2, sy * 2), true, 'heading ' + name + ', two tiles along its line');
        assert.equal(talks(sx * 3, sy * 3), false, 'heading ' + name + ', three tiles along its line is out of reach');
    }
});

test('OK aboard: a counter on the last tile in reach passes the reach on by one tile', () => {
    // Somebody four tiles ahead of the bike's middle is out of its reach; behind a counter three tiles ahead he is in it.
    const w = world({ events: [talker(40, 10, 14, 5)] });
    const p = aboard(w), npc = w.vehicle(40);
    /** Whether OK from the saddle talks to him where he stands, with counters on those tiles ahead. */
    const talks = (y, counters) => {
        w.V.settle();
        if (p._vehicleType !== 'reactor') assert.equal(w.V.getOn(31, { instant: true }), true);
        npc.locate(10, y);
        w.$gameMap.isCounter = (cx, cy) => cx === 10 && counters.includes(cy);
        w.$gameSwitches.setValue(5, false);
        w.run(2);
        w.press('ok');
        w.run(1);
        w.run(3);
        return w.$gameSwitches.value(5);
    };
    assert.equal(talks(14, []), false, 'four tiles ahead, nothing between');
    assert.equal(talks(14, [13]), true, 'over a counter on the third tile');
    assert.equal(p._vehicleType, 'reactor');
    assert.equal(p._rrMount, null);
    assert.equal(talks(15, [13, 14]), false, 'once: two tiles past the counter nobody is reached');
    assert.equal(talks(14, [12]), false, 'a counter nearer than the last tile in reach adds nothing');
});

test('OK aboard: stopped with an NPC one tile to the side starts his event; at speed it does not', () => {
    const w = world({ events: [talker(40, 9, 10, 5)] });
    const p = aboard(w);
    w.press('ok');
    w.run(3);
    assert.equal(w.$gameSwitches.value(5), true, 'pulled up beside him, the rider talks to him');
    assert.equal(p._vehicleType, 'reactor');
    // The reach to the sides is for a rider who has stopped.
    const fast = world({ events: [talker(40, 9, 10, 5)], drive: false });
    const q = aboard(fast);
    q._rrDrive.v = 12;
    fast.press('ok');
    fast.run(3);
    assert.equal(fast.$gameSwitches.value(5), false);
    assert.equal(q._rrDrive.leave, '', 'Confirm does not request getting off');
});

test('OK aboard never starts the ridden vehicle\'s own page, and an event under its middle is acted on first', () => {
    // A vehicle whose own page lies below the characters, as an event under the party does.
    const below = bike(31, 10, 10, { yaw: 180 });
    below.pages[0] = page({ priorityType: 0, trigger: 0, list: [switchOn(7), END] });
    const b = world({ vehicles: [below] });
    const rider = b.$gamePlayer;
    b.stand(11, 10, 4);
    assert.equal(b.board(31), true);
    b.press('ok');
    b.run(3);
    assert.equal(b.$gameSwitches.value(7), false, 'its own page is not what the press is for');
    assert.equal(rider._rrMount, null, 'with nobody else to act on, the party stays aboard');
    const own = bike(31, 10, 10, { yaw: 180 });
    own.pages[0].list = [switchOn(7), END];
    const under = event(41, 10, 10, { pages: [page({ priorityType: 0, trigger: 0, list: [switchOn(6), END] })] });
    const w = world({ vehicles: [own], events: [under] });
    const p = aboard(w);
    w.press('ok');
    w.run(3);
    assert.equal(w.$gameSwitches.value(6), true, 'the event under the vehicle\'s middle');
    assert.equal(w.$gameSwitches.value(7), false, 'never its own');
    assert.equal(p._vehicleType, 'reactor');
});

test('Cancel aboard at a standstill: off to its left, a hop of 14 ticks, still aboard until the last', () => {
    const w = world();
    const p = aboard(w), e = w.vehicle(31);
    let off = 0, counts = 0;
    e.getOff = function() { off++; return w.Game_Event.prototype.getOff.call(this); };
    const makeEncounterCount = p.makeEncounterCount;
    p.makeEncounterCount = function() { counts++; return makeEncounterCount.call(this); };
    const events = [];
    w.ReactorEvents.on('vehicleGetOff', payload => events.push(payload.vehicle + '/' + payload.type + '/' + payload.eventId));
    w.press('cancel');
    w.run(1);
    // Tick 0 of the hop off: the vehicle is parked first, and the player's tile is the spot from now.
    assert.deepEqual([e._rrFree, e._through, e._x, e._y], [1, false, 10, 10], 'parked: solid again');
    assert.deepEqual([p._x, p._y], [11, 10], 'the tile on its left');
    assert.deepEqual(JSON.parse(JSON.stringify(w.$gameMap._rrVehicles.at['1:31'])), { map: 1, x: 10, y: 10, z: 0, yaw: 180, type: 1, home: [10, 10] });
    for (let tick = 0; tick < w.V.HOP; tick++) {
        assert.equal(p._rrMount.t, tick);
        assert.equal(p.isInVehicle(), true, 'aboard at tick ' + tick);
        assert.equal(p._vehicleType, 'reactor');
        assert.equal(p.canMove(), false);
        assert.deepEqual([off, counts], [0, 0]);
        w.run(1);
    }
    // Tick 14.
    assert.equal(p.isInVehicle(), false);
    assert.deepEqual([p._vehicleType, p._rrSeated, p._rrFree, p._rrRide, p._rrDrive, p._rrMount, p._rrWas, p._reactorRiding], ['walk', false, 0, null, null, null, null, false]);
    assert.deepEqual([e._rrBoarded, e._reactorRiding, e._rrFree], [false, false, 1]);
    assert.deepEqual([p._x, p._y, p._realX, p._realY], [11, 10, 11, 10]);
    assert.deepEqual([p._direction, p._reactorDir8], [2, 2], 'he lands facing the way the vehicle faces, not the vehicle');
    assert.deepEqual([p._reactorAir, p._reactorVz], [0, 0]);
    assert.equal(off, 1);
    assert.equal(counts, 1, 'the steps to the next encounter are counted anew on landing');
    assert.deepEqual(events, ['1:31/1/31']);
    assert.deepEqual(w.sounds, ['start', 'stop']);
    // The spot is no tile of the parked bike, and a place to stand.
    assert.equal(w.Reactor3D.eventBodyCovers(e, p._x, p._y), false);
    assert.notEqual(w.ReactorPhysics.standingAt(w.$dataMap, p._x, p._y, 0, { within: 1 }), null);
    assert.equal(p.canMove(), true);
    // Turned to the bike, OK boards again.
    w.run(w.V.LOOK);
    assert.equal(w.V.offered(), e, 'beside it with nothing else to act on, OK boards again');
});

test('the spot: left, then right, then behind, then ahead; never a tile of the bike', () => {
    const blockers = [[11, 10], [9, 10], [10, 7], [10, 13]];
    const expected = [[11, 10], [9, 10], [10, 7], [10, 13]];
    for (let n = 0; n < 4; n++) {
        const w = world({ events: blockers.slice(0, n).map((at, i) => event(50 + i, at[0], at[1])) });
        const p = aboard(w);
        assert.equal(w.V.getOff({ instant: true }), true, 'with ' + n + ' sides taken');
        assert.deepEqual([p._x, p._y], expected[n], 'side ' + n);
        assert.equal(w.Reactor3D.eventBodyCovers(w.vehicle(31), p._x, p._y), false);
    }
    // At the map's edge the side that is off the map is passed over.
    const edge = boardWorld({ width: 60, height: 30, vehicles: [bike(31, 59, 10, { yaw: 180 })] });
    edge.stand(58, 10, 6);
    edge.board(31);
    assert.equal(edge.V.getOff({ instant: true }), true);
    assert.deepEqual([edge.$gamePlayer._x, edge.$gamePlayer._y], [58, 10], 'its left is off the map: its right');
});

test('a vehicle wider than a tile: the spot is the first tile beside its own body, on its left', () => {
    // 3.5 long and 3 wide: its body is three tiles across, so the tile next to its middle is its own.
    const w = boardWorld({ width: 60, height: 30, model: [3.5, 1.2, 3], vehicles: [bike(31, 10, 10, { yaw: 180 })] });
    const p = w.$gamePlayer, e = w.vehicle(31), R = w.Reactor3D;
    w.run(1);
    assert.equal(R.eventBodyCovers(e, 11, 10), true, 'the tile beside its middle is a tile of its body');
    w.stand(12, 10, 4);
    assert.equal(w.board(31), true);
    assert.equal(w.V.getOff({ instant: true }), true);
    assert.deepEqual([p._x, p._y], [12, 10], 'the first free tile on its left, not another side');
    assert.equal(R.eventBodyCovers(e, p._x, p._y), false);
});

test('the leader lands facing the way the vehicle faces when it stops, whatever he faced before', { skip: false }, () => {
    const w = world({ drive: false });
    const p = aboard(w), e = w.vehicle(31);
    assert.deepEqual([p._direction, p._reactorDir8], [2, 2]);
    // The ride has turned east since.
    p._rrDrive.yaw = 90 * DEG;
    w.run(2);
    assert.ok(near(e._rrYaw, 90 * DEG));
    assert.equal(w.V.getOff({ instant: true }), true);
    assert.deepEqual([p._direction, p._reactorDir8], [6, 6]);
    assert.deepEqual([e._direction, e._reactorDir8, e._rrFree], [6, 6, 1], 'and the parked bike keeps that heading');
});

test('no room on any side: the party stays aboard, the buzzer plays, and the label says so for 90 ticks', () => {
    const w = world({ events: [[11, 10], [9, 10], [10, 7], [10, 13]].map((at, i) => event(50 + i, at[0], at[1])) });
    const p = aboard(w), e = w.vehicle(31);
    w.press('cancel');
    w.run(1);
    assert.equal(w.buzzes, 1);
    assert.equal(p._vehicleType, 'reactor');
    assert.equal(p._rrMount, null);
    assert.deepEqual([e._rrFree, e._through, e._rrBoarded], [2, true, true], 'the vehicle is carried again');
    assert.equal(p._rrDrive.leave, '');
    const prompt = w.V.prompt();
    assert.deepEqual([prompt.word, prompt.action, prompt.event], ['No room to get off here', '', e]);
    assert.equal(p.canMove(), true, 'the player rides on');
    w.run(w.V.KEEP - 2);
    assert.equal(w.V.prompt().word, 'No room to get off here');
    w.run(3);
    assert.equal(w.V.prompt(), null);
    assert.equal(w.V.getOff({ instant: true }), false, 'nowhere to stand');
    assert.equal(p._vehicleType, 'reactor');
});

test('the spot is a place to stand: a wall, deep water and a drop on its left send the leader to its right; ground that takes nobody on any side keeps him aboard', () => {
    // Four bikes facing south, each with something on the tile to its left (east of it); the fourth has walls on
    // every tile the leader could get off onto: beside its middle, behind its tail, ahead of its nose.
    const width = 60, height = 30;
    const elevation = new Array(width * height).fill(0);
    // Ground 0.9 under a sheet of water level with the ground around it: within a step down, but deeper than a wade.
    elevation[10 * width + 21] = -0.9;
    // A drop of more than a tile.
    elevation[10 * width + 31] = -1.6;
    const walls = [[11, 10], [41, 10], [39, 10], [40, 7], [40, 13]].map((at, i) => ({ id: i + 1, kind: 'wall', x: at[0], y: at[1], z: 0, rot: 0 }));
    const w = boardWorld({ width, height, vehicles: [bike(31, 10, 10, { yaw: 180 }), bike(32, 20, 10, { yaw: 180 }), bike(33, 30, 10, { yaw: 180 }), bike(34, 40, 10, { yaw: 180 })],
        sidecar: { elevation, pieces: walls, water: [{ x0: 21, y0: 10, x1: 21, y1: 10, level: 0 }] } });
    const p = w.$gamePlayer, P = w.ReactorPhysics, R = w.Reactor3D, V = w.V;
    w.stand(30, 20, 2);
    w.run(1);
    for (const [name, id, x] of [['a wall', 31, 10], ['deep water', 32, 20], ['a drop of more than a tile', 33, 30]]) {
        const e = w.vehicle(id);
        assert.equal(P.standingAt(w.$dataMap, x + 1, 10, 0, { within: 1 }), null, name + ': the physics has no place to stand there');
        assert.equal(R.bodyBlocksTile(p, x + 1, 10, true), false, name + ': and nobody\'s body is on it');
        assert.equal(V.getOn(id, { instant: true }), true, name);
        assert.equal(e.isLandOk(x + 1, 10, 2), false, name + ': no tile to land on for the engine\'s own question either');
        assert.equal(e.isLandOk(x - 1, 10, 2), true);
        assert.equal(V.getOff({ instant: true }), true, name);
        assert.deepEqual([p._x, p._y], [x - 1, 10], name + ' on its left: he gets off on its right');
        assert.equal(w.buzzes, 0);
    }
    const e = w.vehicle(34);
    assert.equal(V.getOn(34, { instant: true }), true);
    w.run(2);
    w.press('cancel');
    w.run(1);
    assert.equal(w.buzzes, 1);
    assert.equal(p._vehicleType, 'reactor');
    assert.equal(p._rrMount, null);
    assert.deepEqual([e._rrFree, e._through, e._rrBoarded], [2, true, true], 'carried again');
    assert.equal(V.prompt().word, 'No room to get off here');
    assert.equal(V.getOff({ instant: true }), false);
    assert.equal(p._vehicleType, 'reactor');
});

test('Cancel at speed is kept: no hop until the vehicle is slow, the label shows the leaving word, and the press runs out', () => {
    const w = world({ drive: false });
    const p = aboard(w), e = w.vehicle(31);
    p._rrDrive.v = 20;
    w.press('cancel');
    w.run(1);
    assert.equal(p._rrDrive.leave, 'ok');
    assert.equal(p._rrMount, null, 'no hop at 20 tiles a second');
    assert.deepEqual([w.V.prompt().word, w.V.prompt().action, w.V.prompt().event], ['Get off', 'cancel', e]);
    assert.equal(w.V.isBusy(), true);
    w.run(20);
    assert.equal(p._rrMount, null);
    // The ride lets the press go (a new press of the throttle): the label goes and nothing starts.
    p._rrDrive.leave = '';
    w.run(30);
    assert.equal(p._rrMount, null);
    assert.equal(w.V.prompt(), null);
    assert.equal(w.V.isBusy(), false);
    assert.equal(p._vehicleType, 'reactor');
    // Kept again, and the vehicle slows under a tile a second: the hop starts on that tick.
    w.press('cancel');
    w.run(1);
    p._rrDrive.v = 0.9;
    w.run(1);
    assert.equal(p._rrMount.t, 0);
    assert.equal(p._rrMount.on, false);
    w.run(w.V.HOP);
    assert.equal(p._vehicleType, 'walk');
    // A press that is never answered runs out after 90 ticks.
    const k = world({ drive: false });
    const q = aboard(k);
    q._rrDrive.v = 20;
    k.press('cancel');
    k.run(1);
    k.run(w.V.KEEP - 2);
    assert.equal(q._rrDrive.leave, 'ok');
    k.run(2);
    assert.equal(q._rrDrive.leave, '');
    assert.equal(k.V.prompt(), null);
    // In the air it is not got off, however slow.
    const air = world({ drive: false });
    const r = aboard(air);
    r._reactorAir = 0.5;
    air.press('cancel');
    air.run(5);
    assert.equal(r._rrMount, null);
    r._reactorAir = 0;
    air.run(1);
    assert.notEqual(r._rrMount, null);
});

test('Cancel at 20 tiles a second ends on foot 0.67 s and 14 ticks later, on a tile to stand on that is no tile of the bike', { skip: needsDrive }, () => {
    const w = world();
    const p = aboard(w), e = w.vehicle(31);
    w.$gameMap._reactorCamera3d = { mode: 'thirdPerson' };
    p._rrDrive.v = 20;
    w.press('cancel');
    const ticks = w.run(120, () => p._vehicleType === 'walk') + 1;
    assert.equal(p._vehicleType, 'walk');
    assert.ok(ticks >= 50 && ticks <= 60, 'on foot after ' + ticks + ' ticks (0.67 s of braking is 40, the hop 14)');
    assert.ok(e._realY > 14 && e._realY < 19, 'it braked over about 6.7 tiles: ' + e._realY);
    assert.notEqual(w.ReactorPhysics.standingAt(w.$dataMap, p._x, p._y, 0, { within: 1 }), null);
    assert.equal(w.Reactor3D.eventBodyCovers(e, p._x, p._y), false);
    assert.equal(e._rrFree, 1);
    assert.ok(near(w.V.where(31).yaw, 180, 0.5));
});

test('Cancel at 20 tiles a second, then the throttle within 30 ticks: aboard and accelerating', { skip: needsDrive }, () => {
    const w = world();
    const p = aboard(w);
    w.$gameMap._reactorCamera3d = { mode: 'thirdPerson' };
    p._rrDrive.v = 20;
    w.press('cancel');
    w.run(20);
    assert.equal(p._rrDrive.leave, 'ok');
    const slowed = w.V.speed();
    assert.ok(slowed < 12, 'it was braking: ' + slowed);
    w.keys.up = true;
    w.run(20);
    assert.equal(p._rrDrive.leave, '', 'the press is let go');
    assert.equal(w.V.prompt(), null);
    assert.ok(w.V.speed() > slowed, 'and it speeds up again: ' + w.V.speed());
    w.run(60);
    assert.equal(p._vehicleType, 'reactor');
    assert.equal(p._rrMount, null);
});

test('after a ride the leader jumps and falls as any walker: the riding flag is cleared', () => {
    const w = world();
    const p = aboard(w), P = w.ReactorPhysics;
    w.run(10);
    assert.equal(w.V.getOff({ instant: true }), true);
    assert.equal(p._reactorRiding, false);
    w.run(5);
    assert.equal(P.isAirborne(p), false);
    p._reactorAlt = Number.isFinite(p._reactorAlt) ? p._reactorAlt : p._reactorGround;
    p._reactorVz = 0.12; p._reactorJumped = true;
    w.run(3);
    assert.equal(P.isAirborne(p), true, 'three frames into a jump he is in the air');
    assert.equal(P.jump(p), false, 'and a second jump there is refused');
});

test('a click: aboard it starts nothing; on foot, on a tile of the vehicle the label shows for, it boards', () => {
    // Somebody stands on the tile south of the bike's middle, where the stock code looks for whoever was clicked.
    const w = world({ events: [talker(40, 10, 11, 5)] });
    const p = w.$gamePlayer;
    w.stand(11, 10, 4);
    w.run(w.V.LOOK);
    // A click on the tile he faces, which is a tile of the bike.
    w.$gameTemp.setDestination(10, 10);
    w.TouchInput.isTriggered = () => true;
    assert.equal(p.triggerTouchAction(), true);
    assert.equal(p._vehicleType, 'reactor');
    assert.equal(w.$gameTemp.isDestinationValid(), false, 'the click is spent: he is not walked on to that tile after the ride');
    w.TouchInput.isTriggered = () => false;
    w.run(w.V.HOP);
    // Aboard, a click on the tile ahead (where the stock code would look for an event) starts nothing.
    w.$gameTemp.setDestination(10, 11);
    w.TouchInput.isTriggered = () => true;
    assert.equal(p.triggerTouchAction(), false);
    assert.equal(w.$gameSwitches.value(5), false);
    assert.equal(p._vehicleType, 'reactor');
    // A click somewhere else on foot is the stock function's.
    const s = world();
    s.stand(11, 10, 4);
    s.run(w.V.LOOK);
    s.$gameTemp.setDestination(30, 20);
    s.TouchInput.isTriggered = () => true;
    assert.equal(s.$gamePlayer.triggerTouchAction(), false);
    assert.equal(s.$gamePlayer._vehicleType, 'walk');
});

//-----------------------------------------------------------------------------
// Followers (4.10)

test('the followers are asked aboard at tick 0, back at tick 14 of the hop off, and at once by the on-foot list', () => {
    const w = world();
    w.stubAboard();
    const p = w.$gamePlayer;
    pressBeside(w);
    assert.deepEqual(w.aboardCalls, [[true, false]]);
    w.run(w.V.HOP);
    w.press('cancel');
    w.run(1);
    w.run(w.V.HOP - 1);
    assert.deepEqual(w.aboardCalls, [[true, false]], 'not before his feet touch the ground');
    w.run(1);
    assert.deepEqual(w.aboardCalls, [[true, false], [false, false]]);
    // The on-foot list brings them at once.
    aboard(w);
    w.V.putOnFoot();
    assert.deepEqual(w.aboardCalls.slice(2), [[true, false], [false, true]]);
    assert.equal(p._vehicleType, 'walk');
    // Without the function nothing is called and nothing throws.
    delete w.Game_Followers.prototype.rrAboard;
    assert.doesNotThrow(() => { aboard(w); w.V.getOff({ instant: true }); });
});

test('boarding ends no order: a follower told to stay is where it was during the ride and after it', () => {
    const w = world({ party: [1, 2, 3] });
    const p = w.$gamePlayer, followers = p.followers();
    w.stand(15, 20, 2);
    const held = followers._data[0];
    followers.order(1, 'stay');
    assert.equal(held.rrIsHeld(), true);
    const at = [held._x, held._y];
    w.stand = (x, y, d) => { vm.runInContext('(function(p, x, y) { Game_CharacterBase.prototype.locate.call(p, x, y); })', w)(p, x, y); p._direction = d; p._reactorDir8 = d; return p; };
    const hidden = followers._data.map(f => !!f._rrHidden), visible = followers.isVisible();
    aboard(w);
    w.run(30);
    assert.equal(held.rrIsHeld(), true, 'still under its order aboard');
    assert.deepEqual([held._x, held._y], at);
    assert.equal(held.isVisible(), true);
    assert.equal(w.V.getOff({ instant: true }), true);
    w.run(30);
    assert.equal(held.rrIsHeld(), true, 'and after it');
    assert.deepEqual([held._x, held._y], at);
    assert.deepEqual(followers._data.map(f => !!f._rrHidden), hidden, 'what was shown and hidden is as it was');
    assert.equal(followers.isVisible(), visible);
});

test('with the followers\' own rrAboard: unseen from tick 16, back behind the leader, hidden in a save made aboard', { skip: typeof boardWorld().Game_Followers.prototype.rrAboard === 'function' ? false : 'waits for Game_Followers.prototype.rrAboard (reactor_objects_followers.js)' }, () => {
    const w = world({ party: [1, 2, 3] });
    const p = w.$gamePlayer, followers = p.followers();
    pressBeside(w);
    w.run(16);
    for (const follower of followers._data) assert.equal(follower.isVisible(), false);
    assert.equal(followers._rrAboard, true);
    w.saveAndLoad();
    w.V.resume();
    for (const follower of w.$gamePlayer.followers()._data) assert.equal(follower.isVisible(), false, 'hidden after a load aboard');
    assert.equal(w.V.getOff({ instant: true }), true);
    w.run(16);
    // A slot that stands for nobody (a party of three has two followers) is never seen.
    for (const follower of w.$gamePlayer.followers()._data) {
        if (!follower.actor()) continue;
        assert.equal(follower.isVisible(), true);
        assert.deepEqual([follower.x, follower.y], [w.$gamePlayer.x, w.$gamePlayer.y], "on the leader's tile");
    }
});

//-----------------------------------------------------------------------------
// Commands (9.1) and script calls (9.3)

test('Get On Vehicle (this), waiting, seats the party and runs its next command at tick 14', () => {
    const own = bike(31, 10, 10, { yaw: 180, board: 'command' });
    own.pages[0].list = [command('GetOnVehicle', { vehicle: 'this', instant: false, wait: true }), switchOn(6), END];
    const w = world({ vehicles: [own] });
    const p = w.$gamePlayer, e = w.vehicle(31);
    w.stand(11, 10, 4);
    w.run(1);
    assert.equal(w.V.offered(true), null, 'a command vehicle shows no label: OK runs its page');
    w.press('ok');
    w.run(3, () => p._vehicleType === 'reactor');
    assert.equal(p._vehicleType, 'reactor');
    assert.deepEqual([e._direction, e._reactorDir8], [2, 2], 'spoken to, it did not turn to the player');
    let frames = 0;
    while (p._rrMount && frames < 40) { assert.equal(w.$gameSwitches.value(6), false, 'held until seated'); w.run(1); frames++; }
    assert.equal(frames, w.V.HOP - p._rrMount === null ? frames : frames);
    assert.equal(p._rrMount, null);
    assert.equal(e._rrFree, 2);
    w.run(1);
    assert.equal(w.$gameSwitches.value(6), true, 'the next command ran as he sat down');
    w.run(3);
    assert.equal(p.canMove(), true, 'and the event is over');
    assert.deepEqual([e._direction, e._reactorDir8], [2, 2]);
});

test('Get On Vehicle (this) is the vehicle whose event runs the command, not the one nearest the leader', () => {
    const w = world({ vehicles: [bike(31, 10, 10, { yaw: 180 }), bike(32, 30, 10, { yaw: 180 })] });
    const p = w.$gamePlayer;
    // (The leader alone: followers who take the other vehicle are the convoy's tests.)
    p.hideFollowers();
    // The leader stands beside the second bike; the first one's event runs the command.
    w.stand(31, 10, 4);
    w.run(1);
    assert.equal(w.V.find('nearest'), w.vehicle(32));
    w.$gameMap._interpreter.setup([command('GetOnVehicle', { vehicle: 'this', instant: false, wait: true }), END], 31);
    w.run(2);
    assert.equal(w.V.ridden(), w.vehicle(31));
    assert.deepEqual([p._realX, p._realY], [10, 10], 'from that far he is on it at once');
    assert.equal(w.vehicle(32)._rrBoarded, undefined);
    // With no event behind the command there is no "this".
    const none = world();
    none.stand(11, 10, 4);
    none.run(1);
    none.$gameMap._interpreter.setup([command('GetOnVehicle', { vehicle: 'this' }), END], 0);
    none.run(2);
    assert.equal(none.$gamePlayer._vehicleType, 'walk');
});

test('Get On Vehicle from further than three tiles boards at once; not waiting, the event runs on', () => {
    const caller = event(45, 30, 20, { pages: [page({ priorityType: 0, trigger: 0, list: [command('GetOnVehicle', { vehicle: '1:31', wait: 'false' }), switchOn(6), END] })] });
    const w = world({ events: [caller] });
    const p = w.$gamePlayer;
    w.stand(30, 20, 2);
    w.run(1);
    w.press('ok');
    w.run(3);
    assert.equal(w.$gameSwitches.value(6), true);
    assert.equal(p._vehicleType, 'reactor');
    assert.equal(p._rrMount, null, 'from this far it is at once');
    assert.deepEqual([p._realX, p._realY], [10, 10]);
    assert.equal(w.vehicle(31)._rrFree, 2);
});

test('Get Off Vehicle waits until the party is on foot; on foot it does nothing', () => {
    const caller = event(45, 10, 10, { pages: [page({ priorityType: 0, trigger: 1, list: [command('GetOffVehicle', { instant: false, wait: true }), switchOn(6), END] })] });
    const w = world({ events: [caller] });
    const p = aboard(w);
    // The interpreter runs the command as the map's event would.
    w.$gameMap._interpreter.setup(caller.pages[0].list, 45);
    w.run(1);
    assert.notEqual(p._rrMount, null, 'at a standstill the hop starts with the command');
    assert.equal(w.$gameSwitches.value(6), false);
    w.run(w.V.HOP - 2);
    assert.equal(w.$gameSwitches.value(6), false, 'held through the hop');
    w.run(3);
    assert.equal(p._vehicleType, 'walk');
    assert.equal(w.$gameSwitches.value(6), true);
    // On foot.
    w.$gameSwitches.setValue(6, false);
    w.$gameMap._interpreter.setup(caller.pages[0].list, 45);
    w.run(2);
    assert.equal(w.$gameSwitches.value(6), true, 'nothing to wait for');
    assert.equal(p._vehicleType, 'walk');
});

test('Set Vehicle Location: typed values and a dialog\'s strings move it; without x and y it moves nothing and says so once', () => {
    const w = world();
    const e = w.vehicle(31), V = w.V;
    const warned = [];
    w.console = Object.assign({}, console, { warn: (...args) => warned.push(args.join(' ')) });
    const call = args => vm.runInContext('(function(args) { const i = new Game_Interpreter(); i.setup([{ code: 0, indent: 0, parameters: [] }], 31); PluginManager.callCommand(i, "RPGReactor", "SetVehicleLocation", args); })', w)(args);
    call({ vehicle: '1:31', x: '28', y: '3', yaw: '180' });
    assert.deepEqual([e._realX, e._realY, e._x, e._y, e._direction], [28, 3, 28, 3, 2], 'at (28, 3) facing south');
    assert.deepEqual([V.where(31).x, V.where(31).y, V.where(31).yaw], [28, 3, 180]);
    assert.equal(warned.length, 0);
    call({ vehicle: 'this', x: 20, y: 12.5, yaw: 90 });
    assert.deepEqual([e._realX, e._realY, e._direction], [20, 12.5, 6]);
    // No x: refused, one line, nothing moved (never the map's corner).
    call({ vehicle: '1:31', y: 4, yaw: 0 });
    call({ vehicle: '1:31', x: '', y: '' });
    assert.deepEqual([e._realX, e._realY], [20, 12.5]);
    assert.equal(warned.length, 2);
    assert.match(warned[0], /x and y are not set/);
    assert.match(warned[1], /x and y are not set/, 'an empty string is no number');
    // The label follows at once: beside it the leader has one, and none the moment a command has sent it away.
    w.stand(20, 14, 8);
    w.run(V.LOOK + 1);
    assert.equal(V.offered(), e);
    call({ vehicle: '1:31', x: 40, y: 20, yaw: 0 });
    assert.equal(V.offered(), null, 'not kept until the next look');
    call({ vehicle: '1:31', x: 20, y: 12.5, yaw: 90 });
    assert.equal(V.offered(), e, 'and there again when it is back');
    // Taken out of the world.
    call({ vehicle: '1:31', remove: true });
    assert.equal(e._erased, true);
    call({ vehicle: '1:31', x: 15, y: 15, yaw: 0 });
    assert.equal(e._erased, false);
    assert.deepEqual([e._realX, e._realY, e._direction], [15, 15, 8]);
    // Refused for the ridden vehicle.
    w.stand(16, 15, 4);
    w.board(31);
    const lines = warned.length;
    call({ vehicle: 'ridden', x: 30, y: 20 });
    assert.equal(warned.length, lines + 1);
    assert.deepEqual([w.$gamePlayer._realX, w.$gamePlayer._realY], [15, 15]);
});

test('the commands are registered under RPGReactor and add no interpreter command function', () => {
    const w = world();
    const commands = w.PluginManager._commands;
    for (const name of ['GetOnVehicle', 'GetOffVehicle', 'SetVehicleLocation']) assert.equal(typeof commands['RPGReactor:' + name], 'function', name);
    assert.equal(typeof w.Game_Interpreter.prototype.command357, 'function');
});

test('command 206 from an event boards the vehicle the leader faces and gets the party off again', () => {
    const w = world();
    const p = w.$gamePlayer;
    w.stand(11, 10, 4);
    w.run(1);
    w.$gameMap._interpreter.setup([{ code: 206, indent: 0, parameters: [] }, END], 0);
    w.run(2);
    assert.equal(p._vehicleType, 'reactor', 'Get on/off Vehicle boards the new vehicle');
    w.run(w.V.HOP);
    assert.equal(p._rrMount, null);
    w.$gameMap._interpreter.setup([{ code: 206, indent: 0, parameters: [] }, END], 0);
    w.run(2);
    assert.notEqual(p._rrMount, null, 'and leaves it');
    w.run(w.V.HOP);
    assert.equal(p._vehicleType, 'walk');
});

test('the script calls: getOn, getOff, settle, isRiding, ridden, find, idOf, where, speed, type, offered, prompt', () => {
    const w = world({ vehicles: [bike(31, 10, 10, { yaw: 180, key: 'bike' })] });
    const V = w.V, p = w.$gamePlayer, e = w.vehicle(31);
    let on = 0, off = 0;
    w.ReactorEvents.on('vehicleGetOn', () => on++);
    w.ReactorEvents.on('vehicleGetOff', () => off++);
    assert.equal(V.isRiding(), false);
    assert.equal(V.ridden(), null);
    assert.equal(V.speed(), 0);
    assert.equal(V.getOff(), false, 'on foot there is nothing to get off');
    assert.equal(V.getOn('nobody'), false);
    assert.equal(V.type(1).kind, 'motorcycle');
    assert.equal(V.type(1), V.type(1), 'the same object for the same record');
    assert.equal(V.type(9), null);
    w.stand(11, 10, 4);
    w.run(1);
    assert.equal(V.getOn('bike'), true);
    assert.equal(V.getOn('bike'), false, 'already boarding');
    assert.equal(p._rrMount.t, 0);
    V.settle();
    assert.equal(V.isRiding(), true);
    assert.equal(V.isRiding('bike'), true);
    assert.equal(V.isRiding({ type: 1 }), true);
    assert.equal(V.isRiding('other'), false);
    assert.equal(V.ridden(), e);
    assert.equal(p.vehicle(), e);
    assert.equal(V.find('ridden'), e);
    assert.equal(V.idOf(V.ridden()), '1:31');
    assert.deepEqual([V.where('ridden').x, V.where('ridden').y, V.where('ridden').yaw], [10, 10, 180]);
    assert.equal(V.offered(true), null, 'aboard nothing is offered');
    assert.equal(V.prompt(), null);
    p._rrDrive.v = -2.5;
    assert.equal(V.speed(), -2.5);
    p._rrDrive.v = 0;
    assert.equal(V.getOff({ instant: true }), true);
    assert.equal(V.isRiding(), false);
    assert.deepEqual([on, off], [1, 1], 'each listener ran once for the ride');
    // An instant boarding and the kept press.
    assert.equal(V.getOn(31, { instant: true }), true);
    assert.equal(p._rrMount, null);
    assert.equal(V.getOff(), true);
    assert.equal(p._rrMount.on, false);
    V.settle();
    assert.equal(p._vehicleType, 'walk');
    assert.deepEqual([on, off], [2, 2]);
});

test('a type with music swaps it in for the ride and gives the walking music back', () => {
    const w = world({ types: [null, motorcycle({ bgm: { name: 'Ride', volume: 90, pitch: 100, pan: 0 } })] });
    const played = [];
    w.AudioManager.playBgm = bgm => played.push(bgm && bgm.name);
    w.$gameSystem.replayWalkingBgm = () => played.push('walking');
    aboard(w);
    assert.deepEqual(played, ['Ride']);
    w.V.getOff({ instant: true });
    assert.deepEqual(played, ['Ride', 'walking']);
    // A type without music leaves the map's music alone.
    const quiet = world();
    const heard = [];
    quiet.AudioManager.playBgm = bgm => heard.push(bgm && bgm.name);
    aboard(quiet);
    quiet.V.getOff({ instant: true });
    assert.deepEqual(heard, []);
});
