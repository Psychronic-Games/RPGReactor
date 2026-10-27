'use strict';
// The view of a ride (runtime/reactor_vehicles_feel.js): the overlay laid over the map camera while the party is
// aboard a vehicle. With the engine's own 3D runtime, map camera, Tactical director and Action driver in one
// context, so the three wrappers of `Reactor3D.Camera.update` are the shipped ones in their load order. What is
// pinned: the order and the stand-downs, that the saved camera state is never written, the eased values at top
// speed, the swing round behind the heading and the hand's say over it, that the picture does not depend on the
// frame rate, what the wrapper asks of the world, and that nothing is made per tick or per drawn frame.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { realWorld } = require('./helpers/fight-real-world.cjs');
const { runtimeRoot } = require('./helpers/runtime-source.cjs');
const { cpuMicros, withinBudget } = require('./helpers/timing.cjs');

const read = name => fs.readFileSync(path.join(runtimeRoot, name), 'utf8');
const feelSource = read('reactor_vehicles_feel.js');
const DEG = Math.PI / 180;
const plain = value => JSON.parse(JSON.stringify(value));
const arc = (from, to) => { let d = (to - from) % 360; if (d > 180) d -= 360; else if (d < -180) d += 360; return d; };

// A case makes several worlds, each a context with the whole runtime in it, and V8 by itself lets hundreds of
// megabytes of dead ones pile up before it collects. The collector is run every few worlds, so the file's peak is
// what a handful of worlds take. (The flag is switched off again at once: no world gets a `gc` global.)
let collect = null, made = 0;
try {
    const v8 = require('node:v8');
    v8.setFlagsFromString('--expose-gc');
    collect = vm.runInNewContext('gc');
    v8.setFlagsFromString('--no-expose-gc');
} catch (error) { collect = null; }

const TYPE = (extra = {}) => Object.assign({
    id: 1, name: 'Motorcycle', kind: 'motorcycle', handling: { speed: 20 },
    camera: { speedDistance: 35, speedFov: 11, lookAhead: 3, minDistance: 0 },
    sounds: { engine: null, engineRate: [0.6, 1.5], start: null, stop: null, bump: null, land: null, scrape: null, skid: null }
}, extra);

/**
 * A 3D floor map (40 by 30) with the party at (20, 15), the map camera in `mode`, and the three camera wrappers
 * loaded in the game's order. `calls` lists which wrapper returned, in order, on the last `draw()`.
 *   board({ heading, v, hop })   the party is aboard vehicle event 7 (heading in degrees, 0 north, clockwise)
 *   tick(n, each)                n logic ticks: the mover's `advance` once each
 *   draw()                       the spriteset asking for the camera, as it does on a drawn frame
 *   plainCamera()                where the map's own camera (with the director's and the driver's wrappers, without
 *                                the vehicle's) puts a camera for the same game state
 */
function world({ mode = 'thirdPerson', camera = {}, locked = true, pieces = null, silent = false } = {}) {
    if (typeof collect === 'function' && ++made % 5 === 0) collect();
    const w = realWorld({ sidecar: Object.assign({ camera: Object.assign({ mode }, camera) }, pieces ? { pieces } : {}), start: [20, 15] });
    vm.runInContext(`
        Scene_Map = function Scene_Map() {};
        Scene_Map.prototype.update = function() {}; Scene_Map.prototype.updateMainMultiply = function() {};
        Scene_Map.prototype.stop = function() {}; Scene_Map.prototype.start = function() {}; Scene_Map.prototype.terminate = function() {};
    `, w);
    const R = w.Reactor3D;
    w.calls = [];
    const spy = name => { const inner = R.Camera.update; R.Camera.update = function(spriteset) { const placed = inner.call(this, spriteset); w.calls.push(name); return placed; }; };
    spy('map');
    vm.runInContext(read('reactor_fight_camera.js'), w, { filename: 'reactor_fight_camera.js' });
    spy('director');
    vm.runInContext(read('reactor_fight_action.js'), w, { filename: 'reactor_fight_action.js' });
    spy('action');
    // (`silent`: one more wrapper under the vehicle's, a plugin's that answers nothing.)
    if (silent) { const inner = R.Camera.update; R.Camera.update = function(spriteset) { inner.call(this, spriteset); }; }
    w.below = R.Camera.update;
    vm.runInContext(feelSource, w, { filename: 'reactor_vehicles_feel.js' });
    w.Feel = w.ReactorVehicles.Feel;
    w.cam = w.Feel.camera;
    w.look = R.Camera.look;
    w.look.locked = locked;
    w.type = TYPE();
    w.input = { gas: 0, brake: 0 };
    const make = () => vm.runInContext('new THREE.PerspectiveCamera(45, 816 / 624, 0.1, 500)', w);
    const focus = () => ({ x: w.$gamePlayer._realX, y: w.$gamePlayer._realY });
    w.camera = make();
    w.spriteset = { _reactor3d: { camera: w.camera, cameraCurrent: null }, reactor3DCameraFocus: focus };
    const other = { _reactor3d: { camera: make(), cameraCurrent: null }, reactor3DCameraFocus: focus };
    const p = w.$gamePlayer;
    p._reactorGround = 0; p._reactorAlt = 0; p._reactorAir = 0; p._reactorLift = 0;
    w.board = ({ heading = 0, v = 0, hop = false, id = 7 } = {}) => {
        p._vehicleType = 'reactor';
        p._rrRide = { map: w.$gameMap.mapId(), id };
        p._rrDrive = { v, yaw: heading * DEG };
        p._rrMount = hop ? { t: 0, n: 14, on: true } : null;
    };
    w.onFoot = () => { p._vehicleType = 'walk'; p._rrRide = null; p._rrDrive = null; p._rrMount = null; };
    w.tick = (n = 1, each) => {
        for (let i = 0; i < n; i++) {
            w.Graphics.frameCount++;
            if (each) each(i);
            if (p._rrMount && p._rrMount.t < p._rrMount.n) p._rrMount.t++;
            w.Feel.advance(p._rrDrive, w.type, w.input);
        }
    };
    w.draw = () => { w.calls.length = 0; return R.Camera.update(w.spriteset); };
    w.frame = (n = 1, each) => { for (let i = 0; i < n; i++) { w.tick(1, each); w.draw(); } };
    w.plainCamera = () => {
        other._reactor3d.cameraCurrent = w.spriteset._reactor3d.cameraCurrent ? Object.assign({}, w.spriteset._reactor3d.cameraCurrent) : null;
        w.below.call(R.Camera, other);
        return other._reactor3d.camera;
    };
    /** The camera's place, where it looks, and its field of view, as plain numbers. */
    w.pose = (camera = w.camera) => {
        const dir = vm.runInContext('(camera => camera.getWorldDirection(new THREE.Vector3()))', w)(camera);
        return { x: camera.position.x, y: camera.position.y, z: camera.position.z, dx: dir.x, dy: dir.y, dz: dir.z, fov: camera.fov };
    };
    /** How far the camera stands from the point it is aimed at, by its height over that point's and its pitch. */
    w.back = (pitch = 25, height = 1) => (w.camera.position.y - height) / Math.sin(pitch * DEG);
    // The map camera takes its look from the player's facing the first time it is asked: done here, so a test's own look stands.
    w.draw();
    return w;
}
const same = (a, b, by = 1e-9) => Object.keys(a).every(key => Math.abs(a[key] - b[key]) <= by);
const gap = (a, b) => Math.max(...Object.keys(a).map(key => Math.abs(a[key] - b[key])));

test('the three wrappers run in load order, the vehicle\'s last, and it stands down while a battle is on the map', () => {
    const w = world();
    assert.equal(w.Reactor3D.Camera.update.__reactorVehiclesFeel, true, 'the outermost wrapper is the vehicle\'s');
    assert.equal(w.RPGReactorCamera3D.update, w.Reactor3D.Camera.update, 'and it is what the spriteset calls');
    w.board({ heading: 0, v: 20 });
    w.look.yaw = 0;
    w.frame(120);
    assert.deepEqual(w.calls, ['map', 'director', 'action'], 'the map\'s camera, then the Tactical director\'s, then the Action driver\'s');
    const riding = w.pose();
    assert.ok(gap(riding, w.pose(w.plainCamera())) > 1, 'and the vehicle\'s overlay over all three: the camera stands somewhere else');
    // A battle on this map: the view is the battle's.
    w.$gameFight._active = true;
    w.$gameFight._mapId = w.$gameMap.mapId();
    assert.equal(w.$gameFight.isHere(), true);
    w.frame(1);
    assert.ok(same(w.pose(), w.pose(w.plainCamera())), 'with a battle here the camera is exactly where the three below put it');
    const yaw = w.look.yaw;
    w.$gamePlayer._rrDrive.yaw = 90 * DEG;
    w.frame(60);
    assert.equal(w.look.yaw, yaw, 'and the look is not turned');
    assert.ok(same(w.pose(), w.pose(w.plainCamera())));
    // The battle over: the overlay comes back by itself.
    w.$gameFight._active = false;
    w.frame(60);
    assert.ok(gap(w.pose(), w.pose(w.plainCamera())) > 1);
    // A wrapper under it that answers nothing (a plugin's) does not switch the view off: what is laid over is the
    // spriteset's own camera, whatever the call below answers.
    const s = world({ silent: true });
    s.look.yaw = 0;
    s.board({ heading: 0, v: 20 });
    s.frame(180);
    assert.equal(s.draw(), undefined, 'the wrappers below answer nothing');
    assert.ok(Math.abs(s.back() - 10.8) < 0.02, 'and the view stands back with speed all the same: ' + s.back().toFixed(3));
});

test('in the load list the file comes after the Action driver, and no file after it wraps the camera', t => {
    const main = read('reactor_main.js');
    const list = Array.from(main.matchAll(/"js\/([^"/]+\.js)"/g), m => m[1]);
    const at = list.indexOf('reactor_vehicles_feel.js');
    if (at < 0) { t.skip('reactor_vehicles_feel.js is not in the load list yet (veh-seams registers it)'); return; }
    assert.ok(at > list.indexOf('reactor_fight_action.js'), 'after reactor_fight_action.js');
    assert.ok(at > list.indexOf('reactor_fight_camera.js'), 'after reactor_fight_camera.js');
    for (const name of list.slice(at + 1)) {
        if (name === 'reactor_plugins.js' || !fs.existsSync(path.join(runtimeRoot, name))) continue;
        assert.ok(!/Camera\.update\s*=[^=]/.test(read(name)), name + ' loads later and must not wrap Reactor3D.Camera.update');
    }
});

