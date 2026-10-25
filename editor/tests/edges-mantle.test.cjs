// What a body can do at an edge (walk, hop, mantle, ladder, drop, blocked) and the mantle itself.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');
const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

let nextId = 1;
const piece = (kind, x, y, z, more) => Object.assign({ id: nextId++, kind, x, y, z, rot: 0, material: '' }, more || {});
const column = (x, y, levels) => Array.from({ length: levels }, (unused, z) => piece('block', x, y, z));
const mapOf = pieces => ({ width: 14, height: 14, note: '<3d>', reactor3d: { version: 1, mode: '3d', pieces } });
// Values made in the physics' own realm compare by content.
const plain = value => JSON.parse(JSON.stringify(value, (key, v) => (v === Infinity ? 'Infinity' : v)));

/** The physics in its own realm, over the real world functions and a map. */
function sandbox(map, physics = {}, mapPhysics = null) {
    if (mapPhysics) map.reactor3d.physics = mapPhysics;
    const context = { console, Math, JSON, Number, Object, Array, WeakMap, Map, Reactor3D: R, $dataSystem: { reactorPhysics: physics }, $dataMap: map,
        Input: { keyMapper: {}, gamepadMapper: {} } };
    context.window = context; context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(read('runtime/reactor_controls.js'), context);
    vm.runInContext(read('runtime/reactor_physics.js'), context);
    return context;
}

/** A character as the physics sees one: a cell, where it is drawn, a height. */
function body(x, y, more) {
    const c = Object.assign({ _x: x, _y: y, _realX: x, _realY: y, _reactorGround: 0, _reactorAlt: 0, _d: 2, blocked: false,
        get x() { return this._x; }, get y() { return this._y; },
        isMoving() { return this._realX !== this._x || this._realY !== this._y; },
        setDirection(d) { this._d = d; }, direction() { return this._d; }, reverseDir(d) { return 10 - d; },
        isThrough() { return false; }, isCollidedWithCharacters() { return this.blocked; } }, more || {});
    return c;
}
/** One game frame: the walk toward its cell (a sixteenth of a tile), then the physics. */
function frame(P, c) {
    for (const key of ['X', 'Y']) {
        const real = '_real' + key, cell = '_' + key.toLowerCase();
        if (c[real] < c[cell]) c[real] = Math.min(c[cell], c[real] + 1 / 16);
        else if (c[real] > c[cell]) c[real] = Math.max(c[cell], c[real] - 1 / 16);
    }
    P.update(c);
}

test('a cell has a place to stand for each layer: the ground, a wall top, a floor over a room', () => {
    const map = mapOf([piece('wall', 5, 5, 0), piece('floor', 8, 8, 5), ...column(2, 2, 3), piece('fence', 2, 2, 3), piece('ramp', 9, 2, 0)]);
    const P = sandbox(map).ReactorPhysics;
    const ground = P.levelsAt(map, 1, 1);
    assert.equal(ground.length, 1);
    assert.deepEqual([ground[0].top, ground[0].ceiling, ground[0].kind, ground[0].level, ground[0].stand], [0, Infinity, 'ground', true, true]);
    const wall = P.levelsAt(map, 5, 5);
    assert.deepEqual(plain(wall.map(l => l.top)), [5], 'a wall is stood on at its top, nowhere else');
    const room = P.levelsAt(map, 8, 8);
    assert.deepEqual(plain(room.map(l => [l.top, l.ceiling])), [[0, 5], [5.1, 'Infinity']], 'under the slab, and on it');
    assert.equal(P.ceilingAbove(map, 8, 8, 0), 5);
    assert.equal(P.ceilingAbove(map, 8, 8, 5.1), Infinity);
    const fenced = P.levelsAt(map, 2, 2);
    assert.deepEqual([fenced[0].top, fenced[0].kind, fenced[0].stand], [4, 'fence', false], 'a railing on top is not a place to stand');
    const ramp = P.levelsAt(map, 9, 2)[0];
    assert.ok(ramp.slope > 0.9 && !ramp.level && ramp.stand, 'a ramp is steep and still built to be walked');
    assert.equal(P.levelsAt(map, 1, 1), ground, 'kept until the map changes');
    map.reactor3d.pieces = map.reactor3d.pieces.concat(column(1, 1, 1));
    assert.equal(P.levelsAt(map, 1, 1)[0].top, 1, 'a new pieces array is a new reading');
    assert.equal(P.levelsAt(map, -1, 0).length, 0);
});

test('an edge is walked, hopped, mantled or blocked by its rise, and says how long it takes', () => {
    const map = mapOf([...column(5, 1, 1), ...column(5, 3, 2), ...column(5, 5, 3), ...column(5, 7, 4), piece('wall', 5, 9, 0)]);
    const P = sandbox(map).ReactorPhysics;
    const go = (y, height = 0, rules) => P.edge(map, 4, y, 6, height, rules);
    assert.deepEqual([go(0).kind, go(0).to, go(0).frames, go(0).cost], ['walk', 0, 16, 1]);
    assert.deepEqual([go(1).kind, go(1).rise], ['hop', 1]);
    assert.equal(go(3).kind, 'hop', 'a jump of 1.25 carries a body onto anything a step over its top');
    const mantle = go(5);
    assert.deepEqual([mantle.kind, mantle.x, mantle.y, mantle.to, mantle.rise], ['mantle', 5, 5, 3, 3]);
    assert.equal(mantle.frames, P.mantleFrames(3) + 16 - P.mantleOverlap(P.mantleFrames(3)), 'the pull, and the step onto the top that shares its end');
    assert.ok(mantle.cost >= 2, 'a mantle costs more than a step');
    assert.equal(go(7).kind, 'mantle', 'four tiles: within a jump and raised hands (1.25 + 3)');
    assert.deepEqual([go(9).kind, go(9).reason], ['blocked', 'high'], 'a storey is out of reach from the ground');
    assert.equal(go(9, 1).kind, 'mantle', 'and within it from a crate a tile high');
    assert.deepEqual([go(5, 0, { mantle: false }).kind, go(5, 0, { mantle: false }).reason], ['blocked', 'high'], 'mantling off: only what a jump reaches');
    assert.equal(go(1, 0, { jump: false }).kind, 'blocked', 'jumping off: nothing is hopped or mantled');
    assert.deepEqual([go(5, 0, { hop: 1, reach: 4 }).kind, go(3, 0, { hop: 1, reach: 4 }).kind, go(1, 0, { hop: 1, reach: 4 }).kind], ['mantle', 'mantle', 'hop'], 'a Tactical unit brings its own hop and reach');
    assert.deepEqual([P.edge(map, 0, 0, 4, 0).kind, P.edge(map, 0, 0, 4, 0).reason], ['blocked', 'offmap']);
    assert.equal(P.edge(map, 4, 0, 5, 0).kind, 'blocked', 'only the four ways');
});

