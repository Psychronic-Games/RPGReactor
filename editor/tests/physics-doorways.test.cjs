// Walking on every floor: the party is never lifted at a doorway, on a staircase or on the floor above, and the
// walk-up rule never climbs more than a hop. The first half is walked on North Haven itself (the Demo's Map005):
// every doorway, every staircase and every tile of the floors the staircases lead to, with the game's own frame
// (Game_Player.update with a direction held, the followers behind) and every walker's height read every frame.
// The second half is on small maps made here: the cap on the walk-up rule (and what it must never take away: the
// way out of a pond or a river bed), a walker who walked into ground that rises steeply at a tile's border, and the
// bodies that rule leaves alone (set Through, the playtest's walk-through key, a gather, anything built).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { runtimeParts, runtimeRoot } = require('./helpers/runtime-source.cjs');
const { runtime3DFiles } = require('./helpers/runtime-3d-source.cjs');
const { fightWorld } = require('./helpers/fight-world.cjs');

const repoRoot = path.resolve(__dirname, '..', '..');
// RR_RUNTIME names another runtime folder (an earlier copy), to see the walks fail there.
const runtimeDir = process.env.RR_RUNTIME ? path.resolve(process.env.RR_RUNTIME) : runtimeRoot;
const readRuntime = name => fs.readFileSync(path.join(runtimeDir, name), 'utf8');
/** The parts of a split runtime script in the order that folder's reactor_main.js loads them. */
function partsOf(file) {
    if (runtimeDir === runtimeRoot) return runtimeParts(file);
    const stem = file.replace(/\.js$/, '');
    return Array.from(readRuntime('reactor_main.js').matchAll(/"js\/([^"/]+\.js)"/g), m => m[1]).filter(name => name === file || name.startsWith(stem + '_'));
}
const R = require(path.join(runtimeDir, 'reactor_3d.js'));
const LIMIT = R.TERRAIN_SLOPE_LIMIT;
const demoData = path.join(repoRoot, 'template', 'Demo', 'data');

const DX = { 2: 0, 4: -1, 6: 1, 8: 0 }, DY = { 2: 1, 4: 0, 6: 0, 8: -1 };
const DIAGONALS = { NE: [6, 8], SW: [4, 2], NW: [4, 8], SE: [6, 2] };
const STRAIGHTS = { N: 8, S: 2, W: 4, E: 6 };
const alt = c => (Number.isFinite(c._reactorAlt) ? c._reactorAlt : c._reactorGround);

/**
 * The party's controls over a game context: `place` puts it on a cell at rest on the floor nearest a height, `walk`
 * holds a way (2, 4, 6, 8, or [horz, vert] taken as the camera-relative walk takes it: the diagonal, else its
 * vertical step, else its horizontal one) for some frames, lets go until everybody is at rest, and returns the
 * largest rise of any walker's height in one frame, whether anybody pulled itself up, and where each ended: its
 * cell, its height, how far `up` from where it began, and how far `over` both its start and its end it was on the
 * way (a walker carried up over something and set down again). `keys.through` holds the playtest's walk-through key.
 */
function controls(ctx) {
    const player = ctx.$gamePlayer, P = ctx.ReactorPhysics;
    const keys = { dir: 0, dash: false, jump: false, through: false };
    ctx.Input.isPressed = name => (name === 'shift' && keys.dash) || (name === 'control' && keys.through);
    ctx.Input.isTriggered = name => name === 'jump' && keys.jump;
    player.moveByInput = function() {
        const dir = keys.dir;
        if (this.isMoving() || !this.canMove() || !dir) return;
        if (Array.isArray(dir)) {
            this.moveDiagonally(dir[0], dir[1]);
            if (!this.isMovementSucceeded()) this.executeMove(dir[1]);
            if (!this.isMovementSucceeded()) this.executeMove(dir[0]);
        } else this.executeMove(dir);
    };
    player.setThrough(false);
    const followers = player.followers(), own = { update: followers.update, updateMove: followers.updateMove };
    let single = false;
    /** The leader by itself (the followers neither walk nor are counted), or the whole party again. */
    const alone = on => { single = !!on; followers.update = on ? () => {} : own.update; followers.updateMove = on ? () => {} : own.updateMove; };
    const party = () => (single ? [player] : [player, ...followers.visibleFollowers()]);
    const tick = () => { ctx.Graphics.frameCount++; player.update(true); keys.jump = false; };
    const settled = c => !c.isMoving() && !c._reactorMantle && !c._reactorStepDown && !P.isAirborne(c) && !Number.isFinite(c._reactorStepUp);
    const place = (x, y, height) => {
        keys.dir = 0; keys.dash = false;
        player.locate(x, y); player.followers().synchronize(x, y, 2);
        player._reactorPushFrames = 0; player._reactorPushDir = 0; player._dashing = false;
        for (const c of party()) { c._reactorGround = height; c._reactorAlt = height; }
        tick(); tick();
    };
    const walk = (dir, frames, more = {}) => {
        const members = party(), last = members.map(alt), begin = last.slice(), tops = last.slice();
        let rise = 0, climbed = false;
        const note = () => members.forEach((c, i) => { const a = alt(c); if (a - last[i] > rise) rise = a - last[i]; last[i] = a; if (c._reactorMantle) climbed = true; if (a > tops[i]) tops[i] = a; });
        keys.dir = dir; keys.dash = !!more.dash;
        for (let f = 0; f < frames; f++) { if (more.jumpAt === f) keys.jump = true; tick(); note(); }
        keys.dir = 0; keys.dash = false;
        let rest = 0;
        for (let f = 0; f < 90 && rest < 2; f++) { tick(); note(); rest = members.every(settled) ? rest + 1 : 0; }
        return { rise, climbed, top: tops[0], x: player.x, y: player.y, alt: alt(player),
            ends: members.map((c, i) => ({ x: c.x, y: c.y, alt: alt(c), up: alt(c) - begin[i], over: tops[i] - Math.max(begin[i], alt(c)) })) };
    };
    return { keys, place, walk, party, tick, alone };
}

//-----------------------------------------------------------------------------
// North Haven

/**
 * The game's own map objects over the Demo's North Haven: the shipped managers and objects, the 3D runtime and the
 * physics in one context, the Demo's database, a party of three. The map's rocks are left out (they take a quarter
 * of a minute to measure, and none stands in a house) and so are its events.
 */