test('the saved camera state is identical before and after a ride, and no saved object gains a field', () => {
    const w = world();
    w.draw();
    const before = JSON.stringify(w.$gameMap._reactorCamera3d), system = JSON.stringify(w.$gameSystem._reactorCamera3d);
    const keys = object => Object.keys(object).sort().join(',');
    w.board({ heading: 200, v: 0, hop: true });
    const mapKeys = keys(w.$gameMap), playerKeys = keys(w.$gamePlayer), systemKeys = keys(w.$gameSystem), screenKeys = keys(w.$gameScreen);
    const state = w.$gameMap._reactorCamera3d;
    w.frame(60);
    w.input = { gas: 1, brake: 0 };
    w.frame(240, i => { w.$gamePlayer._rrDrive.v = Math.min(20, i / 6); w.$gamePlayer._rrDrive.yaw += 1.2 * DEG; });
    w.Feel.kick(0.08);
    w.frame(30);
    w.input = { gas: 0, brake: 1 };
    w.frame(60, i => { w.$gamePlayer._rrDrive.v = Math.max(0, 20 - i / 2); });
    w.onFoot();
    w.frame(300);
    assert.equal(w.$gameMap._reactorCamera3d, state, 'the same object');
    assert.equal(JSON.stringify(w.$gameMap._reactorCamera3d), before);
    assert.equal(JSON.stringify(w.$gameSystem._reactorCamera3d), system);
    assert.equal(w.$gameMap._reactorCamera3dTween, null, 'no tween was started');
    assert.equal(keys(w.$gameMap), mapKeys, 'nothing was added to the map');
    assert.equal(keys(w.$gameSystem), systemKeys);
    assert.equal(keys(w.$gameScreen), screenKeys);
    w.board({ heading: 200 });
    w.$gamePlayer._rrMount = { t: 0, n: 14, on: true };
    assert.equal(keys(w.$gamePlayer), playerKeys, 'nor to the player: the file saves nothing');
    assert.ok(!/_reactorCamera3d\s*=[^=]|_reactorCamera3dTween\s*=[^=]/.test(feelSource), 'the file has no assignment to the saved camera state');
});

test('standing, the camera is the map\'s own; at top speed it stands 35% further back, sees 11 degrees wider and aims 3 tiles ahead', () => {
    const w = world();
    w.look.yaw = 0;
    w.board({ heading: 0, v: 0 });
    w.frame(120);
    assert.ok(same(w.pose(), w.pose(w.plainCamera())), 'aboard and standing behind the bike: exactly the map\'s own camera');
    assert.ok(Math.abs(w.back() - 8) < 1e-9, 'eight tiles');
    assert.equal(w.camera.fov, 45);
    // Three seconds at top speed, heading north.
    w.$gamePlayer._rrDrive.v = 20;
    w.frame(180);
    assert.ok(Math.abs(w.back() - 10.8) < 0.02, 'distance ' + w.back().toFixed(3));
    assert.ok(Math.abs(w.camera.fov - 56) < 0.05, 'field of view ' + w.camera.fov.toFixed(3));
    // The aim: the camera stands `distance` behind the aimed point, which is north (-z) of the player.
    const aimZ = w.camera.position.z - Math.cos(25 * DEG) * w.back() - 0.5;
    assert.ok(Math.abs((w.$gamePlayer._realY - aimZ) - 3) < 0.02, 'aims ' + (w.$gamePlayer._realY - aimZ).toFixed(3) + ' tiles ahead');
    assert.ok(Math.abs(w.camera.position.x - (w.$gamePlayer._realX + 0.5)) < 1e-6, 'straight behind');
    assert.ok(Math.abs(w.cam.dist - 1) < 0.001 && Math.abs(w.cam.fov - 1) < 0.001, 'the two shares have arrived');
    // How fast: 0.4 s and 0.3 s time constants (63% of the way after that long).
    const f = world();
    f.look.yaw = 0;
    f.board({ heading: 0, v: 20 });
    f.tick(24);
    assert.ok(Math.abs(f.cam.dist - (1 - Math.exp(-1))) < 0.005, 'distance after 0.4 s: ' + f.cam.dist.toFixed(4));
    f.Feel.reset();
    f.board({ heading: 0, v: 20 });
    f.tick(18);
    assert.ok(Math.abs(f.cam.fov - (1 - Math.exp(-1))) < 0.005, 'field of view after 0.3 s: ' + f.cam.fov.toFixed(4));
    assert.ok(Math.abs(Math.hypot(f.cam.ax, f.cam.az) - 3 * (1 - Math.exp(-1))) < 0.02, 'the aim after 0.3 s');
    // Half speed is half of each; a type's own numbers win.
    const h = world();
    h.look.yaw = 0;
    h.type = TYPE({ camera: { speedDistance: 50, speedFov: 20, lookAhead: 6, minDistance: 0 } });
    h.board({ heading: 0, v: 10 });
    h.frame(240);
    assert.ok(Math.abs(h.back() - 8 * 1.25) < 0.02, 'half of the type\'s 50%: ' + h.back().toFixed(3));
    assert.ok(Math.abs(h.camera.fov - 55) < 0.05);
    assert.ok(Math.abs(Math.hypot(h.cam.ax, h.cam.az) - 3) < 0.02);
    // Backing up, the aim leads the way it travels.
    h.$gamePlayer._rrDrive.v = -3;
    h.frame(240);
    assert.ok(h.cam.az > 0.85 && h.cam.az < 0.95, 'south of a bike that faces north and backs up: ' + h.cam.az.toFixed(3));
});

test('the map camera\'s own distance, field of view and zoom are what the overlay starts from', () => {
    const w = world({ camera: { distance: 12, fov: 60, pitch: 40 } });
    w.look.yaw = 0;
    w.board({ heading: 0, v: 0 });
    w.frame(60);
    assert.ok(same(w.pose(), w.pose(w.plainCamera())), 'standing: the map\'s 12 tiles at 60 degrees');
    w.$gamePlayer._rrDrive.v = 20;
    w.frame(240);
    assert.ok(Math.abs(w.back(40) - 12 * 1.35) < 0.02, '35% of the map\'s own 12: ' + w.back(40).toFixed(3));
    assert.ok(Math.abs(w.camera.fov - 71) < 0.05);
    // Zoom is a distance in three dimensions, here as in the map camera.
    w.$gameScreen._zoomScale = 2;
    w.frame(1);
    assert.ok(Math.abs(w.back(40) - 6 * 1.35) < 0.02, 'zoomed in twice: half as far');
});

test('in a steady corner at 92 and at 150 degrees a second the view trails the heading by under 15 degrees after one second', () => {
    for (const [rate, v] of [[92, 20], [150, 12.2], [-150, 12.2]]) {
        const w = world();
        w.look.yaw = 0;
        w.board({ heading: 0, v });
        w.tick(2);
        let heading = 0;
        const turn = () => { heading += rate / 60; w.$gamePlayer._rrDrive.yaw = heading * DEG; };
        w.frame(60, turn);
        const after1 = arc(w.cam.yaw, heading) * Math.sign(rate);
        assert.ok(after1 > 0 && after1 < 15, rate + ' degrees a second: trails by ' + after1.toFixed(2) + ' after 1 s');
        w.frame(180, turn);
        const steady = arc(w.cam.yaw, heading) * Math.sign(rate);
        // A tenth of a second of turn, less the tick the heading moved on: the player review's 8 and 13 degrees.
        assert.ok(Math.abs(steady - Math.abs(rate) * (0.1 - 1 / 60)) < 0.3, rate + ': steady at ' + steady.toFixed(2));
        assert.equal(w.look.yaw, w.cam.yaw, 'the look is the view\'s yaw, written each tick');
        // What is drawn is that yaw: the camera stands on the line through the aimed point at it.
        const from = Math.atan2(-(w.camera.position.x - (w.$gamePlayer._realX + 0.5 + w.cam.ax)), w.camera.position.z - (w.$gamePlayer._realY + 0.5 + w.cam.az)) / DEG;
        assert.ok(Math.abs(arc(from, w.cam.yaw)) < 1e-6, 'the camera is aimed from the eased yaw');
    }
    // Without the lead it would trail by four tenths of a second of turn.
    const w = world();
    w.Feel.TUNING.swingLead = 0;
    w.look.yaw = 0;
    w.board({ heading: 0, v: 20 });
    let heading = 0;
    w.frame(240, () => { heading += 92 / 60; w.$gamePlayer._rrDrive.yaw = heading * DEG; });
    assert.ok(arc(w.cam.yaw, heading) > 30, 'the lead is what keeps it close: ' + arc(w.cam.yaw, heading).toFixed(1) + ' without');
});

test('the unlocked ease of the map camera adds no second lag: the drawn yaw is the same with and without the mouse held', () => {
    const run = locked => {
        const w = world({ locked });
        w.look.yaw = 0;
        w.board({ heading: 0, v: 20 });
        let heading = 0;
        w.frame(120, () => { heading += 92 / 60; w.$gamePlayer._rrDrive.yaw = heading * DEG; });
        return w.pose();
    };
    assert.ok(same(run(true), run(false)), 'the same picture');
});

test('60 one-tick frames and 20 three-tick frames give the same yaw and the same camera', () => {
    const script = i => ({ v: Math.min(20, i * 0.4), yaw: (i < 20 ? 0 : (i - 20) * 1.5) * DEG });
    const run = perFrame => {
        const w = world();
        w.look.yaw = 140;
        w.board({ heading: 0, v: 0, hop: true });
        let i = 0;
        for (let f = 0; f < 60 / perFrame; f++) {
            w.tick(perFrame, () => { Object.assign(w.$gamePlayer._rrDrive, script(i++)); });
            // The spriteset asks on every logic tick and once more on the last tick of the drawn frame.
            for (let c = 0; c < perFrame + 1; c++) w.draw();
        }
        return { yaw: w.cam.yaw, look: w.look.yaw, pose: w.pose(), dist: w.cam.dist };
    };
    const one = run(1), three = run(3);
    assert.equal(one.yaw, three.yaw, 'the same yaw to the last bit');
    assert.equal(one.look, three.look);
    assert.equal(one.dist, three.dist);
    assert.deepEqual(one.pose, three.pose, 'and the same camera');
    // Asked for five times on one tick, the camera does not move.
    const w = world();
    w.look.yaw = 30;
    w.board({ heading: 0, v: 20 });
    w.frame(30);
    const first = w.pose(), yaw = w.cam.yaw;
    for (let c = 0; c < 5; c++) w.draw();
    assert.deepEqual(w.pose(), first, 'the wrapper eases nothing');
    assert.equal(w.cam.yaw, yaw);
});

