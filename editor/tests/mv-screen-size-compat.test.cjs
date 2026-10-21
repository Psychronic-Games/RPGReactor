const assert = require('node:assert/strict');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const compat = fs.readFileSync(
    path.join(repoRoot, 'runtime', 'reactor_mv_compat.js'), 'utf8');

function slice(name) {
    const start = compat.indexOf(`    function ${name}() {`);
    const end = compat.indexOf('\n    function ', start + 1);
    assert.ok(start >= 0 && end > start, `${name} is locatable`);
    return compat.slice(start, end) + `\n${name}();`;
}

function bootSandbox({ mv, screen, box }) {
    const advanced = { screenWidth: 816, screenHeight: 624, uiAreaWidth: 816, uiAreaHeight: 624 };
    const calls = [];
    function Scene_Boot() {}
    Scene_Boot.prototype.resizeScreen = function() { calls.push('resize'); this.adjustBoxSize(); };
    Scene_Boot.prototype.adjustBoxSize = function() {
        Graphics.boxWidth = advanced.uiAreaWidth - 8;
        Graphics.boxHeight = advanced.uiAreaHeight - 8;
    };
    const Graphics = {};
    const SceneManager = {};
    if (screen) { SceneManager._screenWidth = screen[0]; SceneManager._screenHeight = screen[1]; }
    if (box) { SceneManager._boxWidth = box[0]; SceneManager._boxHeight = box[1]; }
    const global = { Scene_Boot, $dataSystem: { advanced } };
    vm.runInNewContext(slice('installBoxSizeCompatibility'), {
        global, Scene_Boot, Graphics, SceneManager, $dataSystem: global.$dataSystem,
        mvGameSemantics: mv, Number
    });
    new Scene_Boot().resizeScreen();
    return { advanced, Graphics, calls };
}

test('an MV game takes the screen size a plugin set, as MV itself did', () => {
    const { advanced, Graphics, calls } = bootSandbox({ mv: true, screen: [1280, 720], box: [1280, 720] });
    assert.deepEqual(calls, ['resize'], 'the original boot still runs, once');
    assert.equal(advanced.screenWidth, 1280);
    assert.equal(advanced.screenHeight, 720);
    assert.equal(advanced.uiAreaWidth, 1280);
    assert.equal(Graphics.boxWidth, 1280, 'the box is the plugin box, not the MZ margin');
    assert.equal(Graphics.boxHeight, 720);
});

test('an MV game without a plugin-set size keeps the data it has', () => {
    const { advanced, Graphics } = bootSandbox({ mv: true });
    assert.equal(advanced.screenWidth, 816);
    assert.equal(advanced.uiAreaHeight, 624);
    assert.equal(Graphics.boxWidth, 808);
});

test('an MZ game keeps its authored screen size even if a plugin sets one', () => {
    const { advanced } = bootSandbox({ mv: false, screen: [1280, 720] });
    assert.equal(advanced.screenWidth, 816);
    assert.equal(advanced.screenHeight, 624);
});

test('a nonsense plugin size is ignored', () => {
    const { advanced } = bootSandbox({ mv: true, screen: [NaN, 0] });
    assert.equal(advanced.screenWidth, 816);
});

test('the MV F2 name reaches the MZ FPS counter toggle', () => {
    const Graphics = { _switchFPSCounter() { this.toggled = (this.toggled || 0) + 1; } };
    vm.runInNewContext(slice('installGraphicsCompatibility'), { global: { Graphics }, Graphics });
    assert.equal(typeof Graphics._switchFPSMeter, 'function');
    Graphics._switchFPSMeter();
    assert.equal(Graphics.toggled, 1);
    assert.equal(typeof Graphics.showFps, 'function', 'the older gap-fills are still installed');
});

test('a plugin that defined its own FPS meter toggle keeps it', () => {
    const own = () => {};
    const Graphics = { _switchFPSMeter: own, _switchFPSCounter() {} };
    vm.runInNewContext(slice('installGraphicsCompatibility'), { global: { Graphics }, Graphics });
    assert.equal(Graphics._switchFPSMeter, own);
});

test('the scaling report never draws on screen', () => {
    const core = runtimeSource('reactor_core.js');
    assert.doesNotMatch(core, /_showScalingToast|rrScalingToast/);
    assert.match(core, /console\.debug\(report\)/, 'the line stays reachable at debug level');
});

test('the 3D update wrappers never look their base up on `this`', () => {
    // LeTBS's Sprite_TBSAnimation is a Sprite_Animation that the compat
    // layer routes through Sprite_AnimationMV.update; that instance has no
    // _reactor3dBaseUpdate of its own, so the wrapper must hold it itself.
    const sprites = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.doesNotMatch(sprites, /this\._reactor3dBaseUpdate\(/);
    assert.match(sprites, /Sprite_AnimationMV\.prototype\._reactor3dBaseUpdate\.call\(this\)/);
    assert.match(sprites, /Sprite_Character\.prototype\._reactor3dBaseUpdate\.call\(this\)/);
});

test('MV row scrolling on selectable windows: scrollUp, scrollDown, updateCursor', () => {
    const start = compat.indexOf('        // ---- Window_Selectable MV scroll/sound API ----');
    const end = compat.indexOf('        // ---- MV gauge/color API on Window_Base', start);
    assert.ok(start >= 0 && end > start);
    const WS = {
        _top: 3, topRow() { return this._top; }, setTopRow(row) { this._top = row; },
        maxRows() { return 5; }, maxPageRows() { return 2; }, row() { return 3; }, refreshed: 0, refreshCursor() { this.refreshed++; }
    };
    const defs = [];
    vm.runInNewContext(compat.slice(start, end), {
        global: { Window_Selectable: { prototype: WS } }, Window_Selectable: { prototype: WS },
        SoundManager: {}, TouchInput: {},
        def: (target, name, fn) => { if (!target[name]) target[name] = fn; defs.push(name); }
    });
    assert.ok(defs.includes('scrollUp') && defs.includes('scrollDown') && defs.includes('updateCursor'));
    WS.scrollDown(); assert.equal(WS._top, 4);
    WS.scrollDown(); assert.equal(WS._top, 4, 'stops at the last row');
    WS.scrollUp(); WS.scrollUp(); WS.scrollUp(); WS.scrollUp(); WS.scrollUp();
    assert.equal(WS._top, 0, 'stops at the top');
    WS.updateCursor(); assert.equal(WS.refreshed, 1);
});