function northHaven() {
    const json = name => JSON.parse(fs.readFileSync(path.join(demoData, name), 'utf8'));
    const ctx = { console: Object.assign({}, console, { info() {} }), setTimeout, clearTimeout, Bitmap: function() {}, Input: function() {} };
    vm.createContext(ctx);
    vm.runInContext('window = globalThis;', ctx);
    const core = readRuntime('reactor_core.js');
    vm.runInContext(core.slice(0, core.indexOf('function Utils()')), ctx, { filename: 'reactor_core.js' });
    const feedStart = core.indexOf('function ReactorEvents()'), alias = 'window.$reactorEvents = ReactorEvents;';
    vm.runInContext(core.slice(feedStart, core.indexOf(alias, feedStart) + alias.length), ctx, { filename: 'reactor_core.js' });
    for (const file of ['reactor_managers.js', 'reactor_objects.js']) vm.runInContext(partsOf(file).map(readRuntime).join(''), ctx, { filename: file });
    vm.runInContext(`
        Utils = { extractFileName: name => name, RPGMAKER_NAME: "MZ", isNwjs: () => false, isOptionValid: () => false };
        SceneManager = { _scene: null, push() {}, goto() {}, isSceneChanging: () => false };
        Input = { isPressed: () => false, isTriggered: () => false, isRepeated: () => false, dir4: 0, dir8: 0, update() {}, keyMapper: {}, gamepadMapper: {} };
        TouchInput = { isTriggered: () => false, isPressed: () => false, isCancelled: () => false, x: 0, y: 0 };
        Graphics = { width: 816, height: 624, frameCount: 0, boxWidth: 816, boxHeight: 624 };
        Scene_Battle = function Scene_Battle() {}; Scene_Gameover = function Scene_Gameover() {};
        for (const name of ["playBgm", "playBgs", "playMe", "playSe", "stopBgm", "stopBgs", "stopMe", "replayBgm", "replayBgs", "playStaticSe"]) AudioManager[name] = () => {};
        SoundManager.playJump = () => {};
    `, ctx);
    for (const [name, file] of [['$dataActors', 'Actors.json'], ['$dataClasses', 'Classes.json'], ['$dataSkills', 'Skills.json'], ['$dataItems', 'Items.json'], ['$dataWeapons', 'Weapons.json'],
        ['$dataArmors', 'Armors.json'], ['$dataEnemies', 'Enemies.json'], ['$dataTroops', 'Troops.json'], ['$dataStates', 'States.json'], ['$dataAnimations', 'Animations.json'],
        ['$dataTilesets', 'Tilesets.json'], ['$dataCommonEvents', 'CommonEvents.json'], ['$dataMapInfos', 'MapInfos.json'], ['$dataSystem', 'System.json']]) ctx[name] = json(file);
    ctx.$dataSystem.reactorPhysics = {};
    ctx.$dataMap = json('Map005.json');
    ctx.$dataMap.reactor3d = json('Map005.r3d.json');
    ctx.$dataMap.reactor3d.pieces = ctx.$dataMap.reactor3d.pieces.filter(piece => piece.kind !== 'rock');
    delete ctx.$dataMap.reactor3d.physics;
    ctx.$dataMap.events = [null];
    vm.runInContext('for (const list of [$dataActors, $dataClasses, $dataSkills, $dataItems, $dataWeapons, $dataArmors, $dataEnemies, $dataStates]) DataManager.extractArrayMetadata(list); DataManager.extractMetadata($dataMap);', ctx);
    const files3D = runtimeDir === runtimeRoot ? runtime3DFiles() : (() => {
        const block = readRuntime('reactor_3d.js').match(/Reactor3D\.EXTENSIONS = \[([\s\S]*?)\];/);
        return ['reactor_3d.js', ...(block ? Array.from(block[1].matchAll(/file: "([^"]+)"/g), m => m[1]) : [])];
    })();
    for (const file of files3D) vm.runInContext(readRuntime(file), ctx, { filename: file });
    if (ctx.Reactor3D.installPropHooks) ctx.Reactor3D.installPropHooks();
    ctx.Reactor3D._databaseSidecar = null;
    ctx.Reactor3D._databaseSidecarState = 'done';
    vm.runInContext(readRuntime('reactor_controls.js'), ctx, { filename: 'reactor_controls.js' });
    vm.runInContext(readRuntime('reactor_physics.js'), ctx, { filename: 'reactor_physics.js' });
    vm.runInContext('DataManager.createGameObjects(); $gameParty.setupStartingMembers(); $gameMap.setup(5); $gamePlayer.locate(80, 58); $gamePlayer.refresh(); $gamePlayer.followers().synchronize(80, 58, 2);', ctx);
    const world = controls(ctx);
    const map = ctx.$dataMap, W3 = ctx.Reactor3D, P = ctx.ReactorPhysics, player = ctx.$gamePlayer;
    const inMap = (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height;
    /** The player on a state without a frame played: for asking what it may do from there. */
    const at = (x, y, g) => {
        player._x = x; player._y = y; player._realX = x; player._realY = y; player._reactorGround = g; player._reactorAlt = g; player._reactorAir = 0; player._reactorVz = 0;
        player._reactorMantle = null; player._reactorSwim = false; player._reactorOnLadder = false; player._reactorStepDown = false; player._reactorStepUp = undefined; player._reactorJumped = false;
    };
    /** The floor of a cell nearest a height, within `within`: the height, or null. */
    const floorNear = (x, y, height, within) => {
        if (!inMap(x, y)) return null;
        const top = W3.groundHeightAt(map, x + 0.5, y + 0.5, height);
        return Math.abs(top - height) <= within + 1e-6 ? top : null;
    };
    /** Whether a body can be on a cell at a height by walking: some straight step leaves it and comes back. */
    const walkable = (x, y, g) => [2, 4, 6, 8].some(d => {
        const x2 = x + DX[d], y2 = y + DY[d];
        if (!inMap(x2, y2)) return false;
        at(x, y, g);
        if (!player.canPass(x, y, d)) return false;
        const to = W3.groundHeightAt(map, x2 + 0.5, y2 + 0.5, g);
        if (Math.abs(to - g) > LIMIT + 1e-6) return false;
        at(x2, y2, to);
        return player.canPass(x2, y2, 10 - d);
    });
    /** Every staircase: its stairs from the foot up, the way it climbs, the floors it joins, the cells before its foot and after its head. */
    const staircases = () => {
        const groups = new Map();
        for (const piece of W3.piecesOf(map)) if (piece.kind === 'stair') { const key = piece.group || piece.x + ',' + piece.y; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(piece); }
        return [...groups.values()].map(list => {
            list.sort((a, b) => a.z - b.z);
            const foot = list[0], head = list[list.length - 1], axis = W3.stairAxis(foot.rot), base = W3.pieceBaseAt(map, foot.x, foot.y);
            return { list, axis, base, lower: base + foot.z + 0.1, upper: base + head.z + 1.1, before: [foot.x - axis[0], foot.y - axis[1]], after: [head.x + axis[0], head.y + axis[1]] };
        });
    };
    /** Every (tile, floor) reached on foot from a place, kept per tile AND per floor, where `keep` allows. */
    const reach = (x0, y0, g0, keep) => {
        const seen = new Map(), queue = [];
        const visit = (x, y, g) => { const key = x + ',' + y + ',' + Math.round(g * 2); if (seen.has(key) || !keep(x, y, g)) return; seen.set(key, [x, y, g]); queue.push([x, y, g]); };
        visit(x0, y0, g0);
        while (queue.length) {
            const [x, y, g] = queue.pop();
            for (const d of [2, 4, 6, 8]) {
                const x2 = x + DX[d], y2 = y + DY[d];
                if (!inMap(x2, y2)) continue;
                at(x, y, g);
                if (!player.canPass(x, y, d)) continue;
                const option = P.edge(map, x, y, d, g);
                visit(x2, y2, option.kind === 'walk' || option.kind === 'drop' ? option.to : W3.groundHeightAt(map, x2 + 0.5, y2 + 0.5, g));
            }
        }
        return [...seen.values()];
    };
    return Object.assign(world, { ctx, map, W3, P, player, floorNear, walkable, staircases, reach });
}

let haven = null;
const havenWorld = () => haven || (haven = northHaven());
const hasDemo = () => fs.existsSync(path.join(demoData, 'Map005.r3d.json'));
const r2 = value => Math.round(value * 100) / 100;

test('North Haven, every doorway on its own floor: walked through on both diagonals both ways, nobody is lifted', t => {
    if (!hasDemo()) return t.skip('the Demo is not in this checkout');
    const w = havenWorld(), { map, W3 } = w;
    const doorways = W3.piecesOf(map).filter(piece => piece.kind === 'doorway');
    assert.ok(doorways.length > 0, 'the map has doorways');
    const lifted = [], liftedAt = new Set();
    let walked = 0, walks = 0, upstairs = 0;
    for (const door of doorways) {
        const floor = w.floorNear(door.x, door.y, W3.pieceBaseAt(map, door.x, door.y) + door.z + 0.1, 0.6);
        if (floor === null || !w.walkable(door.x, door.y, floor)) continue;
        walked++;
        if (door.z >= 1) upstairs++;
        // From the doorway and from the eight cells round it, each diagonal held for two tiles at a run: the steps that
        // pass a door's jamb start in front of it and behind it as much as in it. From the doorway itself the whole
        // party, at a walk as well, and straight through it each way.
        const starts = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const side = dx || dy ? w.floorNear(door.x + dx, door.y + dy, floor, 1 + LIMIT) : floor;
            if (side !== null && (!(dx || dy) || w.walkable(door.x + dx, door.y + dy, side))) starts.push([door.x + dx, door.y + dy, side]);
        }
        const tries = [];
        for (const [x, y, h] of starts) for (const way of Object.keys(DIAGONALS)) tries.push([x, y, h, way, DIAGONALS[way], 16, true, !(x === door.x && y === door.y)]);
        for (const way of Object.keys(DIAGONALS)) tries.push([door.x, door.y, floor, way, DIAGONALS[way], 20, false, false]);
        for (const way of Object.keys(STRAIGHTS)) tries.push([door.x, door.y, floor, way, STRAIGHTS[way], 10, true, false]);
        for (const [x, y, h, way, dir, frames, dash, single] of tries) {
            w.alone(single);
            w.place(x, y, h);
            const out = w.walk(dir, frames, { dash });
            walks++;
            // No frame raises a walker more than a step, nobody ends above the floor they came in on, and nobody is
            // carried up over the walk and set down again.
            const high = out.ends.find(end => end.up > 1 + LIMIT || end.over > 1 + LIMIT);
            if (out.rise > LIMIT + 1e-6 || high) {
                liftedAt.add(door.x + ',' + door.y + ',' + door.z);
                lifted.push(`door ${door.x},${door.y}${door.z ? ' (floor ' + door.z + ')' : ''} from ${x},${y} ${way}${dash ? ' at a run' : ''}: rose ${r2(out.rise)} in a frame, ends at ${out.ends.map(end => r2(end.alt)).join(' / ')}`);
            }
        }
    }
    w.alone(false);
    assert.equal(walked, doorways.length, 'every doorway of the map has a floor to walk it on');
    assert.ok(upstairs > 0, 'doorways of the floors above among them');
    assert.deepEqual(lifted.slice(0, 12), [], `${lifted.length} of ${walks} walks lift a walker, at ${liftedAt.size} of ${walked} doorways`);
});

test('North Haven, every staircase: up and down, on every diagonal, hugging each wall, at a walk, a run and move speed 6', t => {
    if (!hasDemo()) return t.skip('the Demo is not in this checkout');
    const w = havenWorld(), { player } = w;
    const runs = w.staircases();
    assert.ok(runs.length > 0, 'the map has staircases');
    const lifted = [];
    let walks = 0;
    for (const run of runs) {
        const starts = [];
        const add = (x, y, height) => { const floor = w.floorNear(x, y, height, 0.6); if (floor !== null && w.walkable(x, y, floor)) starts.push([x, y, floor]); };
        add(run.before[0], run.before[1], run.lower);
        add(run.after[0], run.after[1], run.upper);
        for (const stair of run.list) {
            add(stair.x, stair.y, run.base + stair.z + 0.5);
            // Beside the run on the floor above, where the stairwell opens.
            for (const side of [-1, 1]) add(stair.x + run.axis[1] * side, stair.y + run.axis[0] * side, run.upper);
        }
        assert.ok(starts.length >= run.list.length + 2, 'the foot, the head and every stair of the run are places to stand');
        const tall = run.upper + 0.11;
        const judge = (label, out) => {
            walks++;
            // Nobody ends above the floor the stairs lead to, and the one who walks is not carried up and set down.
            // (A follower may go up some stairs and step off again on its own feet: it heads for the leader along
            // the run when the diagonal is shut to it. That is where it walks, not a lift; no frame raises it more
            // than the slope allows.)
            const over = out.ends.find((end, i) => end.alt > tall || (i === 0 && end.over > 1 + LIMIT));
            if (out.rise > LIMIT + 1e-6 || over) lifted.push(`stairs at ${run.list[0].x},${run.list[0].y} ${label}: rose ${r2(out.rise)} in a frame, ends at ${out.ends.map(end => r2(end.alt)).join(' / ')} (the floor above is ${r2(run.upper)})`);
        };
        for (const [x, y, h] of starts) {
            for (const way of Object.keys(DIAGONALS)) { w.place(x, y, h); judge(`from ${x},${y} ${way} at a run`, w.walk(DIAGONALS[way], 48, { dash: true })); }
            for (const way of Object.keys(STRAIGHTS)) { w.place(x, y, h); judge(`from ${x},${y} ${way} at a run`, w.walk(STRAIGHTS[way], 48, { dash: true })); }
        }
        // The whole run, straight: up from the floor below to the floor above and down again.
        const up = { 1: 6, '-1': 4 }[run.axis[0]] || (run.axis[1] > 0 ? 2 : 8);
        for (const [speed, dash, frames] of [[4, false, 112], [4, true, 56], [6, false, 30], [6, true, 16]]) {
            player.setMoveSpeed(speed);
            w.place(run.before[0], run.before[1], run.lower);
            const climbed = w.walk(up, frames, { dash });
            judge(`up, move speed ${speed}${dash ? ' at a run' : ''}`, climbed);
            assert.ok(Math.abs(climbed.alt - run.upper) < 0.02, `up the run at move speed ${speed}${dash ? ' at a run' : ''}: on the floor above (${r2(climbed.alt)})`);
            assert.ok(climbed.rise <= Math.max(0.3, player.distancePerFrame() * 2) + 1e-6, `a stair's rise a frame, no more (${r2(climbed.rise)})`);
            w.place(run.after[0] + run.axis[0], run.after[1] + run.axis[1], run.upper);
            const down = w.walk(10 - up, frames + 16, { dash });
            judge(`down, move speed ${speed}${dash ? ' at a run' : ''}`, down);
            assert.ok(Math.abs(down.alt - run.lower) < 0.25, `and down again to the floor below (${r2(down.alt)})`);
            player.setMoveSpeed(4);
        }
    }
    assert.deepEqual(lifted.slice(0, 12), [], `${lifted.length} of ${walks} walks on ${runs.length} staircases lift a walker`);
});

test('North Haven, the floors the staircases lead to: every tile left in all eight directions, nobody ends on the floor above', t => {
    if (!hasDemo()) return t.skip('the Demo is not in this checkout');
    const w = havenWorld(), { map, W3 } = w;
    const lifted = [];
    let walks = 0, floors = 0;
    for (const run of w.staircases()) {
        const top = w.floorNear(run.after[0], run.after[1], run.upper, 0.6);
        assert.ok(top !== null, 'a floor at the head of the stairs');
        // Upstairs and the stairs only: everything a step or more over the ground it stands on, kept per tile and floor.
        const states = w.reach(run.after[0], run.after[1], top, (x, y, g) => g - W3.pieceBaseAt(map, x, y) >= 0.9);
        assert.ok(states.length > 60, `a floor above to walk (${states.length} places)`);
        floors++;
        for (const [x, y, g] of states) {
            if (!w.walkable(x, y, g)) continue;
            // The diagonals by the whole party, the straight steps by the leader.
            const tries = Object.keys(DIAGONALS).map(way => [way, DIAGONALS[way], 12, false]).concat(Object.keys(STRAIGHTS).map(way => [way, STRAIGHTS[way], 9, true]));
            for (const [way, dir, frames, single] of tries) {
                w.alone(single);
                w.place(x, y, g);
                const out = w.walk(dir, frames, { dash: true });
                walks++;
                const high = out.ends.find(end => (end.up > LIMIT + 1e-6 && end.alt > run.upper + 0.11) || end.over > 1 + LIMIT);
                if (out.rise > LIMIT + 1e-6 || high) lifted.push(`from ${x},${y} at ${r2(g)} ${way}: rose ${r2(out.rise)} in a frame, ends at ${out.ends.map(end => r2(end.alt)).join(' / ')}`);
            }
        }
    }
    w.alone(false);
    assert.ok(floors > 0, 'the map has floors above');
    assert.deepEqual(lifted.slice(0, 12), [], `${lifted.length} of ${walks} walks on ${floors} upper floors lift a walker`);
});

//-----------------------------------------------------------------------------
// The step up is capped at a hop

let nextId = 1;
const piece = (kind, x, y, z, more) => Object.assign({ id: nextId++, kind, x, y, z, rot: 0, material: '' }, more || {});
/**
 * Ledges of the ground itself a tile and a half, two tiles and two and a half tiles high, each wide enough to walk
 * on over, and a house five tiles tall with a flat roof, a door step (0.5) and a crate (0.9) against its west wall.
 */
function ledgeMap(physics) {
    const width = 30, height = 22;
    const map = { width, height, note: '<3d>', reactor3d: { version: 1, mode: '3d', elevation: new Array(width * height).fill(0),
        pieces: [piece('box', 21, 6, 0, { size: [6, 5, 6] }), piece('box', 17, 6, 0, { size: [1, 0.5, 1] }), piece('box', 17, 8, 0, { size: [1, 0.9, 1] })] } };
    for (const [y0, rise] of [[2, 1.5], [8, 2], [14, 2.5]]) for (let y = y0; y <= y0 + 3; y++) for (let x = 4; x <= 9; x++) map.reactor3d.elevation[y * width + x] = rise;
    if (physics) map.reactor3d.physics = physics;
    return map;
}
/** The physics alone, in its own realm, over the real world rules and a map. */
function sandbox(map, physics = {}) {
    const context = { console, Math, JSON, Number, Object, Array, WeakMap, Map, Reactor3D: R, $dataSystem: { reactorPhysics: physics }, $dataMap: map, Input: { keyMapper: {}, gamepadMapper: {} } };
    context.window = context; context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(readRuntime('reactor_controls.js'), context);
    vm.runInContext(readRuntime('reactor_physics.js'), context);
    return context.ReactorPhysics;
}
/** The game's own map objects over a 3D map with every tile passable, the physics loaded on top as the game loads it. */
function gameWorld(map, system = {}) {
    const ctx = fightWorld({ system });
    const size = map.width * map.height;
    const data = new Array(size * 6).fill(0);
    for (let i = 0; i < size; i++) data[i] = 1536;
    Object.assign(ctx.$dataMap, { width: map.width, height: map.height, data, note: map.note, reactor3d: map.reactor3d, events: [null] });
    ctx.Reactor3D = R;
    ctx.Input.keyMapper = {}; ctx.Input.gamepadMapper = {};
    ctx.console = Object.assign({}, console, { info() {} });
    vm.runInContext(readRuntime('reactor_controls.js'), ctx);
    vm.runInContext(readRuntime('reactor_physics.js'), ctx);
    vm.runInContext('$gameMap.setup(1);', ctx);
    return Object.assign(controls(ctx), { ctx, P: ctx.ReactorPhysics, player: ctx.$gamePlayer });
}

test('the height climbed by walking is read through a cap: never more than a hop, the jump height and a step', () => {
    const map = ledgeMap();
    const read = physics => { const P = sandbox(map, physics); return [P.readSettings().stepUpReach, P.stepUpReach()]; };
    assert.deepEqual(read({}), [1.5, 1.5], 'the stock reach is under the stock hop');
    assert.deepEqual(read({ stepUpReach: 5 }), [2, 2], 'a reach of 5 reads as the hop: a jump of 1.25 and a step of 0.75');
    assert.deepEqual(read({ stepUpReach: 20 }), [2, 2]);
    assert.deepEqual(read({ stepUpReach: 1 }), [1, 1], 'a lower reach is the project\'s own');
    assert.deepEqual(read({ stepUpReach: 5, jumpHeight: 3 }), [3.75, 3.75], 'the cap follows the jump height');
    assert.deepEqual(read({ stepUpReach: 5, jumpHeight: 1 }), [1.75, 1.75]);
    // Never under the stock reach: a low jump leaves a pond's rim climbed.
    assert.deepEqual(read({ stepUpReach: 5, jumpHeight: 0.5 }), [1.5, 1.5]);
    assert.deepEqual(read({ jumpHeight: 0.5 }), [1.5, 1.5]);
    assert.deepEqual(read({ jumpHeight: 0.5, jump: false, mantle: false }), [1.5, 1.5]);
    assert.deepEqual(read({ stepUpReach: 1, jumpHeight: 0.5 }), [1, 1]);
    assert.deepEqual(read({ stepUpReach: 5, jump: false, mantle: false }), [2, 2], 'jumping switched off: the hop of the jump height still caps it');
    assert.deepEqual(read({ stepUpReach: 5, jumpHeight: 0 }), [2, 2], 'no jump height at all: the stock hop, so a pond is still walked out of');
    assert.deepEqual(read({ stepUpReach: 5, stepUp: false }), [2, 0], 'switched off: nothing is climbed');
    // A map's own physics are read through the same cap, with the map's own jump height.
    const own = sandbox(ledgeMap({ stepUpReach: 5 }), { stepUpReach: 1 });
    assert.deepEqual([own.readSettings().stepUpReach, own.stepUpReach()], [2, 2]);
    const moon = sandbox(ledgeMap({ stepUpReach: 6, jumpHeight: 4 }), {});
    assert.equal(moon.stepUpReach(), 4.75);
    const P = sandbox(map, {});
    assert.deepEqual([P.stepUpCap(1.25), P.stepUpCap(2), P.stepUpCap(0), P.stepUpCap(undefined), P.stepUpCap(0.5), P.stepUpCap(0.7), P.stepUpCap(1)], [2, 2.75, 2, 2, 1.5, 1.5, 1.75]);
    // The mantle a Jump takes is as it was: the cap is the walk's alone.
    assert.deepEqual([P.edgeRules().hop, P.edgeRules().reach], [2, 4.25]);
});

test('with the reach set to 5 a push climbs a ledge a hop high and nothing higher: no roof from a door step or a crate', () => {
    const map = ledgeMap();
    // Every ledge is the ground itself, and the roof is wide: only its height can keep a walker off it.
    const plain = sandbox(map, {});
    assert.deepEqual([[9, 3, 1.5], [9, 9, 2], [9, 15, 2.5], [18, 6, 5]].map(([x, y, top]) => [R.groundHeightAt(map, x + 0.5, y + 0.5, top), plain.openGround(map, x, y, top)]),
        [[1.5, true], [2, true], [2.5, true], [5, true]], 'the three ledges and the roof, each ground the walk goes on over');
    assert.deepEqual([R.groundHeightAt(map, 17.5, 6.5), R.groundHeightAt(map, 17.5, 8.5)], [0.5, 0.9], 'the door step and the crate');
    /** Push west from the open ground against the ledge in row `y`, or east from a place against the house: what the walker did. */
    const push = (w, x, y, dir, height) => { w.place(x, y, height); const out = w.walk(dir, 90); return [out.climbed, r2(out.alt)]; };
    const five = gameWorld(map, { reactorPhysics: { stepUpReach: 5 } });
    assert.equal(five.P.stepUpReach(), 2);
    assert.deepEqual(push(five, 10, 3, 4, 0), [true, 1.5], 'a tile and a half (a pond\'s rim from inside): climbed');
    assert.deepEqual(push(five, 10, 9, 4, 0), [true, 2], 'two tiles, a hop: climbed');
    assert.deepEqual(push(five, 10, 15, 4, 0), [false, 0], 'two and a half: not without Jump');
    assert.deepEqual(push(five, 17, 6, 6, 0.5), [false, 0.5], 'from the door step into the house wall under a roof at 5: nothing');
    assert.deepEqual(push(five, 17, 8, 6, 0.9), [false, 0.9], 'from the crate: nothing');
    assert.deepEqual(push(five, 17, 7, 6, 0), [false, 0], 'from the ground: nothing');
    // What a push climbs, a push steps down; a ledge over the cap is neither climbed nor left by pushing.
    five.place(9, 9, 2);
    assert.deepEqual([five.player.canPass(9, 9, 6), r2(five.walk(6, 60).alt)], [false, 0], 'off the two-tile ledge by pushing, as it was climbed');
    five.place(9, 15, 2.5);
    const stays = five.walk(6, 60);
    assert.deepEqual([stays.x, r2(stays.alt)], [9, 2.5], 'the ledge over the cap is not left by a push');
    // Jump is what climbs higher: against the two-and-a-half tile ledge it takes hold and pulls up.
    five.place(10, 15, 0);
    five.walk(4, 20);
    const jumped = five.walk(4, 90, { jumpAt: 1 });
    assert.deepEqual([jumped.climbed, r2(jumped.alt)], [true, 2.5], 'with Jump: up the ledge a walk leaves alone');
    // The stock reach: a tile and a half, and no more.
    const stock = gameWorld(map);
    assert.deepEqual([push(stock, 10, 3, 4, 0), push(stock, 10, 9, 4, 0)], [[true, 1.5], [false, 0]]);
    // A low jump never lowers the reach under the stock one: the rim a walk steps in over is stepped out over by
    // pushing, with Jump or ledge climbing switched off as well. Nothing higher is climbed.
    for (const physics of [{ stepUpReach: 5, jumpHeight: 0.5 }, { jumpHeight: 0.5, jump: false }, { jumpHeight: 0.5, mantle: false }, { jumpHeight: 0.7, jump: false }, { jumpHeight: 0.5, jump: false, mantle: false }]) {
        const low = gameWorld(map, { reactorPhysics: physics });
        assert.deepEqual([push(low, 10, 3, 4, 0), push(low, 10, 9, 4, 0)], [[true, 1.5], [false, 0]], `out over a rim a tile and a half high with ${JSON.stringify(physics)}`);
    }
    // A game with no jump height keeps the stock hop.
    const none = gameWorld(map, { reactorPhysics: { stepUpReach: 5, jumpHeight: 0 } });
    assert.deepEqual([push(none, 10, 3, 4, 0), push(none, 10, 9, 4, 0), push(none, 10, 15, 4, 0)], [[true, 1.5], [true, 2], [false, 0]]);
});

test('a roof whose eave hangs within the reach and whose top does not is left to Jump', () => {
    // A lean-to on ground a quarter tile up, long enough to be walked on over: its eave is 1.25 over the walker, the
    // middle of its first tile 1.75. The hands would reach the eave; the top is higher than a walk climbs.
    const width = 16, height = 32, pieces = [];
    for (let y = 2; y <= 29; y++) for (let x = 6; x <= 8; x++) pieces.push(piece('ramp', x, y, 1 + (x - 6), { rot: 3 }));
    const map = { width, height, note: '<3d>', reactor3d: { version: 1, mode: '3d', elevation: new Array(width * height).fill(0), pieces } };
    for (let y = 2; y <= 29; y++) for (let x = 6; x <= 8; x++) map.reactor3d.elevation[y * width + x] = 0.25;
    const w = gameWorld(map);
    const { P } = w;
    assert.deepEqual([r2(R.groundHeightAt(map, 6.01, 15.5, 2)), r2(R.groundHeightAt(map, 6.5, 15.5, 2))], [1.26, 1.75], 'the eave and the top');
    const reach = P.stepUpReach() + 1e-3;
    const options = P.edges(map, 5, 15, 6, 0, P.edgeRules({ jump: true, mantle: true, hop: reach, reach }));
    assert.deepEqual([options[0].kind, r2(options[0].to), P.openGround(map, 6, 15, options[0].to)], ['mantle', 1.75, true], 'within reach of the hands, and ground the walk goes on over');
    w.place(5, 15, 0);
    const pushed = w.walk(6, 90);
    assert.deepEqual([pushed.climbed, pushed.x, r2(pushed.alt)], [false, 5, 0], 'not climbed by walking into it: its top is over the reach');
    w.place(5, 15, 0);
    w.walk(6, 20);
    const jumped = w.walk(6, 90, { jumpAt: 1 });
    assert.deepEqual([jumped.climbed, jumped.top > 1.5], [true, true], 'with Jump: up onto the roof');
});

test('a bank of the ground is climbed by its edge, its top no more than a hop up', () => {
    // A river bed with a sloping bank, as the Demo's rivers have them: the terrain's corners stand at 0 on the bank's
    // top, at `lip` where the slope breaks and at `bed` below. A walker on the slope stands against the bank's tile,
    // whose edge is nearer than its middle, where the climb ends.
    const width = 16, height = 30;
    const river = (lip, bed) => {
        const terrain = [];
        for (let y = 0; y <= height; y++) for (let x = 0; x <= width; x++) terrain.push(x <= 5 ? 0 : x === 6 ? lip : bed);
        return { width, height, note: '<3d>', reactor3d: { version: 1, mode: '3d', elevation: new Array(width * height).fill(0), terrain, terrainWidth: width, pieces: [] } };
    };
    const low = river(-0.5, -3.4);
    assert.deepEqual([R.groundHeightAt(low, 6.5, 15.5), R.groundHeightAt(low, 5.98, 15.5), R.groundHeightAt(low, 5.5, 15.5)].map(r2), [-1.95, -0.49, -0.25],
        'where the walker stands, the bank\'s edge (1.46 up) and the middle of its tile (1.7 up)');
    // Whether or not the game jumps: this is the way out of a river for a game that does not.
    for (const physics of [{}, { jump: false }, { mantle: false }]) {
        const w = gameWorld(low, { reactorPhysics: physics });
        assert.equal(w.P.isGroundTop(low, 5, 15, -0.25), true);
        w.place(6, 15, -1.95);
        assert.equal(w.player.canPass(6, 15, 4), false, 'too steep to walk');
        const pushed = w.walk(4, 60);
        assert.deepEqual([pushed.climbed, pushed.x <= 5, pushed.alt > -0.26], [true, true, true], `climbed by pushing at the stock reach with ${JSON.stringify(physics)} (ends at ${pushed.x} at ${r2(pushed.alt)})`);
    }
    // With the reach raised as far as it goes, a bank whose edge is within it and whose top is more than a hop up
    // is left to Jump.
    const high = river(-0.6, -4.4);
    assert.deepEqual([R.groundHeightAt(high, 6.5, 15.5), R.groundHeightAt(high, 5.98, 15.5), R.groundHeightAt(high, 5.5, 15.5)].map(r2), [-2.5, -0.59, -0.3], 'the edge 1.91 up, the top 2.2 up');
    const five = gameWorld(high, { reactorPhysics: { stepUpReach: 5 } });
    assert.equal(five.P.stepUpReach(), 2);
    const reach = five.P.stepUpReach() + 1e-3;
    assert.deepEqual(Array.from(five.P.edges(high, 6, 15, 4, -2.5, five.P.edgeRules({ jump: true, mantle: true, hop: reach, reach })), option => [option.kind, r2(option.to)]), [['mantle', -0.3]], 'offered for its edge');
    five.place(6, 15, -2.5);
    const stays = five.walk(4, 60);
    assert.deepEqual([stays.climbed, stays.x, r2(stays.alt)], [false, 6, -2.5], 'not by pushing');
    five.place(6, 15, -2.5);
    five.walk(4, 20);
    const jumped = five.walk(4, 60, { jumpAt: 1 });
    assert.deepEqual([jumped.climbed, jumped.x <= 5], [true, true], 'with Jump');
});

//-----------------------------------------------------------------------------
// A walker is not left inside the ground, and is not carried over it

/** A map 12 by 8 whose tile (5, 3) stands `rise` over the rest; `corner` sets the terrain's corners along x = 6. */
function riseMap(rise, corner) {
    const width = 12, height = 8;
    const map = { width, height, note: '<3d>', reactor3d: { version: 1, mode: '3d', elevation: new Array(width * height).fill(0), pieces: [] } };
    map.reactor3d.elevation[3 * width + 5] = rise;
    if (corner) {
        map.reactor3d.terrain = [];
        for (let y = 0; y <= height; y++) for (let x = 0; x <= width; x++) map.reactor3d.terrain.push(x === 6 ? corner : 0);
        map.reactor3d.terrainWidth = width;
    }
    return map;
}
/**
 * A body at rest on (4, 3) carried east into (5, 3) at a walk, as a step would carry it, and left to stand there:
 * where its height ends, the highest it was, and its largest rise in one frame.
 */
function carriedIn(P, body) {
    body._x = 5;
    let last = alt(body), top = last, rise = 0;
    for (let f = 0; f < 48; f++) {
        if (body._realX < 5) body._realX = Math.min(5, body._realX + 1 / 16);
        P.update(body);
        const now = alt(body);
        rise = Math.max(rise, now - last); top = Math.max(top, now); last = now;
    }
    return [r2(last), r2(top), r2(rise)];
}

test('a walker is never left inside the ground: ground that rises steeply at a tile\'s border is come up onto, as deep as a walked step leaves a body', () => {
    // The walk's own rule reads the middles of the two tiles and the edge between them; where a rock or a bank dips
    // toward the border a walker comes down with it (a level and a step at most) and meets ground more than a level
    // and a step over its feet. Up to a level and two steps it has walked in, and comes up at a step's speed.
    for (const rise of [1.9, 2.2, 2.5]) {
        const w = gameWorld(riseMap(rise));
        w.place(4, 3, 0);
        assert.equal(w.P.underGround(w.player, 5, 3, 0), true);
        assert.deepEqual(carriedIn(w.P, w.player), [rise, rise, 0.3], `the leader, ${rise} under: up onto it, a step's speed a frame, never over it`);
        w.place(4, 3, 0);
        assert.deepEqual(carriedIn(w.P, w.player.followers().follower(0)), [rise, rise, 0.3], `a follower behind a leader who walks, ${rise} under`);
    }
    // Deeper than that nobody walked in: the body is crossing something, and keeps its level.
    for (const rise of [2.6, 4, 16]) {
        const w = gameWorld(riseMap(rise));
        w.place(4, 3, 0);
        assert.equal(w.P.underGround(w.player, 5, 3, 0), false);
        assert.deepEqual([carriedIn(w.P, w.player), carriedIn(w.P, w.player.followers().follower(0))], [[0, 0, 0], [0, 0, 0]], `${rise} under: the leader and a follower keep their level`);
    }
    // An event walks as the party does.
    const e = gameWorld(riseMap(2.2));
    const walker = new e.ctx.Game_Character();
    walker.locate(4, 3); walker._reactorGround = 0; walker._reactorAlt = 0;
    e.P.update(walker);
    assert.deepEqual(carriedIn(e.P, walker), [2.2, 2.2, 0.3], 'an event that walks');
    // The rise is marked on the body only while it lasts: gone when it is up, and gone on a map with no height.
    const m = gameWorld(riseMap(2.5));
    m.place(4, 3, 0);
    m.player._x = 5;
    for (let f = 0; f < 10; f++) { m.player._realX = Math.min(5, m.player._realX + 1 / 16); m.P.update(m.player); }
    assert.deepEqual([m.player._reactorRisen, alt(m.player) > 0.5 && alt(m.player) < 2.5], [true, true], 'on its way up');
    for (let f = 0; f < 30; f++) { m.player._realX = Math.min(5, m.player._realX + 1 / 16); m.P.update(m.player); }
    assert.deepEqual([m.player._reactorRisen, alt(m.player)], [false, 2.5], 'up');
    m.place(4, 3, 0);
    m.player._x = 5;
    for (let f = 0; f < 10; f++) { m.player._realX = Math.min(5, m.player._realX + 1 / 16); m.P.update(m.player); }
    assert.equal(m.player._reactorRisen, true);
    m.ctx.$dataMap.note = ''; m.ctx.$dataMap.reactor3d.mode = '2d';
    assert.equal(R.isMap3D(m.ctx.$dataMap), false, 'the same body on a flat map');
    m.P.update(m.player);
    assert.equal(m.player._reactorRisen, false);
});

test('a spur at a tile\'s border, a ridge higher than a walked step and a hill beyond one are not come up onto', () => {
    // The middle of the tile is within a step of the walker and only its border stands high: nothing to come up onto.
    const spur = riseMap(2.4, -3.4);
    assert.deepEqual([R.groundHeightAt(spur, 5.001, 3.5, 2), R.groundHeightAt(spur, 5.5, 3.5, 2)].map(r2), [2.4, 0.7], 'the border and the middle');
    const a = gameWorld(spur);
    a.place(4, 3, 0);
    assert.equal(a.P.underGround(a.player, 5, 3, 0), false);
    const crossed = carriedIn(a.P, a.player);
    assert.deepEqual([crossed[0], crossed[1] < 1.2], [0.7, true], `ends on the tile's ground, never up on the spur (highest ${crossed[1]})`);
    // The border stands far over the walker and the middle within a walked step: the ground at the body's own point
    // is what it would rise to, and that is out of reach until the ridge is behind it.
    const ridge = riseMap(16, -28);
    assert.deepEqual([R.groundHeightAt(ridge, 5.001, 3.5, 16), R.groundHeightAt(ridge, 5.5, 3.5, 2)].map(r2), [15.97, 2], 'the border and the middle');
    const b = gameWorld(ridge);
    b.place(4, 3, 0);
    assert.equal(b.P.underGround(b.player, 5, 3, 0), true, 'the tile itself is ground to come up onto');
    assert.deepEqual(carriedIn(b.P, b.player), [2, 2, 0.3], 'up onto the middle, never toward the ridge');
    // The border within a walked step and the middle beyond one: a hillside no step leads onto.
    const hill = riseMap(2, 6);
    assert.deepEqual([R.groundHeightAt(hill, 5.001, 3.5, 2), R.groundHeightAt(hill, 5.5, 3.5, 5)].map(r2), [2.01, 5], 'the border and the middle');
    const c = gameWorld(hill);
    c.place(4, 3, 0);
    assert.equal(c.P.underGround(c.player, 5, 3, 0), false);
    assert.deepEqual(carriedIn(c.P, c.player), [0, 0, 0], 'keeps its level');
});

test('what is built is no ground: a follower inside a wall or a block stays on its floor', () => {
    // A follower passes through what is built (it is always set Through): a wall a storey high, and a block whose
    // top is as far over it as ground it would come up onto.
    const width = 12, height = 8;
    for (const [label, pieces] of [
        ['a wall on a floor under the floor above', [piece('floor', 4, 3, 0), piece('floor', 5, 3, 0), piece('wall', 5, 3, 0), piece('floor', 5, 3, 5)]],
        ['a wall on bare ground', [piece('wall', 5, 3, 0)]],
        ['a block 2.2 high on bare ground', [piece('box', 5, 3, 0, { size: [1, 2.2, 1] })]],
        ['a block on a floor, its top 2 over it', [piece('floor', 4, 3, 0), piece('floor', 5, 3, 0), piece('box', 5, 3, 0.1, { size: [1, 2, 1] })]]]) {
        const map = { width, height, note: '<3d>', reactor3d: { version: 1, mode: '3d', elevation: new Array(width * height).fill(0), pieces } };
        const v = gameWorld(map);
        const follower = v.player.followers().follower(0);
        v.place(4, 3, 0.1);
        const start = alt(follower), top = R.groundHeightAt(map, 5.5, 3.5, start);
        assert.ok(top - start > 1 + LIMIT, `${label}: its top is more than a level and a step over the walker (${r2(top - start)})`);
        assert.equal(v.P.underGround(follower, 5, 3, start), false, label);
        assert.deepEqual(carriedIn(v.P, follower), [r2(start), r2(start), 0], `${label}: a follower inside it keeps its floor`);
    }
});

test('a body that passes through things keeps its level in the ground: set Through, the playtest walk-through key, a gather', () => {
    const fresh = () => { const w = gameWorld(riseMap(2.2)); w.place(4, 3, 0); return w; };
    const follower = w => w.player.followers().follower(0);
    // The player set Through (an event's route), and the follower behind it.
    let w = fresh();
    w.player.setThrough(true);
    assert.equal(w.P.underGround(w.player, 5, 3, 0), false);
    assert.deepEqual([carriedIn(w.P, w.player), carriedIn(w.P, follower(w))], [[0, 0, 0], [0, 0, 0]], 'the player set Through and its follower');
    w.player.setThrough(false);
    assert.equal(w.P.underGround(w.player, 5, 3, 0), true, 'and comes up again when Through is off');
    // The playtest's walk-through key; outside a playtest the key is nothing.
    w = fresh();
    w.keys.through = true;
    w.ctx.$gameTemp._isPlaytest = false;
    assert.equal(w.P.underGround(w.player, 5, 3, 0), true, 'the key outside a playtest');
    w.ctx.$gameTemp._isPlaytest = true;
    assert.equal(w.player.isDebugThrough(), true);
    assert.deepEqual([carriedIn(w.P, w.player), carriedIn(w.P, follower(w))], [[0, 0, 0], [0, 0, 0]], 'the walk-through key held: the player and its follower');
    // Followers called in by Gather Followers walk straight to the leader.
    w = fresh();
    w.player.followers()._gathering = true;
    assert.equal(w.player.areFollowersGathering(), true);
    assert.deepEqual(carriedIn(w.P, follower(w)), [0, 0, 0], 'a follower on a gather');
    // An event set Through; the same event with Through off comes up.
    w = fresh();
    const ghost = new w.ctx.Game_Character();
    ghost.locate(4, 3); ghost._reactorGround = 0; ghost._reactorAlt = 0; ghost.setThrough(true);
    w.P.update(ghost);
    assert.deepEqual(carriedIn(w.P, ghost), [0, 0, 0], 'an event set Through');
});

test('crossing a rock sixteen tiles tall, the party is never carried up over it: set Through, the walk-through key, a gather', () => {
    const width = 24, height = 9;
    // A terrain grid, though flat: the walk's own rule judges a map that has one.
    const map = { width, height, note: '<3d>', reactor3d: { version: 1, mode: '3d', elevation: new Array(width * height).fill(0), terrain: new Array((width + 1) * (height + 1)).fill(0), terrainWidth: width, pieces: [] } };
    for (let y = 2; y <= 6; y++) for (let x = 8; x <= 9; x++) map.reactor3d.elevation[y * width + x] = 16;
    const w = gameWorld(map, { reactorPhysics: { fallDamage: true } });
    const { player, ctx, keys } = w;
    const hp = () => ctx.$gameParty.members().map(actor => actor.hp);
    const full = hp();
    // On foot the rock stops the party.
    w.place(5, 4, 0);
    assert.equal(w.walk(6, 16 * 7).x, 7);
    const cross = (label, more) => {
        w.place(5, 4, 0);
        const out = w.walk(6, more && more.dash ? 8 * 7 : 16 * 7, more);
        assert.ok(out.ends.length > 1, 'the leader and a follower');
        assert.ok(out.ends.every(end => end.x >= 10), `${label}: through to the far side (${out.ends.map(end => end.x)})`);
        assert.deepEqual(out.ends.map(end => [r2(end.alt), r2(end.over)]), out.ends.map(() => [0, 0]), `${label}: everybody on the ground, never over it`);
        assert.equal(out.rise, 0, label);
        assert.deepEqual(hp(), full, `${label}: nobody fell`);
    };
    player.setThrough(true);
    cross('set Through, at a walk');
    cross('set Through, at a run', { dash: true });
    player.setThrough(false);
    ctx.$gameTemp._isPlaytest = true;
    keys.through = true;
    cross('the walk-through key, at a walk');
    cross('the walk-through key, at a run', { dash: true });
    keys.through = false;
    // Gather Followers with the rock between them and the leader.
    w.place(5, 4, 0);
    player._x = 12; player._realX = 12;
    const followers = player.followers();
    followers.gather();
    let top = -Infinity, frames = 0;
    for (; frames < 600 && followers.areGathering(); frames++) { w.tick(); for (const follower of followers.visibleFollowers()) top = Math.max(top, alt(follower)); }
    assert.equal(followers.areGathering(), false, 'gathered');
    assert.deepEqual(followers.visibleFollowers().map(follower => [follower.x, follower.y, r2(alt(follower))]), followers.visibleFollowers().map(() => [12, 4, 0]));
    assert.ok(top < 0.01, `no follower rose on its way through (highest ${r2(top)})`);
});