test('a catch-up tick eases the view and lays nothing over a camera nobody draws from; the drawn tick does', () => {
    const w = world();
    vm.runInContext('finalTick = true; SceneManager.isFinalUpdateOfFrame = () => finalTick;', w);
    w.look.yaw = 0;
    w.board({ heading: 0, v: 20 });
    w.frame(180);
    const far = w.back();
    assert.ok(Math.abs(far - 10.8) < 0.02);
    // Three logic ticks in one drawn frame: the first two are catch-up ticks.
    w.finalTick = false;
    const dist = w.cam.dist;
    w.$gamePlayer._rrDrive.v = 0;
    w.frame(2);
    assert.ok(w.cam.dist < dist, 'the eased values moved on both ticks');
    assert.ok(same(w.pose(), w.pose(w.plainCamera())), 'and the camera is left as the wrappers below placed it');
    w.finalTick = true;
    w.frame(1);
    assert.ok(Math.abs(w.back() - 8 * (1 + 0.35 * w.cam.dist)) < 1e-6, 'the drawn tick is laid over, from the values of all three ticks');
    // A catch-up tick the mover did not advance is still advanced by the wrapper (the tick after the mover's last).
    w.finalTick = false;
    w.Graphics.frameCount++;
    w.draw();
    const before = w.cam.dist;
    w.Graphics.frameCount++;
    w.draw();
    assert.ok(w.cam.dist < before);
});

test('every logic tick is advanced once: by the mover, or by the wrapper on a tick the mover left out', () => {
    const w = world();
    w.look.yaw = 0;
    w.board({ heading: 0, v: 20 });
    // No `advance` from the mover at all: the wrapper does it, once a logic tick however often it is asked.
    for (let i = 0; i < 24; i++) { w.Graphics.frameCount++; w.draw(); w.draw(); w.draw(); }
    assert.ok(Math.abs(w.cam.dist - (1 - Math.exp(-1))) < 0.005, '24 ticks of easing from 72 calls: ' + w.cam.dist.toFixed(4));
    // With the mover advancing before the view is asked for, the wrapper adds none.
    const m = world();
    m.look.yaw = 0;
    m.board({ heading: 0, v: 20 });
    for (let i = 0; i < 24; i++) { m.tick(1); m.draw(); m.draw(); m.draw(); }
    assert.equal(m.cam.dist, w.cam.dist, 'the same number either way');
    // The game's own order: the scene updates its sprites (the camera, twice on a drawn tick), then the game (the mover).
    const g = world();
    g.look.yaw = 0;
    g.board({ heading: 0, v: 20 });
    let advances = 0;
    const stamp = () => g.cam.dist;
    for (let i = 0; i < 24; i++) {
        g.Graphics.frameCount++;
        const before = stamp();
        g.draw(); g.draw();
        // The first tick aboard nobody has advanced yet: the wrapper does. After that the mover has, a tick ago.
        if (stamp() !== before) advances++;
        g.Feel.advance(g.$gamePlayer._rrDrive, g.type, g.input);
        advances++;
    }
    assert.equal(advances, 25, 'the wrapper advanced the first tick only: one advance a tick after that');
    assert.ok(Math.abs(g.cam.dist - (1 - Math.exp(-25 / 24))) < 1e-9, 'the distance after 25 advances, not 48: ' + g.cam.dist.toFixed(4));
    // The mover stops (the party is put on foot in the game's update): the wrapper takes over the next tick, with no tick left out and none doubled.
    const tail = g.cam.dist;
    g.onFoot();
    g.Graphics.frameCount++;
    g.draw(); g.draw();
    assert.equal(g.cam.dist, tail, 'the tick the party went on foot was the mover\'s: not advanced again');
    for (let i = 0; i < 24; i++) { g.Graphics.frameCount++; g.draw(); g.draw(); }
    assert.ok(Math.abs(g.cam.dist - tail * Math.exp(-1)) < 1e-9, 'then one advance a tick by the wrapper: ' + (g.cam.dist / tail).toFixed(4));
    // A game that runs its logic twice a scene update (fast forward) advances twice, and the wrapper adds none.
    const f = world();
    f.look.yaw = 0;
    f.board({ heading: 0, v: 20 });
    for (let i = 0; i < 12; i++) { f.Graphics.frameCount++; f.draw(); f.Feel.advance(f.$gamePlayer._rrDrive, f.type, f.input); f.Feel.advance(f.$gamePlayer._rrDrive, f.type, f.input); }
    assert.ok(Math.abs(f.cam.dist - (1 - Math.exp(-25 / 24))) < 1e-9);
});

test('a look change of 0.3 degree restarts nothing; more than 1.5 degrees inside 10 ticks is the hand', () => {
    const w = world();
    w.look.yaw = 0;
    w.board({ heading: 0, v: 20 });
    w.frame(60);
    const still = w.cam.still;
    assert.ok(still >= 45);
    // Two pixels of mouse.
    w.look.yaw += 0.3;
    w.frame(1);
    assert.equal(w.cam.still, still + 1, 'the count goes on');
    assert.ok(Math.abs(arc(0, w.cam.yaw) - 0.3) < 0.05, 'the 0.3 degree is kept in the view: ' + w.cam.yaw.toFixed(3));
    w.frame(60);
    assert.ok(Math.abs(arc(0, w.cam.yaw)) < 0.05, 'and the view goes on easing behind the heading');
    // One pixel a tick for ten ticks is exactly 1.5 degrees: not the hand.
    w.frame(10, () => { w.look.yaw = (w.look.yaw + 0.15) % 360; });
    assert.ok(w.cam.still > still, 'a slow drift does not freeze the view');
    w.frame(60);
    // A tenth of a degree a tick is one degree in any ten ticks, however long it goes on: the window is ten ticks, not more.
    const drifting = w.cam.still;
    w.frame(40, () => { w.look.yaw = (w.look.yaw + 0.1) % 360; });
    assert.equal(w.cam.still, drifting + 40, 'four degrees in forty ticks is not the hand');
    w.frame(60);
    // Two pixels a tick is.
    w.frame(6, () => { w.look.yaw = (w.look.yaw + 0.3) % 360; });
    assert.ok(w.cam.still < 6, 'the count restarted: ' + w.cam.still);
    // One sweep of the mouse.
    w.frame(60);
    w.look.yaw = 80;
    w.frame(1);
    assert.equal(w.cam.still, 0);
    assert.equal(w.cam.yaw, 80, 'the view is the hand\'s at once');
    assert.equal(w.cam.vyaw, 0);
    w.frame(43);
    assert.equal(w.cam.yaw, 80, 'and stays the hand\'s for 45 ticks at any speed');
    assert.equal(w.look.yaw, 80);
    w.frame(1);
    assert.equal(w.cam.yaw, 80, 'tick 44');
    w.frame(2);
    assert.notEqual(w.cam.yaw, 80, 'then it eases back behind');
    w.frame(120);
    assert.ok(Math.abs(arc(0, w.cam.yaw)) < 0.5, 'and arrives: ' + w.cam.yaw.toFixed(2));
    // A hand that keeps moving keeps the view: the mouse looks sideways at any speed.
    let side = 0;
    w.frame(300, () => { side = 90 + 20 * Math.sin(w.Graphics.frameCount / 8); w.look.yaw = side; });
    assert.ok(Math.abs(arc(w.cam.yaw, side)) < 1e-9, 'the view is where the mouse points after five seconds of looking about at 20 tiles a second');
});

test('boarded from the front the view comes round behind whatever the speed, unless the hand takes it', () => {
    const w = world();
    // The bike faces south; the hero walked up to its nose looking north-ish: the camera is in front of the bike.
    w.look.yaw = 10;
    w.board({ heading: 180, v: 0, hop: true });
    w.frame(1);
    assert.equal(w.cam.board, 1, 'the boarding ease is in force from the hop\'s first tick');
    w.frame(13);
    assert.ok(Math.abs(arc(w.cam.yaw, 180)) < 150, 'on its way during the hop: ' + w.cam.yaw.toFixed(1));
    w.frame(30);
    assert.ok(Math.abs(arc(w.cam.yaw, 180)) < 25, 'the hop\'s 14 ticks and 30 more: within 25 degrees of behind, ' + arc(w.cam.yaw, 180).toFixed(1) + ' to go');
    w.frame(60);
    assert.ok(Math.abs(arc(w.cam.yaw, 180)) < 0.5, 'and it finishes the turn standing still: ' + arc(w.cam.yaw, 180).toFixed(2));
    assert.equal(w.cam.board, 0, 'then the boarding ease is over');
    // W now rides away from the camera: forward on the screen is the heading.
    const forward = w.pose();
    assert.ok(forward.dz > 0.5 && Math.abs(forward.dx) < 0.01, 'the camera looks south, the way the bike faces');
    // The hand during the hop: the view is the hand's, and the boarding ease is given up.
    const h = world();
    h.look.yaw = 10;
    h.board({ heading: 180, v: 0, hop: true });
    h.frame(5);
    h.look.yaw = 300;
    h.frame(1);
    assert.equal(h.cam.board, 0);
    h.frame(120);
    assert.equal(h.cam.yaw, 300, 'standing still it stays where the hand put it');
    // Boarded from behind: nothing to do, and the ease ends after its 44 ticks.
    const b = world();
    b.look.yaw = 180;
    b.board({ heading: 180, v: 0, hop: true });
    b.frame(43);
    assert.equal(b.cam.board, 1);
    b.frame(1);
    assert.equal(b.cam.board, 0);
    assert.equal(b.cam.yaw, 180);
    // A mover with no state yet in the hop: the heading is the ridden event's.
    const e = world();
    e.look.yaw = 0;
    e.board({ heading: 0, hop: true });
    e.$gamePlayer._rrDrive = null;
    e.$gameMap._events[7] = { _rrYaw: 90 * DEG, _rrVehicle: 1 };
    e.frame(120);
    assert.ok(Math.abs(arc(e.cam.yaw, 90)) < 0.5, 'behind the event\'s own heading: ' + e.cam.yaw.toFixed(2));
});

test('standing still the view stays where the player left it; above 2 tiles a second it swings behind', () => {
    const w = world();
    w.look.yaw = 0;
    w.board({ heading: 0, v: 0 });
    w.frame(60);
    w.look.yaw = 120;
    w.frame(1);
    w.frame(600);
    assert.equal(w.cam.yaw, 120, 'ten seconds at rest: he may walk the view round his bike');
    w.$gamePlayer._rrDrive.v = 1.9;
    w.frame(120);
    assert.equal(w.cam.yaw, 120, 'under 2 tiles a second it still stays');
    // Walked round where it stands: the heading turns under a view that stays.
    w.$gamePlayer._rrDrive.v = 0;
    w.frame(90, () => { w.$gamePlayer._rrDrive.yaw += 2 * DEG; });
    assert.equal(w.cam.yaw, 120);
    w.$gamePlayer._rrDrive.v = 5;
    w.frame(120);
    assert.ok(Math.abs(arc(w.cam.yaw, 180)) < 0.5, 'riding off: behind the new heading, ' + w.cam.yaw.toFixed(2));
    // Slowing under 2 in the middle of a swing: the swing runs out, it does not stop dead or go on.
    w.look.yaw = 60;
    w.frame(50);
    const mid = w.cam.yaw, speed = w.cam.vyaw;
    assert.ok(Math.abs(speed) > 20, 'swinging');
    w.$gamePlayer._rrDrive.v = 0;
    w.frame(1);
    assert.ok(Math.abs(w.cam.vyaw) < Math.abs(speed) && w.cam.vyaw !== 0, 'the swing slows');
    w.frame(40);
    assert.equal(w.cam.vyaw, 0, 'and has ended');
    assert.ok(Math.abs(arc(mid, w.cam.yaw)) < 15, 'a little past where it was let go');
    const rest = w.cam.yaw;
    w.frame(120);
    assert.equal(w.cam.yaw, rest);
});

