'use strict';
// Game logic stays at 60 updates while Graphics.FramePacing draws on every
// available refresh, with camera, characters and articulated models where
// they stand at that refresh's moment between the last two updates. The
// game's own updates and state are untouched. Driven here by a mocked series
// of refresh times through the real tick, update count and pacing code.
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { runtimeSource } = require('./helpers/runtime-source.cjs');

const core = runtimeSource('reactor_core.js'), managers = runtimeSource('reactor_managers.js'), fx = runtimeSource('reactor_screen_fx.js');
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
function play(hz, { seconds = 4, speed = 0.0625, pacing = true, late = null, map3d = true, panorama = false, throwRenderAt = null, fovStep = 0, initiallyFrozen = false } = {}) {
    let now = 0;
    const shown = [];
    const camera = { position: vector(0, 10, 10), quaternion: quaternion(), fov: 45, updateProjectionMatrix() {}, updateMatrixWorld() {} };
    const player = { _realX: 0, _realY: 5, _jumpCount: 0, _reactorAir: 0 };
    const bone = { position: vector(0, 1, 0), quaternion: quaternion(), scale: vector(1, 1, 1), matrixAutoUpdate: true };
    const model = { position: vector(0.5, 0, 5.5), matrixAutoUpdate: !initiallyFrozen, traverse(fn) { fn(this); fn(bone); } };
    const scene = { _modelInstances: new Map([['p', { character: player, object: model }]]) };
    const state = map3d ? { viewport: { camera: () => camera }, scene } : null;
    let updatesRun = 0, worldDrawnInUpdate = 0;
    const tilemap = { origin: { x: 0, y: 0 } };
    const spriteset = {
        _reactor3d: state, _characterSprites: [], _tilemap: tilemap,
        _parallax: panorama ? { bitmap: { width: 1920, height: 1440, isReady: () => true }, origin: { x: 0, y: 0 } } : null,
        drawReactor3D() { shown.push({ t: now, model: model.position.x, camera: camera.position.x, fov: camera.fov, bone: 2 * Math.atan2(bone.quaternion.z, bone.quaternion.w) }); },
        // The final update's sync: places the model and aims the camera from the game's state.
        sync() {
            model.matrixAutoUpdate = true;
            model.position.x = player._realX + 0.5;
            const angle = updatesRun * .002;
            bone.quaternion.set(0, 0, Math.sin(angle / 2), Math.cos(angle / 2));
            camera.position.x = player._realX;
            camera.fov = 45 + updatesRun * fovStep;
            if (!Graphics.FramePacing.drawsWorld(this)) { worldDrawnInUpdate++; this.drawReactor3D(state); }
        }
    };
    function Scene_Map() {}
    const sceneObject = Object.assign(new Scene_Map(), { _spriteset: spriteset, isStarted: () => true });
    const $gameMap = {
        mapId: () => 5, _events: [], _vehicles: [], _displayX: 0, _displayY: 0,
        displayX() { return this._displayX; }, displayY() { return this._displayY; }, tileWidth: () => 48, tileHeight: () => 48,
        width: () => 40, height: () => 30, isLoopHorizontal: () => false, isLoopVertical: () => false,
        _parallaxX: 0, _parallaxY: 0, parallaxOx: () => 0, parallaxOy: () => 0
    };
    const composites = [];
    let renderFailure = false;
    const app = { stage: { renderGroup: { childrenToUpdate: {}, renderGroupChildren: [] } }, renderer: {}, render() {
        composites.push(now);
        if (throwRenderAt !== null && now >= throwRenderAt) throw Error('intentional composite failure');
        if (spriteset._parallax) panoramas.push({ t: now, display: tilemap.origin.x / 48, origin: spriteset._parallax.origin.x });
    } };
    const panoramas = [];
    const Graphics = { width: 960, height: 720, _app: app, _fpsCounter: { startTick() {}, endTick() {} }, _canRender() { return true; }, _lastWatchdogSweep: Infinity, frameCount: 0 };
    const SceneManager = {
        _scene: sceneObject, _smoothDeltaTime: 1, _elapsedTime: 0, trueSpeed: true,
        isSceneChanging: () => false, catchException(e) { throw e; },
        updateInputData() {}, updateEffekseer() {}, changeScene() {},
        updateScene() {
            updatesRun++;
            player._realX += speed;
            $gameMap._displayX = player._realX - 8;
            if (this.isFinalUpdateOfFrame()) spriteset.sync();
            else { camera.position.x = player._realX; camera.fov = 45 + updatesRun * fovStep; }
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
    if (panorama) {
        // The 2000/2003 panorama placement, run as the runtime runs it.
        function Game_Map() {}
        function Spriteset_Map() {}
        Object.assign(context, { Game_Map, Spriteset_Map, $dataSystem: { rrLegacyParallax: true }, ImageManager: { loadParallax: () => spriteset._parallax.bitmap } });
        vm.runInNewContext(between(fx, '    const legacyPanorama =', '    // A loaded save or a re-entered map scene'), context);
        spriteset.rrPlaceLegacyParallax = Spriteset_Map.prototype.rrPlaceLegacyParallax;
    }
    Graphics.FramePacing.enabled = pacing;
    Graphics._tickHandler = dt => SceneManager.update(dt);
    const interval = 1000 / hz;
    let last = 0;
    for (let i = 1; now < seconds * 1000; i++) {
        now = i * interval;
        if (late && late(i)) now += interval;
        const dt = (now - last) / (1000 / 60);
        last = now;
        try { Graphics._onTick(dt); } catch (error) {
            if (throwRenderAt === null || error.message !== 'intentional composite failure') throw error;
            renderFailure = true;
        }
        // Whatever the paced draw moved is back where the game put it.
        assert.equal(model.position.x, player._realX + 0.5, 'the model is the game\'s again after the composite');
        assert.equal(camera.position.x, player._realX);
        assert.equal(camera.fov, 45 + updatesRun * fovStep, 'render restores the camera projection');
        assert.ok(Math.abs(2 * Math.atan2(bone.quaternion.z, bone.quaternion.w) - updatesRun * .002) < 1e-12, 'render interpolation never changes the game pose');
        if (renderFailure) break;
    }
    return { shown, composites, panoramas, renderFailure, updatesRun, worldDrawnInUpdate, player, Graphics };
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

test('144 Hz: every refresh draws an interpolated position, with unchanged game timing', () => {
    const before = play(144, { pacing: false });
    const after = play(144);
    const was = judder(before.shown), now = judder(after.shown);
    assert.ok(was.spread > 0.15, 'drawn on its updates, a walk judders (' + was.spread.toFixed(3) + ')');
    assert.ok(now.spread < 0.01, 'paced, it does not (' + now.spread.toFixed(4) + ')');
    assert.ok(now.gaps.every(g => Math.abs(g - 1000 / 144) < 0.01), 'a new picture on every refresh: 144 a second');
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
    for (const [hz, every] of [[165, 1], [100, 1], [50, 1], [75, 1]]) {
        const run = play(hz);
        const j = judder(run.shown);
        assert.ok(j.spread < 0.01, hz + ' Hz: even (' + j.spread.toFixed(4) + ')');
        assert.ok(j.gaps.every(g => Math.abs(g - every * 1000 / hz) < 0.01), hz + ' Hz: every ' + every);
    }
});

test('120, 180 and 240 Hz show new positions every refresh while game speed stays at 60 updates', () => {
    for (const hz of [120, 180, 240]) {
        const run = play(hz), baseline = play(hz, { pacing: false });
        assert.equal(run.Graphics.FramePacing._active, true, hz + ' Hz interpolates');
        const j = judder(run.shown);
        assert.ok(j.spread < 0.01, hz + ' Hz has even movement');
        assert.ok(j.gaps.every(g => Math.abs(g - 1000 / hz) < 0.01), hz + ' new pictures per second');
        assert.equal(run.updatesRun, baseline.updatesRun);
        assert.equal(run.player._realX, baseline.player._realX);
    }
    assert.equal(play(60).Graphics.FramePacing._active, false, '60 Hz needs no intermediate pictures');
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

test('144 Hz, a 2D map with a 2000/2003 panorama: every picture shows the panorama where the camera is', () => {
    // Sunset over Imdahl's town square: a map-sized panorama that follows the camera. The paced
    // pictures between updates put it at its top-left corner, a flash and a snap back.
    const run = play(144, { map3d: false, panorama: true, speed: 0.05 });
    const walking = run.panoramas.filter(p => p.t >= 2500);
    assert.ok(walking.length > 100);
    assert.ok(walking.some(p => Math.abs(p.display / 0.05 - Math.round(p.display / 0.05)) > 0.01), 'pictures between updates were drawn');
    for (const p of walking) assert.equal(p.origin, Math.floor(48 * p.display), 'panorama at ' + p.origin + ' for a camera at ' + p.display);
});

test('180 Hz interpolates skeletal animation, not just root position and camera', () => {
    const run = play(180), pictures = run.shown.filter(p => p.t > 2500);
    for (let i = 1; i < pictures.length; i++) {
        const step = pictures[i].bone - pictures[i - 1].bone;
        assert.ok(Math.abs(step - .002 / 3) < 1e-8, 'each refresh has an intermediate bone pose');
    }
});

test('F2 reports new pictures rather than callbacks, including a retained 30 Hz world', () => {
    let now = 0;
    const Graphics = {};
    vm.runInNewContext(between(core, 'Graphics.FPSCounter = function()', 'Graphics.FPSCounter.prototype.switchMode'), { Graphics, performance: { now: () => now }, Math });
    Graphics.FPSCounter.prototype._createElements = function() {};
    Graphics.FPSCounter.prototype._update = function() {};
    for (const every of [1, 3, 6]) {
        now = 0;
        const fps = new Graphics.FPSCounter();
        for (let i = 1; i <= 360; i++) {
            now = i * 1000 / 180;
            fps.startTick(); fps.endTick(i % every === 0);
        }
        assert.ok(Math.abs(fps.fps - 180 / every) < 2, '180 callbacks with one picture per ' + every + ': ' + fps.fps);
        for (let i = 1; i <= 120; i++) { now += 1000 / 180; fps.startTick(); fps.endTick(false); }
        assert.equal(fps.fps, 0, 'callbacks without pictures do not sustain a high FPS reading');
    }
});

test('a failed composite restores interpolated roots, bones and camera before control returns', () => {
    assert.equal(play(180, { throwRenderAt: 1500 }).renderFailure, true);
});

test('50 Hz catch-up interpolates model poses across their actual update span', () => {
    const run = play(50), baseline = play(50, { pacing: false });
    assert.ok(judder(run.shown).spread < .01, 'model movement stays even when some frames run two logic updates');
    assert.equal(run.updatesRun, baseline.updatesRun);
    assert.equal(run.player._realX, baseline.player._realX);
});

test('motorcycle acceleration FOV interpolates with the camera even when only the projection changes', () => {
    const run = play(180, { speed: 0, fovStep: .005 });
    const pictures = run.shown.filter(p => p.t > 2500);
    for (let i = 1; i < pictures.length; i++) assert.ok(Math.abs(pictures[i].fov - pictures[i - 1].fov - .005 / 3) < 1e-8);
    assert.equal(play(180, { speed: 0, fovStep: .005, throwRenderAt: 1500 }).renderFailure, true);
});

test('a parked motorcycle thawing its root joins interpolation without a hierarchy change', () => {
    const run = play(180, { initiallyFrozen: true });
    assert.ok(judder(run.shown).spread < .01, 'the moving root advances between logic updates after thawing');
    for (const picture of run.shown.filter(p => p.t > 2500)) assert.ok(Math.abs(picture.model - picture.camera - .5) < 1e-8, 'bike and following camera stay in step');
});

test('over a border crossed without a break the pacing stands as it was; any other break eases it in again', () => {
    // Eased in from nothing after a crossing, the entered map's first frames drew each update's own moment, up to an
    // update ahead, and slid back over half a second (Open Road, 2026-11-07).
    const method = name => between(core, '    ' + name + '(', '\n    },') + '\n    }';
    const context = { Graphics: { frameCount: 10 }, Reactor3D: { Neighbors: { crossing: { from: 9, to: 10 } } } };
    vm.createContext(context);
    const P = vm.runInContext('({' + method('crossing') + ',' + method('begin') + '})', context);
    Object.assign(P, { EASE_FRAMES: 30, _ease: 30, _paced: true, _poses: [], _poseRoots: [], _chars: [], noteInterval() {}, allowed: () => false });
    P.begin(0);
    assert.equal(P._active, false, 'nothing is drawn paced while the scene changes');
    assert.equal(P._ease, 30, 'and the pacing is kept for the map entered');
    context.Reactor3D.Neighbors.crossing = null;
    P.begin(0);
    assert.equal(P._ease, 0, 'a transfer with a fade starts again from nothing');
});

test('a frame steps by the clock it is shown by, not the callback timestamp; a long gap keeps the capped step', () => {
    // Uncapped, the callback's timestamps bunched and spread: the place drawn between updates wandered from the time
    // it was shown at, and a fast camera turn jittered by up to 0.4 degrees (owner's screen, 2026-11-07).
    let now = 1000;
    const context = { performance: { now: () => now }, Graphics: {} };
    vm.createContext(context);
    vm.runInContext(between(core, 'Graphics.REAL_CLOCK = true;', '\nGraphics._onTick = function'), context);
    const G = context.Graphics;
    assert.equal(G.realClockDelta(0.3), 0.3, 'the first frame: nothing to measure from');
    now += 1000 / 120;
    assert.ok(Math.abs(G.realClockDelta(0.05) - 0.5) < 1e-9, 'half an update, as shown, whatever the callback said');
    now += 500;
    assert.equal(G.realClockDelta(6), 6, 'a long gap: the capped step');
    G.REAL_CLOCK = false;
    now += 10;
    assert.equal(G.realClockDelta(0.42), 0.42, 'switched off');
});
