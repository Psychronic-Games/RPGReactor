/**
 * A WebGL context lost and restored (a GPU reset, a driver update, sleep, a
 * crashed GPU process) must come back whole. Found by losing and restoring
 * the contexts in a running Demo: the 3D map stayed black (PIXI kept sampling
 * three's dead pass textures), window text vanished (the upload guard read a
 * null MAX_TEXTURE_SIZE and shrank every canvas drawn during the loss to 1x1),
 * the Effekseer overlay never came back (nothing accepted its loss), an effect
 * playing at the loss called into a freed native context, and a battle room
 * carried across the restore drew part of its world wrong.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { runtimeSource } = require('./helpers/runtime-source.cjs');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(repoRoot, file), 'utf8');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

/** The dimension guard pixi_compat installs over v8's onSourceUpdate, as a callable. */
function uploadGuard(renderer, original) {
    const compat = read('runtime/libs/pixi_compat.js');
    const start = compat.indexOf('renderer.texture.onSourceUpdate = function(source) {');
    const end = compat.indexOf('renderer.texture.onSourceUpdate.__compatDimensionGuard = true;', start);
    const body = compat.slice(start + 'renderer.texture.onSourceUpdate = function(source) {'.length, end).trim().replace(/\};\s*$/, '');
    return new Function('renderer', 'originalOnSourceUpdate', `return function(source) {${body}};`)(renderer, original);
}

function canvasSource(width, height) {
    const resized = [];
    return { resized, uploadMethodId: 'image', resource: { width, height }, pixelWidth: width, pixelHeight: height,
        resize(w, h) { resized.push([w, h]); this.pixelWidth = w; this.pixelHeight = h; } };
}

test('a canvas updated while the context is lost is neither shrunk nor uploaded', () => {
    const uploads = [];
    const lostGl = { MAX_TEXTURE_SIZE: 3379, isContextLost: () => true, getParameter: () => null };
    const guard = uploadGuard({ gl: lostGl }, source => uploads.push(source));
    const source = canvasSource(1190, 340);
    guard(source);
    assert.deepEqual(source.resized, [], 'a null limit made every canvas look oversized');
    assert.equal(uploads.length, 0, 'PIXI uploads every source again once the context is back');

    // A live context that answers the limit with nothing does not shrink either.
    const quietGl = { MAX_TEXTURE_SIZE: 3379, isContextLost: () => false, getParameter: () => null };
    const live = canvasSource(1190, 340);
    uploadGuard({ gl: quietGl }, s => uploads.push(s))(live);
    assert.deepEqual(live.resized, []);
    assert.equal(uploads.length, 1);

    // The guard still clamps a genuinely oversized source.
    const smallGl = { MAX_TEXTURE_SIZE: 3379, isContextLost: () => false, getParameter: () => 1024 };
    const huge = canvasSource(4096, 64);
    uploadGuard({ gl: smallGl }, () => {})(huge);
    assert.deepEqual(huge.resized, [[1024, 64]]);
});

test('a restored context rebuilds the 3D passes, the shadow rows and the effect contexts, in order', () => {
    const saved = { viewport: Reactor3D._viewport, Shadows: Reactor3D.Shadows, EffekseerScene: Reactor3D.EffekseerScene,
        GpuEffects: Reactor3D.GpuEffects, handlers: Reactor3D.contextRestoredHandlers.slice(), generation: Reactor3D.contextGeneration };
    const order = [];
    try {
        const viewport = { _generation: 3, isShared: () => true, _disposeTargets() { order.push('passes'); } };
        const sceneA = {}, sceneB = {};
        Reactor3D._viewport = viewport;
        Reactor3D.Shadows = { disposeSlots() { order.push('shadows'); } };
        Reactor3D.EffekseerScene = { _live: [{ scene: sceneA }, { scene: sceneA }, { scene: sceneB }],
            stopScene(scene) { order.push(scene === sceneA ? 'stop A' : 'stop B'); } };
        const entry = {};
        Reactor3D.GpuEffects = { _runtime: new Map([[{}, entry]]), release(e) { assert.equal(e, entry); order.push('release'); } };
        Reactor3D.contextRestoredHandlers.length = 0;
        Reactor3D.contextRestoredHandlers.push(() => order.push('handler'), () => { throw new Error('one handler failing'); }, () => order.push('next handler'));
        const before = Reactor3D.contextGeneration;
        const errors = [];
        const error = console.error;
        console.error = (...args) => errors.push(args.join(' '));
        try { Reactor3D.onContextRestored(); } finally { console.error = error; }
        assert.equal(Reactor3D.contextGeneration, before + 1);
        assert.equal(viewport._generation, 4, 'the pass sprites rebuild off the viewport generation');
        // Effects end while their native contexts are alive; releasing first left a
        // playing handle calling into freed memory (a WASM signature mismatch).
        assert.deepEqual(order, ['passes', 'shadows', 'stop A', 'stop B', 'release', 'handler', 'next handler']);
        assert.equal(errors.length, 1, 'a failing handler is reported and the rest still run');
    } finally {
        Reactor3D._viewport = saved.viewport;
        Reactor3D.Shadows = saved.Shadows;
        Reactor3D.EffekseerScene = saved.EffekseerScene;
        Reactor3D.GpuEffects = saved.GpuEffects;
        Reactor3D.contextRestoredHandlers.length = 0;
        Reactor3D.contextRestoredHandlers.push(...saved.handlers);
        Reactor3D.contextGeneration = saved.generation;
    }
});

