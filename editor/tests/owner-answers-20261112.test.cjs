/**
 * The runtime side of the owner's answers to the audits' questions (2026-11-12, "all as recommended"):
 * the splash screen, which system pictures are sharp, the stall watchdog and destroyed pictures, and the
 * Battle Camera option. Each runs the runtime's own code on small stand-ins; nothing is drawn.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { runtimeSource } = require('./helpers/runtime-source.cjs');

const runtime = name => fs.readFileSync(path.resolve(__dirname, '..', '..', 'runtime', name), 'utf8');
const between = (source, from, to) => { const a = source.indexOf(from), b = source.indexOf(to, a + 1); assert.ok(a >= 0 && b > a, from); return source.slice(a, b); };

test('Show Splash Screen shows img/system/Splash.png before the title, and a project without the picture goes straight on', () => {
    const scenes = runtime('reactor_scenes.js');
    const went = [], shown = [];
    let bitmap = { ready: false, error: false, isReady() { return this.ready; }, isError() { return this.error; } };
    const context = vm.createContext({
        $dataSystem: { optSplashScreen: true }, went,
        Scene_Base: function() {}, Scene_Title: function Scene_Title() {}, Sprite: function() { this.visible = true; },
        Bitmap: { load: url => { shown.push(url); return bitmap; } },
        SceneManager: { goto: scene => went.push(scene.name) },
        Input: { isTriggered: () => false }, TouchInput: { isTriggered: () => false }
    });
    vm.runInContext(`Object.assign(Scene_Base.prototype, { initialize() {}, create() {}, start() {}, update() {}, stop() {}, isReady() { return true; }, isActive() { return true; },
        addChild() {}, startFadeIn() {}, startFadeOut() {}, fadeSpeed() { return 24; }, scaleSprite() {}, centerSprite() {} });`, context);
    vm.runInContext(between(scenes, 'function Scene_Splash() {', '//-----------------------------------------------------------------------------\n// Scene_Title'), context);
    const play = () => vm.runInContext(`(() => { const scene = new Scene_Splash(); scene.initialize(); scene.create(); const waited = !scene.isReady(); return { scene, waited }; })()`, context);
    // The picture is there: the scene waits for it, holds two seconds, then goes to the title.
    let { scene, waited } = play();
    assert.deepEqual(shown, ['img/system/Splash.png']);
    assert.equal(waited, true, 'it waits for its picture');
    bitmap.ready = true;
    assert.equal(scene.isReady(), true);
    scene.start();
    for (let i = 0; i < 120; i++) scene.update();
    assert.deepEqual(went, [], 'held for 120 frames');
    scene.update();
    assert.deepEqual(went, ['Scene_Title']);
    // OK ends the hold.
    went.length = 0;
    ({ scene } = play());
    scene.start();
    context.Input.isTriggered = name => name === 'ok';
    scene.update(); scene.update();
    assert.deepEqual(went, ['Scene_Title']);
    context.Input.isTriggered = () => false;
    // No Splash.png: the load fails, nothing waits on it and the title comes at once.
    went.length = 0;
    bitmap = { isReady: () => false, isError: () => true };
    ({ scene, waited } = play());
    assert.equal(waited, false, 'a picture that failed is not waited for');
    scene.start();
    scene.update();
    assert.deepEqual(went, ['Scene_Title']);
    // The boot goes there only with the option on.
    assert.match(scenes, /SceneManager\.goto\(\$dataSystem\.optSplashScreen \? Scene_Splash : Scene_Title\);/);
});

test('in img/system only the named sheets are sharp; a whole picture there is smooth', () => {
    const managers = runtime('reactor_managers.js');
    const context = vm.createContext({ ImageManager: { _emptyBitmap: {}, loadBitmap: (folder, name) => ({ folder, name, smooth: true, addLoadListener() {} }) } });
    vm.runInContext(between(managers, 'const _setBitmapNearest = function(bitmap) {', 'ImageManager.loadEnemy = '), context);
    vm.runInContext(between(managers, 'ImageManager.SYSTEM_SHEETS = ', 'ImageManager.loadTileset = '), context);
    const smooth = name => context.ImageManager.loadSystem(name).smooth;
    for (const sheet of ['IconSet', 'Balloon', 'States', 'Weapons1', 'Weapons3', 'ButtonSet', 'Damage', 'Shadow1', 'Shadow2', 'iconset.png']) assert.equal(smooth(sheet), false, sheet);
    for (const picture of ['Window', 'GameOver', 'Splash', 'BattleHud_Panel', 'Loading']) assert.equal(smooth(picture), true, picture);
});

test('the stall watchdog stops watching a picture destroyed while it loads, and watches it again if it is loaded again', () => {
    const core = runtimeSource('reactor_core.js');
    const sweep = between(core, 'Bitmap._sweepStalledLoads = function() {', '\n};') + '\n};';
    const retried = [];
    const context = vm.createContext({ Bitmap: function() {}, performance: { now: () => 100000 }, console: { warn() {}, error() {} } });
    vm.runInContext(sweep, context);
    const make = extra => Object.assign({ _loadingState: 'loading', _loadStartTime: 1, _url: 'a.png', _startLoading() { retried.push(this); } }, extra);
    const kept = make({}), dropped = make({ _watchDropped: true });
    context.Bitmap._loadWatchList = [kept, dropped];
    context.Bitmap._sweepStalledLoads();
    assert.deepEqual(retried, [kept], 'only the one still wanted is retried');
    assert.deepEqual(context.Bitmap._loadWatchList, [kept]);
    assert.match(between(core, 'Bitmap.prototype.destroy = function() {', '\n};'), /this\._watchDropped = true;/);
    assert.match(between(core, 'Bitmap.prototype._startLoading = function() {', '\n};'), /this\._watchDropped = false;/);
});

test('Battle Camera is an option of a game being played, in a project whose battles use the camera, and steps Off, Some, Every', () => {
    const windows = runtime('reactor_windows.js');
    let level = 'some';
    const set = [];
    const context = vm.createContext({
        Window_Options: function() {},
        $dataSystem: { reactorBattle: {} }, $gameMap: { mapId: () => 3 },
        ReactorFight: {
            systemSettings: () => context.$dataSystem.reactorBattle || {},
            Camera: { LEVELS: ['off', 'some', 'every'], normalizeSettings: raw => ({ level: raw && raw.level || 'some' }), settings: () => ({ level }) },
            Director: { setLevel: next => { set.push(next); level = next; } }
        }
    });
    vm.runInContext(between(windows, 'Window_Options.CAMERA_TEXT = ', 'Window_Options.prototype.addVolumeOptions = '), context);
    const W = context.Window_Options;
    assert.equal(W.offersBattleCamera(), true);
    context.$gameMap = { mapId: () => 0 };
    assert.equal(W.offersBattleCamera(), false, 'not from the title: the choice is kept with a saved game');
    context.$gameMap = { mapId: () => 3 };
    context.$dataSystem = { reactorBattle: { cinematic: { level: 'off' } } };
    assert.equal(W.offersBattleCamera(), false, 'not where the project has the camera off');
    context.$dataSystem = {};
    assert.equal(W.offersBattleCamera(), false, 'not in a project with no battle settings');
    context.$dataSystem = { reactorBattle: {} };
    const window = Object.assign(new W(), { findSymbol: () => 0, redrawItem() {}, playCursorSound() {} });
    window.changeBattleCamera(true, false);
    window.changeBattleCamera(true, false);
    assert.deepEqual(set, ['every'], 'right stops at the last level');
    window.changeBattleCamera(true, true);
    window.changeBattleCamera(false, false);
    assert.deepEqual(set, ['every', 'off'], 'OK goes round; left stops at the first');
    // The scene counts its row, and the window reads and changes it on OK, right and left.
    assert.match(runtime('reactor_scenes.js'), /\+ \(Window_Options\.offersBattleCamera && Window_Options\.offersBattleCamera\(\) \? 1 : 0\);/);
    assert.equal((windows.match(/\} else if \(symbol === "battleCamera"\) \{\n\s+this\.changeBattleCamera\(/g) || []).length, 3);
    assert.match(windows, /return Window_Options\.CAMERA_TEXT\[ReactorFight\.Camera\.settings\(\)\.level\] \|\| "";/);
});