test('a mantle needs a place to stand, room to stand in, and nothing over the climber', () => {
    const map = mapOf([
        ...column(5, 1, 3), piece('fence', 5, 1, 3),                 // a railing on the edge
        ...column(5, 3, 3), piece('floor', 5, 3, 5),                 // a slab two tiles over the top
        ...column(5, 5, 3), piece('floor', 4, 5, 3),                 // a slab over the climber
        piece('box', 5, 7, 0, { size: [1, 0.25, 4], angle: 0, tilt: 300 }),   // a slab leaning at sixty degrees
        ...column(5, 9, 3), piece('floor', 5, 9, 7)                  // a slab well over the top
    ]);
    const P = sandbox(map).ReactorPhysics;
    const reason = y => { const e = P.edge(map, 4, y, 6, 0); return e.kind === 'blocked' ? e.reason : e.kind; };
    assert.equal(reason(1), 'thin', 'the railing raises the edge and is not stood on');
    assert.equal(reason(3), 'headroom');
    assert.equal(reason(5), 'overhead');
    assert.equal(reason(7), 'steep', 'nobody pulls up onto a slope steeper than a roof is walked');
    assert.equal(reason(9), 'mantle', 'four tiles of room over the top is enough');
});

test('a ladder is an edge up to every floor it passes and down from its top; a fall is a drop with the fall rule', () => {
    const pieces = [piece('wall', 5, 5, 0)];
    for (let z = 0; z < 5; z++) pieces.push(piece('ladder', 5, 6, z, { rot: 2 }));
    const map = mapOf(pieces);
    const P = sandbox(map).ReactorPhysics;
    const up = P.edge(map, 5, 6, 8, 0);
    assert.deepEqual([up.kind, up.x, up.y, up.to, up.rise], ['ladder', 5, 5, 5, 5]);
    assert.equal(up.frames, Math.round(16 + 5 / P.LADDER_SPEED));
    const down = P.edge(map, 5, 5, 2, 5);
    assert.deepEqual([down.kind, down.x, down.y, down.to], ['ladder', 5, 6, 0]);
    assert.equal(P.edge(map, 5, 6, 6, 0).kind, 'walk', 'sideways at the foot is a walk');
    const drop = P.edge(map, 5, 5, 4, 5);
    assert.deepEqual([drop.kind, drop.to, drop.fell, drop.hurts, drop.harm], ['drop', 0, 5, false, 0]);
    const hard = sandbox(map, { fallDamage: true, fallFrom: 3, fallPercent: 10 }).ReactorPhysics.edge(map, 5, 5, 4, 5);
    assert.deepEqual([hard.kind, hard.hurts, Math.round(hard.harm * 100)], ['drop', true, 20], 'two tiles past the safe three, at 10% a tile');
});

test('a cell with two floors answers for both: under the bridge on foot, onto it by the hands', () => {
    const map = mapOf([piece('floor', 5, 5, 2), piece('floor', 6, 5, 2)]);
    const P = sandbox(map).ReactorPhysics;
    const all = P.edges(map, 4, 5, 6, 0);
    assert.deepEqual(plain(all.map(e => [e.kind, e.to])), [['walk', 0], ['mantle', 2.1]]);
    assert.equal(P.edge(map, 5, 5, 6, 2.1).kind, 'walk', 'along the deck');
    assert.deepEqual(plain(P.edges(map, 5, 5, 4, 2.1).map(e => e.kind)), ['drop'], 'and off its end');
});

test('the Tactical grid gets mantles, ladders and long drops; walks and hops stay its own', () => {
    const pieces = [...column(5, 1, 1), ...column(5, 5, 3), piece('wall', 9, 5, 0)];
    for (let z = 0; z < 5; z++) pieces.push(piece('ladder', 9, 6, z, { rot: 2 }));
    const map = mapOf(pieces);
    const c = sandbox(map);
    const P = c.ReactorPhysics;
    assert.equal(P.tacticalEdge(4, 0, 6, 0, 1), null, 'a walk');
    assert.equal(P.tacticalEdge(4, 1, 6, 0, 1), null, 'a hop within the unit\'s jump');
    assert.deepEqual(JSON.parse(JSON.stringify(P.tacticalEdge(4, 5, 6, 0, 1))), { kind: 'mantle', cost: 2, height: 3 });
    assert.equal(P.tacticalEdge(4, 5, 6, 0, 0), null, 'a unit that cannot jump cannot mantle');
    assert.deepEqual(JSON.parse(JSON.stringify(P.tacticalEdge(9, 6, 8, 0, 1))), { kind: 'ladder', cost: 3, height: 5 });
    assert.deepEqual(JSON.parse(JSON.stringify(P.tacticalEdge(9, 5, 2, 5, 1))), { kind: 'ladder', cost: 3, height: 0 });
    assert.deepEqual(JSON.parse(JSON.stringify(P.tacticalEdge(9, 5, 4, 5, 1))), { kind: 'drop', cost: 2, height: 0, harm: 0 }, 'five tiles: further than the unit\'s own drop, inside a safe fall');
    assert.equal(P.tacticalEdge(5, 5, 4, 3, 2), null, 'three tiles with a jump of two is the grid\'s own drop');
    const hurt = sandbox(map, { fallDamage: true, fallFrom: 3 }).ReactorPhysics;
    assert.deepEqual(JSON.parse(JSON.stringify(hurt.tacticalEdge(9, 5, 4, 5, 1))), { kind: 'drop', cost: 2, height: 0, harm: 0.2 }, 'a fall that hurts is taken at its price: two tiles past the safe fall');
    const kept = sandbox(map, { fallDamage: true, fallFrom: 3, battleFall: 'off' }).ReactorPhysics;
    assert.equal(kept.tacticalEdge(9, 5, 4, 5, 1), null, 'a project that keeps battles to the safe fall leaves it out');
    // The seams are given to the grid once it exists, and never over somebody else's.
    c.ReactorFight = { Grid: { edge: null, playStep: null, isStepping: () => 'kept' } };
    assert.equal(P.installFightSeams(), true);
    assert.equal(c.ReactorFight.Grid.edge(4, 5, 6, 0, 1).kind, 'mantle');
    assert.equal(c.ReactorFight.Grid.isStepping({}), 'kept');
    const unit = body(4, 5);
    assert.equal(c.ReactorFight.Grid.playStep(unit, { x: 5, y: 5, d: 6, kind: 'hop', height: 1 }), false, 'a hop is the grid\'s');
    assert.equal(c.ReactorFight.Grid.playStep(unit, { x: 5, y: 5, d: 6, kind: 'mantle', height: 3 }), true);
    assert.equal(P.isMantling(unit), true);
    for (let i = 0; i < 200 && unit._reactorMantle; i++) frame(P, unit);
    assert.deepEqual([unit.x, unit.y, unit._reactorAlt, unit._reactorGround], [5, 5, 3, 3]);
    // Down a ladder: over the edge at the height it left, then down the wall to the foot.
    const climber = body(9, 5, { _reactorAlt: 5, _reactorGround: 5 });
    assert.equal(P.playStep(climber, { x: 9, y: 6, d: 2, kind: 'ladder', height: 0 }), true);
    assert.deepEqual([climber.x, climber.y, climber.direction()], [9, 6, 8], 'on the ladder\'s cell at once, facing the wall');
    let lowest = 5;
    for (let i = 0; i < 400 && climber._reactorMantle; i++) { frame(P, climber); assert.ok(climber._reactorAlt <= lowest + 1e-9); lowest = climber._reactorAlt; }
    assert.deepEqual([climber._reactorMantle, climber._reactorAlt, climber._reactorAir], [null, 0, 0]);
});

