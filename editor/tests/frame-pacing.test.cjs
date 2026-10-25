'use strict';
// On a screen 60 does not divide (144, 165, 100, 50 Hz) the game's 60 updates
// land on uneven refreshes and motion judders. Graphics.FramePacing draws the
// map on every k-th refresh, evenly, with the camera and the characters where
// they stand at that refresh's moment between the last two updates. The
// game's own updates and state are untouched. Driven here by a mocked series
// of refresh times through the real tick, update count and pacing code.
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { runtimeSource } = require('./helpers/runtime-source.cjs');

const core = runtimeSource('reactor_core.js'), managers = runtimeSource('reactor_managers.js');
const between = (source, from, to) => {
    const start = source.indexOf(from), end = source.indexOf(to, start);
    assert.ok(start >= 0 && end > start, 'found ' + from);
    return source.slice(start, end);
};

const vector = (x, y, z) => ({ x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; } });
const quaternion = () => ({ x: 0, y: 0, z: 0, w: 1, set(a, b, c, d) { this.x = a; this.y = b; this.z = c; this.w = d; return this; } });

/**
 * A map with the player walking east at `speed` tiles an update, its model
 * placed from `_realX` by the sync, and a camera following it; refreshed at
 * `hz` for `seconds`. Returns what each composite showed and when.
 */
function play(hz, { seconds = 4, speed = 0.0625, pacing = true, late = null, map3d = true } = {}) {
    let now = 0;
    const shown = [];
    const camera = { position: vector(0, 10, 10), quaternion: quaternion(), updateMatrixWorld() {} };
    const player = { _realX: 0, _realY: 5, _jumpCount: 0, _reactorAir: 0 };
    const model = { position: vector(0.5, 0, 5.5), matrixAutoUpdate: true };
    const scene = { _modelInstances: new Map([['p', { character: player, object: model }]]) };
    const state = map3d ? { viewport: { camera: () => camera }, scene } : null;
    let updatesRun = 0, worldDrawnInUpdate = 0;
    const tilemap = { origin: { x: 0, y: 0 } };
    const spriteset = {
        _reactor3d: state, _characterSprites: [], _tilemap: tilemap, _parallax: null,
        drawReactor3D() { shown.push({ t: now, model: model.position.x, camera: camera.position.x }); },
        // The final update's sync: places the model and aims the camera from the game's state.
        sync() {
            model.position.x = player._realX + 0.5;
            camera.position.x = player._realX;
            if (!Graphics.FramePacing.drawsWorld(this)) { worldDrawnInUpdate++; this.drawReactor3D(state); }
        }
    };
    function Scene_Map() {}
    const sceneObject = Object.assign(new Scene_Map(), { _spriteset: spriteset, isStarted: () => true });
    const $gameMap = {
        mapId: () => 5, _events: [], _vehicles: [], _displayX: 0, _displayY: 0,
        displayX() { return this._displayX; }, displayY() { return this._displayY; }, tileWidth: () => 48, tileHeight: () => 48
    };
    const composites = [];
    const app = { stage: { renderGroup: { childrenToUpdate: {}, renderGroupChildren: [] } }, renderer: {}, render() { composites.push(now); } };
    const Graphics = { _app: app, _fpsCounter: { startTick() {}, endTick() {} }, _canRender() { return true; }, _lastWatchdogSweep: Infinity, frameCount: 0 };
    const SceneManager = {
        _scene: sceneObject, _smoothDeltaTime: 1, _elapsedTime: 0, trueSpeed: true,
        isSceneChanging: () => false, catchException(e) { throw e; },
        updateInputData() {}, updateEffekseer() {}, changeScene() {},
        updateScene() {
            updatesRun++;
            player._realX += speed;
            $gameMap._displayX = player._realX - 8;
            if (this.isFinalUpdateOfFrame()) spriteset.sync();
            else { model.position.x = player._realX + 0.5; camera.position.x = player._realX; }
        }
    };
    const context = {
        Graphics, SceneManager, Scene_Map, $gameMap, $gamePlayer: player, PIXI: { __reactorFlushTextureUploads() {}, __reactorPendingTextureUploads: () => 0 },
        performance: { now: () => now }, console, Math, Float64Array, ReactorProfiler: { _active: false },
        window: { PIXI: null, Sprite_Animation: null }
    };
    vm.runInNewContext(between(core, 'Graphics._reactorBeforeRender = ', '\n//-----------------------------------------------------------------------------\n/**\n * The in-game frame profiler'), context);
    vm.runInNewContext(between(managers, 'SceneManager.update = function', 'SceneManager.terminate = function'), context);
    vm.runInNewContext(between(managers, 'SceneManager.updateMain = function', 'SceneManager.updateInputData = function'), context);
    Graphics.FramePacing.enabled = pacing;
    Graphics._tickHandler = dt => SceneManager.update(dt);
    const interval = 1000 / hz;
    let last = 0;
    for (let i = 1; now < seconds * 1000; i++) {
        now = i * interval;
        if (late && late(i)) now += interval;
        const dt = (now - last) / (1000 / 60);
        last = now;
        Graphics._onTick(dt);
        // Whatever the paced draw moved is back where the game put it.
        assert.equal(model.position.x, player._realX + 0.5, 'the model is the game\'s again after the composite');
        assert.equal(camera.position.x, player._realX);
    }
    return { shown, composites, updatesRun, worldDrawnInUpdate, player, Graphics };
}

