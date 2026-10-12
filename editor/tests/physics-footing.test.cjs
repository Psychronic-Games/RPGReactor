// Nobody is lifted, launched, dropped through or trapped by the world: the ground a moving body reads, the layer it
// keeps, what it may stand on, the corners it may cut, the low ledges it climbs by itself.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { fightWorld } = require('./helpers/fight-world.cjs');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');
const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const LIMIT = R.TERRAIN_SLOPE_LIMIT;

let nextId = 1;
const piece = (kind, x, y, z, more) => Object.assign({ id: nextId++, kind, x, y, z, rot: 0, material: '' }, more || {});
const column = (x, y, levels) => Array.from({ length: levels }, (unused, z) => piece('block', x, y, z));
const mapOf = (pieces, width = 14, height = 14) => ({ width, height, note: '<3d>', reactor3d: { version: 1, mode: '3d', pieces } });
/** A street lamp as the Demo builds one: a plinth, a thin post, a cap, a lantern, a finial. One unbroken stack 5.47 high. */
const lamp = (x, y) => [
    piece('cylinder', x, y, 0, { size: [0.42, 0.35, 0.42] }), piece('cylinder', x, y, 0.25, { size: [0.24, 3.95, 0.24] }),
    piece('cylinder', x, y, 4, { size: [0.36, 0.2, 0.36] }), piece('box', x, y, 4.25, { size: [0.46, 0.62, 0.46] }),
    piece('pyramid', x, y, 4.75, { size: [0.62, 0.5, 0.62] }), piece('cylinder', x, y, 5.25, { size: [0.08, 0.22, 0.08] })
];

/** The physics alone, in its own realm, over the real world rules and a map. */
function sandbox(map, physics = {}) {
    const context = { console, Math, JSON, Number, Object, Array, WeakMap, Map, Reactor3D: R, $dataSystem: { reactorPhysics: physics }, $dataMap: map,
        Input: { keyMapper: {}, gamepadMapper: {} } };
    context.window = context; context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(read('runtime/reactor_controls.js'), context);
    vm.runInContext(read('runtime/reactor_physics.js'), context);
    return context;
}
const plainLevel = level => [Math.round(level.top * 100) / 100, level.kind, level.stand];
/** A character as the physics sees one. */
function body(x, y, more) {
    return Object.assign({ _x: x, _y: y, _realX: x, _realY: y, _reactorGround: 0, _reactorAlt: 0, _d: 2, blocked: false,
        get x() { return this._x; }, get y() { return this._y; },
        isMoving() { return this._realX !== this._x || this._realY !== this._y; },
        setDirection(d) { this._d = d; }, direction() { return this._d; }, reverseDir(d) { return 10 - d; },
        isThrough() { return false; }, isCollidedWithCharacters() { return this.blocked; } }, more || {});
}
/** One frame: the walk toward its cell at `per` tiles a frame (a sixteenth walking, an eighth dashing), then the physics. */
function frame(P, c, per = 1 / 16) {
    for (const key of ['X', 'Y']) {
        const real = '_real' + key, cell = '_' + key.toLowerCase();
        if (c[real] < c[cell]) c[real] = Math.min(c[cell], c[real] + per);
        else if (c[real] > c[cell]) c[real] = Math.max(c[cell], c[real] - per);
    }
    P.update(c);
}
/** Walk a body one step to (x2, y2) whatever stands there, and return the largest rise of its height in one frame. */
function stepTo(P, c, x2, y2, per) {
    c._x = x2; c._y = y2;
    let last = c._reactorAlt, rise = 0;
    for (let i = 0; i < 20 && c.isMoving(); i++) { frame(P, c, per); rise = Math.max(rise, c._reactorAlt - last); last = c._reactorAlt; }
    return rise;
}

/**
 * The game's own map objects over a 3D map: Game_Map, Game_Player and a follower from the shipped runtime, every tile
 * passable, the physics loaded on top as the game loads it. `hold(dir, frames)` plays frames with a direction held:
 * 2, 4, 6, 8, or [horz, vert] for a diagonal, taken as the camera-relative walk takes it (reactor_3d.js moveByInput):
 * the diagonal, else its vertical step, else its horizontal one.
 */
function gameWorld(map, system = {}) {
    const ctx = fightWorld({ system });
    const size = map.width * map.height;
    const data = new Array(size * 6).fill(0);
    for (let i = 0; i < size; i++) data[i] = 1536;
    Object.assign(ctx.$dataMap, { width: map.width, height: map.height, data, note: map.note, reactor3d: map.reactor3d, events: [null] });
    ctx.Reactor3D = R;
    ctx.Input.keyMapper = {}; ctx.Input.gamepadMapper = {};
    ctx.console = Object.assign({}, console, { info() {} });
    vm.runInContext(read('runtime/reactor_controls.js'), ctx);
    vm.runInContext(read('runtime/reactor_physics.js'), ctx);
    vm.runInContext('$gameMap.setup(1);', ctx);
    const player = ctx.$gamePlayer, P = ctx.ReactorPhysics;
    const keys = { dir: 0, jump: false, dash: false };
    ctx.Input.isPressed = name => (name === 'shift' ? keys.dash : false);
    ctx.Input.isTriggered = name => name === 'jump' && keys.jump;
    player.moveByInput = function() {
        if (this.isMoving() || !this.canMove() || !keys.dir) return;
        if (Array.isArray(keys.dir)) {
            this.moveDiagonally(keys.dir[0], keys.dir[1]);
            if (!this.isMovementSucceeded()) this.executeMove(keys.dir[1]);
            if (!this.isMovementSucceeded()) this.executeMove(keys.dir[0]);
        } else this.executeMove(keys.dir);
    };
    const alt = c => (Number.isFinite(c._reactorAlt) ? c._reactorAlt : c._reactorGround);
    const tick = () => { ctx.Graphics.frameCount++; ctx.$gameMap.update(true); player.update(true); keys.jump = false; };
    /** Put the party on a cell, at rest, on the floor nearest `height` (the ground floor when not given). */
    const place = (x, y, height) => {
        keys.dir = 0;
        player.locate(x, y); player.followers().synchronize(x, y, 2);
        for (const c of [player, ...player.followers()._data]) { c._reactorGround = height; c._reactorAlt = height; }
        tick(); tick();
    };
    /** Hold a direction for some frames; returns the largest one-frame rise of the player's and the followers' heights, and the highest reached. */
    const hold = (dir, frames, more = {}) => {
        keys.dir = dir; keys.dash = !!more.dash;
        const walkers = [player, ...player.followers().visibleFollowers()];
        const last = walkers.map(alt);
        let rise = 0, top = alt(player);
        for (let f = 0; f < frames; f++) {
            if (more.jumpAt === f) keys.jump = true;
            tick();
            walkers.forEach((c, i) => { const a = alt(c); if (!c._reactorMantle) rise = Math.max(rise, a - last[i]); last[i] = a; });
            top = Math.max(top, alt(player));
        }
        keys.dir = 0;
        return { rise, top, x: player.x, y: player.y, alt: alt(player) };
    };
    return { ctx, P, player, place, hold, tick, alt, keys };
}

/** The Inn of North Haven, from the Demo: its real pieces on level ground (tests/fixtures/north-haven-inn.json). */
function innMap() {
    const fixture = JSON.parse(read('editor/tests/fixtures/north-haven-inn.json'));
    const pieces = [];
    for (const kind of Object.keys(fixture.cells)) for (const [x, y, z, rot] of fixture.cells[kind]) pieces.push(piece(kind, x, y, z, { rot: rot || 0 }));
    for (const whole of fixture.whole) pieces.push(Object.assign({ material: '' }, whole, { id: nextId++ }));
    return mapOf(pieces, fixture.width, fixture.height);
}
// In the fixture the staircase climbs west along row 20, from (16, 20) up to (12, 20); the upper floor begins at (11, 20).
// The east door is at (18, 16), and an upstairs room's wall corner at (12, 14).
const INN = { foot: [17, 20], head: [11, 20], steps: [[16, 20], [15, 20], [14, 20], [13, 20], [12, 20]], door: [18, 16], upper: 5.1, ground: 0.1 };