test('a mantle rises beside the wall, goes over, and lands exactly on top; a taken top lets go', () => {
    const map = mapOf([...column(5, 5, 3)]);
    const c = sandbox(map);
    const P = c.ReactorPhysics;
    const who = body(4, 5);
    assert.equal(P.tryMantle(who, 8), false, 'no ledge that way');
    assert.equal(P.tryMantle(who, 6), true);
    assert.equal(who.direction(), 6);
    assert.equal(P.isAirborne(who), false, 'a climber is not in the air');
    assert.equal(P.jump(who), false, 'and cannot jump');
    let last = 0, frames = 0, crossedAt = null, stepped = null;
    while (who._reactorMantle && frames < 300) {
        frame(P, who); frames++;
        assert.ok(who._reactorAlt >= last - 1e-9, 'never down');
        if (who._realX === 4) assert.ok(who._reactorAlt <= 3 + 1e-9);
        // The step onto the top begins as the pull ends: a knee's worth under the top beside the wall,
        // and at the top by the time the body's middle is over the wall's face.
        else if (who._realX < 4.5) { stepped = stepped === null ? who._reactorAlt : stepped; assert.ok(who._reactorAlt >= 3 - 0.3, 'the knee clears the edge: ' + who._reactorAlt); }
        else { crossedAt = crossedAt === null ? who._reactorAlt : crossedAt; assert.equal(who._reactorAlt, 3, 'it crosses the edge at the top, never through the wall'); }
        last = who._reactorAlt;
    }
    assert.equal(crossedAt, 3);
    assert.ok(stepped > 2.7 && stepped < 3, 'the step over began before the rise was done: ' + stepped);
    assert.deepEqual([who.x, who.y, who._realX, who._reactorAlt, who._reactorGround, who._reactorAir, who._reactorMantle], [5, 5, 5, 3, 3, 0, null]);
    assert.equal(P.mantleOverlap(P.mantleFrames(3)), 8);
    assert.deepEqual([P.mantleOverlap(14), P.mantleOverlap(20), P.mantleOverlap(48), P.mantleOverlap(1)], [4, 5, 8, 0], 'a quarter of the pull, 4 to 8, never the whole of it');
    assert.equal(frames, P.mantleFrames(3) + 16 - 8, 'no hanging beside a top it has reached');
    assert.equal(frames, P.edge(map, 4, 5, 6, 0).frames, 'the time the edge query promised');
    P.update(who);
    assert.deepEqual([who._reactorAlt, who._reactorAir], [3, 0], 'standing on top afterwards');
    // Somebody steps onto the top while it climbs: it lets go and comes down where it was.
    const other = body(4, 5);
    assert.equal(P.tryMantle(other, 6), true);
    for (let i = 0; i < 5; i++) frame(P, other);
    other.blocked = true;
    frame(P, other);
    assert.equal(other._reactorMantle, null);
    assert.ok(other._reactorAlt > 0.5);
    for (let i = 0; i < 200 && other._reactorAir > 0; i++) frame(P, other);
    assert.deepEqual([other.x, other._reactorAlt, other._reactorAir], [4, 0, 0]);
    other.blocked = true;
    assert.equal(P.tryMantle(other, 6), false, 'a taken top is not climbed to');
});

test('in the air the jump is spent and the hands still reach; a fast fall catches nothing; a save mid-climb resumes', () => {
    const map = mapOf([...column(5, 5, 4), ...column(5, 7, 5)]);
    const c = sandbox(map);
    const P = c.ReactorPhysics;
    assert.equal(P.tryMantle(body(4, 7), 6), false, 'five tiles from the ground: out of reach');
    const leaper = body(4, 7, { _reactorAlt: 2.1, _reactorVz: 0.01 });
    assert.equal(P.isAirborne(leaper), true);
    assert.equal(P.tryMantle(leaper, 6), true, 'from two tiles up the hands reach it');
    assert.equal(leaper._reactorMantle.from, 2.1);
    const faller = body(4, 5, { _reactorAlt: 2.5, _reactorVz: -0.3 });
    assert.equal(P.tryMantle(faller, 6), false);
    const saved = body(4, 5);
    assert.equal(P.tryMantle(saved, 6), true);
    for (let i = 0; i < 9; i++) frame(P, saved);
    const loaded = body(4, 5, { _reactorAlt: saved._reactorAlt, _reactorGround: saved._reactorGround, _d: saved._d, _reactorMantle: JSON.parse(JSON.stringify(saved._reactorMantle)) });
    for (let i = 0; i < 300 && loaded._reactorMantle; i++) frame(P, loaded);
    assert.deepEqual([loaded.x, loaded._reactorAlt, loaded._reactorMantle], [5, 4, null]);
});