test('the game canvas is watched once, when the shared viewport takes its context', () => {
    const saved = Reactor3D.onContextRestored;
    let restored = 0;
    Reactor3D.onContextRestored = () => { restored++; };
    try {
        const canvas = new EventTarget();
        Reactor3D.watchContextRestore(canvas);
        Reactor3D.watchContextRestore(canvas);
        canvas.dispatchEvent(new Event('webglcontextrestored'));
        assert.equal(restored, 1);
        Reactor3D.watchContextRestore(null);
    } finally {
        Reactor3D.onContextRestored = saved;
    }
    const core = read('runtime/reactor_3d.js');
    const shared = core.slice(core.indexOf('Reactor3D.Viewport.prototype._initializeShared = function'), core.indexOf('Reactor3D.contextGeneration = 0;'));
    assert.match(shared, /Reactor3D\.watchContextRestore\(pixi\.canvas \|\| Graphics\._canvas\);/);
    // A flat 3D battler's target is rebuilt, and its texture adopted again, on a new context.
    assert.match(core, /if \(!state\.target \|\| state\.targetPixels !== pixels \|\| state\.contextGeneration !== this\.contextGeneration\) \{/);
    assert.match(core, /state\.contextGeneration = this\.contextGeneration;\n\s+state\.adoptedSource = null;/);
});

test('a battle room is built again on a restored context', () => {
    const presentation = read('runtime/reactor_battle_presentation.js');
    const rebuild = presentation.slice(presentation.indexOf('P.rebuildRoom=function(scene){'), presentation.indexOf('P.updateRoom=function'));
    // A fresh token cancels a build still in flight; the old room and its sprite go before the new one starts.
    assert.match(rebuild, /scene\._reactorRoomToken=\{\};const token=scene\._reactorRoomToken;\n\s+old\.dispose\(\);ss\._reactorRoom=null;/);
    assert.match(rebuild, /sprite\?\.removeFromParent\(\);sprite\?\.destroy\(\);ss\._reactorRoomSprite=null;\n\s+P\.createRoom\(scene,config,token\)\.catch\(P\.warn\);/);
    assert.match(rebuild, /root\.Reactor3D\?\.contextRestoredHandlers\)root\.Reactor3D\.contextRestoredHandlers\.push\(/);
});

test('the Effekseer overlay accepts its loss and starts a new context when it is restored', () => {
    const core = runtimeSource('reactor_core.js');
    const listen = core.slice(core.indexOf('Graphics._listenEffekseerStateResets = function'), core.indexOf('Graphics._restoreEffekseerContext = function'));
    assert.match(listen, /overlay\.addEventListener\("webglcontextlost", event => event\.preventDefault\(\)\);/,
        'without preventDefault the browser never gives the context back');
    assert.match(listen, /overlay\.addEventListener\("webglcontextrestored", \(\) => this\._restoreEffekseerContext\(\)\);/);

    const start = core.indexOf('Graphics._restoreEffekseerContext = function');
    const source = core.slice(start, core.indexOf('\n};', start) + 3);
    const created = [];
    const gl = { lost: false, isContextLost() { return this.lost; } };
    const context = {
        Graphics: { _effekseerGL: gl, _effekseer: 'old', rearmEffekseerState() { this.rearmed = true; } },
        window: { effekseer: true },
        effekseer: { createContext: () => { const c = { init(g) { this.gl = g; } }; created.push(c); return c; } },
        EffectManager: { _cache: { 'effects/Old.efkefc': 1 } },
        console
    };
    vm.runInNewContext(source, context);
    context.Graphics._restoreEffekseerContext();
    assert.equal(created.length, 1);
    assert.equal(context.Graphics._effekseer, created[0]);
    assert.equal(created[0].gl, gl);
    assert.deepEqual(Object.keys(context.EffectManager._cache), [], 'effects load again into the new context');
    assert.equal(context.Graphics.rearmed, true);
    // Nothing starts on a context that is still lost.
    gl.lost = true;
    context.Graphics._restoreEffekseerContext();
    assert.equal(created.length, 1);
});