/** Of the pictures from `from` ms on: the spread of speed between consecutive pictures, as a share of the mean. */
function judder(shown, from = 2500) {
    const s = shown.filter(p => p.t >= from);
    const speeds = [];
    for (let i = 1; i < s.length; i++) speeds.push((s[i].model - s[i - 1].model) / (s[i].t - s[i - 1].t));
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const spread = Math.sqrt(speeds.reduce((a, v) => a + (v - mean) ** 2, 0) / speeds.length);
    return { mean, spread: spread / mean, gaps: s.slice(1).map((p, i) => +(p.t - s[i].t).toFixed(2)) };
}

test('144 Hz: the map is drawn on every other refresh, evenly, and motion is even', () => {
    const before = play(144, { pacing: false });
    const after = play(144);
    const was = judder(before.shown), now = judder(after.shown);
    assert.ok(was.spread > 0.15, 'drawn on its updates, a walk judders (' + was.spread.toFixed(3) + ')');
    assert.ok(now.spread < 0.01, 'paced, it does not (' + now.spread.toFixed(4) + ')');
    assert.ok(now.gaps.every(g => Math.abs(g - 2000 / 144) < 0.01), 'a picture every other refresh: 72 a second');
    assert.equal(after.composites.filter(t => t >= 2500).length, after.shown.filter(p => p.t >= 2500).length, 'and the composite with it, nothing between');
    assert.ok(after.worldDrawnInUpdate < 100, 'the world drawn in an update only until the uneven updates are seen');
    // The game itself: the same updates, the same state.
    assert.equal(after.updatesRun, before.updatesRun);
    assert.equal(after.player._realX, before.player._realX);
    // Drawn a little under an update behind the game, never ahead of it.
    const speed = 0.0625 * 60 / 1000;
    for (const p of after.shown.filter(p => p.t >= 2500)) {
        const lag = (p.t * speed - (p.model - 0.5)) / speed;
        assert.ok(lag > 0 && lag <= 1000 / 60 + 0.5, 'drawn ' + lag.toFixed(2) + ' ms behind');
    }
});

test('165 and 100 Hz pace too; 50 Hz plays every refresh evenly', () => {
    for (const [hz, every] of [[165, 2], [100, 1], [50, 1], [75, 1]]) {
        const run = play(hz);
        const j = judder(run.shown);
        assert.ok(j.spread < 0.01, hz + ' Hz: even (' + j.spread.toFixed(4) + ')');
        assert.ok(j.gaps.every(g => Math.abs(g - every * 1000 / hz) < 0.01), hz + ' Hz: every ' + every);
        assert.equal(run.Graphics.FramePacing.every(), every);
    }
});

test('a screen 60 divides is drawn on its updates as before', () => {
    for (const hz of [60, 120, 180, 240]) {
        const run = play(hz);
        assert.equal(run.Graphics.FramePacing._active, false, hz + ' Hz is not paced');
        assert.ok(run.worldDrawnInUpdate > 0, hz + ' Hz draws in its updates');
        const j = judder(run.shown);
        assert.ok(j.spread < 0.01, hz + ' Hz is already even');
    }
});