test('mantling off is the game as it was; a map that switches jumping off switches it off too', () => {
    const pieces = () => [...column(5, 5, 3)];
    const off = sandbox(mapOf(pieces()), { mantle: false }).ReactorPhysics;
    assert.equal(off.mantleAllowed(), false);
    assert.equal(off.tryMantle(body(4, 5), 6), false);
    assert.equal(off.edge(off.settings() && mapOf(pieces()), 4, 5, 6, 0).kind, 'blocked');
    const noJump = sandbox(mapOf(pieces()), { jump: false }).ReactorPhysics;
    assert.equal(noJump.tryMantle(body(4, 5), 6), false);
    const reach = sandbox(mapOf(pieces()), { mantleReach: 1 }).ReactorPhysics;
    assert.equal(reach.tryMantle(body(4, 5), 6), false, 'a reach of one tile over the jump: three is too high');
    assert.equal(sandbox(mapOf(pieces()), {}).ReactorPhysics.settings().mantleReach, 3);
});

test('a follower goes up after its leader by the same ledge, a hop as much as a mantle', () => {
    const map = mapOf([...column(5, 5, 3), ...column(5, 8, 1)]);
    const P = sandbox(map).ReactorPhysics;
    const lead = body(5, 5, { _reactorAlt: 3, _reactorGround: 3 });
    const follower = body(4, 5);
    assert.equal(P.followerMantle(follower, lead), true);
    assert.equal(follower._reactorMantle.to, 3);
    const hopper = body(4, 8);
    assert.equal(P.followerMantle(hopper, body(5, 8, { _reactorAlt: 1 })), true, 'a tile up is hopped the same way, not walked through');
    assert.equal(P.followerMantle(body(4, 1), body(5, 1)), false, 'level ground is its ordinary step');
});

test('the game wires it: Jump against a ledge, a push in the air, followers, the model and the held weapon', () => {
    const physics = read('runtime/reactor_physics.js');
    assert.match(physics, /if \(this\._reactorPush && ReactorPhysics\.tryMantle\(this, this\._reactorPush\)\) \{ \/\* climbing \*\/ \}/);
    assert.match(physics, /this\._reactorPush = d;\n\s+\/\/[^\n]+\n\s+if \(ReactorPhysics\.isAirborne\(this\) && !ReactorPhysics\.fellOff\(this\)\) ReactorPhysics\.tryMantle\(this, d\);/);
    assert.match(physics, /return !this\._reactorRagdoll && !this\._reactorMantle && !this\._reactorGrapple && _canMove\.apply\(this, arguments\);/);
    assert.match(physics, /if \(character && ReactorPhysics\.followerMantle\(this, character\)\) return;/);
    assert.match(physics, /if \(character\._reactorMantle\) \{ this\.updateMantle\(character\); return; \}/);
    const models = read('runtime/reactor_3d_models.js');
    // Beside the wall it climbs; over the edge it walks onto the top.
    assert.match(models, /return !!\(character && \(character\._reactorOnLadder \|\| \(character\._reactorMantle && !character\._reactorMantle\.over\)\)\);/);
    assert.match(models, /: character\._reactorMantle \? Reactor3D\.mantleHold\(holder, character\) : 0;/);
    assert.match(models, /if \(character\._reactorMantle\) \{ this\.stow\(state\); return false; \}\n\s+if \(state\.stowed\) this\.unstow\(state\);/);
    assert.match(models, /if \(character\._reactorMantle \|\| holder\.mantlePose\) Reactor3D\.MantlePose\.update\(holder, character\);\n\s+\/\/ What the character holds/, 'the hands go on the edge before what they hold is laid over the motion');
    // Through the player's own eyes nobody is shown through a wall.
    assert.match(read('runtime/reactor_sprites.js'), /Reactor3D\.Camera\.currentState\(\)\.mode === "firstPerson"\) return list;/);
});

