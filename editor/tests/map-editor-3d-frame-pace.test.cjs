/**
 * How often the editor's 3D view draws. A change, the camera and a flight
 * draw on every refresh of the display; a picture that moves by itself at
 * the game's sixty a second however fast the display refreshes; a flickering
 * or pulsing light about twenty times a second, its flicker read off the
 * clock so it plays at the speed the game shows; a still view once a second.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const mapSource = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor3D.js'), 'utf8');
const lightingSource = fs.readFileSync(path.join(editorRoot, 'src', 'LightingManager.js'), 'utf8');
const MapLights = require(path.join(editorRoot, 'src', 'utils', 'MapLights.js'));

/** The view's own loop on a display refreshing `hz` times a second, for `seconds`: how many draws. */
function drawsAt(hz, seconds, setUp) {
    const frames = [];
    let clock = 0;
    const window = { reactor: {} };
    const MapEditor3D = vm.runInNewContext(`${mapSource}\nMapEditor3D;`, {
        console, window, performance: { now: () => clock },
        requestAnimationFrame(fn) { frames.push(fn); return frames.length; }, cancelAnimationFrame() {},
        document: { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [], getElementById: () => null },
        require, setTimeout, clearTimeout
    });
    const view = Object.create(MapEditor3D.prototype);
    view.flying = () => false;
    view.camera = { position: { x: 0, y: 1, z: 2 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
    view.hoverCell = { visible: true, position: { x: 3, y: 0, z: 4 } };
    view.enabled = true; view.frame = null;
    view.keepCanvasFilling = () => false; view.stepFly = () => {};
    view.mapScene = { _waterMeshes: [] };
    let draws = 0;
    view.render = () => { draws++; };
    setUp(view, window);
    view.startLoop();
    // Past the first draw and the tail after it: what the view does when nobody touches it.
    const step = 1000 / hz;
    for (let now = step; now < 1000; now += step) { clock = now; frames.shift()(now); }
    draws = 0;
    for (let now = 1000; now < 1000 + seconds * 1000; now += step) { clock = now; frames.shift()(now); }
    return draws / seconds;
}

/** Draws a second, give or take the one a window's edge cuts. */
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= 0.6, `${message || ''} ${actual} against ${expected}`);

test('a flickering light no longer keeps the view at the full rate: about twenty draws a second, at any refresh', () => {
    const lights = (view, window) => { window.reactor.lightingManager = { wants3DFrames: () => true }; };
    near(drawsAt(60, 4, lights), 20);
    assert.ok(Math.abs(drawsAt(144, 4, lights) - 20.5) < 1.5, 'every seventh refresh at 144 Hz');
    assert.ok(Math.abs(drawsAt(180, 4, lights) - 20) < 1.5, 'every ninth at 180 Hz');
    // A light a placed model carries is paced the same way.
    const carried = view => { view.effectPlays = [{ object: { parent: {} }, light: true, effect: { light: { pulse: { min: 0.2, max: 1, period: 90 } } } }]; };
    near(drawsAt(60, 4, carried), 20);
    // With nothing moving: the once-a-second safety net.
    near(drawsAt(60, 4, () => {}), 1);
});

test('what moves by itself draws at most sixty times a second; the display refresh is never exceeded', () => {
    const models = view => { view.modelsAnimate = () => true; };
    near(drawsAt(60, 2, models), 60, 'every refresh at 60 Hz');
    near(drawsAt(120, 2, models), 60, 'every second refresh at 120 Hz');
    near(drawsAt(144, 2, models), 72, 'every second at 144 Hz');
    near(drawsAt(180, 2, models), 60, 'every third at 180 Hz');
    near(drawsAt(30, 2, models), 30, 'a slower display: every refresh');
    for (const animate of [
        (view, window) => { view.projectController = { mediaSurfacePreviewManager: { previewActive: () => true } }; },
        view => { view.effectPlays = [{ object: { parent: {} }, quad: {}, layer: { active: true } }]; }
    ]) near(drawsAt(180, 2, animate), 60, 'media and effects alike');
    // A light and a moving model: the faster of the two.
    near(drawsAt(60, 2, (view, window) => { view.modelsAnimate = () => true; window.reactor.lightingManager = { wants3DFrames: () => true }; }), 60);
    // The camera turning, or a flight, draws on every refresh.
    let turn = 0;
    near(drawsAt(180, 2, view => { view.flying = () => true; }), 180);
    near(drawsAt(144, 2, view => { const camera = view.camera; Object.defineProperty(camera.quaternion, 'y', { get: () => (turn += 0.01) }); }), 144);
    // The rule itself.
    const MapEditor3D = vm.runInNewContext(`${mapSource}\nMapEditor3D;`, { console, window: {}, performance: { now: () => 0 }, document: { addEventListener() {}, removeEventListener() {} }, require });
    const should = MapEditor3D.shouldRender;
    assert.equal(should({ now: 1012, active: false, animating: true, lastRenderAt: 1000 }), true);
    assert.equal(should({ now: 1011, active: false, animating: true, lastRenderAt: 1000 }), false);
    assert.equal(should({ now: 1001, active: true, animating: true, lastRenderAt: 1000 }), true);
    assert.equal(should({ now: 1500, active: false, lastRenderAt: 1000 }), false, 'still: once a second');
});

test('an animated light\'s frame is read off the clock, at the game\'s sixty a second, however often the view draws', () => {
    const context = { document: { addEventListener() {}, removeEventListener() {} }, window: {}, RRMapLights: MapLights, console,
        requestAnimationFrame() { return 1; }, cancelAnimationFrame() {} };
    const set = [];
    context.Reactor3D = { extensionsLoaded: () => true, setAmbient() {}, setLights(lights) { set.push(lights); }, parseColour: () => 0xffffff };
    const Manager = vm.runInNewContext(`${lightingSource}\nLightingManager;`, context);
    const map = { id: 1, width: 20, height: 20, events: [], reactor3d: { version: 1, lights: [MapLights.normalize({ type: 'point', x: 2, y: 2, flicker: 0.6 }, 'light1')] } };
    const scene = { syncLights() {} };
    const manager = new Manager({ tilemapManager: { currentMap: map }, mapEditor3D: { isEnabled: () => true, mapScene: scene }, modelPropsManager: {} });
    manager._boundMap = map;
    manager.map = () => map;
    manager._update3DRing = () => {};
    // Drawn twenty times a second or sixty, the light at a moment is the same light.
    const at = now => { manager.feed3D(now); return [manager._frame, set.at(-1)[0].intensity]; };
    const slow = [0, 50, 100, 150, 1000].map(at);
    const fast = [0, 50, 100, 150, 1000].map(at);
    assert.deepEqual(slow, fast);
    assert.deepEqual(slow.map(entry => entry[0]), [0, 3, 6, 9, 60]);
    assert.notEqual(slow[0][1], slow[1][1], 'and it flickers');
    // Fed with no clock (a test, an old caller): a frame on from the last.
    manager.feed3D();
    assert.equal(manager._frame, 61);
    assert.match(mapSource, /window\.reactor\?\.lightingManager\?\.feed3D\?\.\(now\);/);
});