test('a dropped frame does not rubber-band: the drawn place keeps to the clock', () => {
    // Every 37th refresh comes a refresh late (a GC pause, a busy frame).
    const run = play(144, { seconds: 4, late: i => i % 37 === 0 });
    const speed = 0.0625 * 60 / 1000;
    const s = run.shown.filter(p => p.t >= 2500);
    for (let i = 1; i < s.length; i++) assert.ok(s[i].model >= s[i - 1].model, 'never backwards');
    // A late refresh is drawn where the clock says (within an update of lag), not ahead of it or held back.
    for (const p of s) {
        const lag = (p.t * speed - (p.model - 0.5)) / speed;
        assert.ok(lag > -0.5 && lag <= 1000 / 60 + 1, 'lag ' + lag.toFixed(2) + ' ms');
    }
});

test('a 180 Hz screen whose frames take two refreshes (90 a second) is paced on every frame', () => {
    const before = play(90, { pacing: false }), after = play(90);
    assert.ok(judder(before.shown).spread > 0.15, 'its updates land 1, 1, 0: judder (' + judder(before.shown).spread.toFixed(3) + ')');
    const j = judder(after.shown);
    assert.ok(j.spread < 0.01, 'paced: even (' + j.spread.toFixed(4) + ')');
    assert.ok(j.gaps.every(g => Math.abs(g - 1000 / 90) < 0.01), 'a picture every frame');
});

test('60 Hz with a dropped frame now and then stays drawn in its updates', () => {
    const run = play(60, { seconds: 4, late: i => i % 50 === 0 });
    assert.equal(run.Graphics.FramePacing._paced, false);
    assert.equal(run.Graphics.FramePacing._active, false);
});

test('pacing comes on eased: no picture steps back when it starts', () => {
    const run = play(144, { seconds: 3 });
    const s = run.shown;
    for (let i = 1; i < s.length; i++) assert.ok(s[i].model >= s[i - 1].model, 'never backwards (' + i + ')');
    // Nor more than a third again of the even step forward, through the change.
    const step = 0.0625 * 60 / 1000;
    for (let i = 1; i < s.length; i++) assert.ok(s[i].model - s[i - 1].model <= (s[i].t - s[i - 1].t) * step * 1.35 + 1e-9, 'no lurch at ' + s[i].t.toFixed(1));
});

test('frames of one, two and three refreshes that average a tick keep the game on the clock', () => {
    // A 144 Hz screen whose frames take 1, 2 or 3 refreshes: on average about one 60 Hz tick.
    const managersPart = between(managers, 'SceneManager.trueSpeed = true;', 'SceneManager.terminate = function');
    const SceneManager = { _smoothDeltaTime: 1, _elapsedTime: 0 };
    new Function('SceneManager', managersPart.replace(/SceneManager\.update = [\s\S]*?\n\};\n/, ''))(SceneManager);
    const pattern = [2, 3, 2, 1, 3, 2, 3, 2, 2, 3, 1, 3];
    let time = 0, updates = 0, worst = 0;
    for (let i = 0; i < 2000; i++) {
        const dt = pattern[i % pattern.length] * 60 / 144;
        time += dt;
        updates += SceneManager.determineRepeatNumber(dt);
        worst = Math.max(worst, Math.abs(updates - time));
    }
    assert.ok(worst < 1.2, 'the updates keep within a tick of the clock (' + worst.toFixed(2) + ')');
});

test('a flat map scrolls its tilemap between updates and gives the scroll back', () => {
    const run = play(144, { map3d: false });
    assert.ok(run.composites.length > 0);
    assert.equal(run.Graphics.FramePacing._active, true);
});

test('the switch: off, a 144 Hz screen draws on its updates', () => {
    const run = play(144, { pacing: false });
    assert.equal(run.Graphics.FramePacing._active, false);
    assert.equal(run.composites.length, run.worldDrawnInUpdate + 1, 'a composite per update (and the first, before any)');
});

test('the hooks are where the frame runs', () => {
    assert.match(managers, /SceneManager\.updateMain = function\(\) \{\n[^\n]*\n\s+if \(Graphics\.FramePacing && Graphics\.FramePacing\._active\) Graphics\.FramePacing\.beforeUpdate\(\);\n\s+this\.updateFrameCount\(\);/);
    const sprites = runtimeSource('reactor_sprites.js');
    assert.match(sprites, /if \(typeof Graphics !== "undefined" && Graphics\.FramePacing && Graphics\.FramePacing\.drawsWorld\(this\)\) return;\n\s+if \(this\.reactor3DKeepsLastPicture\(state\)\) return;\n\s+this\.drawReactor3D\(state\);/);
});
