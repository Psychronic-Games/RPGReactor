'use strict';
// A route's Move to Tile step (Game_Character.reactorMoveToTile in
// runtime/reactor_objects_map.js): the route waits on the step, the whole
// path is found by a search bounded in work and kept while the way stays
// open, a blocked step looks again, a tile that cannot be reached is come as
// near to as can be, a save in the middle resumes, and a second step
// replaces the first. On a flat map and on North Haven's stairs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { followerWorld, event, page } = require('./helpers/follower-world.cjs');
const SetMovementRouteEditor = require('../src/event/commands/SetMovementRouteEditor.js');

const repo = path.resolve(__dirname, '..', '..');
const END = { code: 0, parameters: [] };
/** The step as the editor writes it into a route. */
const moveTo = (x, y) => SetMovementRouteEditor.routeCommand('moveto', { x, y });
const route = (steps, options = {}) => Object.assign({ repeat: false, skippable: false, wait: true, list: steps.concat([END]) }, options);
const still = (id, x, y, overrides = {}) => event(id, x, y, { pages: [page(Object.assign({ priorityType: 1 }, overrides))] });

/** Runs an event's command list to its end (or `limit` frames), calling `each` every frame. Returns the frames it took. */
function runList(w, list, { eventId = 0, limit = 6000, each = null } = {}) {
    const interpreter = new w.Game_Interpreter();
    interpreter.setup(list.concat([{ code: 0, indent: 0, parameters: [] }]), eventId);
    let frames = 0;
    while (interpreter.isRunning() && frames < limit) {
        interpreter.update();
        w.run(1);
        frames++;
        if (each) each(frames);
    }
    return frames;
}
const setRoute = (who, steps, options) => ({ code: 205, indent: 0, parameters: [who, route(steps, options)] });
const switchOn = id => ({ code: 121, indent: 0, parameters: [id, id, 0] });

/** Counts the searches a character begins. */
function countSearches(w) {
    const proto = w.Game_Character.prototype, begin = proto.reactorBeginSearch;
    const count = { begun: 0 };
    proto.reactorBeginSearch = function() { count.begun++; return begin.apply(this, arguments); };
    return count;
}

test('the step is a Script entry a runtime without the walk leaves alone', () => {
    const step = moveTo(14, 9);
    assert.equal(step.code, 45);
    assert.deepEqual(SetMovementRouteEditor.parseRouteCommand(step), { op: 'moveto', x: 14, y: 9 });
    assert.match(step.parameters[0], /^\/\*@RPG_REACTOR_EVENT:1:route:[^\n]*\*\/\nif \(typeof this\.reactorMoveToTile === "function"\) this\.reactorMoveToTile\(14, 9\);$/);
    // A stock character has no such function: the step does nothing and the route goes on.
    const stock = { moved: false };
    assert.doesNotThrow(() => vm.runInNewContext('(function() { eval(text); }).call(character)', { text: step.parameters[0], character: stock }));
    assert.equal(SetMovementRouteEditor.moveToText({ x: 14, y: 9 }), 'Move to (14, 9)');
    // A hand-edited body is a plain script again, not a step.
    assert.equal(SetMovementRouteEditor.parseRouteCommand({ code: 45, parameters: [step.parameters[0].replace('14, 9', '15, 9')] }), null);
});