test('hands on the edge: the body against the wall, the arms on the lip, a held thing put away for the climb', () => {
    assert.equal(R.isClimbing({ _reactorMantle: { over: false } }), true);
    assert.equal(R.isClimbing({ _reactorMantle: { over: true } }), false, 'over the edge is a step, not a climb');
    assert.equal(R.isClimbing({ _reactorOnLadder: true }), true);
    // The body is drawn with its front at the wall's face, however deep the model is.
    const thin = { object: { userData: { glbSize: { x: 1, y: 3, z: 0.4 } }, scale: { z: 1 } } };
    const deep = { object: { userData: { glbSize: { x: 1, y: 3, z: 1.6 } }, scale: { z: 1 } } };
    const full = { _reactorMantle: { lean: 0.32 } }, half = { _reactorMantle: { lean: 0.16 } };
    assert.ok(Math.abs(R.mantleHold(thin, full) - (0.5 - 0.2 - R.MANTLE_WALL_GAP)) < 1e-9);
    assert.ok(Math.abs(R.mantleHold(thin, half) - (0.5 - 0.2 - R.MANTLE_WALL_GAP) / 2) < 1e-9, 'eased in with the lean');
    assert.ok(Math.abs(R.mantleHold(deep, full) - (0.5 - 0.42 - R.MANTLE_WALL_GAP)) < 1e-9, 'a deep model is held back, not pushed into the wall');
    assert.equal(R.mantleHold(thin, {}), 0);
    // The lip: on the wall's face between the cells, a little onto the top; a climb down holds the edge it left.
    const M = R.MantlePose, at = { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
    M.lip({ d: 6, x: 5, y: 5, from: 0, to: 3, lip: 3 }, at);
    assert.deepEqual([+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2)], [5 + M.INSET, 3 + M.LIFT, 5.5].map(v => +v.toFixed(2)));
    M.lip({ d: 2, x: 8, y: 9, from: 0, to: 4.54, lip: 4.18 }, at);
    assert.deepEqual([+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2)], [8.5, +(4.18 + M.LIFT).toFixed(2), +(9 + M.INSET).toFixed(2)], 'an eave is taken at its lip, lower than the cell\'s middle');
    M.lip({ d: 6, x: 5, y: 5, from: 3, to: 0, down: true }, at);
    assert.deepEqual([+at.x.toFixed(2), +at.y.toFixed(2)], [+(5 - M.INSET).toFixed(2), +(3 + M.LIFT).toFixed(2)]);
    // How much of the pose shows: onto the edge in a few frames, held through the pull, let go as the body comes onto the top.
    const who = { _x: 5, _y: 5, _realX: 4, _realY: 5 };
    assert.equal(M.weight({ t: 0, over: false }, who, {}), 0);
    assert.equal(M.weight({ t: M.IN, over: false }, who, {}), 1);
    assert.equal(M.weight({ t: 30, over: true }, who, {}), 1, 'still pushing off as the step begins');
    assert.equal(M.weight({ t: 30, over: true }, Object.assign({}, who, { _realX: 4.75 }), {}), 0, 'let go on the top');
    assert.equal(M.weight({ down: true }, who, { reach: 1, far: 0.5 }), 1);
    assert.equal(M.weight({ down: true }, who, { reach: 1, far: 1.3 }), 0, 'the edge it left is out of reach');
    // A model with no hands keeps its motion.
    assert.equal(M.update({ object: null }, {}), false);
    // What is carried is put away for the climb and comes back to the hand.
    const H = R.MapHeld, thing = { visible: true }, node = { quaternion: { equals: () => true, copy(q) { this.copied = q; } } };
    const state = { record: { object: thing }, slots: [{ node, out: 'out', base: 'base', hasFrom: true }], shown: true, t: 1, frames: 0 };
    H.stow(state);
    assert.deepEqual([state.stowed, thing.visible, node.quaternion.copied], [true, false, 'base'], 'out of the picture, the arms back to the model\'s own motion');
    H.stow(state);
    H.unstow(state);
    assert.deepEqual([state.stowed, thing.visible, state.slots[0].hasFrom, state.t, state.frames], [false, true, false, 0, H.EASE], 'eased back into the hand');
    // The edge the hands take is noted when the climb begins.
    const P = sandbox(mapOf([...column(5, 5, 3)])).ReactorPhysics, climber = body(4, 5);
    assert.equal(P.tryMantle(climber, 6), true);
    assert.equal(climber._reactorMantle.lip, 3);
});

test('a ridge, a point, a curve and a tilted slab are not places to stand; a flat roof behind a parapet is', () => {
    const box = (x, y, z, size, more) => piece('box', x, y, z, Object.assign({ size, angle: 0 }, more || {}));
    const map = mapOf([
        ...column(5, 1, 3), piece('prism', 5, 1, 3, { size: [1, 1, 1], angle: 0 }),       // a ridge on top
        ...column(5, 3, 3), box(5, 3, 3, [1, 0.25, 1.4], { tilt: 300 }),                  // a slab at sixty degrees
        box(5, 5, 0, [1, 3, 1]),                                                          // a flat-topped crate three high
        // A one-storey flat roof: walls, the slab, a parapet a tile high; a crate two high beside it.
        piece('wall', 9, 5, 0), piece('floor', 9, 5, 5), piece('block', 9, 5, 5), piece('floor', 10, 5, 5), ...column(8, 5, 2)
    ]);
    const P = sandbox(map).ReactorPhysics;
    const at = (x, y, d, h = 0) => { const e = P.edge(map, x, y, d, h); return e.kind === 'blocked' ? e.reason : e.kind; };
    assert.equal(at(4, 1, 6), 'thin', 'a prism\'s ridge');
    assert.equal(at(4, 3, 6), 'steep', 'a slab laid steeper than a roof is walked');
    assert.equal(at(4, 5, 6), 'mantle', 'a box is a crate');
    assert.equal(at(7, 5, 6), 'hop', 'onto the crate');
    assert.equal(at(8, 4, 2), 'hop');
    const roof = P.edge(map, 8, 5, 6, 2);
    assert.deepEqual([roof.kind, roof.to, roof.rise], ['mantle', 6, 4], 'from the crate onto the parapet: four tiles');
    const inward = P.edge(map, 9, 5, 6, 6);
    assert.deepEqual([inward.kind, Math.round(inward.fell * 10) / 10, inward.hurts], ['drop', 0.9, false], 'and off the parapet onto the roof: a short drop');
    assert.equal(at(8, 6, 8) === 'hop' && P.edge(map, 9, 6, 8, 0).reason, 'high', 'from the ground the parapet is out of reach');
});

