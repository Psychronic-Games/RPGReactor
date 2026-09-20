const { source3D } = require('./helpers/runtime-3d-source.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

function loadGuard() {
    const listeners = { window: {}, document: {} };
    const document = {
        hidden: false,
        addEventListener(type, fn) { listeners.document[type] = fn; }
    };
    const window = {
        addEventListener(type, fn) { listeners.window[type] = fn; }
    };
    const context = { window, document, module: { exports: {} } };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(read('editor/src/utils/EffekseerStateGuard.js'), context, { filename: 'EffekseerStateGuard.js' });
    return { guard: context.RREffekseerStateGuard, listeners, document };
}

function fakeContext() {
    const ctx = { flags: [] };
    ctx.setRestorationOfStatesFlag = flag => ctx.flags.push(flag);
    return ctx;
}

test('a guarded context restores state on its first draw only, and again after focus or visibility returns', () => {
    const { guard, listeners, document } = loadGuard();
    const ctx = fakeContext();
    const canvasListeners = {};
    const canvas = { addEventListener(type, fn) { canvasListeners[type] = fn; } };

    assert.ok(guard.attach(ctx, canvas), 'attach returns the entry');
    assert.deepEqual(ctx.flags, [true], 'restoration is on until a draw has run with it');

    guard.settle(ctx);
    assert.deepEqual(ctx.flags, [true, false], 'the first draw turns it off');
    guard.settle(ctx);
    guard.settle(ctx);
    assert.deepEqual(ctx.flags, [true, false], 'later draws do not touch the flag at all');

    listeners.window.focus();
    assert.deepEqual(ctx.flags.slice(-1), [true], 'focus re-arms');
    guard.settle(ctx);
    assert.deepEqual(ctx.flags.slice(-1), [false]);

    document.hidden = true;
    listeners.document.visibilitychange();
    assert.deepEqual(ctx.flags.slice(-1), [false], 'going hidden re-arms nothing');
    document.hidden = false;
    listeners.document.visibilitychange();
    assert.deepEqual(ctx.flags.slice(-1), [true], 'coming back re-arms');
    guard.settle(ctx);

    canvasListeners.webglcontextrestored();
    assert.deepEqual(ctx.flags.slice(-1), [true], 'a restored context re-arms');
    guard.settle(ctx);

    guard.release(ctx);
    listeners.window.focus();
    assert.deepEqual(ctx.flags.slice(-1), [false], 'a released context is left alone');

    assert.equal(guard.attach(null), null);
    assert.doesNotThrow(() => guard.settle(null));
    assert.doesNotThrow(() => guard.settle({}));
});

test('every Effekseer context the editor owns outright is guarded, and the shared Animations-page context is not', () => {
    const guarded = [
        'editor/src/utils/AnimationPreviewLayer.js',
        'editor/src/database/AnimationPickerModal.js',
        'editor/src/event/AnimationPicker.js',
        'editor/src/forge/EffekseerGenerator/EffekseerGenerator.js'
    ];
    for (const file of guarded) {
        const source = read(file);
        assert.match(source, /RREffekseerStateGuard\.attach\(/, `${file} attaches the guard`);
        assert.match(source, /RREffekseerStateGuard\.settle\(/, `${file} settles after endDraw`);
        assert.equal((source.match(/setRestorationOfStatesFlag\(true\)/g) || []).length, 1,
            `${file} keeps the flag only as the no-guard fallback`);
    }
    const animations = read('editor/src/database/DatabaseAnimationEditor.js');
    // The page's main preview blits a Canvas2D scene into the same context
    // before each draw: that context stays fully restored. Its standalone
    // Effect File preview owns its context and is guarded.
    assert.match(animations, /Canvas2D scene blit before\s*\n\s*\/\/ each effect draw, so Effekseer must restore its GL state\.\s*\n\s*effekseerContext\.setRestorationOfStatesFlag\(true\);/);
    assert.match(animations, /RREffekseerStateGuard\.attach\(previewEffekseerContext, previewGL\.canvas\)/);
    assert.match(animations, /previewEffekseerContext\.endDraw\(\);\s*\n\s*if \(typeof RREffekseerStateGuard !== 'undefined'\) RREffekseerStateGuard\.settle\(previewEffekseerContext\);/);
    assert.match(read('editor/index.html'), /<script src="src\/utils\/EffekseerStateGuard\.js"><\/script>/);
});

test('the game overlay context follows the same policy through Graphics', () => {
    const core = read('runtime/reactor_core.js');
    assert.match(core, /this\._effekseer\.init\(efxGL\);\s*\n(?:\s*\/\/.*\n)*\s*this\.rearmEffekseerState\(\);\s*\n\s*this\._listenEffekseerStateResets\(\);/);
    assert.match(core, /Graphics\.settleEffekseerState = function\(\) \{\s*\n\s*if \(!this\._effekseerRestorePending \|\| !this\._effekseer\) return;/);
    assert.match(core, /window\.addEventListener\("focus", \(\) => this\.rearmEffekseerState\(\)\);/);
    assert.doesNotMatch(core, /this\._effekseer\.setRestorationOfStatesFlag\(true\);\s*\n\s*\}\s*\n\s*\} catch/, 'the flag is no longer pinned on at creation');
    const sprites = read('runtime/reactor_sprites.js');
    assert.equal((sprites.match(/Graphics\.effekseer\.endDraw\(\);\s*\n\s*Graphics\.settleEffekseerState\(\);/g) || []).length, 2,
        'both Sprite_Animation draw paths settle after endDraw');
    assert.match(source3D(), /efx\.endDraw\(\);\s*\n\s*if \(typeof Graphics !== "undefined" && Graphics\.settleEffekseerState\) Graphics\.settleEffekseerState\(\);/);
    assert.match(read('runtime/reactor_main.js'), /runtime revision: \d{8}\.\d+/);
});

test('the editor lights pass draws nothing but the light group', () => {
    const source = read('editor/src/MapEditor3D.js');
    const start = source.indexOf('renderLightsPass(scene) {');
    const body = source.slice(start, source.indexOf('animateAutotiles(now)', start));
    assert.match(body, /const lightGroup = typeof mapScene\.lightGroup === 'function' \? mapScene\.lightGroup\(\) : null;/);
    assert.match(body, /for \(const child of scene\.children\) \{\s*\n\s*if \(child === lightGroup \|\| !child\.visible\) continue;\s*\n\s*child\.visible = false;/);
    assert.match(body, /for \(const child of hidden\) child\.visible = true;/);
});

test('room pictures carry mipmaps; tile atlases still do not', () => {
    const source = source3D();
    const room = source.indexOf('Reactor3D.MapScene.prototype.addRoomPiece');
    const roomBody = source.slice(room, source.indexOf('Reactor3D.MapScene.prototype.', room + 10));
    assert.match(roomBody, /texture\.generateMipmaps = true;\s*\n\s*texture\.minFilter = THREE\.LinearMipmapLinearFilter;/);
    const atlas = source.indexOf('Reactor3D.MapScene.prototype.textureFor');
    const atlasBody = source.slice(atlas, source.indexOf('Reactor3D.MapScene.prototype.', atlas + 10));
    assert.match(atlasBody, /texture\.generateMipmaps = false;/);
});

test('i18n text passes write only what changed, so the observer cannot feed itself', () => {
    const source = read('editor/src/I18nManager.js');
    assert.match(source, /if \(stored !== source\) el\.setAttribute\('data-i18n-text-source', source\);\s*\n\s*if \(el\.textContent !== wanted\) el\.textContent = wanted;/);
    assert.match(source, /if \(el\.getAttribute\('placeholder'\) !== wanted\) el\.setAttribute\('placeholder', wanted\);/);
    assert.doesNotMatch(source, /el\.textContent = this\.language === 'en' \? source : translated;/);
});

test('a video surface preview recompiles its material only when its blend state changes', () => {
    const source = read('editor/src/MediaSurfacePreviewManager.js');
    assert.match(source, /if \(owner\.material\.transparent !== transparent \|\| owner\.material\.depthWrite !== depthWrite\) \{\s*\n\s*owner\.material\.transparent = transparent;\s*\n\s*owner\.material\.depthWrite = depthWrite;\s*\n\s*owner\.material\.needsUpdate = true;/);
});