test('an event walks to the tile round a wall; the route waits on the step and the command waits for the arrival', () => {
    // A wall 30 tiles long between the event and its goal, 40 tiles away as the crow flies.
    const w = followerWorld({ width: 70, height: 50, walls: [[30, 5, 30, 34]], start: [2, 2], events: [still(1, 10, 20)] });
    const walker = w.$gameMap.event(1);
    const searches = countSearches(w);
    let walled = 0, early = false, steps = 0, last = '10,20';
    const frames = runList(w, [setRoute(1, [moveTo(50, 20), { code: 27, parameters: [3] }, { code: 16 }]), switchOn(4)], {
        eventId: 1,
        each: () => {
            if (walker.x === 30 && walker.y >= 5 && walker.y <= 34) walled++;
            if (walker.x + ',' + walker.y !== last) { steps++; last = walker.x + ',' + walker.y; }
            if (!walker.pos(50, 20) && (w.$gameSwitches.value(3) || w.$gameSwitches.value(4))) early = true;
        }
    });
    assert.deepEqual([walker.x, walker.y], [50, 20], 'it stands on the tile');
    assert.equal(walled, 0, 'never on a wall tile');
    assert.equal(early, false, 'the route\'s next step and the event\'s next command both waited');
    assert.equal(w.$gameSwitches.value(3), true, 'then the route went on: Switch ON');
    assert.equal(walker.direction(), 2, 'and Turn Down');
    assert.equal(w.$gameSwitches.value(4), true, 'and the event after it');
    assert.equal(steps, 70, 'by the shortest way round: 40 across and 15 down and up again');
    assert.equal(searches.begun, 1, 'one search for the whole walk');
    assert.ok(frames >= 70 * 16 && frames < 70 * 16 + 120, `at the event's own speed (${frames} frames)`);
    assert.equal(walker._reactorWalk, null);
});

test('the search is bounded: a slice a frame, and a way longer than one search is walked in legs', () => {
    const w = followerWorld({ width: 120, height: 90, walls: [[60, 0, 60, 80]], start: [2, 2], events: [still(1, 10, 40)] });
    const walker = w.$gameMap.event(1), C = w.Game_Character;
    assert.ok(C.WALK_NODES <= 4000 && C.WALK_SLICE_MOST <= 128, 'a search opens a bounded number of tiles, a few of them a frame');
    // Each call opens no more than a slice.
    const proto = C.prototype, run = proto.reactorRunSearch;
    let most = 0, calls = 0;
    proto.reactorRunSearch = function(search, budget, milliseconds) {
        const before = search.opened;
        const done = run.call(this, search, budget, milliseconds);
        most = Math.max(most, search.opened - before);
        calls++;
        return done;
    };
    const searches = countSearches(w);
    walker.reactorWalkTo(110, 40, false);
    const frames = w.run(9000, () => !walker.isMoveRouteForcing());
    assert.deepEqual([walker.x, walker.y], [110, 40], 'round an 80-tile wall');
    assert.ok(most <= C.WALK_SLICE_MOST, `no frame opened more than a slice (${most})`);
    assert.ok(calls > searches.begun, 'the search ran over several frames');
    assert.ok(searches.begun >= 2 && searches.begun <= 8, `walked in legs (${searches.begun} searches)`);
    assert.ok(frames < 9000);
    // The whole way at once, for a script: the same path whoever asks.
    const whole = walker.reactorFindPath(10, 40);
    assert.equal(whole.reached, false, 'one search does not reach it');
    assert.ok(whole.length > 20 && whole.opened === C.WALK_NODES);
});

test('a step blocked by something that moved looks for another way; the way is kept while it stays open', () => {
    // Two doors in a wall; the nearer one is shut by an event that steps into it once the walker is on its way.
    const w = followerWorld({ width: 50, height: 30, walls: [[20, 0, 20, 9], [20, 11, 20, 19], [20, 21, 20, 29]], start: [2, 2],
        events: [still(1, 10, 10), still(2, 20, 12, { through: true })] });
    const walker = w.$gameMap.event(1), blocker = w.$gameMap.event(2);
    const searches = countSearches(w);
    walker.reactorWalkTo(30, 10, false);
    w.run(600, () => walker.x === 17);
    assert.equal(searches.begun, 1);
    // The door at (20, 10) is shut.
    blocker.setThrough(false);
    blocker.locate(20, 10);
    let through = 0;
    w.run(4000, () => { if (walker.pos(20, 10)) through++; return !walker.isMoveRouteForcing(); });
    assert.deepEqual([walker.x, walker.y], [30, 10], 'it arrived by the other door');
    assert.equal(through, 0, 'not through the event');
    assert.equal(searches.begun, 2, 'one more search when the step was refused, none besides');
});