test('a diagonal step reads its ground in the cell it leaves, then the cell it enters, never the corner between them', () => {
    const map = mapOf(lamp(5, 5));
    const P = sandbox(map).ReactorPhysics;
    // North-east from the cell west of the lamp to the cell north of it: half-way, the body's middle is the lamp's corner.
    const c = body(4, 5);
    P.update(c);
    c._x = 5; c._y = 4; c._realX = 4.5; c._realY = 4.5;
    const half = P.groundPoint(c, []);
    assert.deepEqual([Math.floor(half[0]), Math.floor(half[1])], [5, 4], 'half-way: in the cell being entered');
    assert.ok(Math.abs(half[0] - 5) < 1e-3 && Math.abs(half[1] - 5) < 1e-3, 'at its corner');
    assert.equal(Math.floor(c._realX + 0.5) + ',' + Math.floor(c._realY + 0.5), '5,5', 'where the body\'s middle floors into the lamp\'s cell');
    c._realX = 4.4375; c._realY = 4.5625;
    const before = P.groundPoint(c, []);
    assert.deepEqual([Math.floor(before[0]), Math.floor(before[1])], [4, 5], 'before half-way: in the cell being left');
    // A straight step and a body at rest read their own middle.
    const straight = body(4, 5); straight._x = 5; straight._realX = 4.5;
    assert.deepEqual(Array.from(P.groundPoint(straight, [])), [5, 5.5]);
    assert.deepEqual(Array.from(P.groundPoint(body(4, 5), [])), [4.5, 5.5]);
    assert.equal(P.groundPoint(body(1, 1)), P.groundPoint(body(2, 2)), 'without a place to put it, one shared scratch: no garbage a frame');
    // Walked through the physics, both ways past that corner, walking and dashing: the height never leaves the street.
    for (const [from, to] of [[[4, 5], [5, 4]], [[5, 4], [4, 5]]]) for (const per of [1 / 16, 1 / 8]) {
        const walker = body(from[0], from[1]);
        P.update(walker);
        const rise = stepTo(P, walker, to[0], to[1], per);
        assert.equal(rise, 0, `no lift past the lamp from ${from} at ${per}`);
        assert.deepEqual([walker._reactorAlt, walker._reactorAir], [0, 0]);
    }
    assert.equal(R.groundHeightAt(map, 5, 5, 0), 5.47, 'the corner itself still reads as the lamp\'s top');
});

test('the view draws a character on the ground the physics read: not a corner cell, and the feet\'s own height on a step', () => {
    // The world rules live in this realm: the physics and the map are made visible to them as the game has them.
    const map = mapOf([piece('box', 5, 5, 0, { size: [1, 1, 1] }), piece('box', 9, 5, 0, { size: [1, 0.6, 1] })]);
    const P = sandbox(map).ReactorPhysics;
    const had = { physics: Object.getOwnPropertyDescriptor(globalThis, 'ReactorPhysics'), map: Object.getOwnPropertyDescriptor(globalThis, '$dataMap') };
    globalThis.ReactorPhysics = P; globalThis.$dataMap = map;
    try {
        // Half-way along a diagonal past a crate, before the physics has run for this character (its first frame on
        // the map): the middle of the body floors into the crate's cell, a tile up and within a step's reach.
        const fresh = body(5, 4, { _realX: 4.5, _realY: 4.5, _reactorAlt: undefined });
        assert.equal(R.groundHeightAt(map, fresh._realX + 0.5, fresh._realY + 0.5, 0), 1, 'the crate, read under the body\'s middle');
        assert.equal(R.characterGround(map, fresh), 0, 'the cell being entered is what is drawn');
        // Coming up a kerb, the physics eases the feet up and reports their height as the ground: the view draws
        // that, and does not read the kerb's top again or write over what the physics keeps.
        const k = body(8, 5);
        P.update(k);
        k._x = 9;
        for (let i = 0; i < 8; i++) frame(P, k);
        assert.deepEqual([k._reactorAlt, k._reactorGround, k._reactorStepUp, R.groundHeightAt(map, k._realX + 0.5, 5.5, 0.3)], [0.3, 0.3, 0.6, 0.6]);
        assert.equal(R.characterGround(map, k), 0.3);
        assert.equal(k._reactorGround, 0.3, 'and it is left as the physics set it');
        // Another map than the one being played (the editor's preview) is read from the map's own data.
        const other = mapOf([]);
        assert.equal(R.characterGround(other, body(5, 5, { _reactorGround: 3, _reactorAlt: 3 })), 0);
    } finally {
        for (const [name, was] of [['ReactorPhysics', had.physics], ['$dataMap', had.map]]) { if (was) Object.defineProperty(globalThis, name, was); else delete globalThis[name]; }
    }
    // The camera follows the same answer: the player's elevation is the physics' ground where the physics runs.
    assert.match(read('runtime/reactor_3d.js'), /const ground = Number\.isFinite\(\$gamePlayer\._reactorGround\) && Number\.isFinite\(\$gamePlayer\._reactorAlt\) \? \$gamePlayer\._reactorGround : elevationAt\(x, y\);\n\s+const elevation = ground \+ \(\$gamePlayer\._reactorLift \|\| 0\) \+ \(\$gamePlayer\._reactorAir \|\| 0\);/);
});

test('a body keeps the layer it is on: a wall beside it or a slab over it is never ground it walked or flew onto', () => {
    // Walked into a wall (a follower passes through what stops its leader): it stays at its height inside it.
    const map = mapOf([piece('wall', 5, 5, 0), ...column(8, 5, 1), piece('floor', 9, 5, 3), piece('floor', 2, 2, 4),
        piece('box', 11, 9, 0, { size: [1, 0.6, 1] }), piece('floor', 11, 9, 3)]);
    const P = sandbox(map).ReactorPhysics;
    const ghost = body(4, 5);
    P.update(ghost);
    assert.equal(stepTo(P, ghost, 5, 5), 0, 'not lifted onto the wall');
    assert.deepEqual([ghost._reactorAlt, ghost._reactorGround], [0, 0]);
    // A wall that appears where a body stands (a door shutting on it) does not carry it up.
    const still = body(1, 1);
    P.update(still);
    map.reactor3d.pieces = map.reactor3d.pieces.concat([piece('wall', 1, 1, 0)]);
    P.update(still);
    assert.equal(still._reactorAlt, 0, 'stays put');
    // Somebody placing it (a transfer, a unit sent upstairs) is not a walk: there at once.
    const placed = body(5, 5, { _reactorGround: undefined, _reactorAlt: undefined });
    P.update(placed);
    assert.equal(placed._reactorAlt, 5, 'a body located on a wall stands on it');
    const sent = body(9, 5); P.update(sent);
    sent._reactorGround = 3.1; P.update(sent);
    assert.equal(sent._reactorAlt, 3.1, 'ground chosen for it (a Tactical unit sent to the floor above) is taken');
    // The same while it is half-way up a kerb: the ground it is given counts, not the kerb it was climbing.
    const climbing = body(10, 9);
    P.update(climbing);
    climbing._x = 11;
    for (let i = 0; i < 8; i++) frame(P, climbing);
    assert.deepEqual([climbing._reactorAlt, climbing._reactorStepUp], [0.3, 0.6]);
    climbing._reactorGround = 3.1; P.update(climbing);
    assert.deepEqual([climbing._reactorAlt, climbing._reactorGround, climbing._reactorStepUp], [3.1, 3.1, undefined], 'sent upstairs from half-way up a kerb');
    // A jump off a crate, in the air under a slab whose underside is within a body's reach of its feet: the slab used
    // to read as the ground it was "on", and the jump was carried up through it.
    const jumper = body(9, 5, { _reactorGround: 0, _reactorAlt: 1.6, _reactorAir: 1.6, _reactorVz: 0.05, _reactorPeak: 1.6 });
    assert.equal(R.groundHeightAt(map, 9.5, 5.5, 1.6), 3.1, 'the slab is what the ground query answers at that height');
    P.update(jumper);
    assert.ok(jumper._reactorAlt < 1.7, `not carried up through the slab (${jumper._reactorAlt})`);
    assert.equal(jumper._reactorGround, 0, 'the floor under it is still its ground');
    // And it cannot get there: in the air, a cell where something hangs at chest height is shut.
    const offCrate = body(8, 5, { _reactorGround: 1, _reactorAlt: 1.9, _reactorAir: 0.9, _reactorVz: 0.04 });
    assert.equal(P.airBlocks(offCrate, 9, 5), true);
    assert.equal(P.airBlocks(offCrate, 8, 4), false, 'open air is not');
    // The same for something that hangs lower than the jumper's chest over ground it could otherwise come down on
    // (an awning two tiles over its feet), and for the cell under a raised stair, which is solid down to the ground.
    const low = mapOf([piece('floor', 5, 5, 3), piece('stair', 8, 5, 3, { rot: 3 })]);
    const L = sandbox(low).ReactorPhysics;
    const hop = (x, y, feet) => body(x, y, { _reactorGround: 0, _reactorAlt: feet, _reactorAir: feet, _reactorVz: 0.02 });
    assert.deepEqual([R.groundHeightAt(low, 5.5, 5.5, 0.6), L.ceilingAbove(low, 5, 5, 0.6)], [0, 3], 'the ground under the awning is what a jumper is over');
    assert.equal(L.airBlocks(hop(4, 5, 0.6), 5, 5), true, 'an awning 2.4 tiles over the feet: at the chest');
    assert.equal(L.airBlocks(hop(4, 5, 0.2), 5, 5), false, 'at 2.8 the head only grazes it: passed under');
    assert.deepEqual([L.ceilingAbove(low, 8, 5, 0.2), R.groundHeightAt(low, 8.5, 5.5, 0.2)], [3, 0], 'a stair three tiles up, the ground under it');
    assert.equal(L.airBlocks(hop(7, 5, 0.2), 8, 5), true, 'under a raised stair, which the awning\'s height would let pass');
    // Jumping under a slab, the head stops at its underside: four tiles of room, a body three tall, a jump of 1.25.
    const under = body(2, 2);
    P.update(under);
    assert.equal(P.jump(under), true);
    let peak = 0;
    for (let i = 0; i < 80; i++) { P.update(under); peak = Math.max(peak, under._reactorAlt); }
    assert.ok(Math.abs(peak - 1) < 1e-9, `the head stops under the slab (${peak})`);
    assert.equal(under._reactorAlt, 0, 'and it comes back down');
    assert.deepEqual([P.headroom(under), P.headroom(body(8, 8))], [1, Infinity]);
    // Where there is no room to rise at all, Jump does nothing: no leap, no sound, and the reason is said.
    const cramped = sandbox(mapOf([piece('box', 2, 2, 3, { size: [1, 0.2, 1] }), piece('box', 5, 2, 3.25, { size: [1, 0.2, 1] })]));
    const C = cramped.ReactorPhysics;
    let sounds = 0;
    cramped.SoundManager = { playJump() { sounds++; } };
    cramped.console = { info() {} };
    const stuck = body(2, 2);
    C.update(stuck);
    assert.deepEqual([C.headroom(stuck), C.headroom(body(5, 2)), C.JUMP_MIN_ROOM], [0, 0.25, 0.25]);
    assert.equal(C.jump(stuck), false, 'an awning at the top of the head: no jump');
    assert.deepEqual([sounds, stuck._reactorVz, !!stuck._reactorLeap, C.isAirborne(stuck)], [0, 0, false, false]);
    C.noteJumpRefused(stuck);
    assert.equal(C.lastJumpRefusal.reason, 'no room overhead');
    const room = body(5, 2);
    C.update(room);
    assert.equal(C.jump(room), true, 'a quarter of a tile is room to hop');
    let top = 0;
    for (let i = 0; i < 60; i++) { C.update(room); top = Math.max(top, room._reactorAlt); }
    assert.deepEqual([sounds, Math.abs(top - 0.25) < 1e-9, room._reactorAlt], [1, true, 0]);
    // A climber lets go of its ladder with Jump wherever it is.
    const onLadder = body(2, 2, { _reactorOnLadder: true, _reactorAlt: 0.05 });
    assert.equal(C.jump(onLadder), true);
});