test('a heading that jumps (a place set by a command) is no turn: the view eases to it with no lead', () => {
    const w = world();
    w.look.yaw = 0;
    w.board({ heading: 0, v: 20 });
    w.frame(60);
    w.$gamePlayer._rrDrive.yaw = 90 * DEG;
    w.tick(1);
    assert.equal(w.cam.turn, 0, 'a quarter turn in one tick is not a rate');
    assert.ok(Math.abs(arc(0, w.cam.yaw)) < 1.5, 'the view does not jump: ' + w.cam.yaw.toFixed(2));
    w.frame(120);
    assert.ok(Math.abs(arc(w.cam.yaw, 90)) < 0.5);
});

test('a save loaded aboard starts from the look with no boarding swing; a ride that begins in play with no hop is a boarding', () => {
    const w = world();
    w.look.yaw = 0;
    w.board({ heading: 0, v: 20 });
    w.frame(120);
    assert.ok(w.cam.dist > 0.99);
    // The game is loaded: a new player object, standing aboard, looking sideways, and the map scene starts with it.
    const load = (v = 0) => {
        const loaded = Object.create(Object.getPrototypeOf(w.$gamePlayer));
        Object.assign(loaded, w.$gamePlayer, { _vehicleType: 'reactor', _rrDrive: { v, yaw: 0 }, _rrMount: null, _rrRide: { map: w.$gameMap.mapId(), id: 7 } });
        w.$gamePlayer = loaded;
        vm.runInContext('new Scene_Map()', w).start();
        w.tick = (n = 1) => { for (let i = 0; i < n; i++) { w.Graphics.frameCount++; w.Feel.advance(loaded._rrDrive, w.type, w.input); } };
        return loaded;
    };
    let loaded = load();
    w.look.yaw = 250;
    w.tick(1);
    assert.equal(w.cam.owner, loaded);
    assert.equal(w.cam.yaw, 250, 'from the look');
    assert.equal(w.cam.board, 0, 'no boarding ease: the scene began aboard');
    assert.ok(w.cam.dist < 0.05, 'and none of the last game\'s speed in the distance: ' + w.cam.dist);
    w.tick(300);
    assert.equal(w.cam.yaw, 250, 'at rest it stays');
    // Loaded at speed: it swings behind the heading from the first tick, with no 45 ticks of waiting.
    loaded = load(10);
    w.look.yaw = 250;
    w.tick(3);
    assert.equal(w.cam.board, 0);
    assert.ok(Math.abs(arc(250, w.cam.yaw)) > 1, 'three ticks in, the view is on its way behind: ' + w.cam.yaw.toFixed(2));
    // Off (the first tick on foot is seen), then on again with no hop: now it is a boarding.
    loaded._rrDrive.v = 0;
    w.tick(120);
    Object.assign(loaded, { _vehicleType: 'walk', _rrRide: null, _rrDrive: null });
    w.Graphics.frameCount++; w.draw(); w.Graphics.frameCount++; w.draw();
    Object.assign(loaded, { _vehicleType: 'reactor', _rrDrive: { v: 0, yaw: 0 }, _rrRide: { map: w.$gameMap.mapId(), id: 7 } });
    w.look.yaw = 170;
    w.tick(1);
    assert.equal(w.cam.board, 1, 'the party has been on foot since the scene began: getting on is a boarding');

    // The Get On command's instant, a boarding from afar: no hop. From in front of the bike, standing.
    const g = world();
    vm.runInContext('new Scene_Map()', g).start();
    g.look.yaw = 10;
    g.board({ heading: 180, v: 0 });
    g.frame(1);
    assert.equal(g.cam.board, 1, 'the boarding ease is in force though nobody hopped');
    g.frame(43);
    assert.ok(Math.abs(arc(g.cam.yaw, 180)) < 25, '44 ticks on, within 25 degrees of behind: ' + arc(g.cam.yaw, 180).toFixed(1) + ' to go');
    g.frame(60);
    assert.ok(Math.abs(arc(g.cam.yaw, 180)) < 0.5, 'and it finishes the turn standing still');
    assert.equal(g.cam.board, 0);
    // W held from the first tick: the bike never rides toward the camera for long.
    const r = world();
    r.look.yaw = 0;
    r.board({ heading: 180, v: 0 });
    let toward = 0;
    r.frame(120, i => { r.$gamePlayer._rrDrive.v = Math.min(20, i * 0.25); if (i > 20 && Math.abs(arc(r.cam.yaw, 180)) > 90) toward++; });
    assert.equal(toward, 0, 'a third of a second after getting on, the view is no longer in front of the bike');
    // A transfer made aboard: the new map's scene begins aboard, and the view does not swing.
    const t = world();
    t.look.yaw = 0;
    t.board({ heading: 0, v: 0 });
    t.frame(120);
    t.$gameMap._mapId = 99;
    t.$gamePlayer._rrRide.map = 99;
    vm.runInContext('new Scene_Map()', t).start();
    t.look.yaw = 140;
    t.frame(1);
    assert.equal(t.cam.map, 99);
    assert.equal(t.cam.board, 0, 'no boarding ease on the map arrived at');
    assert.equal(t.cam.yaw, 140);
});

test('bumps move the bike, not the screen: the height is followed through a 0.15 s low-pass', () => {
    const w = world();
    w.look.yaw = 0;
    w.board({ heading: 0, v: 5 });
    w.frame(120);
    const y = w.camera.position.y;
    // A half-tile curb.
    w.$gamePlayer._reactorGround = 0.5; w.$gamePlayer._reactorAlt = 0.5;
    w.frame(1);
    const first = w.camera.position.y - y;
    assert.ok(first > 0.02 && first < 0.1, 'the tick of the curb the camera has risen ' + first.toFixed(3) + ' of 0.5');
    w.frame(8);
    const ninth = w.camera.position.y - y;
    assert.ok(Math.abs(ninth - 0.5 * (1 - Math.exp(-1))) < 0.02, '63% after 0.15 s: ' + ninth.toFixed(3));
    w.frame(60);
    assert.ok(Math.abs(w.camera.position.y - y - 0.5) < 0.005, 'and all of it soon after');
    // In the air: the jump's height is followed the same way.
    w.$gamePlayer._reactorAir = 0.75;
    w.frame(1);
    assert.ok(w.camera.position.y - y - 0.5 < 0.1);
    // A height that changes by storeys in one tick is a move, not a bump: followed at once.
    w.$gamePlayer._reactorAir = 0;
    w.frame(60);
    w.$gamePlayer._reactorGround = 12.5; w.$gamePlayer._reactorAlt = 12.5;
    w.frame(1);
    assert.ok(Math.abs(w.camera.position.y - y - 12.5) < 0.01, 'twelve tiles up at once');
});

test('the kick pushes the camera for six ticks: down for a landing, along the heading for a square hit', () => {
    const w = world();
    w.look.yaw = 0;
    w.board({ heading: 90, v: 0 });
    w.look.yaw = 90;
    w.frame(200);
    const rest = w.pose();
    w.Feel.kick(0.08);
    w.frame(1);
    assert.ok(Math.abs(rest.y - w.camera.position.y - 0.08) < 1e-9, 'the whole kick on its first frame');
    assert.ok(Math.abs(w.camera.position.x - rest.x) < 1e-9 && Math.abs(w.camera.position.z - rest.z) < 1e-9, 'straight down');
    assert.deepEqual([w.pose().dx, w.pose().dy, w.pose().dz], [rest.dx, rest.dy, rest.dz], 'the view is pushed, not turned');
    let last = 0.08;
    for (let i = 0; i < 5; i++) {
        w.frame(1);
        const now = rest.y - w.camera.position.y;
        assert.ok(now < last && now > 0, 'smaller each tick: ' + now.toFixed(4));
        // Fading as the square of the time left: most of it is gone in the first three ticks.
        assert.ok(Math.abs(now - 0.08 * ((5 - i) / 6) ** 2) < 1e-9, 'tick ' + (i + 1) + ': ' + now.toFixed(5));
        last = now;
    }
    w.frame(1);
    assert.ok(same(w.pose(), rest), 'gone after six ticks');
    // Put on foot with a kick in force (a battle starting on the landing): the kick runs out on foot and the overlay ends.
    w.Feel.kick(0.3);
    w.frame(1);
    w.onFoot();
    let ticks = 0, drop = 0.3;
    while (w.cam.live && ticks < 100) {
        w.Graphics.frameCount++; w.draw(); ticks++;
        const now = w.pose(w.plainCamera()).y - w.camera.position.y;
        assert.ok(now <= drop + 1e-9, 'the kick only fades on foot');
        drop = now;
    }
    assert.ok(ticks >= 6 && ticks <= 8, 'over ' + ticks + ' ticks after the party was put on foot');
    w.board({ heading: 90, v: 0 });
    w.frame(200);
    // Along the heading (east).
    w.Feel.kick(0.06, true);
    w.frame(1);
    assert.ok(Math.abs(w.camera.position.x - rest.x - 0.06) < 1e-9, 'shoved east');
    assert.ok(Math.abs(w.camera.position.y - rest.y) < 1e-9);
    w.frame(6);
    assert.ok(same(w.pose(), rest));
    // Nothing for nothing, and never a throw of the camera across the map.
    w.Feel.kick(0); w.Feel.kick(-1); w.Feel.kick('x');
    w.frame(1);
    assert.ok(same(w.pose(), rest));
    w.Feel.kick(40);
    w.frame(1);
    assert.ok(rest.y - w.camera.position.y <= 0.5 + 1e-9, 'held to half a tile');
});

test('in the fixed, top-down and isometric views the camera stands back with speed, and the look is not written', () => {
    for (const [mode, pitch] of [['fixed', 55], ['topDown', 89], ['isometric', 35.264]]) {
        const w = world({ mode });
        w.look.yaw = 33;
        w.board({ heading: 0, v: 0 });
        w.frame(60);
        const standing = w.pose(), own = (w.camera.position.y - 0) / Math.sin(pitch * DEG);
        assert.ok(same(standing, w.pose(w.plainCamera())), mode + ': standing it is the map\'s own');
        w.$gamePlayer._rrDrive.v = 20;
        w.$gamePlayer._rrDrive.yaw = 70 * DEG;
        w.frame(240);
        const far = (w.camera.position.y - 0) / Math.sin(pitch * DEG);
        assert.ok(Math.abs(far / own - 1.35) < 0.002, mode + ': 1.35 times as far at top speed (' + own.toFixed(2) + ' to ' + far.toFixed(2) + ')');
        assert.equal(w.camera.fov, standing.fov, mode + ': the field of view is the mode\'s');
        assert.deepEqual([w.pose().dx, w.pose().dy, w.pose().dz].map(n => n.toFixed(9)), [standing.dx, standing.dy, standing.dz].map(n => n.toFixed(9)), mode + ': it looks the same way');
        assert.equal(w.look.yaw, 33, mode + ': the look is left alone');
        w.$gamePlayer._rrDrive.v = 10;
        w.frame(240);
        assert.ok(Math.abs((w.camera.position.y / Math.sin(pitch * DEG)) / own - 1.175) < 0.002, mode + ': half speed, half of it');
    }
});