test('a tile that cannot be reached: as near as it can, then on with Skip If Cannot Move, else it keeps trying and arrives when the way opens', () => {
    // The goal is walled in.
    const room = [[30, 8, 34, 8], [30, 12, 34, 12], [30, 9, 30, 11], [34, 9, 34, 11]];
    for (const skippable of [true, false]) {
        const w = followerWorld({ width: 50, height: 30, walls: room, start: [2, 2], events: [still(1, 10, 10)] });
        const walker = w.$gameMap.event(1);
        const searches = countSearches(w);
        const list = [setRoute(1, [moveTo(32, 10), { code: 27, parameters: [5] }], { skippable })];
        const frames = runList(w, list, { eventId: 1, limit: 2500 });
        assert.deepEqual([walker.x, walker.y], [29, 10], 'beside the wall, as near as a walk comes');
        if (skippable) {
            assert.equal(w.$gameSwitches.value(5), true, 'the route went on to its next step');
            assert.ok(frames < 2500, 'and the event with it');
            assert.equal(walker._reactorWalk, null);
        } else {
            assert.equal(w.$gameSwitches.value(5), false, 'the route is still on the step');
            assert.ok(walker._reactorWalk && walker.isMoveRouteForcing(), 'and still trying');
            assert.ok(searches.begun <= 12, `at intervals that grow, not every frame (${searches.begun} searches in ${frames} frames)`);
            // The game goes on meanwhile, and when the wall opens the walk ends.
            for (let y = 9; y <= 11; y++) w.$dataMap.data[(3 * 30 + y) * 50 + 30] = 0;
            w.run(1500, () => walker.pos(32, 10));
            assert.deepEqual([walker.x, walker.y], [32, 10], 'it arrives once there is a way');
        }
    }
    // Somebody stands on the goal: the tile beside it, without looking over the whole map.
    const w = followerWorld({ width: 50, height: 30, start: [2, 2], events: [still(1, 10, 10), still(2, 30, 10)] });
    const walker = w.$gameMap.event(1);
    const found = walker.reactorFindPath(30, 10);
    assert.ok(!found.reached && found.length === 19 && found.opened < 60, `beside the one in the way, ${found.opened} tiles opened`);
    walker.reactorWalkTo(w.$gamePlayer.x, w.$gamePlayer.y);
    w.run(2000, () => !walker.isMoveRouteForcing());
    assert.equal(Math.abs(walker.x - 2) + Math.abs(walker.y - 2), 1, 'a walk to the player ends beside the player');
});

test('somebody stands on the tile: the walk ends beside it and the route goes on, Skip If Cannot Move ticked or not', () => {
    for (const skippable of [false, true]) {
        for (const who of ['the player', 'an event']) {
            const label = `${who}, Skip ${skippable ? 'ticked' : 'not ticked'}`;
            const w = followerWorld({ width: 50, height: 30, start: [6, 10], party: [1], events: [still(1, 10, 14), still(2, 30, 10)] });
            const p = w.$gamePlayer, walker = who === 'the player' ? p : w.$gameMap.event(1);
            const searches = countSearches(w);
            // As a map event runs it: the player cannot move while the event waits for the route.
            w.$gameMap._interpreter.setup([setRoute(who === 'the player' ? -1 : 1, [moveTo(30, 10), { code: 27, parameters: [5] }], { skippable }), switchOn(6),
                { code: 0, indent: 0, parameters: [] }], 0);
            const frames = w.run(1200, () => !w.$gameMap.isEventRunning());
            assert.equal(w.$gameMap.isEventRunning(), false, `${label}: the event that waits for the route goes on (${frames} frames)`);
            assert.equal(Math.abs(walker.x - 30) + Math.abs(walker.y - 10), 1, `${label}: it stands beside the tile (${walker.x},${walker.y})`);
            assert.equal(w.$gameSwitches.value(5), true, `${label}: the route went on to its next step`);
            assert.equal(w.$gameSwitches.value(6), true, label);
            assert.equal(walker._reactorWalk, null, label);
            assert.equal(p.canMove(), true, `${label}: the player can move`);
            assert.ok(searches.begun <= 2, `${label}: no search after search (${searches.begun})`);
        }
    }
    // The tile clears while the walker is on its way: it arrives on the tile itself.
    const w = followerWorld({ width: 50, height: 30, start: [2, 2], events: [still(1, 10, 10), still(2, 30, 10)] });
    const walker = w.$gameMap.event(1), other = w.$gameMap.event(2);
    walker.forceMoveRoute(route([moveTo(30, 10), { code: 27, parameters: [5] }]));
    w.run(600, () => walker.x >= 22);
    other.locate(40, 20);
    w.run(600, () => !walker.isMoveRouteForcing());
    assert.deepEqual([walker.x, walker.y], [30, 10], 'on the tile once it is free');
    assert.equal(w.$gameSwitches.value(5), true);
    // Somebody on a tile no way leads to is no reason to end: that tile cannot be reached, and the step keeps trying.
    const room = [[30, 8, 34, 8], [30, 12, 34, 12], [30, 9, 30, 11], [34, 9, 34, 11]];
    const shut = followerWorld({ width: 50, height: 30, walls: room, start: [2, 2], events: [still(1, 10, 10), still(2, 32, 10)] });
    const outside = shut.$gameMap.event(1);
    outside.forceMoveRoute(route([moveTo(32, 10), { code: 27, parameters: [5] }]));
    shut.run(900);
    assert.deepEqual([outside.x, outside.y], [29, 10]);
    assert.ok(outside._reactorWalk && outside.isMoveRouteForcing(), 'still on the step');
    assert.equal(shut.$gameSwitches.value(5), false);
});