test('a walker that steps off an edge falls where it stepped off: a hole one tile wide is fallen into, a jump is what crosses it', () => {
    // The Inn's upper floor, beside the opening the stairs come up through: one tile wide, the run 2.6 tiles below.
    const map = innMap();
    const w = gameWorld(map);
    const { P } = w;
    assert.deepEqual([P.edge(map, 14, 19, 2, INN.upper).kind, +P.edge(map, 14, 19, 2, INN.upper).to.toFixed(1)], ['drop', 2.5], 'off the floor onto the run');
    assert.ok(P.levelsAt(map, 14, 21).some(l => Math.abs(l.top - INN.upper) < 0.01), 'and the floor goes on at the far side');
    for (const dash of [false, true]) {
        w.place(14, 18, INN.upper);
        const fell = w.hold(2, 90, { dash });
        assert.deepEqual([fell.x, fell.y, +fell.alt.toFixed(1)], [14, 20, 2.5], `walked into the stairwell${dash ? ' at a run' : ''}: down on the run, not across`);
        assert.ok(fell.rise <= LIMIT, 'and nobody was lifted');
    }
    // Two walls two tiles apart, three tiles high: a walk off one ends on the ground between them; a jump from the
    // edge is still coming down over the gap when its next step is asked for, and lands on the other.
    const gap = mapOf([...column(4, 5, 3), ...column(5, 5, 3), ...column(8, 5, 3), ...column(9, 5, 3)]);
    const g = gameWorld(gap);
    // Where a walk held east comes down to the ground. (The walk goes on once the feet are within a step of the
    // ground, so that is a little way into the next step.)
    const landsAt = () => { for (let f = 0; f < 120; f++) { g.hold(6, 1); if (g.alt(g.player) === 0) return g.player._realX; } return null; };
    g.place(4, 5, 3);
    const walked = landsAt();
    assert.ok(walked >= 6 && walked < 6.5, `walked off: down beside the wall it left (${walked})`);
    g.place(5, 5, 3);
    const jumped = g.hold(6, 70, { jumpAt: 0 });
    assert.deepEqual([jumped.x >= 8, jumped.alt, jumped.top > 4], [true, 3, true], `jumped: over the gap (${jumped.x} at ${jumped.alt}, top ${jumped.top})`);
    // Down again, the jump is over: walking on off the far wall's end is a fall like the first.
    g.place(8, 5, 3);
    g.keys.jump = true;
    g.tick();
    assert.equal(g.P.isAirborne(g.player), true);
    for (let f = 0; f < 80; f++) g.tick();
    assert.deepEqual([g.player.x, g.alt(g.player)], [8, 3], 'a jump on the spot');
    const landed = landsAt();
    assert.ok(landed >= 10 && landed < 10.5, `off the end of the wall: down beside it (${landed})`);
    // In the air, only a jumper steers and takes hold of an edge by itself.
    const faller = body(7, 5, { _reactorGround: 0, _reactorAlt: 2.6, _reactorAir: 2.6, _reactorVz: -0.03 });
    assert.equal(g.P.fellOff(faller), true);
    assert.equal(g.P.fellOff(Object.assign(faller, { _reactorJumped: true })), false, 'a jump on its way down is still a jump');
    assert.equal(g.P.fellOff(body(7, 5, { _reactorGround: 0, _reactorAlt: 0.5, _reactorAir: 0.5, _reactorVz: 0 })), false, 'a step\'s height over the ground is no fall');
});

test('on a 3D map a diagonal step needs both cells beside it open and nothing at the corner over the walker', () => {
    // A lamp, a crate and a wall, each with open ground round it; a kerb half a tile high, which is walked.
    const map = mapOf([...lamp(5, 5), piece('box', 9, 5, 0, { size: [1, 1, 1] }), piece('wall', 5, 9, 0), piece('box', 9, 9, 0, { size: [1, 0.5, 1] })]);
    const w = gameWorld(map);
    const NE = [6, 8], SW = [4, 2], NW = [4, 8], SE = [6, 2];
    for (const [x, y, what] of [[5, 5, 'lamp'], [9, 5, 'crate'], [5, 9, 'wall']]) {
        for (const [from, way] of [[[x - 1, y], NE], [[x, y - 1], SW], [[x + 1, y], NW], [[x, y - 1], SE], [[x - 1, y], SE], [[x, y + 1], NE], [[x + 1, y], SW], [[x, y + 1], NW]]) {
            w.place(from[0], from[1]);
            assert.equal(w.player.canPassDiagonally(from[0], from[1], way[0], way[1]), false, `no cutting past the ${what} from ${from} toward ${way}`);
            // The walk goes round by the straight steps instead, and nobody leaves the ground.
            const walked = w.hold(way, 40);
            assert.ok(walked.rise <= LIMIT && walked.top < 0.8, `walking ${way} from ${from} past the ${what}: rise ${walked.rise}, top ${walked.top}`);
            assert.ok(walked.x !== from[0] || walked.y !== from[1], 'and it does walk on');
        }
    }
    // Both ways round have to be open, whatever shuts one of them: somebody standing in the cell beside the step, or
    // a tile that is not walked, on level ground with nothing at the corner.
    w.place(1, 11);
    assert.equal(w.P.cornerBlocks(w.player, 1, 11, 6, 2), false);
    w.player.isCollidedWithCharacters = (x, y) => x === 2 && y === 11;
    assert.deepEqual([w.player.canPass(1, 11, 2), w.player.canPass(1, 12, 6), w.player.canPass(1, 11, 6)], [true, true, false], 'south then east is open, east is not');
    assert.equal(w.player.canPassDiagonally(1, 11, 6, 2), false, 'not past somebody\'s shoulder');
    delete w.player.isCollidedWithCharacters;
    const tiles = w.ctx.$gameMap.isPassable;
    w.ctx.$gameMap.isPassable = function(x, y) { return !(x === 1 && y === 12) && tiles.apply(this, arguments); };
    assert.equal(w.player.canPassDiagonally(1, 11, 6, 2), false, 'nor over the corner of a tile that is not walked');
    w.ctx.$gameMap.isPassable = tiles;
    // Open ground and a kerb are cut as before.
    w.place(1, 1);
    assert.equal(w.player.canPassDiagonally(1, 1, 6, 2), true);
    w.place(8, 9);
    assert.equal(w.player.canPassDiagonally(8, 9, 6, 8), true, 'a kerb is a step: the corner is walked');
    // A character nothing stops (a follower) is not asked.
    assert.equal(w.player.followers().follower(0).canPassDiagonally(4, 5, 6, 8), true);
    // The corner rule alone: what stands at the point the four cells share, in any of them.
    w.place(4, 5);
    assert.equal(w.P.cornerBlocks(w.player, 4, 5, 6, 8), true, 'the lamp at the corner');
    assert.equal(w.P.cornerBlocks(w.player, 4, 5, 4, 8), false, 'open ground the other way');
    // A 2D map keeps the stock rule: one open way round is enough.
    const flat = gameWorld({ width: 14, height: 14, note: '', reactor3d: undefined });
    flat.ctx.$gameMap.isPassable = (x, y) => !(x === 5 && y === 5);
    flat.place(4, 5);
    assert.equal(flat.player.canPassDiagonally(4, 5, 6, 8), true, 'north then east is open');
});

