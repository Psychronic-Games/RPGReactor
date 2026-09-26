const assert = require('node:assert/strict');
const test = require('node:test');
const Editor = require('../src/database/Database3DEditor.js');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function editor() {
    const e = new Editor({}, {});
    e._detail = { querySelector: () => null };
    for (const method of ['renderModelStats', 'highlightModel', 'renderPartList', 'renderPartForm',
        'renderRuleList', 'renderSelectBar', 'renderEditCard', '_refreshMotionsButton', '_refreshHint']) e[method] = () => {};
    e.loadSidecar = () => { e.rawEffects = []; e.rawAnimations = []; };
    e.rebuildPlayback = () => {};
    e._readEmbeddedClips = async entry => [entry.name];
    return e;
}

test('switching models stops manually played media and animation before the next load resolves', async () => {
    const e = editor(), load = deferred();
    e._drawPreview = () => load.promise;
    let paused = 0, disposed = 0, stopped = 0, removed = 0;
    const parent = { remove(node) { node.parent = null; removed++; } };
    const disposable = () => ({ dispose() { disposed++; } });
    const video = { pause() { paused++; }, src: 'old.webm' };
    e._fxVideo = { video, mesh: { parent, geometry: disposable(), material: disposable() }, texture: disposable() };
    e._fxPreview = { stop() { stopped++; this.active = false; }, active: true };
    e._fxQuad = { mesh: { visible: true } };
    e._fxPreviewDef = { name: 'old', anchor: { offset: [9, 9, 9] } };
    e._fxTriggered = 0;
    e._fxTriggeredLight = 0;
    e._effectWork = e._fxPreviewDef;
    e._cardMode = 'effect';
    e._object = { parent };
    e._binding = { mixer: { stopAllAction() { stopped++; } } };
    e.playRules = [{ name: 'old' }];
    e.embeddedClips = ['old'];
    e._sim = { action: { name: 'old' }, walking: true, dashing: true };
    e._bgFlash = {}; e._flashHolder = {};
    const request = e.selectModel({ name: 'new' });
    assert.equal(paused, 1);
    assert.equal(disposed, 3);
    assert.equal(stopped, 2);
    assert.equal(removed, 2);
    assert.equal(video.src, '');
    assert.equal(e._fxVideo, null);
    assert.equal(e._fxPreviewDef, null);
    assert.equal(e._fxTriggered, null);
    assert.equal(e._fxTriggeredLight, null);
    assert.equal(e._fxQuad.mesh.visible, false);
    assert.equal(e._object, null);
    assert.equal(e._binding, null);
    assert.equal(e._cardMode, 'part');
    assert.equal(e._effectWork, null);
    assert.equal(e._bgFlash, null);
    assert.equal(e._flashHolder, null);
    assert.deepEqual(e.playRules, []);
    assert.deepEqual(e._sim, { action: null, walking: false, dashing: false, jumping: false, swimming: false });
    load.resolve(); await request;
    assert.deepEqual(e.embeddedClips, ['new']);
});

test('late model and clip loads cannot overwrite a newer selection, including A-B-A', async () => {
    const e = editor(), loads = [], clips = [];
    e._drawPreview = () => { const d = deferred(); loads.push(d); return d.promise; };
    e._readEmbeddedClips = entry => { const d = deferred(); clips.push({ entry, ...d }); return d.promise; };
    let rebuilt = 0;
    e.rebuildPlayback = () => { rebuilt++; };
    const first = e.selectModel({ name: 'A' });
    loads[0].resolve(); await Promise.resolve();
    assert.equal(clips.length, 1);
    const second = e.selectModel({ name: 'B' });
    const third = e.selectModel({ name: 'A' });
    loads[2].resolve(); await Promise.resolve();
    clips[1].resolve(['latest A']); await third;
    clips[0].resolve(['stale A']); await first;
    loads[1].resolve(); await second;
    assert.equal(clips.length, 2, 'the stale B request never reads clips or rebuilds the panel');
    assert.deepEqual(e.embeddedClips, ['latest A']);
    assert.equal(rebuilt, 1);
});

test('an old preview completion does not clear the current loading state', async () => {
    const e = editor(), old = deferred(), current = deferred();
    e._drawPreviewNow = entry => entry.name === 'old' ? old.promise : current.promise;
    const first = e._drawPreview({ name: 'old' });
    const second = e._drawPreview({ name: 'current' });
    old.resolve(); await first;
    assert.equal(e._loadingPreview, true);
    current.resolve(); await second;
    assert.equal(e._loadingPreview, false);
});

test('closing the preview invalidates pending model selection and clears its effects', async () => {
    const e = editor(), pending = deferred();
    e._drawPreview = () => pending.promise;
    let rebuilt = 0;
    e.rebuildPlayback = () => { rebuilt++; };
    let stopped = 0, disposed = 0;
    e._fxPreview = { stop() { stopped++; }, dispose() { disposed++; } };
    const request = e.selectModel({ name: 'pending' });
    const gen = e._gen;
    e._disposePreview();
    pending.resolve(); await request;
    assert.ok(e._gen > gen);
    assert.equal(rebuilt, 0);
    assert.equal(stopped, 2);
    assert.equal(disposed, 1);
    assert.equal(e._fxPreview, null);
    assert.equal(e._scene, null);
});