test('an event whose page changes in the middle of its own route\'s walk gives the walk up', () => {
    // Page 1 walks to a tile by its own route; page 2 (switch 7) stands.
    const walking = page({ priorityType: 1, moveType: 3, moveFrequency: 5, moveRoute: route([moveTo(30, 6)], { repeat: false, wait: false }) });
    const standing = page({ priorityType: 1, moveType: 0 });
    standing.conditions.switch1Valid = true;
    standing.conditions.switch1Id = 7;
    const w = followerWorld({ width: 40, height: 20, start: [2, 2], events: [event(1, 10, 6, { pages: [walking, standing] })] });
    const walker = w.$gameMap.event(1);
    w.run(600, () => walker.x >= 14 && !walker.isMoving());
    assert.ok(walker._reactorWalk, 'on its way by its page\'s route');
    w.$gameSwitches.setValue(7, true);
    w.run(2);
    const at = walker.x;
    assert.equal(walker._reactorWalk, null, 'the walk belonged to the route of the page that is gone');
    w.run(300);
    assert.ok(walker.x <= at + 1 && walker.x < 30, `it stands where the new page found it (x ${walker.x})`);
});

test('a save in the middle resumes the walk, and a second Move to Tile replaces the first', () => {
    const w = followerWorld({ width: 60, height: 30, walls: [[25, 4, 25, 25]], start: [2, 2], events: [still(1, 10, 10)] });
    let walker = w.$gameMap.event(1);
    walker.forceMoveRoute(route([moveTo(40, 10), { code: 27, parameters: [6] }]));
    w.run(200);
    assert.ok(walker._reactorWalk && !walker.pos(40, 10));
    w.saveAndLoad();
    walker = w.$gameMap.event(1);
    assert.deepEqual([walker._reactorWalk.x, walker._reactorWalk.y], [40, 10], 'the goal is in the save');
    assert.equal(w.Game_Character._walkPaths.get(walker), undefined, 'the path is not');
    w.run(3000, () => !walker.isMoveRouteForcing());
    assert.deepEqual([walker.x, walker.y], [40, 10]);
    assert.equal(w.$gameSwitches.value(6), true, 'and the route went on after it');
    // A second step while one runs.
    walker.forceMoveRoute(route([moveTo(10, 10)]));
    w.run(100);
    walker.reactorMoveToTile(40, 20);
    assert.deepEqual([walker._reactorWalk.x, walker._reactorWalk.y], [40, 20]);
    w.run(3000, () => !walker.isMoveRouteForcing());
    assert.deepEqual([walker.x, walker.y], [40, 20], 'it went to the second tile');
    // A new route ends a walk the old one was on.
    walker.forceMoveRoute(route([moveTo(10, 10)]));
    w.run(50);
    walker.forceMoveRoute(route([{ code: 16 }]));
    assert.equal(walker._reactorWalk, null);
    w.run(20);
    assert.equal(walker.isMoveRouteForcing(), false);
});