test('a roof is a place to be: mantled at its eave, walked up its pitch, crossed at its ridge, dropped off', () => {
    const SP = require(path.join(repoRoot, 'editor', 'src', 'utils', 'StructurePlan.js'));
    const house = roof => {
        const plan = { size: [8, 10], floors: [{ rooms: { hall: [1, 1, 6, 8] }, doors: [['hall', 'outside', 2]] }], roof };
        return { width: 40, height: 40, note: '<3d>', reactor3d: { version: 1, mode: '3d', pieces: SP.build(plan, 10, 10, 1) } };
    };
    /** Southward from the open ground north of the house, climbing where it is offered. */
    const trail = (map, P) => {
        let y = 7, h = 0;
        const out = [];
        for (let i = 0; i < 16; i++) {
            const all = P.edges(map, 13, y, 2, h), e = all.find(o => o.kind === 'mantle') || all[0];
            out.push(e.kind + ' ' + Math.round(e.to * 10) / 10);
            if (e.kind === 'blocked') break;
            y = e.y; h = e.to;
        }
        return out;
    };
    // A gable: 45 degrees, the pitch the plans lay. Its eave hangs a tile out, a tile under the wall's top.
    const gable = house({ pitch: 2 });
    const P = sandbox(gable).ReactorPhysics;
    const eave = P.levelsAt(gable, 13, 9);
    assert.deepEqual(plain(eave.map(l => [Math.round(l.top * 10) / 10, l.level, l.roof, l.stand])), [[0, true, false, true], [4.5, false, true, true]], 'under the eave, and on it');
    assert.ok(Math.abs(R.groundHeightAt(gable, 13.5, 9.05, 4.5) - 4.18) < 0.06 && Math.abs(R.groundHeightAt(gable, 13.5, 9.95, 4.5) - 4.99) < 0.06, 'the slab is stood on where it is, low at its lip');
    assert.deepEqual(trail(gable, P), ['walk 0', 'mantle 4.5', 'walk 5.5', 'walk 6.5', 'walk 7.1', 'walk 7.1', 'walk 7.1', 'walk 7.1', 'walk 7.1', 'walk 7.1', 'walk 6.5', 'walk 5.5', 'walk 4.5', 'drop 0', 'walk 0', 'walk 0']);
    const up = P.edge(gable, 13, 8, 2, 0);
    assert.equal(P.edges(gable, 13, 8, 2, 0).some(e => e.kind === 'mantle' && e.rise > P.edgeRules().reach), true, 'the middle of the eave is over the reach: the hands take its lip');
    assert.equal(up.kind, 'walk', 'and the way under the eave is still a walk');
    assert.equal(R.terrainBlocks(gable, 13, 10, 13, 11, 5.54), false, 'ramp to ramp up the pitch');
    assert.equal(R.terrainBlocks(gable, 13, 11, 13, 12, 0.1), false, 'indoors is as it was');
    assert.equal(R.roofSlopeAt(gable, 13, 10, 5.54), true);
    assert.equal(R.roofSlopeAt(gable, 13, 12, 7.1), false, 'the ridge is a floor');
    assert.equal(sandbox(gable, { mantleReach: 2 }).ReactorPhysics.edges(gable, 13, 8, 2, 0).some(e => e.kind === 'mantle'), false, 'a shorter reach does not make the eave');
    // A slanted roof: a gentle slope, walked like ground; its low eave is a wall's height up, out of reach without a crate.
    const shed = house({ style: 'shed', pitch: 3, high: 'north' });
    const S = sandbox(shed).ReactorPhysics;
    const low = S.levelsAt(shed, 13, 20), high = S.levelsAt(shed, 13, 10);
    assert.ok(low[1].top > 5 && low[1].top < 5.4 && high[0].top > 8 && high[0].top < 8.5, 'the slab follows its slope from the low eave to the high side');
    assert.ok(low[1].level && low[1].stand && low[1].slope > 0.2 && low[1].slope < 0.4);
    assert.equal(S.edges(shed, 13, 21, 8, 0).some(e => e.kind === 'mantle'), false, 'not from the ground');
    assert.equal(S.edges(shed, 13, 21, 8, 1.5).some(e => e.kind === 'mantle' && e.to > 5), true, 'from a crate a tile and a half high');
    assert.equal(S.edge(shed, 13, 20, 8, low[1].top).kind, 'walk', 'and up the slope on foot');
    // Two ramps in a row on the ground are a slope walked, as a stair's run is.
    const ramps = mapOf([piece('ramp', 5, 5, 0), piece('ramp', 5, 6, 1), piece('block', 5, 7, 0), piece('block', 5, 7, 1)]);
    assert.equal(R.terrainBlocks(ramps, 5, 5, 5, 6, 0.5), false);
    assert.equal(R.terrainBlocks(mapOf([...column(5, 6, 1)]), 5, 5, 5, 6, 0), true, 'a block is still a step too high');
});

