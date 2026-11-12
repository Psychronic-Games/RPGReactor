'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const THREE = require('./helpers/three.cjs');
const source = fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/Character3DBuilder.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
    const listeners = new Set(), frames = new Map(); let active = true, sequence = 0;
    const window = { THREE, devicePixelRatio: 1, RRDetachedWindow: {
        previewActive: () => active,
        onPreviewActivity(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    } };
    class Renderer {
        constructor() { this.shadowMap = {}; }
        setPixelRatio() {} setClearColor() {} setSize() {} dispose() {} forceContextLoss() {}
    }
    const normalize = r => JSON.parse(JSON.stringify(r));
    const scope = { window, THREE: { ...THREE, WebGLRenderer: Renderer }, console, setTimeout, clearTimeout,
        requestAnimationFrame: fn => { const id = ++sequence; frames.set(id, fn); return id; },
        cancelAnimationFrame: id => frames.delete(id), ResizeObserver: class { observe() {} disconnect() {} },
        RRCharacterModel: { normalize }, RRHumanBody: { normalizeRecipe: normalize, naturalRecipe: normalize } };
    vm.runInNewContext(source, scope);
    const Builder = window.Character3DBuilder, b = new Builder();
    Builder.weakGpu = () => true; Builder.blobTexture = () => null;
    const status = { dataset: {} }, name = {}, canvas = { parentElement: { clientWidth: 400, clientHeight: 400 }, addEventListener() {} };
    b.root = { ownerDocument: { hidden: false }, querySelector: selector => selector === '.rr-c3d-canvas' ? canvas : selector === '.rr-c3d-status' ? status : selector === '.rr-c3d-name-input' ? name : null };
    b._studio = () => null; b._draw = b._refreshThumbs = b._renderPanel = b._syncHistory = b._showExpression = b._queueShading = () => {};
    b._configurePreview = async () => {}; b._loadOutfitEmblems = () => {}; b._buildOptions = () => ({});
    b._show = result => { b.displayed = result.recipe; };
    b.pack = {}; b._livePool = () => ({ build: async ({ recipe }) => ({ recipe, parts: [], height: 1, plan: 'quadruped' }) });
    return { b, status, listeners, frames,
        activity(value) { active = value; for (const fn of [...listeners]) fn(); },
        async flush() { for (const [id, fn] of [...frames]) { frames.delete(id); fn(); } await tick(); await tick(); }
    };
}
test('creating the studio retains focus/resume notifications so opened designs and later species display', async () => {
    const f = fixture(), { b } = f;
    b._bindPreviewActivity(); b._makeView();
    assert.equal(f.listeners.size, 1, 'studio creation must not unsubscribe preview activity');
    f.activity(false); assert.equal(b._previewPaused, true);
    b._openRecord('Saved elf', { recipe: { species: 'elf' } });
    assert.equal(f.frames.size, 0, 'background builds stay deferred');
    assert.doesNotMatch(f.status.textContent, /^Opened /, 'loading is not reported as completed');
    f.activity(true); await f.flush();
    assert.equal(b.displayed.species, 'elf'); assert.equal(f.status.textContent, 'Opened Saved elf.');
    b._selectPreset({ species: 'dwarf' }); await f.flush();
    assert.equal(b.displayed.species, 'dwarf');
    b._clearModel = () => {}; b.detach(); assert.equal(f.listeners.size, 0);
});
test('opening a design retires a canceled slider settle instead of silently discarding its worker result', async t => {
    const f = fixture(), { b } = f; b._view = {};
    const timer = b._settle = setTimeout(() => assert.fail('obsolete slider callback'), 10000);
    t.after(() => clearTimeout(timer));
    b._selectPreset({ species: 'human' });
    b._openRecord('Saved orc', { recipe: { species: 'orc' } });
    await f.flush();
    assert.equal(b._settle, 0); assert.equal(b.displayed?.species, 'orc');
    assert.equal(f.status.textContent, 'Opened Saved orc.');
});
test('Opened belongs to the applied current recipe, and an abandoned load cannot report success', async () => {
    const f = fixture(), { b } = f; b._view = {};
    let finish;
    b._livePool = () => ({ build: ({ recipe }) => new Promise(resolve => { finish = () => resolve({ recipe, parts: [], height: 1, plan: 'quadruped' }); }) });
    b._openRecord('Old design', { recipe: { species: 'elf' } }); await f.flush();
    assert.doesNotMatch(f.status.textContent, /^Opened /);
    b._selectPreset({ species: 'dwarf' }); finish(); await tick(); await tick();
    assert.equal(b.displayed, undefined); assert.doesNotMatch(f.status.textContent, /^Opened Old/);
    b._livePool = () => ({ build: async ({ recipe }) => ({ recipe, parts: [], height: 1, plan: 'quadruped' }) });
    await f.flush(); assert.equal(b.displayed.species, 'dwarf');
});
test('a build whose own recipe differs by a normalizing pass still counts as the one asked for', async () => {
    const f = fixture(), { b } = f; b._view = {};
    // The build normalizes once more, which can move an ancestry weight by one bit: its recipe never equals the builder's.
    b._livePool = () => ({ build: async ({ recipe }) => ({ recipe: { ...recipe, drift: 1 }, parts: [], height: 1, plan: 'quadruped' }) });
    b._openRecord('Saved elf', { recipe: { species: 'elf' } }); await f.flush();
    assert.equal(f.status.textContent, 'Opened Saved elf.');
    assert.equal(b._builtFor, JSON.stringify(b.recipe), 'what a group waits for before it draws a member');
});
test('detach cancels pending frame and settle work even before a view exists', t => {
    const f = fixture(), { b } = f;
    b._queueRebuild(); const timer = b._settle = setTimeout(() => assert.fail('detached slider callback'), 10000);
    t.after(() => clearTimeout(timer));
    b.detach();
    assert.equal(b._pending, 0); assert.equal(f.frames.size, 0); assert.equal(b._settle, 0);
});