test('at the character\'s own speed and frequency: a slower event, and a page\'s own route that pauses between steps', () => {
    const custom = { moveType: 3, moveSpeed: 4, moveFrequency: 3, moveRoute: route([moveTo(20, 6)], { repeat: false, wait: false }) };
    const w = followerWorld({ width: 40, height: 20, start: [2, 2], events: [still(1, 10, 10, { moveSpeed: 3 }), still(2, 10, 6, custom)] });
    const slow = w.$gameMap.event(1), own = w.$gameMap.event(2);
    slow.forceMoveRoute(route([moveTo(20, 10)]));
    const frames = w.run(4000, () => !slow.isMoveRouteForcing());
    assert.deepEqual([slow.x, slow.y], [20, 10]);
    assert.ok(frames >= 10 * 32 && frames < 10 * 32 + 20, `ten tiles at speed 3 (${frames} frames)`);
    // The page's own route walked meanwhile, a step and a pause at a time: slower than a forced route.
    assert.ok(own.x > 10 && own.x < 20 && own.y === 6, `on its way at its own frequency (x ${own.x})`);
    w.run(4000, () => own.pos(20, 6));
    assert.deepEqual([own.x, own.y], [20, 6]);
});

test('the player and a follower walk the same way; a character that is walked through walks straight', () => {
    const w = followerWorld({ width: 50, height: 30, walls: [[20, 0, 20, 19]], start: [10, 10], events: [still(1, 10, 14, { through: true })] });
    const p = w.$gamePlayer, F = p.followers(), ghost = w.$gameMap.event(1);
    w.walk(4, 3); w.rest();
    let walled = 0;
    const frames = runList(w, [setRoute(-1, [moveTo(30, 10)])], { each: () => { if (p.x === 20 && p.y <= 19) walled++; } });
    assert.deepEqual([p.x, p.y], [30, 10], 'the player, by a route');
    assert.equal(walled, 0);
    assert.ok(frames > 16 * 20);
    w.rest();
    const line = [p].concat(Array.from(F._data));
    for (let i = 1; i < line.length; i++) assert.equal(Math.abs(line[i].x - line[i - 1].x) + Math.abs(line[i].y - line[i - 1].y), 1, 'with its followers in a file behind it as ever');
    // A follower: Set Movement Route with Move to Tile.
    const second = F._data[1];
    runList(w, [setRoute(w.Game_Followers.CHARACTER_ID + 2, [moveTo(10, 10)])], { each: () => { if (second.x === 20 && second.y <= 19) walled++; } });
    assert.deepEqual([second.x, second.y], [10, 10], 'a follower, back round the wall');
    assert.equal(walled, 0);
    assert.ok(second.rrIsHeld());
    // Through: nothing is in its way.
    ghost.reactorWalkTo(30, 14);
    const straight = w.run(2000, () => !ghost.isMoveRouteForcing());
    assert.deepEqual([ghost.x, ghost.y], [30, 14]);
    assert.ok(straight <= 20 * 16 + 4, `straight through the wall (${straight} frames)`);
});

test('nothing is searched while a walker is in the air, and a walker waits its turn for the one search', () => {
    const w = followerWorld({ width: 60, height: 30, start: [2, 2], events: [still(1, 10, 10), still(2, 10, 12), still(3, 10, 14)] });
    const searches = countSearches(w);
    const walkers = [1, 2, 3].map(id => w.$gameMap.event(id));
    walkers.forEach((walker, i) => walker.reactorWalkTo(40, 10 + i * 2));
    w.run(3000, () => walkers.every(walker => !walker.isMoveRouteForcing()));
    assert.deepEqual(walkers.map(walker => walker.x + ',' + walker.y), ['40,10', '40,12', '40,14'], 'all three arrive');
    assert.equal(searches.begun, 3);
    // An event erased in the middle of its search does not hold the others up.
    const far = followerWorld({ width: 120, height: 90, walls: [[60, 0, 60, 80]], start: [2, 2], events: [still(1, 10, 40), still(2, 10, 42)] });
    const lost = far.$gameMap.event(1), other = far.$gameMap.event(2);
    lost.reactorWalkTo(110, 40);
    far.run(2);
    assert.ok(far.Game_Character._walkSearch && far.Game_Character._walkSearch.owner === lost, 'its search is under way');
    lost._reactorWalk = null;
    lost._moveRouteForcing = false;
    other.reactorWalkTo(20, 42);
    far.run(600, () => !other.isMoveRouteForcing());
    assert.deepEqual([other.x, other.y], [20, 42]);
});