test('an eave over the way on is taken by Jump as the step ends; a follower climbs only to where its leader is', () => {
    const SP = require(path.join(repoRoot, 'editor', 'src', 'utils', 'StructurePlan.js'));
    const plan = { size: [8, 10], floors: [{ rooms: { hall: [1, 1, 6, 8] }, doors: [['hall', 'outside', 2]] }], roof: { pitch: 2 } };
    const map = { width: 40, height: 40, note: '<3d>', reactor3d: { version: 1, mode: '3d', pieces: SP.build(plan, 10, 10, 1) } };
    const P = sandbox(map).ReactorPhysics;
    const walker = body(13, 8);
    assert.equal(P.mantleAhead(walker, 13, 8, 2), 1, 'the eave hangs over the next cell');
    assert.equal(P.mantleAhead(walker, 13, 7, 2), 2, 'a step early is in time');
    assert.equal(P.mantleAhead(walker, 13, 6, 2), 0, 'open ground');
    // At a run the same press comes twice as many cells early: the eave is still taken.
    const runner = body(13, 6, { realMoveSpeed: () => 5 });
    assert.equal(P.mantleLookAhead(walker), 2);
    assert.equal(P.mantleLookAhead(runner), 4);
    assert.equal(P.mantleLookAhead(body(0, 0, { realMoveSpeed: () => 3 })), 2, 'never fewer than a walk');
    assert.equal(P.mantleLookAhead(body(0, 0, { realMoveSpeed: () => 9 })), P.MANTLE_AHEAD_MAX);
    assert.equal(P.mantleAhead(runner, 13, 6, 2), 3, 'three steps on, at a run');
    assert.equal(P.mantleAhead(runner, 13, 5, 2), 4);
    assert.equal(P.mantleAhead(runner, 13, 4, 2), 0, 'further off is a jump');
    // The wish counts down a step at a time while the run keeps its way, and takes the ledge when it is there.
    {
        const steps = [];
        let wish = [2, P.mantleAhead(runner, 13, 5, 2)];
        for (let y = 5; wish; y++) {
            wish = wish[1] > 1 ? [wish[0], wish[1] - 1] : null;
            steps.push(P.mantleAhead(body(13, y), 13, y, 2));
            if (steps[steps.length - 1] === 1) break;
        }
        assert.deepEqual(steps, [0, 0, 2, 1], 'the ledge is one step on when the count runs out');
    }
    assert.equal(P.mantleAhead(body(13, 8, { _reactorAlt: 2, _reactorVz: 0.05 }), 13, 8, 2), 0, 'not from the air: that is a push');
    // The leader walked under the eave: the follower walks after it. The leader is on the roof: the follower climbs.
    const follower = body(13, 8);
    assert.equal(P.followerMantle(follower, body(13, 9)), false);
    assert.equal(P.followerMantle(follower, body(13, 10, { _reactorAlt: 5.54, _reactorGround: 5.54 })), true);
    assert.ok(Math.abs(follower._reactorMantle.to - 4.54) < 0.05);
    const physics = read('runtime/reactor_physics.js');
    assert.match(physics, /else if \(this\.isMoving\(\) && ReactorPhysics\.mantleAhead\(this, this\.x, this\.y, this\.direction\(\)\)\) this\._reactorMantleWish = \[this\.direction\(\), /);
    assert.match(physics, /if \(typeof \$gamePlayer !== "undefined" && \$gamePlayer && \$gamePlayer\._reactorMantle\) return false;/);
    // A Tactical unit pulls itself up two tiles over its jump: the usual unit a wall its own height, never an eave.
    assert.deepEqual(JSON.parse(JSON.stringify(P.tacticalEdge(13, 8, 2, 0, 1))), null, 'the walk under it is the grid\'s');
    const c = sandbox({ width: 14, height: 14, note: '<3d>', reactor3d: { version: 1, mode: '3d', pieces: column(5, 5, 4) } });
    assert.equal(c.ReactorPhysics.TACTICAL_MANTLE_REACH, 2);
    assert.deepEqual(plain(c.ReactorPhysics.tacticalEdge(4, 5, 6, 0, 1)), { kind: 'climb', cost: 3, height: 4 }, 'four tiles are over a unit of the usual jump: it climbs the wall');
    assert.equal(c.ReactorPhysics.tacticalEdge(4, 5, 6, 0, 2).kind, 'mantle', 'and within one that jumps two');
    c.$dataSystem.reactorPhysics = { battleClimb: false };
    assert.equal(c.ReactorPhysics.tacticalEdge(4, 5, 6, 0, 1), null, 'with climbing off, out of reach');
});

test('a camera behind a player on a roof is lifted over the tiles, and left alone anywhere else', () => {
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const SP = require(path.join(repoRoot, 'editor', 'src', 'utils', 'StructurePlan.js'));
    const plan = { size: [8, 10], floors: [{ rooms: { hall: [1, 1, 6, 8] }, doors: [['hall', 'outside', 2]] }], roof: { pitch: 2 } };
    const map = { width: 40, height: 40, note: '<3d>', reactor3d: { version: 1, mode: '3d', pieces: SP.build(plan, 10, 10, 1) } };
    const camera = new THREE.PerspectiveCamera();
    const aim = (fx, fy, fz, cx, cy, cz) => { camera.position.set(cx, cy, cz); camera.lookAt(fx, fy, fz); camera.updateMatrixWorld(); return { x: fx, y: fy, z: fz }; };
    // On the north pitch at (13, 10), feet 5.54, coming down it northward: the camera is behind, up the pitch, under the tiles.
    let focus = aim(13.5, 5.54 + 1.2, 10.5, 13.5, 6.9, 14.5);
    assert.ok(6.9 < R.groundHeightAt(map, 13.5, 14.5, 6.5), 'the camera starts under the ridge');
    assert.equal(R.clearCameraRoof(camera, focus, map, 5.54), true);
    assert.ok(camera.position.y > 7.1 + 0.5 && camera.position.x === 13.5 && camera.position.z === 14.5, 'lifted over the ridge, where it stood: ' + camera.position.y.toFixed(2));
    const ahead = camera.getWorldDirection(new THREE.Vector3());
    assert.ok(ahead.z < 0 && ahead.y < 0, 'still looking down at the player');
    // Going up the pitch the camera is out over the eave: nothing to do.
    focus = aim(13.5, 5.54 + 1.2, 10.5, 13.5, 8.5, 6.5);
    assert.equal(R.clearCameraRoof(camera, focus, map, 5.54), false);
    // Indoors, on the ground, and with no pieces: left alone.
    focus = aim(13.5, 0.1 + 1.2, 14.5, 13.5, 3, 17.5);
    assert.equal(R.clearCameraRoof(camera, focus, map, 0.1), false, 'under a roof is the cutaway\'s');
    focus = aim(13.5, 1.2, 7.5, 13.5, 3, 3.5);
    assert.equal(R.clearCameraRoof(camera, focus, map, 0), false, 'on the ground');
    assert.equal(R.clearCameraRoof(camera, focus, { width: 40, height: 40, reactor3d: {} }, 5), false);
    assert.match(read('runtime/reactor_3d.js'), /if \(Reactor3D\.clearCameraRoof && walker && !resolved\.eye\) Reactor3D\.clearCameraRoof\(camera, focus, \$dataMap, /);
});

test('a party member steps off a roof edge when the fall is safe; a cliff, a long fall and anyone else still take a Jump', () => {
    const map = mapOf([...column(5, 5, 4), ...column(5, 8, 8)]);
    const c = sandbox(map, { fallDamage: true, fallFrom: 6 });
    const P = c.ReactorPhysics;
    const player = body(5, 5, { _reactorAlt: 4, _reactorGround: 4 });
    c.$gamePlayer = player;
    c.$gameMap = { isPassable: () => true };
    assert.equal(P.walksOff(player, 5, 5, 4), true, 'four tiles down off a built top');
    assert.equal(P.walksOff(body(5, 5, { _reactorAlt: 4, _reactorGround: 4 }), 5, 5, 4), false, 'an event does not');
    const high = body(5, 8, { _reactorAlt: 8, _reactorGround: 8 });
    c.$gamePlayer = high;
    assert.equal(P.walksOff(high, 5, 8, 4), false, 'eight tiles is past the safe fall');
    const ground = body(4, 5);
    c.$gamePlayer = ground;
    assert.equal(P.walksOff(ground, 4, 5, 4), false, 'level ground is a walk, not this');
    c.$gameMap = { isPassable: () => false };
    c.$gamePlayer = player;
    assert.equal(P.walksOff(player, 5, 5, 4), false, 'a tile that cannot be left is not left');
    const physics = read('runtime/reactor_physics.js');
    assert.match(physics, /return _isMapPassable\.apply\(this, arguments\) \|\| ReactorPhysics\.walksOff\(this, x, y, d\);/);
    // An event climbs only when its note says so.
    assert.equal(P.climbs({ event: () => ({ meta: { climb: true } }) }), true);
    assert.equal(P.climbs({ event: () => ({ meta: {} }) }), false);
    assert.equal(P.climbs(player), false);
    assert.match(physics, /if \(!this\.isMovementSucceeded\(\) && !this\._reactorMantle && ReactorPhysics\.climbs\(this\)\s+&& \(ReactorPhysics\.tryMantle\(this, d, true\) \|\| ReactorPhysics\.stepUp\(this, d\)\)\) this\.setMovementSuccess\(true\);/);
    // A ledge of the ground itself is not walked off (a push steps down a low one: physics-footing.test.cjs).
    const cliff = sandbox({ width: 14, height: 14, note: '<3d>', reactor3d: { version: 1, mode: '3d', pieces: [piece('floor', 0, 0, 0)], elevation: new Array(196).fill(0).map((v, i) => (i % 14 >= 5 ? 1 : 0)) } });
    const walker = body(5, 5, { _reactorAlt: 1, _reactorGround: 1 });
    cliff.$gamePlayer = walker;
    cliff.$gameMap = { isPassable: () => true };
    assert.equal(cliff.ReactorPhysics.walksOff(walker, 5, 5, 4), false, 'a cliff of the ground takes a Jump, or a push');
    walker._reactorStepOff = 4;
    assert.equal(cliff.ReactorPhysics.walksOff(walker, 5, 5, 4), true, 'pushed against, a ledge one tile deep is stepped down');
});

test('a camera is never left in a roof\'s hollow, and an event under the roof the player stands on gets no corridor', () => {
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const SP = require(path.join(repoRoot, 'editor', 'src', 'utils', 'StructurePlan.js'));
    const plan = { size: [8, 10], floors: [{ rooms: { hall: [1, 1, 6, 8] }, doors: [['hall', 'outside', 2]] }], roof: { pitch: 2 } };
    const map = { width: 40, height: 40, note: '<3d>', reactor3d: { version: 1, mode: '3d', pieces: SP.build(plan, 10, 10, 1) } };
    assert.equal(R.inRoofVoid(map, 13.5, 5.6, 11.5), true, 'under the ramps, over the ceiling');
    assert.equal(R.inRoofVoid(map, 13.5, 6, 14.5), true, 'under the ridge\'s strip');
    assert.equal(R.inRoofVoid(map, 13.5, 2.5, 14.5), false, 'a room is not one');
    assert.equal(R.inRoofVoid(map, 13.5, 8.5, 14.5), false, 'over the roof');
    assert.equal(R.inRoofVoid(map, 13.5, 2, 5.5), false, 'open ground');
    assert.equal(R.inRoofVoid(map, 13.5, 4.7, 14.5), false, 'nor is it one just under its ceiling');
    assert.equal(R.inRoofVoid(map, 13.5, 2, 9.5), false, 'the open air under the eave is not one: only the ground is below it');
    assert.equal(R.inRoofVoid(map, 13.5, 5.2, 10.5), true, 'over the wall\'s top, under the tiles');
    const camera = new THREE.PerspectiveCamera();
    // The player has stepped off the north eave and stands on the ground; the camera behind is in the attic.
    const focus = { x: 13.5, y: 1.2, z: 7.5 };
    camera.position.set(13.5, 5.8, 12.5); camera.lookAt(focus.x, focus.y, focus.z); camera.updateMatrixWorld();
    R._cutawayUniforms = null;
    assert.equal(R.clearCameraAttic(camera, focus, map), true);
    assert.ok(Math.abs(camera.position.y - (7.1 + R.CAMERA_ROOF_MARGIN)) < 0.05 && camera.position.z === 12.5, 'over the tiles above it: ' + camera.position.y.toFixed(2));
    camera.position.set(13.5, 3, 4.5); camera.lookAt(focus.x, focus.y, focus.z); camera.updateMatrixWorld();
    assert.equal(R.clearCameraAttic(camera, focus, map), false, 'in the open it is left alone');
    // A player walking away from the house, never on its roof: the camera behind passes through the room
    // under the ceiling and under the eave, and stays at its own height.
    for (const z of [9.5, 10.5, 12.5, 14.5]) {
        camera.position.set(13.5, 4.69, z); camera.lookAt(13.5, 1.2, z - 7.25); camera.updateMatrixWorld();
        assert.equal(R.clearCameraAttic(camera, { x: 13.5, y: 1.2, z: z - 7.25 }, map), false, 'no rise at z ' + z);
        assert.equal(camera.position.y, 4.69);
    }
    assert.match(read('runtime/reactor_3d.js'), /if \(Reactor3D\.clearCameraAttic && !resolved\.eye\) Reactor3D\.clearCameraAttic\(camera, focus, \$dataMap\);/);
    assert.match(read('runtime/reactor_sprites.js'), /\$gamePlayer\._reactorGround - event\._reactorGround > Reactor3D\.CUTAWAY_COMPANY_BELOW\) continue;/);
    assert.equal(R.CUTAWAY_COMPANY_BELOW, 3);
});

test('a grid that keeps two heights on a cell is told both ways on: under the eave and onto it', () => {
    const SP = require(path.join(repoRoot, 'editor', 'src', 'utils', 'StructurePlan.js'));
    const plan = { size: [8, 10], floors: [{ rooms: { hall: [1, 1, 6, 8] }, doors: [['hall', 'outside', 2]] }], roof: { pitch: 2 } };
    const map = { width: 40, height: 40, note: '<3d>', reactor3d: { version: 1, mode: '3d', pieces: SP.build(plan, 10, 10, 1) } };
    const P = sandbox(map).ReactorPhysics;
    const ways = jump => plain(P.tacticalEdges(13, 8, 2, 0, jump)).map(w => [w.kind, w.cost, Math.round(w.height * 10) / 10]);
    assert.deepEqual(ways(3), [['walk', 1, 0], ['mantle', 2, 4.5]], 'a unit that jumps three tiles makes the eave');
    assert.deepEqual(ways(1), [['walk', 1, 0], ['climb', 4, 4.5]], 'the usual unit walks under it, or climbs the wall to the eave four and a half tiles up');
    assert.equal(P.tacticalEdge(13, 8, 2, 0, 3), null, 'the single answer is still the walk, which is the grid\'s own');
    assert.deepEqual(plain(P.tacticalEdges(13, 9, 2, 4.54, 1)).map(w => [w.kind, w.cost]), [['walk', 1]], 'and up the pitch from the eave');
    assert.deepEqual(plain(P.tacticalEdges(13, 9, 2, 0, 3)), [], 'from under the eave the wall is the end');
});