test('on foot it does nothing; getting off at speed lets the distance run out instead of jumping', () => {
    const w = world();
    w.look.yaw = 0;
    // Never boarded: the wrapper leaves the camera and the look exactly as the three below it.
    w.look.yaw = 77;
    for (let i = 0; i < 30; i++) { w.Graphics.frameCount++; w.draw(); }
    assert.ok(same(w.pose(), w.pose(w.plainCamera())));
    assert.equal(w.look.yaw, 77);
    assert.equal(w.cam.live, false);
    // And it looks at nothing but `_vehicleType`: the ride's other fields are not read once in 300 camera calls.
    let reads = 0;
    for (const key of ['_rrDrive', '_rrMount', '_rrRide']) Object.defineProperty(w.$gamePlayer, key, { configurable: true, get() { reads++; return null; }, set(value) { Object.defineProperty(w.$gamePlayer, key, { configurable: true, writable: true, enumerable: true, value }); } });
    // (What a tick on foot would reset is left as it is: no tick ran.)
    w.Feel.engine.held = true;
    for (let i = 0; i < 100; i++) { w.Graphics.frameCount++; w.draw(); w.draw(); w.draw(); }
    assert.equal(reads, 0, 'on foot with no ride behind it the wrapper is one compare and one flag');
    assert.equal(w.Feel.engine.held, true, 'and it advances nothing');
    w.Feel.engine.held = false;
    // Aboard at top speed, then on foot in one tick (a battle rule, a script).
    w.look.yaw = 0;
    w.board({ heading: 0, v: 20 });
    w.frame(180);
    const riding = w.back();
    w.onFoot();
    w.Graphics.frameCount++; w.draw();
    assert.ok(Math.abs(riding - w.back()) < 1e-9, 'the first frame on foot is where the last frame aboard was');
    w.Graphics.frameCount++; w.draw();
    assert.ok(riding - w.back() < 0.2 && riding - w.back() > 0, 'the next is ' + (riding - w.back()).toFixed(3) + ' tile nearer, not 2.8');
    assert.equal(w.cam.tail, true);
    let before = w.back(), ticks = 0;
    while (w.cam.live && ticks < 600) {
        w.Graphics.frameCount++; w.draw(); ticks++;
        if (w.cam.live) { assert.ok(w.back() <= before + 1e-9, 'it only comes in'); before = w.back(); }
    }
    assert.ok(ticks > 30 && ticks < 200, 'run out after ' + ticks + ' ticks');
    w.look.yaw = 200;
    for (let i = 0; i < 30; i++) { w.Graphics.frameCount++; w.draw(); }
    assert.ok(same(w.pose(), w.pose(w.plainCamera())), 'then exactly the map\'s own camera again');
    assert.equal(w.look.yaw, 200, 'and the look is the player\'s');
    assert.equal(w.camera.fov, 45);
    // Got off at a standstill: nothing to run out, the first frame on foot is already the map\'s own.
    w.look.yaw = 0;
    w.board({ heading: 0, v: 0 });
    w.frame(120);
    w.onFoot();
    for (let i = 0; i < 3; i++) {
        w.Graphics.frameCount++; w.draw();
        assert.ok(gap(w.pose(), w.pose(w.plainCamera())) < 0.02, 'leaving does not move the camera in or out');
    }
    assert.equal(w.cam.live, false, 'and with nothing to run out the overlay is over on the first tick on foot');
    // Boarded again while it runs out: what is left is kept, not dropped.
    w.board({ heading: 0, v: 20 });
    w.frame(180);
    w.onFoot();
    for (let i = 0; i < 6; i++) { w.Graphics.frameCount++; w.draw(); }
    const left = w.cam.dist;
    assert.equal(w.cam.tail, true);
    w.board({ heading: 0, v: 20 });
    w.frame(1);
    assert.ok(w.cam.dist >= left, 'no step in the distance');
    assert.equal(w.cam.tail, false);
    // On another map the last ride's rest is dropped at once.
    w.onFoot();
    for (let i = 0; i < 3; i++) { w.Graphics.frameCount++; w.draw(); }
    assert.equal(w.cam.live, true);
    w.$gameMap._mapId = 99;
    w.Graphics.frameCount++; w.draw();
    assert.equal(w.cam.live, false);
});

test('during a camera command\'s ease, in first person, on another focus and below the horizon it stands down', () => {
    const w = world();
    w.look.yaw = 0;
    w.board({ heading: 0, v: 20 });
    w.frame(180);
    assert.ok(gap(w.pose(), w.pose(w.plainCamera())) > 1);
    // A camera command's tween: the command has the camera.
    w.$gameMap.setReactorCamera3D({ mode: 'thirdPerson', distance: 5 }, 30, false);
    w.frame(1);
    assert.ok(w.Reactor3D.Camera.isMoving());
    // The map camera's own first step of 30 from its 8 tiles toward 5, and its own field of view.
    assert.ok(Math.abs(w.back() - (8 - 3 * 2 / 900)) < 1e-6, 'while the command eases, the camera is the command\'s: ' + w.back().toFixed(4));
    assert.equal(w.camera.fov, 45);
    w.frame(40);
    assert.ok(!w.Reactor3D.Camera.isMoving());
    assert.ok(Math.abs(w.back() - 5 * 1.35) < 0.02, 'after it, the overlay is over the command\'s distance: ' + w.back().toFixed(3));
    // The camera on an event.
    w.$gameMap._events[3] = Object.assign(Object.create(w.Game_Event.prototype), { _realX: 5, _realY: 5, _x: 5, _y: 5, _direction: 2, direction() { return 2; } });
    w.$gameMap.setReactorCamera3D({ mode: 'thirdPerson', focus: 'event', eventId: 3 }, 0, false);
    w.frame(2);
    assert.ok(same(w.pose(), w.pose(w.plainCamera()), 1e-6), 'third person on an event is not this view');
    // First person.
    w.$gameMap.setReactorCamera3D({ mode: 'firstPerson' }, 0, false);
    w.frame(2);
    assert.ok(same(w.pose(), w.pose(w.plainCamera()), 1e-6), 'first person is left alone');
    // Looking up past the horizon: the map camera sits over the shoulder, and only the field of view is the ride\'s.
    w.$gameMap.setReactorCamera3D({ mode: 'thirdPerson' }, 0, false);
    w.look.pitch = -10;
    w.frame(2);
    const up = w.pose(), own = w.pose(w.plainCamera());
    assert.ok(Math.abs(up.x - own.x) < 1e-6 && Math.abs(up.y - own.y) < 1e-6 && Math.abs(up.z - own.z) < 1e-6, 'the place is the map camera\'s');
    assert.ok(Math.abs(up.fov - 56) < 0.05 && own.fov === 45, 'the field of view is still wider with speed');
});

test('a big kind\'s least camera distance is a floor while aboard, eased in', () => {
    const w = world();
    w.type = TYPE({ camera: { speedDistance: 35, speedFov: 11, lookAhead: 3, minDistance: 13 } });
    w.look.yaw = 0;
    w.board({ heading: 0, v: 0, hop: true });
    w.frame(1);
    assert.ok(w.back() < 8.3, 'boarding does not jump the camera out: ' + w.back().toFixed(3));
    w.frame(24);
    assert.ok(Math.abs(w.back() - (8 + 5 * (1 - Math.exp(-25 / 24)))) < 0.05, 'eased over 0.4 s: ' + w.back().toFixed(3));
    w.frame(200);
    assert.ok(Math.abs(w.back() - 13) < 0.01, 'thirteen tiles standing');
    w.$gamePlayer._rrDrive.v = 20;
    w.frame(240);
    assert.ok(Math.abs(w.back() - 13) < 0.01, 'the floor, not a sum: 8 and 35% is under 13');
    // On foot again it eases back to the map's own 8, with no step.
    w.$gamePlayer._rrDrive.v = 0;
    w.frame(240);
    w.onFoot();
    w.Graphics.frameCount++; w.draw();
    assert.ok(Math.abs(w.back() - 13) < 0.01, 'the first frame on foot is still at 13');
    let last = w.back();
    for (let i = 0; i < 24; i++) { w.Graphics.frameCount++; w.draw(); assert.ok(last - w.back() < 0.25 && last - w.back() > 0, 'in by a little each tick'); last = w.back(); }
    assert.ok(Math.abs(w.back() - (8 + 5 * Math.exp(-1))) < 0.01, 'eased back over 0.4 s: ' + w.back().toFixed(3));
    for (let i = 0; i < 300 && w.cam.live; i++) { w.Graphics.frameCount++; w.draw(); }
    assert.equal(w.cam.live, false);
    w.Graphics.frameCount++; w.draw();
    assert.ok(Math.abs(w.back() - 8) < 1e-9, 'and then the map\'s own');
    // Got off by the hop: the floor is let go while the rider gets off, so the camera is on its way in before the party stands.
    const o = world();
    o.type = w.type;
    o.look.yaw = 0;
    o.board({ heading: 0, v: 0 });
    o.frame(300);
    assert.ok(Math.abs(o.back() - 13) < 0.01);
    o.$gamePlayer._rrMount = { t: 0, n: 14, on: false };
    o.frame(13);
    assert.ok(Math.abs(o.back() - (8 + 5 * Math.exp(-13 / 24))) < 0.05, 'thirteen ticks into the hop off: ' + o.back().toFixed(3));
    // A map camera that already stands further back is left alone.
    const far = world({ camera: { distance: 20 } });
    far.type = w.type;
    far.look.yaw = 0;
    far.board({ heading: 0, v: 0 });
    far.frame(120);
    assert.ok(Math.abs(far.back() - 20) < 1e-6);
});

/**
 * Stand-ins for two of the map's clearing functions, acting as the real ones do: `ask.lift` tiles up, still looking
 * at what it looked at (a roof's hollow); `ask.pull` of the way from the rider out to the camera (a solid).
 */