//-----------------------------------------------------------------------------
// North Haven (the Demo's Map005): up a staircase, by the levels of the 3D
// map. The map's rocks and events are left out: rocks take long to mesh and
// none stands on a staircase, and the Demo's events change. So do its
// buildings: the staircase is looked for in the data, not taken from a
// fixed tile.

const baseline = path.join(repo, 'scratchpad', 'ux-pass', 'baseline', 'demo-data');
const demo = fs.existsSync(path.join(baseline, 'Map005.r3d.json')) ? baseline : path.join(repo, 'template', 'Demo', 'data');

/** A staircase of the map: its stairs from the foot (z 0) up, where five rise one after another in a line. */
function staircase(map) {
    const stairs = map.reactor3d.pieces.filter(piece => piece.kind === 'stair');
    for (const foot of stairs.filter(piece => piece.z === 0)) {
        const next = stairs.find(piece => piece.z === 1 && Math.abs(piece.x - foot.x) + Math.abs(piece.y - foot.y) === 1);
        if (!next) continue;
        const dx = next.x - foot.x, dy = next.y - foot.y, run = [foot];
        for (let z = 1; z < 5; z++) {
            const stair = stairs.find(piece => piece.z === z && piece.x === foot.x + dx * z && piece.y === foot.y + dy * z);
            if (stair) run.push(stair);
        }
        if (run.length === 5) return { run, dx, dy };
    }
    return null;
}

test('North Haven: up a staircase to the floor above, each step by the 3D map\'s own rule', t => {
    if (!fs.existsSync(path.join(demo, 'Map005.r3d.json'))) return t.skip('the Demo is not in this checkout');
    let stairs = null;
    const w = followerWorld({ data: demo, mapId: 5, start: [1, 1], party: [1, 2, 3], prepare: map => {
        map.reactor3d.pieces = map.reactor3d.pieces.filter(piece => piece.kind !== 'rock');
        map.events = [null];
        stairs = staircase(map);
    } });
    if (!stairs) return t.skip('the map has no staircase of five stairs');
    const p = w.$gamePlayer, { run, dx, dy } = stairs, foot = run[0], top = run[4];
    assert.ok(w.Reactor3D.isMap3D(w.$dataMap));
    // From the floor some tiles before the foot of the stairs: beyond a wall of the house where there is one, so
    // the way leads round by its door.
    let from = null, found = null;
    for (const back of [3, 2, 1]) {
        from = [foot.x - dx * back, foot.y - dy * back];
        p.locate(from[0], from[1]);
        w.run(5);
        found = p.reactorFindPath(top.x, top.y);
        if (found.reached) break;
    }
    const ground = p._reactorGround;
    assert.equal(found.reached, true, 'a way up is found');
    assert.ok(found.length >= 5 && found.length <= 40, `to the foot and up the stairs (${found.length} steps)`);
    assert.ok(found.opened < 400, `without looking over the village (${found.opened} tiles)`);
    const stood = [];
    const frames = runList(w, [setRoute(-1, [moveTo(top.x, top.y)])], { limit: 2000, each: () => {
        if (!p.isMoving()) stood.push([p.x, p.y, p._reactorGround]);
    } });
    assert.deepEqual([p.x, p.y], [top.x, top.y], `on the top stair (${frames} frames)`);
    assert.ok(p._reactorGround - ground > 4 && p._reactorGround - ground < 5, `four and a half tiles up (${p._reactorGround} from ${ground})`);
    // It came by the stairs: each in turn, a stair's rise at a time, never from the floor to the top at once.
    for (const stair of run) assert.ok(stood.some(([x, y]) => x === stair.x && y === stair.y), `it stood on the stair at ${stair.x},${stair.y}`);
    let rise = 0;
    for (let i = 1; i < stood.length; i++) rise = Math.max(rise, Math.abs(stood[i][2] - stood[i - 1][2]));
    assert.ok(rise <= 1.2, `no step rose more than a stair (${rise})`);
    // And down again to where it started.
    runList(w, [setRoute(-1, [moveTo(from[0], from[1])])], { limit: 2000 });
    assert.deepEqual([p.x, p.y], from);
    assert.ok(Math.abs(p._reactorGround - ground) < 0.3, 'on the floor again');
});