test('the Inn\'s staircase, its door and its upper floor: walked every way, nobody is lifted off the floor they are on', () => {
    const map = innMap();
    const w = gameWorld(map);
    const { P } = w;
    assert.deepEqual(INN.steps.map(([x, y]) => +P.levelsAt(map, x, y).find(l => l.kind === 'stair').top.toFixed(1)), [0.5, 1.5, 2.5, 3.5, 4.5], 'the run, as stamped');
    const DIRS = { W: 4, E: 6, N: 8, S: 2, NW: [4, 8], SW: [4, 2], NE: [6, 8], SE: [6, 2] };
    // Straight up and straight down, walking and dashing: one eighth of a tile a frame at most, top to bottom.
    for (const dash of [false, true]) {
        w.place(INN.foot[0], INN.foot[1], INN.ground);
        const up = w.hold(4, 140, { dash });
        assert.ok(Math.abs(up.alt - INN.upper) < 0.01 && up.x < INN.head[0], `up the stairs onto the upper floor (${up.x},${up.y} at ${up.alt})`);
        assert.ok(up.rise <= 0.126, `climbed, not popped (${up.rise})`);
        const down = w.hold(6, 180, { dash });
        assert.ok(Math.abs(down.alt - INN.ground) < 0.01 && down.x >= INN.foot[0], `and back down (${down.x},${down.y} at ${down.alt})`);
        assert.ok(down.rise <= 0.126, `never lifted on the way down (${down.rise})`);
    }
    // From every cell round the foot and the head, and from every step, holding each of the eight ways (a diagonal
    // along the run is the walk hugging a wall): no frame lifts anybody more than a step, and nobody ends above the
    // floor the stairs lead to.
    const starts = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { starts.push([INN.foot[0] + dx, INN.foot[1] + dy, INN.ground]); starts.push([INN.head[0] + dx, INN.head[1] + dy, INN.upper]); }
    INN.steps.forEach(([x, y], i) => starts.push([x, y, i + 0.5]));
    let walks = 0;
    for (const [x, y, height] of starts) {
        if (!P.levelsAt(map, x, y).some(l => l.stand && Math.abs(l.top - height) < 0.6)) continue;
        for (const name of Object.keys(DIRS)) for (const dash of [false, true]) {
            w.place(x, y, height);
            const walked = w.hold(DIRS[name], 110, { dash });
            walks++;
            assert.ok(walked.rise <= LIMIT + 1e-6, `from ${x},${y} at ${height} holding ${name}${dash ? ' dashing' : ''}: lifted ${walked.rise.toFixed(2)} in a frame, ends ${walked.x},${walked.y} at ${walked.alt.toFixed(2)}`);
            assert.ok(walked.top <= Math.max(height, INN.upper) + 0.05, `from ${x},${y} at ${height} holding ${name}: reached ${walked.top.toFixed(2)}`);
        }
    }
    assert.ok(walks > 500, `walked ${walks} ways`);
    // The three the owner's playtest and the investigation met, by name.
    // Out of the east door on a diagonal, past its jamb: the jamb is a wall that reads as the roof ridge above it.
    w.place(INN.door[0] - 2, INN.door[1] + 2, INN.ground);
    const out = w.hold(DIRS.NE, 60);
    assert.ok(out.top < 0.2, `out of the door, on the ground (${out.top})`);
    assert.ok(out.x > INN.door[0], `and outside (${out.x},${out.y})`);
    // Upstairs, along a room's wall on a diagonal: the wall's corner reads as the attic floor.
    w.place(9, 19, INN.upper);
    const along = w.hold(DIRS.NE, 110);
    assert.ok(Math.abs(along.alt - INN.upper) < 0.01 && along.top < INN.upper + 0.05, `upstairs stays upstairs (${along.top})`);
    // Off the top step sideways, under the upper floor's slab: not a drop, the slab is at the walker's knees.
    const top = INN.steps[4];
    assert.equal(P.edge(map, top[0], top[1], 8, 4.5).kind, 'blocked', 'the stair\'s side is a wall, from the top step too');
    assert.equal(P.edge(map, top[0], top[1], 2, 4.5).kind, 'blocked');
    w.place(top[0], top[1], 4.5);
    assert.equal(w.player.canPass(top[0], top[1], 8), false);
    assert.equal(w.player.canPassDiagonally(top[0], top[1], 6, 8), false);
    // From the upper floor into the stairwell, though, the way is still open: a drop onto the run below.
    assert.equal(P.edge(map, 14, 19, 2, INN.upper).kind, 'drop');
});

test('every step the Inn allows, from every floor: no frame lifts a walker more than a step or drops it more than a stride', () => {
    const map = innMap();
    const w = gameWorld(map);
    const { P, player } = w;
    const DX = { 2: 0, 4: -1, 6: 1, 8: 0 }, DY = { 2: 1, 4: 0, 6: 0, 8: -1 };
    const at = (x, y, g) => { Object.assign(player, { _x: x, _y: y, _realX: x, _realY: y, _reactorGround: g, _reactorAlt: g, _reactorAir: 0, _reactorVz: 0, _reactorMantle: null, _reactorStepDown: false }); };
    // What is reachable on foot from outside the east door, as (cell, floor) states.
    const states = new Map(), queue = [];
    const visit = (x, y, g) => { const key = x + ',' + y + ',' + Math.round(g * 2) / 2; if (!states.has(key)) { states.set(key, [x, y, g]); queue.push([x, y, g]); } };
    visit(INN.door[0] + 2, INN.door[1], R.groundHeightAt(map, INN.door[0] + 2.5, INN.door[1] + 0.5));
    while (queue.length) {
        const [x, y, g] = queue.pop();
        for (const d of [2, 4, 6, 8]) {
            at(x, y, g);
            if (!player.canPass(x, y, d)) continue;
            const x2 = x + DX[d], y2 = y + DY[d];
            const edge = R.groundHeightAt(map, (x + x2) / 2 + 0.5, (y + y2) / 2 + 0.5, g);
            visit(x2, y2, R.groundHeightAt(map, x2 + 0.5, y2 + 0.5, edge));
        }
    }
    assert.ok([...states.values()].some(s => Math.abs(s[2] - INN.upper) < 0.01), 'the upper floor is reached');
    let steps = 0;
    const walk = (x, y, g, x2, y2, tag) => {
        for (const per of [1 / 16, 1 / 8]) {
            at(x, y, g); P.update(player);
            player._x = x2; player._y = y2;
            let last = player._reactorAlt;
            for (let i = 0; i < 16 && player.isMoving(); i++) {
                player._realX += Math.sign(x2 - player._realX) * per; player._realY += Math.sign(y2 - player._realY) * per;
                P.update(player);
                const change = player._reactorAlt - last; last = player._reactorAlt;
                assert.ok(change <= LIMIT + 1e-6, `${tag} from ${x},${y} at ${g}: up ${change.toFixed(2)} in a frame`);
                assert.ok(change >= -P.STEP_SPEED - 1e-6 || P.isAirborne(player), `${tag} from ${x},${y} at ${g}: down ${(-change).toFixed(2)} in a frame, not falling`);
            }
            steps++;
        }
    };
    for (const [x, y, g] of states.values()) {
        for (const d of [2, 4, 6, 8]) { at(x, y, g); if (player.canPass(x, y, d)) walk(x, y, g, x + DX[d], y + DY[d], 'step ' + d); }
        for (const [h, v] of [[6, 8], [4, 2], [4, 8], [6, 2]]) { at(x, y, g); if (player.canPassDiagonally(x, y, h, v)) walk(x, y, g, x + DX[h], y + DY[v], 'diagonal ' + h + v); }
    }
    assert.ok(states.size > 300 && steps > 2000, `${states.size} places, ${steps} steps`);
});