function clearing(w) {
    const ask = { lift: 0, pull: 1 };
    vm.runInContext(`(function(ask) {
        const ahead = new THREE.Vector3();
        Reactor3D.clearCameraAttic = function(camera, focus) {
            if (!(ask.lift > 0)) return false;
            // (\`ask.blunt\`: a function that lifts and does not turn the camera, as a plugin's own might.)
            if (ask.blunt) { camera.position.y += ask.lift; camera.updateMatrixWorld(); return true; }
            const to = camera.position, length = Math.hypot(to.x - focus.x, to.y - focus.y, to.z - focus.z);
            camera.getWorldDirection(ahead);
            const ax = to.x + ahead.x * length, ay = to.y + ahead.y * length, az = to.z + ahead.z * length;
            camera.position.set(to.x, to.y + ask.lift, to.z);
            camera.lookAt(ax, ay, az);
            camera.updateMatrixWorld();
            return true;
        };
        Reactor3D.clearCameraPath = function(camera, focus) {
            if (!(ask.pull < 1)) return false;
            const to = camera.position;
            camera.position.set(focus.x + (to.x - focus.x) * ask.pull, focus.y + (to.y - focus.y) * ask.pull, focus.z + (to.z - focus.z) * ask.pull);
            camera.updateMatrixWorld();
            return true;
        };
    })`, w)(ask);
    return ask;
}
// What the clearing functions are handed for the rider at (20, 15) on the floor.
const NEAR = { x: 20.5, y: 2.2, z: 15.5 };
const fromRider = camera => Math.hypot(camera.position.x - NEAR.x, camera.position.y - NEAR.y, camera.position.z - NEAR.z);

test('what keeps the map\'s camera clear is followed, not jumped to: a crossing of a tick or two moves nothing, a lasting one is eased to and let go', () => {
    const w = world(), ask = clearing(w);
    const k = n => 1 - Math.exp(-n / 6), back = n => 1 - Math.exp(-n / 18);
    w.look.yaw = 0;
    w.board({ heading: 0, v: 0 });
    w.frame(120);
    const rest = w.pose(), far = fromRider(w.camera);
    // A roof's hollow the view passes through in two ticks.
    ask.lift = 5;
    w.frame(1);
    assert.ok(w.pose(w.plainCamera()).y - rest.y > 4.9, 'the map\'s own camera is over the roof on that tick');
    assert.ok(same(w.pose(), rest), 'the view is not: one tick of asking moves nothing');
    w.frame(1);
    assert.ok(same(w.pose(), rest), 'nor two');
    ask.lift = 0;
    w.frame(30);
    assert.ok(same(w.pose(), rest));
    assert.equal(w.cam.settled, true);
    // One that lasts: followed from the third tick, over a tenth of a second.
    ask.lift = 5;
    w.frame(2);
    assert.ok(same(w.pose(), rest));
    w.frame(1);
    assert.ok(Math.abs(w.camera.position.y - rest.y - 5 * k(1)) < 1e-6, 'the third tick: ' + (w.camera.position.y - rest.y).toFixed(4) + ' of 5 tiles');
    // On the way it looks at what the wanted place looked at.
    const target = { x: rest.x + rest.dx * far, y: rest.y + rest.dy * far, z: rest.z + rest.dz * far };
    const aimed = () => { const q = w.pose(), d = Math.hypot(target.x - q.x, target.y - q.y, target.z - q.z); return Math.hypot(q.dx - (target.x - q.x) / d, q.dy - (target.y - q.y) / d, q.dz - (target.z - q.z) / d); };
    assert.ok(aimed() < 1e-6, 'still looking at the rider');
    let last = w.camera.position.y;
    for (let i = 2; i <= 7; i++) {
        w.frame(1);
        assert.ok(w.camera.position.y > last && w.camera.position.y - last < 5 * k(1), 'up a little less each tick');
        last = w.camera.position.y;
    }
    assert.ok(Math.abs(last - rest.y - 5 * k(7)) < 1e-6, 'seven ticks of following: ' + (last - rest.y).toFixed(4));
    assert.ok(aimed() < 1e-6);
    assert.equal(w.cam.settled, false);
    w.frame(80);
    assert.equal(w.cam.lift, 5, 'arrived');
    assert.equal(w.cam.settled, true);
    assert.ok(same(w.pose(), w.pose(w.plainCamera())), 'and then it is exactly where the map\'s own camera stands');
    // Let go over three tenths of a second.
    ask.lift = 0;
    w.frame(1);
    assert.ok(Math.abs(rest.y + 5 - w.camera.position.y - 5 * back(1)) < 1e-6, 'the first tick down: ' + (rest.y + 5 - w.camera.position.y).toFixed(4));
    w.frame(17);
    assert.ok(Math.abs(w.camera.position.y - rest.y - 5 * Math.exp(-1)) < 1e-6, '37% left after 0.3 s');
    w.frame(200);
    assert.ok(same(w.pose(), rest), 'and all the way back');
    assert.equal(w.cam.lift, 0);
    // A solid: the way in is followed the same way, and the view is not turned.
    ask.pull = 0.4;
    w.frame(2);
    assert.ok(same(w.pose(), rest), 'two ticks in a wall: nothing');
    let most = 0, was = fromRider(w.camera);
    for (let i = 0; i < 60; i++) {
        w.frame(1);
        const now = fromRider(w.camera);
        if (i === 0) assert.ok(Math.abs(now - far * (1 - 0.6 * k(1))) < 1e-6, 'the third tick: ' + now.toFixed(4));
        most = Math.max(most, Math.abs(now - was));
        was = now;
    }
    assert.ok(most < 0.8, 'no tick moves the camera more than ' + most.toFixed(3) + ' tile, where the map\'s own went ' + (far * 0.6).toFixed(2) + ' in one');
    assert.ok(Math.abs(w.cam.pull - 0.4) < 1e-9);
    assert.ok(same(w.pose(), w.pose(w.plainCamera())), 'arrived: the map\'s own place');
    assert.deepEqual([w.pose().dx, w.pose().dy, w.pose().dz].map(n => n.toFixed(9)), [rest.dx, rest.dy, rest.dz].map(n => n.toFixed(9)), 'looking the same way');
    ask.pull = 1;
    w.frame(1);
    assert.ok(Math.abs(fromRider(w.camera) - far * (0.4 + 0.6 * back(1))) < 1e-6, 'let go as slowly: ' + fromRider(w.camera).toFixed(4));
    w.frame(200);
    assert.ok(same(w.pose(), rest));

    // Arrived, the camera is left exactly as the map's functions left it, whatever they did to it.
    ask.blunt = true;
    ask.lift = 3;
    w.frame(120);
    assert.equal(w.cam.settled, true);
    assert.ok(same(w.pose(), w.pose(w.plainCamera())), 'a lift that does not turn the camera: at rest the view is not turned either');
    ask.lift = 0; ask.blunt = false;
    w.frame(200);
    assert.ok(same(w.pose(), rest));

    // A view that starts where the map's camera already stands clear of something takes that as it stands.
    const b = world(), bAsk = clearing(b);
    bAsk.pull = 0.6;
    b.look.yaw = 0;
    for (let i = 0; i < 5; i++) { b.Graphics.frameCount++; b.draw(); }
    const foot = b.pose();
    assert.ok(Math.abs(fromRider(b.camera) - far * 0.6) < 1e-6);
    b.board({ heading: 0, v: 0 });
    b.frame(1);
    assert.ok(same(b.pose(), foot), 'boarding in front of a wall the camera already came in for: nothing moves');
    assert.ok(Math.abs(b.cam.pull - 0.6) < 1e-9);

    // The same at any frame rate: three ticks to a drawn frame follow as far as one tick to a frame.
    const run = perFrame => {
        const f = world(), fAsk = clearing(f);
        f.look.yaw = 0;
        f.board({ heading: 0, v: 0 });
        f.frame(60);
        fAsk.lift = 4; fAsk.pull = 0.5;
        for (let i = 0; i < 12 / perFrame; i++) { f.tick(perFrame); f.draw(); f.draw(); }
        return [f.cam.lift, f.cam.pull];
    };
    const one = run(1), three = run(3);
    assert.ok(Math.abs(one[0] - three[0]) < 1e-9 && Math.abs(one[1] - three[1]) < 1e-9, 'lift and way in after 12 ticks: ' + one + ' and ' + three);
    assert.ok(Math.abs(one[0] - 4 * k(10)) < 1e-9, 'ten ticks of following after the two of waiting: ' + one[0]);

    // On foot the run-out lasts until what was followed has been let go.
    const t = world(), tAsk = clearing(t);
    t.look.yaw = 0;
    t.board({ heading: 0, v: 0 });
    t.frame(60);
    tAsk.lift = 5;
    t.frame(12);
    const up = t.camera.position.y;
    assert.ok(t.cam.lift > 3);
    t.onFoot();
    tAsk.lift = 0;
    t.Graphics.frameCount++; t.draw();
    assert.ok(Math.abs(t.camera.position.y - up) < 1e-9, 'the first frame on foot is where the last frame aboard was');
    let height = up, steps = 0;
    while (t.cam.live && steps < 600) {
        t.Graphics.frameCount++; t.draw(); steps++;
        if (t.cam.live) { assert.ok(height - t.camera.position.y >= 0 && height - t.camera.position.y < 0.3, 'down by a little each tick'); height = t.camera.position.y; }
    }
    assert.ok(steps > 20 && steps < 240, 'let go and over after ' + steps + ' ticks');
    t.Graphics.frameCount++; t.draw();
    assert.ok(same(t.pose(), t.pose(t.plainCamera())), 'then the map\'s own camera');
    // Where the view stands down (a camera command, first person) nothing is followed any more: what was on its way is dropped.
    t.board({ heading: 0, v: 0 });
    t.frame(60);
    tAsk.lift = 5;
    t.frame(8);
    assert.equal(t.cam.settled, false);
    t.$gameMap.setReactorCamera3D({ mode: 'firstPerson' }, 0, false);
    t.frame(2);
    assert.equal(t.cam.settled, true);
    assert.equal(t.cam.lift, 0);
    t.onFoot();
    for (let i = 0; i < 4; i++) { t.Graphics.frameCount++; t.draw(); }
    assert.equal(t.cam.live, false, 'and the run-out on foot does not wait for it');
    t.$gameMap.setReactorCamera3D({ mode: 'thirdPerson' }, 0, false);
    tAsk.lift = 0;
    for (let i = 0; i < 4; i++) { t.Graphics.frameCount++; t.draw(); }
    // A clearing that never comes to rest does not keep the overlay for good.
    t.board({ heading: 0, v: 0 });
    t.frame(60);
    tAsk.lift = 5;
    t.frame(12);
    t.onFoot();
    let ticks = 0;
    while (t.cam.live && ticks < 1000) { tAsk.lift = 3 + (ticks % 7) * 0.3; t.Graphics.frameCount++; t.draw(); ticks++; }
    assert.ok(ticks >= 240 && ticks <= 243, 'four seconds at most: ' + ticks);
    assert.equal(t.cam.settled, true, 'and nothing is followed any more');
});