test('two floors over one tile: a walk that names the floor comes to the tile on that floor, and a whole way or none', () => {
    // A floor five tiles up over x 4..10, y 4..12, and stairs rising west along y = 12 from (15, 12) to its edge.
    const pieces = [];
    for (let x = 4; x <= 10; x++) for (let y = 4; y <= 12; y++) pieces.push({ id: pieces.length + 1, kind: 'floor', x, y, z: 5, rot: 0, material: '' });
    for (let z = 0; z < 5; z++) pieces.push({ id: pieces.length + 1, kind: 'stair', x: 15 - z, y: 12, z, rot: 1, material: '' });
    const w = followerWorld({ flat: false, width: 24, height: 24, start: [7, 16], party: [1], sidecar: { pieces } });
    const p = w.$gamePlayer, C = w.Game_Character;
    w.run(5);
    assert.ok(Math.abs(p._reactorGround) < 0.2, 'on the ground');
    // No floor named: the tile as it is come to first, under the floor above.
    const under = p.reactorFindPath(7, 7);
    assert.deepEqual([under.reached, under.length], [true, 9]);
    assert.deepEqual([p.reactorFindPath(7, 7, 0).reached, p.reactorFindPath(7, 7, 0).length], [true, 9], 'the ground floor named: the same way');
    // The floor above named: round by the stairs.
    const above = p.reactorFindPath(7, 7, 5);
    assert.equal(above.reached, true);
    assert.ok(above.length > 20 && above.length < 40, `by the stairs (${above.length} steps)`);
    assert.equal(C.walkRoute(7, 7, true, 5, true).list[0].parameters[0], 'this.reactorMoveToTile(7, 7, 5, true);');
    assert.equal(C.walkRoute(7, 7).list[0].parameters[0], 'this.reactorMoveToTile(7, 7);', 'a walk that names no floor is written as before');
    p.forceMoveRoute(C.walkRoute(7, 7, true, 5, false));
    let passedUnder = false;
    w.run(3000, () => { if (p.x === 7 && p.y === 7 && p._reactorGround < 1) passedUnder = true; return !p.isMoveRouteForcing(); });
    assert.deepEqual([p.x, p.y], [7, 7]);
    assert.ok(p._reactorGround > 4.9, `on the floor above (${p._reactorGround})`);
    assert.equal(passedUnder, false);
    // Standing over the tile is not standing on it: the walk to the ground floor's tile sets off.
    p.forceMoveRoute(C.walkRoute(7, 7, true, 0, false));
    w.run(3000, () => !p.isMoveRouteForcing());
    assert.deepEqual([p.x, p.y], [7, 7]);
    assert.ok(p._reactorGround < 0.2, `on the ground under it (${p._reactorGround})`);
    // The whole way or none: with the stairs gone the floor above cannot be come to, and the walker does not set off
    // for the tile under it.
    const alone = followerWorld({ flat: false, width: 24, height: 24, start: [7, 16], party: [1], sidecar: { pieces: pieces.filter(piece => piece.kind !== 'stair') } });
    const q = alone.$gamePlayer;
    alone.run(5);
    q.forceMoveRoute(alone.Game_Character.walkRoute(7, 7, true, 5, true));
    let moved = false;
    alone.run(600, () => { if (q.isMoving()) moved = true; return !q.isMoveRouteForcing(); });
    assert.equal(q.isMoveRouteForcing(), false, 'the walk is over');
    assert.equal(moved, false, 'it never set off');
    assert.deepEqual([q.x, q.y], [7, 16]);
    // Without "whole" it goes as near as it can: under the tile.
    q.forceMoveRoute(alone.Game_Character.walkRoute(7, 7, true, 5, false));
    alone.run(3000, () => !q.isMoveRouteForcing());
    assert.ok(Math.abs(q.x - 7) + Math.abs(q.y - 7) <= 9 && q._reactorGround < 0.2, 'as near as the ground comes');
});