test('a top is a place to stand when it is wide enough: not a post, a rail, a gravestone\'s edge or a lamp\'s head', () => {
    const map = mapOf([
        ...lamp(5, 1),
        piece('cylinder', 5, 3, 0, { size: [0.24, 1.5, 0.24] }),        // a post a jump would reach
        piece('box', 5, 5, 0, { size: [1, 1, 0.25] }),                    // a gravestone: wide one way, thin the other
        piece('box', 5, 7, 0, { size: [0.7, 0.5, 0.7] }),                 // a bench
        piece('box', 5, 9, 0, { size: [1, 1, 1] }),                       // a crate
        piece('fence', 5, 11, 0),
        ...column(9, 3, 3), piece('fence', 10, 3, 0), piece('cylinder', 10, 5, 0, { size: [0.3, 1, 0.3] }), ...column(9, 5, 3),
        piece('box', 9, 9, 0, { size: [1, 1, 1] }), piece('floor', 9, 9, 3),        // a counter under a low roof
        piece('box', 12, 9, 0, { size: [1, 0.25, 4], tilt: 30 })          // a slab laid at a tilt: an eave
    ]);
    const c = sandbox(map), P = c.ReactorPhysics;
    const top = (x, y) => { const levels = P.levelsAt(map, x, y); return levels[levels.length - 1]; };
    assert.deepEqual([top(5, 1).stand, top(5, 1).narrow, top(5, 1).level], [false, true, true], 'the lamp: a finial 0.08 across');
    assert.deepEqual([top(5, 3).stand, top(5, 5).stand, top(5, 11).stand], [false, false, false], 'a post, a gravestone, a fence');
    assert.deepEqual([top(5, 7).stand, top(5, 9).stand], [true, true], 'a bench and a crate');
    assert.equal(P.levelsAt(map, 12, 9).some(l => l.kind === 'box' && l.stand), true, 'an eave is judged by its slope, as before');
    assert.equal(P.wideEnough(piece('rock', 0, 0, 0, { size: [0.3, 2, 0.3] })), true, 'a rock is the mass it is drawn as');
    // The piece on top is the one whose top it is, not whichever starts highest: a fence standing on a paving slab,
    // a post coming up through a deck, are still a fence and a post.
    const paved = mapOf([piece('fence', 5, 5, 0), piece('box', 5, 5, 0, { size: [3, 0.22, 3] }), piece('box', 9, 5, 3.25, { size: [1, 0.25, 2.4] }), piece('cylinder', 9, 5, 0.5, { size: [0.35, 3.4, 0.35] })]);
    const PP = sandbox(paved).ReactorPhysics;
    assert.deepEqual(plainLevel(PP.levelsAt(paved, 5, 5).pop()), [1, 'fence', false], 'the fence, not the slab under it');
    assert.deepEqual(plainLevel(PP.levelsAt(paved, 9, 5).pop()), [3.9, 'cylinder', false], 'the post, not the deck it passes through');
    assert.deepEqual(plainLevel(PP.levelsAt(paved, 4, 5).pop()), [0.22, 'box', true], 'the slab beside the fence is walked');
    assert.equal(PP.edge(paved, 5, 4, 2, 0.22).kind, 'blocked');
    // Nothing climbs onto them: not a jump's reach, not raised hands.
    const reason = y => { const e = P.edge(map, 4, y, 6, 0); return e.kind === 'blocked' ? e.reason : e.kind; };
    assert.deepEqual([reason(3), reason(5), reason(11)], ['thin', 'thin', 'thin']);
    assert.equal(reason(1), 'high', 'the lamp\'s head is out of reach anyway');
    assert.equal(P.edge(map, 4, 1, 6, 1.5).reason, 'thin', 'and thin from where it is within reach');
    assert.deepEqual([reason(7), reason(9)], ['walk', 'hop']);
    // Nor a plain jump: in the air, what a body would come down on has to be a place to stand.
    const air = (x, y) => body(x, y, { _reactorGround: 0, _reactorAlt: 1.2, _reactorAir: 1.2, _reactorVz: 0.01 });
    assert.deepEqual([P.airBlocks(air(4, 3), 5, 3), P.airBlocks(air(4, 5), 5, 5), P.airBlocks(air(4, 11), 5, 11)], [true, true, true], 'a post, a gravestone and a fence are walls to a jumper');
    assert.deepEqual([P.airBlocks(air(4, 9), 5, 9), P.airBlocks(air(4, 7), 5, 7), P.airBlocks(air(4, 12), 4, 13)], [false, false, false], 'a crate, a bench and open ground are not');
    // Nor a step off an edge: from a wall top, the fence and the post below are not landings.
    assert.equal(P.edge(map, 9, 3, 6, 3).kind, 'blocked', 'no drop onto a fence');
    assert.equal(P.edge(map, 9, 5, 6, 3).kind, 'blocked', 'nor onto a post');
    assert.equal(P.edge(map, 9, 3, 4, 3).kind, 'drop', 'onto the ground, yes');
    // The Tactical grid: its own hop asks only how high, so the world says no for it.
    assert.deepEqual(JSON.parse(JSON.stringify(P.tacticalEdge(4, 11, 6, 0, 1))), { kind: 'blocked', cost: 0, height: 0 }, 'a fence within the unit\'s jump');
    assert.equal(P.tacticalEdge(4, 3, 6, 0, 2).kind, 'blocked', 'a post within it');
    assert.equal(P.tacticalEdge(8, 9, 6, 0, 1).kind, 'blocked', 'a counter within its jump with no room to stand on it');
    assert.equal(P.tacticalEdge(4, 9, 6, 0, 1), null, 'a crate is the grid\'s own hop');
    assert.equal(P.tacticalEdge(4, 1, 6, 0, 3), null, 'the lamp is too high for any unit: the grid says so itself');
    // One question for whoever puts a body somewhere (a spawn, a unit's move): where, on this cell, can it stand?
    assert.equal(P.standingAt(map, 5, 1), null, 'not on a lamp');
    assert.equal(P.standingAt(map, 5, 11), null, 'not on a fence');
    assert.equal(P.standingAt(map, 9, 9, 0, { within: 2 }), null, 'not on a counter under a low roof');
    assert.equal(P.standingAt(map, 9, 9), 3.1, 'the roof over it is a place to stand');
    assert.equal(P.standingAt(map, 5, 9), 1, 'on a crate');
    assert.equal(P.standingAt(map, 2, 2), 0, 'on the ground');
    assert.equal(P.standingAt(map, 9, 3, 0, { within: 1 }), null, 'a wall top is not within a step of the street');
    assert.equal(P.standingAt(map, 9, 3, 2.5, { within: 1 }), 3);
    assert.deepEqual([P.canStandAt(map, 5, 9), P.canStandAt(map, 5, 1), P.canStandAt(map, -1, 0)], [true, false, false]);
    // Water deeper than a wade is not stood in; a map whose swimmers swim may ask for that.
    const wet = mapOf([]);
    wet.reactor3d.elevation = new Array(14 * 14).fill(0);
    wet.reactor3d.water = [{ x0: 0, y0: 0, x1: 3, y1: 3, level: 3 }, { x0: 6, y0: 0, x1: 9, y1: 3, level: 0.3 }];
    const W = sandbox(wet).ReactorPhysics;
    assert.equal(W.standingAt(wet, 1, 1), null, 'three tiles of water');
    assert.equal(W.standingAt(wet, 1, 1, undefined, { water: 'swim' }), 0);
    assert.equal(W.standingAt(wet, 1, 1, undefined, { water: 'any' }), 0);
    assert.equal(W.standingAt(wet, 7, 1), 0, 'a wade is stood in');
});