test('boarding beside a building: the swing crosses a wall and the camera does not leap; where the view ends in a house it comes in by degrees', () => {
    // A wall three blocks high running west from beside the bike, end on to it: the view, swinging from south of
    // the bike round by the west to its north, passes through it at the camera's height.
    const wall = [];
    for (let x = 12; x <= 18; x++) for (const z of [3, 4, 5]) wall.push({ id: wall.length + 1, kind: 'block', x, y: 15, z, rot: 0, material: '' });
    const w = world({ pieces: wall });
    w.look.yaw = 0;
    w.board({ heading: 180, v: 0, hop: true });
    let mine = 0, own = 0, last = null, lastOwn = null, least = 99;
    for (let i = 0; i < 100; i++) {
        w.frame(1);
        const now = fromRider(w.camera), plain = fromRider(w.plainCamera());
        if (last !== null) { mine = Math.max(mine, Math.abs(now - last)); own = Math.max(own, Math.abs(plain - lastOwn)); }
        last = now; lastOwn = plain; least = Math.min(least, now);
    }
    assert.ok(Math.abs(arc(w.cam.yaw, 180)) < 1, 'the view came round behind the bike');
    assert.ok(own > 3, 'the map\'s own camera, turned the same way, leaps ' + own.toFixed(2) + ' tiles in one tick as it meets the wall');
    assert.ok(mine < 0.05, 'the view passes the wall without coming in: ' + mine.toFixed(3) + ' tile at most in one tick');
    assert.ok(least > 7.5, 'boarding does not move the camera in: never nearer than ' + least.toFixed(2) + ' tiles');
    // A house the bike has its tail to: the view ends inside it, and comes in to where the map's own camera stands.
    const house = [];
    for (let x = 9; x <= 16; x++) for (let y = 12; y <= 18; y++) for (const z of [2, 3, 4, 5, 6]) house.push({ id: house.length + 1, kind: 'block', x, y, z, rot: 0, material: '' });
    const h = world({ pieces: house });
    h.look.yaw = 0;
    h.board({ heading: 90, v: 0, hop: true });
    mine = 0; own = 0; last = null; lastOwn = null;
    for (let i = 0; i < 160; i++) {
        h.frame(1);
        const now = fromRider(h.camera), plain = fromRider(h.plainCamera());
        if (last !== null) { mine = Math.max(mine, Math.abs(now - last)); own = Math.max(own, Math.abs(plain - lastOwn)); }
        last = now; lastOwn = plain;
    }
    assert.ok(own > 2.5, 'the map\'s own camera leaps ' + own.toFixed(2) + ' tiles in as it enters the house');
    assert.ok(mine < 0.8, 'the view comes in ' + mine.toFixed(3) + ' tile a tick at most');
    assert.ok(last < 5, 'it has come in for the house: ' + last.toFixed(2) + ' tiles');
    assert.equal(h.cam.settled, true);
    assert.ok(same(h.pose(), h.pose(h.plainCamera()), 1e-6), 'and stands exactly where the map\'s own camera stands');
});

test('a square hit at speed: for the ticks of its kick the view stands as it stood, and the kick is all that moves', () => {
    const w = world();
    w.look.yaw = 0;
    w.board({ heading: 0, v: 18 });
    w.frame(240);
    const before = w.pose(), dist = w.cam.dist, fov = w.cam.fov, lead = w.cam.az;
    assert.ok(dist > 0.89 && lead < -2.6);
    // The hit, in the mover's order: the bike stopped, the kick asked, then the tick advanced.
    w.$gamePlayer._rrDrive.v = 0;
    w.Feel.kick(0.06, true);
    for (let i = 0; i < 6; i++) {
        w.frame(1);
        // Heading north: pushed north by the kick, fading as the square of the time left.
        assert.ok(Math.abs((before.z - w.camera.position.z) - 0.06 * ((6 - i) / 6) ** 2) < 1e-9, 'tick ' + i + ' of the kick: ' + (before.z - w.camera.position.z).toFixed(5));
        assert.ok(Math.abs(w.camera.position.x - before.x) < 1e-9 && Math.abs(w.camera.position.y - before.y) < 1e-9 && w.camera.fov === before.fov, 'and nothing else moves');
    }
    assert.deepEqual([w.cam.dist, w.cam.fov, w.cam.az], [dist, fov, lead], 'the distance, the field of view and the lead waited');
    w.frame(1);
    assert.ok(same(w.pose(), before), 'the kick is over and the camera is where it was');
    w.frame(1);
    assert.ok(w.cam.dist < dist && w.cam.fov < fov && w.cam.az > lead, 'then they come in');
    w.frame(240);
    assert.ok(Math.abs(w.back() - 8) < 0.01, 'to the standing view');
    // A landing's kick (down) holds nothing: the bike rides on.
    const l = world();
    l.look.yaw = 0;
    l.board({ heading: 0, v: 20 });
    l.frame(10);
    const rising = l.cam.dist;
    l.Feel.kick(0.08);
    l.frame(1);
    assert.ok(l.cam.dist > rising, 'the distance goes on easing through a landing');
});

test('the small rules of the view: what is held to its range, what is asked once, what a number that is no number does', () => {
    // Twice the top speed is the top speed's view, and backward the same.
    const w = world();
    w.look.yaw = 0;
    w.board({ heading: 0, v: 40 });
    w.frame(240);
    assert.ok(Math.abs(w.back() - 10.8) < 0.02 && Math.abs(w.camera.fov - 56) < 0.05, 'not further or wider than the top speed\'s: ' + w.back().toFixed(3));
    assert.ok(Math.abs(Math.hypot(w.cam.ax, w.cam.az) - 3) < 0.02, 'nor aimed further ahead: ' + Math.hypot(w.cam.ax, w.cam.az).toFixed(3));
    w.$gamePlayer._rrDrive.v = -40;
    w.frame(240);
    assert.ok(Math.abs(w.cam.az - 3) < 0.02, 'backward, three tiles behind it at most: ' + w.cam.az.toFixed(3));
    // A type whose top speed is no speed rides with the default's 20.
    const z = world();
    z.type = TYPE({ handling: { speed: 0 } });
    z.look.yaw = 0;
    z.board({ heading: 0, v: 10 });
    z.frame(240);
    assert.ok(Math.abs(z.back() - 8 * 1.175) < 0.02, 'half of 20: ' + z.back().toFixed(3));
    // A zoom that is no zoom is none, as for the map's own camera.
    z.$gamePlayer._rrDrive.v = 0;
    z.frame(300);
    const one = z.pose();
    z.$gameScreen._zoomScale = -2;
    z.frame(1);
    assert.ok(same(z.pose(), one, 1e-4) && same(z.pose(), z.pose(z.plainCamera()), 1e-4), 'a zoom of -2 is a zoom of 1');
    z.$gameScreen._zoomScale = 1;
    // The ridden event's type is looked up once a ride when the mover hands none over.
    const a = world();
    let asks = 0;
    a.ReactorVehicles.type = id => { asks++; return id === 1 ? TYPE({ camera: { speedDistance: 50, speedFov: 11, lookAhead: 3, minDistance: 0 } }) : null; };
    a.$gameMap._events[7] = { _rrVehicle: 1, _rrYaw: 0 };
    a.type = null;
    a.look.yaw = 0;
    a.board({ heading: 0, v: 20 });
    a.frame(240);
    assert.equal(asks, 1, 'asked once in 240 ticks');
    assert.ok(Math.abs(a.back() - 12) < 0.02, 'and it is that type\'s view: ' + a.back().toFixed(3));
    // Numbers that are no numbers: the look, the mover's heading and speed.
    const n = world();
    n.$gameMap._events[7] = { _rrVehicle: 1, _rrYaw: 90 * DEG };
    n.look.yaw = NaN;
    n.board({ heading: 0, v: 0 });
    n.$gamePlayer._rrDrive.yaw = NaN;
    n.$gamePlayer._rrDrive.v = NaN;
    n.frame(60);
    assert.ok(Math.abs(arc(n.cam.yaw, 90)) < 1e-6, 'the view starts from the ridden event\'s heading: ' + n.cam.yaw);
    assert.equal(n.cam.dist, 0, 'and a speed that is no number is no speed');
    assert.ok(Object.values(n.pose()).every(Number.isFinite), 'the camera is somewhere');
    // The map camera's own turn on top of the look is kept: standing behind the bike it is the map's own camera.
    const s = world({ camera: { yaw: 30 } });
    s.look.yaw = 0;
    s.board({ heading: 0, v: 0 });
    s.frame(120);
    assert.ok(same(s.pose(), s.pose(s.plainCamera())), 'a map whose camera is turned 30 degrees keeps its turn aboard');
    // Got off in the middle of the boarding ease: the ease is over, not left for the next ride to find.
    const o = world();
    o.look.yaw = 0;
    o.board({ heading: 180, v: 0, hop: true });
    o.frame(10);
    assert.equal(o.cam.board, 1);
    o.onFoot();
    o.Graphics.frameCount++; o.draw(); o.Graphics.frameCount++; o.draw();
    assert.equal(o.cam.board, 0);
    // A heading that never comes to rest (the bike walked round where it stands): the boarding ease ends by itself.
    const e = world();
    e.look.yaw = 0;
    e.board({ heading: 180, v: 0, hop: true });
    e.frame(119, () => { e.$gamePlayer._rrDrive.yaw += 2 * DEG; });
    assert.equal(e.cam.board, 1, 'still easing behind at tick 119');
    e.frame(1, () => { e.$gamePlayer._rrDrive.yaw += 2 * DEG; });
    assert.equal(e.cam.board, 0, 'two seconds at most');
    e.frame(60, () => { e.$gamePlayer._rrDrive.yaw += 2 * DEG; });
    const left = e.cam.yaw;
    e.frame(60, () => { e.$gamePlayer._rrDrive.yaw += 2 * DEG; });
    assert.equal(e.cam.yaw, left, 'and then, standing, the view stays');
    // In the fixed views there is no boarding ease to carry into a later third person view.
    const f = world({ mode: 'isometric' });
    f.look.yaw = 0;
    f.board({ heading: 180, v: 0, hop: true });
    f.frame(2);
    assert.equal(f.cam.board, 0);
});