test('a whole way of at most so many steps: a longer way round is not taken, a shorter one is', () => {
    // A wall along x = 12 from the top of the map down to y = 20: the way from (8, 5) to (16, 5) is round its end.
    const w = followerWorld({ width: 30, height: 30, start: [8, 5], party: [1], walls: [[12, 0, 12, 20]] });
    const p = w.$gamePlayer, C = w.Game_Character;
    const round = p.reactorFindPath(16, 5);
    assert.equal(round.reached, true);
    assert.equal(round.length, 40, 'round the wall');
    assert.equal(C.walkRoute(16, 5, true, undefined, 24).list[0].parameters[0], 'this.reactorMoveToTile(16, 5, undefined, 24);');
    assert.equal(C.walkRoute(16, 5, true, undefined, true).list[0].parameters[0], 'this.reactorMoveToTile(16, 5, undefined, true);');
    // At most 24 steps: the walker does not set off.
    p.forceMoveRoute(C.walkRoute(16, 5, true, undefined, 24));
    let moved = false;
    w.run(600, () => { if (p.isMoving()) moved = true; return !p.isMoveRouteForcing(); });
    assert.equal(p.isMoveRouteForcing(), false, 'the walk is over');
    assert.equal(moved, false, 'it never set off');
    assert.deepEqual([p.x, p.y], [8, 5]);
    // At most 40: the whole way is walked. A save in the middle keeps the bound.
    p.forceMoveRoute(C.walkRoute(16, 5, true, undefined, 40));
    w.run(120);
    assert.deepEqual([p._reactorWalk.whole, p._reactorWalk.most], [true, 40]);
    w.saveAndLoad();
    const q = w.$gamePlayer;
    assert.deepEqual([q._reactorWalk.whole, q._reactorWalk.most], [true, 40]);
    w.run(3000, () => !q.isMoveRouteForcing());
    assert.deepEqual([q.x, q.y], [16, 5]);
});

test('Teleport to Tile: the character stands there at once, past a wall, and the route goes straight on', () => {
    const teleport = (x, y) => SetMovementRouteEditor.routeCommand('teleport', { x, y });
    const step = teleport(50, 20);
    assert.deepEqual(SetMovementRouteEditor.parseRouteCommand(step), { op: 'teleport', x: 50, y: 20 });
    assert.match(step.parameters[0], /\nif \(typeof this\.reactorTeleportTo === "function"\) this\.reactorTeleportTo\(50, 20\);$/);
    assert.equal(SetMovementRouteEditor.stepText({ op: 'teleport', x: 50, y: 20 }), 'Teleport to (50, 20)');
    const w = followerWorld({ width: 70, height: 50, walls: [[30, 5, 30, 34]], start: [2, 2], events: [still(1, 10, 20)] });
    const walker = w.$gameMap.event(1);
    const seen = [];
    const frames = runList(w, [setRoute(1, [teleport(50, 20), { code: 27, parameters: [3] }])], {
        eventId: 1, each: () => seen.push(walker.x + ',' + walker.y)
    });
    assert.deepEqual([walker.x, walker.y], [50, 20], 'it stands on the tile');
    assert.deepEqual([walker._realX, walker._realY], [50, 20], 'drawn there too, with no slide');
    assert.ok(seen.every(at => at === '10,20' || at === '50,20'), 'no tile in between');
    assert.equal(w.$gameSwitches.value(3), true, 'the route went on');
    assert.ok(frames < 10, `no wait for a walk (${frames} frames)`);
    // Off the map: nothing happens.
    runList(w, [setRoute(1, [teleport(500, 20)])], { eventId: 1 });
    assert.deepEqual([walker.x, walker.y], [50, 20]);
    // The player: the camera and followers come along.
    runList(w, [setRoute(-1, [teleport(40, 40)])]);
    assert.deepEqual([w.$gamePlayer.x, w.$gamePlayer.y], [40, 40]);
});