test('a thin wall has no gaps: a cell takes a ring\'s wall or a slanted wall that passes between its middle and a neighbour\'s', () => {
    // The fountain of the Demo's square: a ring 7.4 across whose wall is about half a tile thick.
    const ring = piece('tube', 10, 10, 0, { size: [7.4, 1.5, 7.4], thick: 0.14 });
    const slanted = piece('box', 10, 10, 0, { size: [8, 2, 0.2], angle: 30 });
    for (const shape of [ring, slanted]) {
        const taken = new Set(R.pieceFootprint(shape).map(cell => cell.join(',')));
        const [cx, cz] = R.shapeCentre(shape), [w, , d] = R.shapeSize(shape);
        const angle = (shape.angle || 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
        const params = R.shapeParams(shape);
        // The drawn outline itself, no slack.
        const drawn = (wx, wz) => { const px = wx - cx, pz = wz - cz; return R.shapeSolidAt(shape.kind, px * cos + pz * sin, -px * sin + pz * cos, w / 2, d / 2, 0, params.sweep, params.thick); };
        let crossings = 0;
        for (let y = 3; y < 18; y++) for (let x = 3; x < 18; x++) for (const [ax, ay] of [[1, 0], [0, 1]]) {
            let through = false;
            for (let k = 0; k <= 32; k++) if (drawn(x + 0.5 + ax * k / 32, y + 0.5 + ay * k / 32)) { through = true; break; }
            if (!through) continue;
            crossings++;
            assert.ok(taken.has(x + ',' + y) || taken.has((x + ax) + ',' + (y + ay)), `${shape.kind}: the step from ${x},${y} to ${x + ax},${y + ay} walks through the wall and neither cell is its`);
        }
        assert.ok(crossings > 8, `${shape.kind}: ${crossings} steps cross it`);
    }
    // The four cells at the fountain's compass points, where the wall passes between two middles: its now.
    const rim = new Set(R.pieceFootprint(ring).map(cell => cell.join(',')));
    assert.deepEqual([[7, 10], [13, 10], [10, 7], [10, 13]].map(cell => rim.has(cell.join(','))), [true, true, true, true]);
    assert.equal(rim.has('10,10'), false, 'the basin stays open');
    assert.equal(rim.size, 20);
    // On a map: nothing walks through the rim, from inside or outside, anywhere round it.
    const map = mapOf([ring], 20, 20);
    for (const [x, y, x2, y2] of [[6, 10, 7, 10], [8, 10, 7, 10], [10, 6, 10, 7], [10, 8, 10, 7]]) assert.equal(R.terrainBlocks(map, x, y, x2, y2, 0), true, `${x},${y} to ${x2},${y2}`);
    // What already had its cells keeps exactly them: a crate, a wide round tower, a post in the middle of its cell.
    assert.deepEqual(R.pieceFootprint(piece('box', 4, 4, 0, { size: [1, 1, 1] })), [[4, 4]]);
    assert.equal(R.pieceFootprint(piece('box', 4, 4, 0, { size: [3, 1, 2] })).length, 9, 'three by two, and the row its edge reaches within the slack');
    assert.deepEqual(R.pieceFootprint(piece('cylinder', 4, 4, 0, { size: [0.24, 4, 0.24] })), [[4, 4]]);
    assert.equal(R.pieceFootprint(piece('cylinder', 6, 6, 0, { size: [5, 4, 5] })).length, 21);
    // Something thin lying exactly on the line between two cells takes neither row beside it (its own cell, as before);
    // something that fills most of both takes both.
    assert.deepEqual(R.pieceFootprint(piece('box', 4, 4, 0, { size: [6, 1, 0.16], offset: [0, -0.5] })), [[4, 4]]);
    assert.deepEqual(R.pieceFootprint(piece('cylinder', 4, 4, 0, { size: [0.8, 1, 0.8], offset: [0, -0.5] })).map(cell => cell.join(',')).sort(), ['4,3', '4,4']);
});

test('a step down or up that is no stair is taken over a few frames, never in one, and never as a fall', () => {
    const map = mapOf([piece('box', 5, 5, 0, { size: [1, 1.5, 1] }), piece('box', 5, 8, 0, { size: [1, 0.6, 1] }),
        piece('stair', 5, 11, 0, { rot: 3 }), piece('stair', 6, 11, 1, { rot: 3 }), piece('stair', 7, 11, 2, { rot: 3 }), ...column(8, 11, 3),
        ...[0, 1, 2, 3, 4].map(i => piece('stair', 5 + i, 13, i, { rot: 3 })), ...column(10, 13, 5)]);
    const P = sandbox(map).ReactorPhysics;
    const hurt = [];
    P.onLand = (character, fell) => hurt.push(fell);
    // Off a ledge a tile and a half high (the Demo's fountain rim into its basin).
    const c = body(5, 5, { _reactorGround: 1.5, _reactorAlt: 1.5 });
    P.update(c);
    c._x = 6;
    const heights = [];
    for (let i = 0; i < 16; i++) { frame(P, c); heights.push(+c._reactorAlt.toFixed(3)); assert.equal(P.isAirborne(c), false, 'a walker coming down a step is not in the air'); }
    assert.deepEqual(heights.slice(6, 13), [1.5, 1.2, 0.9, 0.6, 0.3, 0, 0], 'down three tenths a frame from the edge');
    assert.deepEqual(hurt, [], 'no landing');
    assert.equal(P.jump(c), true, 'and it can jump as soon as it is down');
    // Up a kerb 0.6 high: two frames, and the ground it reports is where its feet are (the view draws that).
    const k = body(4, 8);
    P.update(k);
    k._x = 5;
    const up = [];
    for (let i = 0; i < 16; i++) { frame(P, k); up.push(+k._reactorAlt.toFixed(3)); assert.equal(k._reactorAir, 0); assert.equal(k._reactorGround, k._reactorAlt); }
    assert.deepEqual(up.slice(6, 10), [0, 0.3, 0.6, 0.6]);
    // A stair is no step at any pace a character has: the walker is on the run every frame, up and down, from a
    // walk to move speed 6 dashing (half a tile a frame, where the run rises faster than a step is eased).
    for (const per of [1 / 16, 1 / 8, 1 / 4, 1 / 2]) {
        const s = body(4, 11, { distancePerFrame: () => per });
        P.update(s);
        for (const x of [5, 6, 7, 8, 7, 6, 5, 4]) {
            s._x = x;
            for (let i = 0; i < 16 && s.isMoving(); i++) {
                frame(P, s, per);
                assert.equal(s._reactorAlt, R.groundHeightAt(map, s._realX + 0.5, 11.5, s._reactorAlt), `on the run at ${s._realX}, ${per} a frame`);
                assert.equal(s._reactorStepDown, false);
                assert.equal(P.isAirborne(s), false);
            }
        }
        assert.equal(s._reactorAlt, 0);
    }
    assert.deepEqual([P.stepRate(body(0, 0)), P.stepRate(body(0, 0, { distancePerFrame: () => 1 / 8 })), P.stepRate(body(0, 0, { distancePerFrame: () => 1 / 2 }))], [0.3, 0.3, 1],
        'a step is eased at three tenths a frame, or at what the steepest slope makes of the walker\'s pace');
    // Something moved faster than its own pace says (here it has none) is eased and falls behind a long run. It is
    // judged from the run it is on and not from where its feet have got to, so it is put back on the run and ends on
    // the floor at the top: never left under the stairs.
    for (const [from, cells, end] of [[4, [5, 6, 7, 8, 9, 10], 5], [10, [9, 8, 7, 6, 5, 4], 0]]) {
        const hauled = body(from, 13, from === 10 ? { _reactorGround: 5, _reactorAlt: 5 } : {});
        P.update(hauled);
        const heights = [hauled._reactorAlt];
        for (const x of cells) {
            hauled._x = x;
            for (let i = 0; i < 4 && hauled.isMoving(); i++) {
                frame(P, hauled, 1 / 2);
                // Going up it is never more than a level and a step under the run; coming down it is over the run,
                // on its feet, and comes down at a step's speed with no frame's drop larger.
                const run = R.groundHeightAt(map, hauled._realX + 0.5, 13.5, hauled._reactorAlt + 0.4), was = heights[heights.length - 1];
                heights.push(hauled._reactorAlt);
                assert.ok(run - hauled._reactorAlt <= 1 + LIMIT + 1e-6, `hauled along the run at ${hauled._realX}: ${hauled._reactorAlt} against ${run}`);
                assert.ok(from === 4 || (hauled._reactorAlt >= run - 1e-9 && was - hauled._reactorAlt <= P.STEP_SPEED + 1e-9 && !P.isAirborne(hauled)), `hauled down at ${hauled._realX}: ${was} to ${hauled._reactorAlt}`);
            }
        }
        for (let i = 0; i < 12; i++) P.update(hauled);
        assert.deepEqual([hauled._reactorAlt, hauled._reactorGround, P.isAirborne(hauled)], [end, end, false], `hauled from ${from}`);
    }
});

test('the Inn\'s stairs at move speed 6, dashing or not: the run is under the walker all the way up and all the way down', () => {
    const map = innMap();
    const w = gameWorld(map);
    const { P, player } = w;
    player.setMoveSpeed(6);
    for (const dash of [false, true]) {
        w.place(INN.foot[0], INN.foot[1], INN.ground);
        for (const [dir, end, name] of [[4, INN.upper, 'up'], [6, INN.ground, 'down']]) {
            w.keys.dir = dir; w.keys.dash = dash;
            let fastest = 0;
            for (let f = 0; f < 44; f++) {
                w.tick();
                fastest = Math.max(fastest, player.distancePerFrame());
                const feet = w.alt(player), run = R.groundHeightAt(map, player._realX + 0.5, player._realY + 0.5, feet + 0.4);
                assert.ok(Math.abs(run - feet) <= P.STEP_SPEED + 1e-6, `${name}${dash ? ' dashing' : ''} at ${player._realX}: feet at ${feet.toFixed(2)}, the run at ${run.toFixed(2)}`);
                assert.equal(P.isAirborne(player), false, `${name}: never in the air`);
            }
            w.keys.dir = 0;
            for (let f = 0; f < 8; f++) w.tick();
            assert.equal(fastest, dash ? 0.5 : 0.25);
            assert.ok(Math.abs(w.alt(player) - end) < 0.01 && (dir === 4 ? player.x < INN.head[0] : player.x >= INN.foot[0]),
                `${name}${dash ? ' dashing' : ''}: ends ${player.x},${player.y} at ${w.alt(player).toFixed(2)}`);
        }
    }
});

test('a jump tops out at its height on a whole frame; a rise it would only just make is pulled up instead', () => {
    const map = mapOf([...column(5, 5, 2), ...column(5, 8, 1)]);
    const c = sandbox(map), P = c.ReactorPhysics;
    for (const [gravity, jumpHeight] of [[1, 1.25], [0.166, 1.25], [2, 3], [1, 0.4]]) {
        c.$dataSystem.reactorPhysics = { gravity, jumpHeight };
        const who = body(1, 1);
        P.update(who);
        assert.equal(P.jump(who), true);
        let peak = 0;
        for (let i = 0; i < 2000 && (i < 2 || who._reactorAir > 0); i++) { P.update(who); peak = Math.max(peak, who._reactorAlt); }
        assert.ok(peak >= jumpHeight - 1e-9 && peak < jumpHeight + 0.01, `gravity ${gravity}: a jump of ${jumpHeight} tops out at ${peak}`);
    }
    c.$dataSystem.reactorPhysics = {};
    assert.equal(P.jumpSpeed(0, 1), 0);
    // Two blocks: a rise of exactly the jump and a step. Called a hop, and the jump reaches it on one frame only.
    assert.deepEqual([P.edge(map, 4, 5, 6, 0).kind, P.edge(map, 4, 5, 6, 0).rise], ['hop', 2]);
    const climber = body(4, 5);
    P.update(climber);
    assert.equal(P.tryMantle(climber, 6), true, 'Jump against it takes hold');
    for (let i = 0; i < 200 && climber._reactorMantle; i++) frame(P, climber);
    assert.deepEqual([climber.x, climber.y, climber._reactorAlt], [5, 5, 2], 'and ends on top');
    // One block is well within a jump: left to it.
    const hopper = body(4, 8);
    P.update(hopper);
    assert.equal(P.tryMantle(hopper, 6), false);
});

/**
 * A square with a pond as the fountain of the Demo is (a rim the square walks onto, a basin a tile and a half under
 * the rim, an island of the ground in its middle), a row of crates that stands as a shop's counter does, and other
 * things to push against.
 */
function pondMap() {
    const pond = [piece('tube', 8, 8, 0, { size: [5.4, 0.5, 5.4], thick: 0.2 })];
    const crates = [6, 7, 8, 9, 10, 11, 12].map(x => piece('box', x, 2, 0, { size: [1, 1, 1] }));
    const map = mapOf([...pond, ...crates, piece('box', 2, 2, 0, { size: [1, 1, 1] }), ...column(2, 5, 2), piece('wall', 2, 12, 0),
        piece('stair', 14, 5, 0, { rot: 2 }), piece('stair', 14, 4, 1, { rot: 2 }), piece('fence', 14, 8, 0),
        piece('box', 14, 12, 0, { size: [1, 1.2, 1] }), piece('floor', 14, 12, 3)], 18, 18);
    map.reactor3d.elevation = new Array(18 * 18).fill(0);
    for (let y = 7; y <= 9; y++) for (let x = 7; x <= 9; x++) if (x !== 8 || y !== 8) map.reactor3d.elevation[y * 18 + x] = -1;
    return map;
}

test('pushing on against a low ledge climbs it without Jump: out of a pond, up a bank, never onto a thing standing on the floor', () => {
    const map = pondMap();
    const w = gameWorld(map);
    const { P, player } = w;
    const basin = -1;
    assert.deepEqual([R.groundHeightAt(map, 6.5, 8.5), R.groundHeightAt(map, 7.5, 8.5), R.groundHeightAt(map, 8.5, 8.5), R.groundHeightAt(map, 5.5, 8.5)], [0.5, basin, 0, 0], 'the rim, the basin, the island, the square');
    // In: onto the rim on foot, off it into the basin (a step down off something built).
    w.place(3, 8);
    const into = w.hold(6, 70);
    assert.deepEqual([into.x, into.alt], [7, basin], 'walked in over the rim');
    assert.ok(into.rise <= LIMIT, 'and nobody popped on the way');
    // Out: against the rim from inside, nothing for a quarter of a second, then up and over.
    w.place(7, 8, basin);
    assert.deepEqual([P.edge(map, 7, 8, 4, basin).kind, P.edge(map, 7, 8, 4, basin).rise], ['hop', 1.5], 'the rim is a tile and a half up from inside');
    assert.equal(player.canPass(7, 8, 4), false, 'and no walk');
    w.hold(4, P.STEP_UP_FRAMES - 1);
    assert.deepEqual([player.x, !!player._reactorMantle], [7, false], 'not yet');
    w.hold(4, 2);
    assert.equal(!!player._reactorMantle, true, 'after fifteen frames of pushing: climbing');
    const outside = w.hold(4, 120);
    assert.ok(outside.x < 5 && Math.abs(outside.alt) < 1e-9, `out of the pond and on across the square (${outside.x},${outside.y} at ${outside.alt})`);
    assert.ok(outside.rise <= LIMIT, `walked and climbed, never lifted (${outside.rise})`);
    // The party comes out after its leader, climbing the rim as it did.
    const follower = player.followers().follower(0);
    assert.ok(follower.x < 6 && Math.abs(w.alt(follower)) < 0.75, `the follower is out too (${follower.x},${follower.y})`);
    // Straight across: up onto the island, down off it (the ground itself drops there: a walk alone never leaves
    // it, a push does), up the far rim and out. What a push climbs, a push leaves.
    w.place(7, 8, basin);
    const across = w.hold(6, 260);
    assert.ok(across.x > 10 && Math.abs(across.alt) < 1e-9, `across the pond and out the far side (${across.x},${across.y} at ${across.alt})`);
    assert.ok(across.rise <= LIMIT);
    w.place(8, 8);
    assert.equal(player.canPass(8, 8, 6), false, 'a step of the ground is not walked off by a plain step');
    // A crate one tile high is a thing standing on the square, not ground the walk goes on over: pushing against it
    // does nothing, however long. Jump is what climbs it.
    assert.deepEqual([P.edge(map, 1, 2, 6, 0).kind, P.openGround(map, 2, 2, 1)], ['hop', false]);
    w.place(1, 2);
    const crate = w.hold(6, 90);
    assert.deepEqual([crate.x, crate.top, !!player._reactorMantle], [1, 0, false], 'not onto the crate by walking into it');
    const hopped = w.hold(6, 60, { jumpAt: 2 });
    assert.deepEqual([hopped.x >= 2, hopped.top >= 1], [true, true], 'with Jump: onto it');
    // A shop's counter with somebody to talk to behind it: walked up to and pushed against, the walker stays on the
    // floor in front of it. Sliding along it with a diagonal held is the same.
    assert.equal(P.openGround(map, 8, 2, 1), false, 'seven places in a row, every way off them a drop');
    w.place(8, 5);
    const counter = w.hold(8, 120);
    assert.deepEqual([counter.x, counter.y, counter.top, !!player._reactorMantle], [8, 3, 0, false], 'up to the counter and no further');
    w.place(6, 3);
    let climbed = false;
    for (let f = 0; f < 110 && player.x < 12; f++) { w.hold([6, 8], 1); if (player._reactorMantle) climbed = true; }
    assert.deepEqual([climbed, player.y, player.x > 10, w.alt(player)], [false, 3, true, 0], 'slid the length of the row on the ground');
    w.place(1, 1);
    const beside = w.hold([6, 2], 14);
    assert.ok(beside.top < 0.75, 'past the crate on a diagonal');
    // Too high for a walker: two blocks need Jump, a wall is a wall.
    w.place(1, 5);
    assert.deepEqual([w.hold(6, 60).x, !!player._reactorMantle], [1, false], 'two tiles: not without Jump');
    w.place(1, 12);
    assert.deepEqual([w.hold(6, 60).x, !!player._reactorMantle], [1, false]);
    // Not a stair's side, a fence, or a counter with no room to stand on it.
    w.place(13, 4);
    assert.deepEqual([w.hold(6, 60).x, !!player._reactorMantle], [13, false], 'a stair is climbed along its run');
    w.place(13, 8);
    assert.deepEqual([w.hold(6, 60).x, !!player._reactorMantle], [13, false], 'a fence');
    w.place(13, 12);
    assert.deepEqual([w.hold(6, 60).x, !!player._reactorMantle], [13, false], 'a counter under a low roof');
    // Not when it is somebody in the way and not the ground, nor onto a rim somebody is standing on.
    w.place(1, 15);
    player.isCollidedWithCharacters = (x, y) => x === 2 && y === 15;
    assert.deepEqual([w.hold(6, 60).x, !!player._reactorMantle], [1, false]);
    w.place(7, 8, basin);
    player.isCollidedWithCharacters = (x, y) => x === 6 && y === 8;
    let reached = false;
    for (let f = 0; f < 60; f++) { w.hold(4, 1); reached = reached || !!player._reactorMantle; }
    assert.deepEqual([player.x, reached], [7, false], 'the rim is taken: not even a hand laid on it');
    delete player.isCollidedWithCharacters;
    assert.equal(w.hold(4, 30).x < 7 || !!player._reactorMantle, true, 'free again: climbed');
    // The project's settings: off, or a lower reach. And it does not need jumping to be on.
    const off = gameWorld(map, { reactorPhysics: { stepUp: false } });
    off.place(7, 8, basin);
    assert.deepEqual([off.hold(4, 90).x, !!off.player._reactorMantle], [7, false], 'switched off: Jump or nothing');
    assert.equal(off.P.stepUpReach(), 0);
    const low = gameWorld(map, { reactorPhysics: { stepUpReach: 1 } });
    low.place(7, 8, basin);
    assert.equal(low.hold(4, 90).x, 7, 'a reach of one tile does not make the rim');
    low.place(7, 8, basin);
    assert.ok(low.hold(6, 60).x > 7, 'and still makes the island, one tile up');
    const noJump = gameWorld(map, { reactorPhysics: { jump: false, mantle: false } });
    assert.equal(noJump.P.jumpAllowed(), false);
    noJump.place(7, 8, basin);
    // The follower comes up the rim as its leader did, pulling itself up: it does not pass through the rim's wall.
    const behind = noJump.player.followers().follower(0);
    let pulled = false;
    for (let f = 0; f < 140; f++) { noJump.hold(4, 1); if (behind._reactorMantle) pulled = true; }
    assert.ok(noJump.player.x < 5, 'no jumping in the project: the pond is still walked out of');
    assert.ok(behind.x < 6, 'and the follower with it');
    assert.equal(pulled, true, 'climbing the rim, not walking through it');
    assert.deepEqual([P.readSettings().stepUp, P.readSettings().stepUpReach, P.DEFAULTS.stepUpReach], [true, 1.5, 1.5]);
    // While a push lasts, the ledge is asked for once a quarter of a second, not every frame.
    let asked = 0;
    const stepUp = P.stepUp;
    P.stepUp = function() { asked++; return stepUp.apply(this, arguments); };
    w.place(1, 12);
    w.hold(6, 90);
    P.stepUp = stepUp;
    assert.equal(asked, 6, 'ninety frames against a wall');
});

test('ground the walk goes on over is climbed by a push; the top of a thing is not; a push steps down only where a push climbs back', () => {
    // A terrace of blocks six by four (ground: the walk goes on over it), a platform three by three (a thing: every
    // way off it is a drop, and the stair standing beside it shows it only its side), the same platform with a stair
    // down to the square (ground: walked off), and a long table.
    const terrace = [], platform = [], stepped = [];
    for (let y = 1; y <= 4; y++) for (let x = 1; x <= 6; x++) terrace.push(piece('block', x, y, 0));
    for (let y = 1; y <= 3; y++) for (let x = 10; x <= 12; x++) platform.push(piece('block', x, y, 0));
    for (let y = 1; y <= 3; y++) for (let x = 16; x <= 18; x++) stepped.push(piece('block', x, y, 0));
    // And: a landing two tiles up at the head of two flights of stairs (ground: the stairs lead on from it), a
    // crate with a low post beside it (a thing: nobody walks on by way of a post's top).
    const landing = [...column(19, 8, 2), ...column(20, 8, 2), ...column(19, 9, 2), ...column(20, 9, 2), piece('stair', 19, 10, 1, { rot: 2 }), piece('stair', 19, 11, 0, { rot: 2 })];
    const posted = [piece('box', 12, 12, 0, { size: [1, 1, 1] }), piece('cylinder', 13, 12, 0, { size: [0.3, 0.5, 0.3] })];
    const map = mapOf([...terrace, ...platform, ...stepped, ...landing, ...posted, piece('stair', 13, 2, 0, { rot: 2 }), piece('stair', 17, 4, 0, { rot: 2 }), piece('box', 5, 9, 0, { size: [7, 1.1, 2] })], 22, 22);
    // A hillside too steep to walk, falling to the east: nine tenths of a tile for every tile, rows 14 to 20.
    const terrain = new Array(23 * 23).fill(0);
    for (let vy = 14; vy <= 21; vy++) for (let vx = 0; vx <= 8; vx++) terrain[vy * 23 + vx] = 0.9 * (8 - vx);
    map.reactor3d.terrain = terrain;
    const w = gameWorld(map);
    const { P, player } = w;
    assert.deepEqual([P.openGround(map, 6, 2, 1), P.openGround(map, 10, 2, 1), P.openGround(map, 16, 2, 1), P.openGround(map, 5, 9, 1.1)], [true, false, true, false],
        'the terrace, the platform, the platform with its stair, the table');
    assert.equal(P.openGround(map, 9, 2, 0), true, 'the ground itself');
    assert.deepEqual([P.levelsAt(map, 19, 10).some(l => l.kind === 'stair' && Math.abs(l.top - 1.5) < 1e-9), P.openGround(map, 20, 9, 2)], [true, true], 'the landing, by its two flights');
    const post = P.levelsAt(map, 13, 12).slice(-1)[0];
    assert.deepEqual([post.top, post.narrow, P.openGround(map, 12, 12, 1)], [0.5, true, false], 'the crate with the post beside it');
    w.place(8, 2);
    const up = w.hold(4, 70);
    assert.deepEqual([up.x < 7, up.top], [true, 1], 'onto the terrace by walking into it');
    assert.ok(up.rise <= LIMIT, 'pulled up, not popped');
    const back = w.hold(6, 70);
    assert.deepEqual([back.x > 6, back.alt], [true, 0], 'and off it again the same way');
    w.place(9, 2);
    assert.deepEqual([w.hold(6, 70).x, !!player._reactorMantle], [9, false], 'not onto the platform');
    w.place(15, 2);
    assert.equal(w.hold(6, 70).top, 1, 'onto the one the stair leads to');
    w.place(5, 12);
    const table = w.hold(8, 90);
    assert.deepEqual([table.y, table.top], [11, 0], 'up to the table and no further');
    // The hillside. `edges` calls each step down it a drop within a walker's reach, and the way back up is too steep
    // for anything: a push must not take the first step down, or the walker is left on the slope for good.
    w.place(3, 16);
    const from = w.alt(player);
    assert.ok(Math.abs(from - 4.05) < 1e-6);
    assert.deepEqual([P.edge(map, 3, 16, 6, from).kind, +P.edge(map, 3, 16, 6, from).rise.toFixed(2), P.edge(map, 4, 16, 4, from - 0.9).kind], ['drop', -0.9, 'blocked']);
    for (const dir of [6, 4, 2, 8]) {
        w.place(3, 16);
        const held = w.hold(dir, 80);
        if (dir === 6 || dir === 4) assert.deepEqual([held.x, held.y, held.alt], [3, 16, from], `holding ${dir} on the hillside: stays`);
    }
    // Where the ground drops as a ledge with level ground on top, a push climbs it and a push steps back down it.
    const ledge = pondMap();
    const l = gameWorld(ledge);
    l.place(8, 8);
    assert.equal(l.player.canPass(8, 8, 6), false);
    const off = l.hold(6, 40);
    assert.deepEqual([off.x, off.alt], [9, -1], 'off the island by pushing');
    for (let f = 0; f < 90 && (l.player.x !== 8 || l.player._reactorMantle || l.player.isMoving()); f++) l.hold(4, 1);
    assert.deepEqual([l.player.x, l.alt(l.player)], [8, 0], 'and back onto it');
});

test("Database, Controls, Physics offers the walk-up rule: a switch and a height, said in every language", () => {
    const editor = read("editor/src/database/DatabaseControlsEditor.js");
    assert.match(editor, /class="rr-controls-stepup"\$\{physics\.stepUp !== false \? . checked. : ..\}/);
    assert.match(editor, /data-field="stepUpReach" min="0" max="20" step="0\.25" value="\$\{physics\.stepUpReach\}"/);
    assert.match(editor, /stepUp: true, stepUpReach: 1\.5 \}, this\.system\(\)\.reactorPhysics/);
    assert.match(editor, /querySelector\(.\.rr-controls-stepup.\)\.addEventListener\(.change., event => \{ const p = this\.physics\(\); p\.stepUp = event\.target\.checked; this\.savePhysics\(p\); \}\);/);
    const phrases = ["Climb low ledges by walking into them", "Height climbed by walking",
        "A ledge up to the height climbed by walking is climbed or stepped down by walking into it for a moment."];
    for (const phrase of phrases) assert.ok(editor.includes("tt(\x27" + phrase + "\x27)"), phrase);
    const context = { console };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(read("editor/src/I18nDeepTranslations.js"), context);
    const locales = ["ja", "es", "zh-Hant", "zh-Hans", "ru", "pt", "de", "fr", "el", "ko", "ar", "it", "pl", "id", "vi", "th", "tr"];
    for (const locale of locales) for (const phrase of phrases) {
        const said = context.RR_DEEP_TEXT_TRANSLATIONS[locale] && context.RR_DEEP_TEXT_TRANSLATIONS[locale][phrase];
        assert.ok(typeof said === "string" && said.length > 3 && said !== phrase, locale + ": " + phrase);
    }
});