test('the wrapper asks the world nothing but one aim and what keeps the map\'s own camera clear, and advance asks it nothing', () => {
    const w = world();
    const R = w.Reactor3D;
    w.look.yaw = 0;
    w.board({ heading: 0, v: 20 });
    w.frame(120, () => { w.$gamePlayer._rrDrive.yaw += 1 * DEG; });
    // Every function of the 3D runtime records the calls made to it from outside the runtime, with what it was handed.
    const asked = [];
    let depth = 0;
    for (const name of Object.keys(R)) {
        const fn = R[name];
        if (typeof fn !== 'function' || /^[A-Z]/.test(name)) continue;
        R[name] = function() { if (depth === 0) asked.push([name, arguments[1], arguments[2]]); depth++; try { return fn.apply(this, arguments); } finally { depth--; } };
        Object.assign(R[name], fn);
    }
    const names = () => asked.map(entry => entry[0]);
    w.tick(1);
    assert.deepEqual(names(), [], 'advance, handed its type, calls no function of the 3D runtime');
    // The three wrappers below, alone, on a camera of their own in the same state: what they ask.
    w.plainCamera();
    const below = names();
    assert.ok(below.includes('aimCamera') && below.includes('clearCameraGround'), 'the map camera asks its own questions: ' + below.join(' '));
    // What the map camera's own place asks once it has aimed: over a roof, out of a roof's hollow, out of a solid, out of the ground.
    const CLEAR = ['aimCamera', 'clearCameraRoof', 'clearCameraAttic', 'clearCameraPath', 'clearCameraGround'];
    assert.deepEqual(below.slice(below.lastIndexOf('aimCamera')), CLEAR, 'the map camera keeps itself clear with these four, in this order');
    asked.length = 0;
    w.draw();
    assert.deepEqual(names().slice(0, below.length), below, 'first what the wrappers below ask, as without a vehicle');
    assert.deepEqual(names().slice(below.length), CLEAR, 'then the overlay: one aim and the same four, in the same order, and nothing else');
    // Asked again on the same tick (the spriteset asks twice on a drawn tick): the same place, and the world is not asked again.
    const first = w.pose();
    asked.length = 0;
    w.draw();
    assert.deepEqual(names(), below, 'the second call of a tick asks only what the wrappers below ask');
    assert.deepEqual(w.pose(), first, 'and puts the camera where the first call worked out');
    w.Feel.kick(0.08);
    asked.length = 0;
    w.draw();
    assert.deepEqual(names().slice(below.length), CLEAR, 'a kick between two calls is worked out anew');
    w.tick(8);
    // What the overlay hands over is the same three objects on every call: nothing is made for a call.
    const seen = { aim: new Set(), settings: new Set(), path: new Set(), ground: new Set() };
    for (let i = 0; i < 50; i++) {
        asked.length = 0;
        w.frame(1, () => { w.$gamePlayer._rrDrive.yaw += 1 * DEG; });
        const own = asked.slice(-5);
        assert.deepEqual(own.map(entry => entry[0]), CLEAR);
        seen.aim.add(own[0][1]); seen.settings.add(own[0][2]);
        for (const entry of own.slice(1, 4)) seen.path.add(entry[1]);
        seen.ground.add(own[4][1]);
    }
    assert.deepEqual([seen.aim.size, seen.settings.size, seen.path.size, seen.ground.size], [1, 1, 1, 1], 'one aim, one settings object and one clearing point for 50 frames');
    assert.equal([...seen.path][0], [...seen.ground][0], 'the four are handed the same point');
    const point = [...seen.path][0], p = w.$gamePlayer;
    assert.deepEqual([point.x, point.y, point.z], [p._realX + 0.5, 1 + 1.2, p._realY + 0.5], 'the player\'s own, as the map camera hands it: not the led aim');
    // The roof's question is asked with the height the rider is at, and what the ground's question does to the
    // camera stands at once: it is what is drawn, and what the second call of the tick puts back.
    p._reactorAlt = 0.25;
    w.tick(1);
    let feet = null;
    const roof = R.clearCameraRoof, ground = R.clearCameraGround;
    R.clearCameraRoof = function(camera, focus, mapData, at) { feet = at; return roof.apply(this, arguments); };
    w.draw();
    assert.equal(feet, 0.25);
    const low = w.pose().y;
    R.clearCameraGround = function(camera) { camera.position.y += 5; camera.updateMatrixWorld(); return true; };
    w.tick(1);
    w.draw();
    const lifted = w.pose();
    assert.ok(Math.abs(lifted.y - (low + 5)) < 0.05, 'a camera under the ground is out of it on the same tick, as the map\'s own is: ' + (lifted.y - low).toFixed(3));
    // (The map camera below asks on every call; the overlay asked once more on the first.)
    let grounds = 0;
    R.clearCameraGround = function(camera) { grounds++; camera.position.y -= 3; camera.updateMatrixWorld(); return true; };
    w.draw();
    assert.equal(grounds, 1, 'the second call of the tick asks nothing of its own');
    assert.deepEqual(w.pose(), lifted, 'and puts the camera back where the first call left it');
    R.clearCameraRoof = roof; R.clearCameraGround = ground;
    p._reactorAlt = 0;
    w.tick(1);
    // In the fixed views the overlay is one aim and nothing else; on foot it is nothing at all.
    w.$gameMap.setReactorCamera3D({ mode: 'isometric' }, 0, false);
    w.frame(2);
    asked.length = 0;
    w.plainCamera();
    const flat = names().length;
    w.tick(1);
    asked.length = 0;
    w.draw();
    assert.deepEqual(names().slice(flat), ['aimCamera'], 'isometric: one aim');
    asked.length = 0;
    w.draw();
    assert.equal(names().length, flat, 'and none when asked again on that tick');
    w.onFoot();
    for (let i = 0; i < 400; i++) { w.Graphics.frameCount++; w.draw(); }
    asked.length = 0;
    w.draw();
    assert.equal(names().length, flat, 'on foot: only what the wrappers below ask');
    // A ride that has not moved yet, in a fixed view: there is nothing to lay over, and the camera is not aimed again.
    w.board({ heading: 0, v: 0 });
    w.frame(3);
    asked.length = 0;
    w.frame(1);
    assert.equal(names().length, flat, 'standing aboard in a fixed view: only what the wrappers below ask');
});

test('the tick and the wrapper make no object: no literal, no closure, no constructor in what runs per tick or per call', () => {
    // The body of a function of the file, without its comments.
    const body = name => {
        const declared = feelSource.indexOf('function ' + name + '(');
        const from = declared >= 0 ? declared : feelSource.indexOf(name + ' = function(');
        assert.ok(from >= 0, name + ' is in the file');
        const start = feelSource.indexOf('{', feelSource.indexOf(')', from));
        let depth = 0, i = start;
        for (; i < feelSource.length; i++) {
            if (feelSource[i] === '{') depth++;
            else if (feelSource[i] === '}' && --depth === 0) break;
        }
        return feelSource.slice(start + 1, i).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    };
    const makesNothing = (name, text) => {
        assert.ok(!/\bnew\s/.test(text), name + ' constructs nothing');
        assert.ok(!/=>/.test(text) && !/\bfunction\s*[\w$]*\s*\(/.test(text), name + ' makes no closure');
        assert.ok(!/[=(,:?]\s*\{/.test(text) && !/return\s*\{/.test(text), name + ' has no object literal');
        assert.ok(!/[=(,:?]\s*\[/.test(text) && !/return\s*\[/.test(text), name + ' has no array literal');
        assert.ok(!/\.\.\.|Object\.assign|\.slice\(|\.map\(|\.filter\(|\.concat\(|JSON\./.test(text), name + ' copies nothing');
    };
    // Everything that runs on a tick aboard or on a camera call, by name.
    for (const name of ['arc', 'norm', 'step', 'stepOver', 'frame', 'world', 'lookOf', 'mapCamera', 'mapNow', 'battleHere', 'riddenEvent', 'headingOf', 'heightOf', 'handSpan', 'handClear', 'unclear',
        'swing', 'easeView', 'height', 'ashore', 'advance', 'Feel.advance', 'setFov', 'push', 'clear', 'lay', 'Feel.engineRate', 'Feel.engineVolume', 'soundName', 'audioNow', 'sendRate', 'sendVolume', 'engineRun']) {
        makesNothing(name, body(name));
    }
    const from = feelSource.indexOf('const wrapped = function(spriteset)');
    const wrapper = feelSource.slice(feelSource.indexOf('{', from) + 1, feelSource.indexOf('wrapped.__reactorVehiclesFeel = true'));
    assert.ok(wrapper.length > 200);
    makesNothing('the camera wrapper', wrapper.replace(/\/\/.*$/gm, ''));
    // The file never asks three.js for anything: no vector, no quaternion, no matrix of its own.
    assert.ok(!/THREE\./.test(feelSource));
});

test('what it costs: the tick, the first and the second camera call of a drawn tick, and the camera call on foot', t => {
    const w = world();
    w.look.yaw = 0;
    w.board({ heading: 0, v: 20 });
    w.frame(200, () => { w.$gamePlayer._rrDrive.yaw += 1 * DEG; });
    // Timed inside the game's own realm, so no call in the loop crosses a realm; the main thread's CPU time
    // (read once before and once after) in microseconds a round. `calls` camera calls after each tick.
    const timeIn = vm.runInContext(`(function(clock, update, spriteset, type, input, ticks, calls, rounds) {
        const player = $gamePlayer, Feel = ReactorVehicles.Feel, camera = Reactor3D.Camera;
        const from = clock();
        for (let i = 0; i < rounds; i++) {
            if (ticks) { Graphics.frameCount++; player._rrDrive.yaw += 0.0174; Feel.advance(player._rrDrive, type, input); }
            for (let c = 0; c < calls; c++) update.call(camera, spriteset);
        }
        return (clock() - from) / rounds;
    })`, w);
    const time = (...args) => timeIn(cpuMicros, ...args);
    const best = run => { run(3000); return Math.min(run(20000), run(20000), run(20000)); };
    const feel = w.Reactor3D.Camera.update;
    const advance = best(rounds => time(feel, w.spriteset, w.type, w.input, 1, 0, rounds));
    const below = best(rounds => time(w.below, w.spriteset, w.type, w.input, 0, 1, rounds));
    const first = best(rounds => time(feel, w.spriteset, w.type, w.input, 1, 1, rounds)) - advance - below;
    const second = best(rounds => time(feel, w.spriteset, w.type, w.input, 0, 1, rounds)) - below;
    w.onFoot();
    for (let i = 0; i < 400; i++) { w.Graphics.frameCount++; w.draw(); }
    assert.equal(w.cam.live, false);
    const foot = best(rounds => time(feel, w.spriteset, w.type, w.input, 0, 1, rounds)) - best(rounds => time(w.below, w.spriteset, w.type, w.input, 0, 1, rounds));
    console.log(`    vehicles-camera: advance ${advance.toFixed(3)} us a tick; the overlay ${first.toFixed(3)} us on the first camera call of a tick and `
        + `${second.toFixed(3)} us on the second (the three wrappers below it ${below.toFixed(3)} us a call); on foot ${foot.toFixed(3)} us over the same`);
    // Budgets on the desktop: a tick 2 us, the first call 8 us, the second 4 us (1.5, 5.5 and 2.5 measured alone; twice
    // that with the whole suite running beside it). Ten times the budget fails: a slow or busy machine passes, a
    // question to the world or an object made per call does not.
    withinBudget(t, advance, 20, 'advance: ' + advance.toFixed(3) + ' us');
    withinBudget(t, first, 80, 'the first call of a tick: ' + first.toFixed(3) + ' us');
    withinBudget(t, second, 40, 'the second: ' + second.toFixed(3) + ' us');
    // (A difference of two timings of 6 to 11 us each: the rule itself is pinned by the on-foot test's read count.)
    withinBudget(t, foot, 6, 'on foot the wrapper is a compare and a flag: ' + foot.toFixed(3) + ' us');
});
