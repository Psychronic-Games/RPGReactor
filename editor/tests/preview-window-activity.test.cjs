'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');

function events() {
    const handlers = new Map();
    return {
        addEventListener(type, handler) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(handler); },
        removeEventListener(type, handler) { handlers.get(type)?.delete(handler); },
        fire(type, target) { for (const handler of handlers.get(type) || []) handler({ target }); }
    };
}

function activity() {
    const listeners = new Set();
    let owner = 'map', foreground = true;
    return {
        previewActive: element => foreground && owner === (element ? 'forge' : 'map'),
        onPreviewActivity(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        set(next, visible = true) { owner = next; foreground = visible; for (const listener of listeners) listener(); },
        listeners
    };
}

function frames() {
    const pending = new Map();
    let sequence = 0, now = 0;
    return {
        requestAnimationFrame(callback) { pending.set(++sequence, callback); return sequence; },
        cancelAnimationFrame: token => pending.delete(token),
        step(elapsed = 16) {
            now += elapsed;
            const callbacks = [...pending.values()]; pending.clear();
            for (const callback of callbacks) callback(now);
        },
        performance: { now: () => now },
        pending
    };
}

test('preview ownership follows clicks, keyboard focus, scrolling, app focus and closing a floating window', () => {
    const document = { ...events(), hidden: false, activeElement: null };
    const overlays = new Map();
    document.getElementById = id => overlays.get(id);
    const world = { ...events(), document }; world.window = world;
    vm.runInNewContext(read('utils/DetachedWindow.js'), world);
    const helper = world.RRDetachedWindow;
    const make = id => {
        const element = { ownerDocument: document, isConnected: true };
        const overlay = { contains: target => target === element, open: true };
        overlays.set(id, overlay);
        return { element, overlay, window: helper.create({ overlayId: id, isOpen: node => node.open }) };
    };
    const forge = make('forge'), database = make('database');
    let changes = 0;
    const off = helper.onPreviewActivity(() => changes++);
    assert.equal(helper.previewActive(), true);
    document.fire('pointerdown', forge.element);
    assert.equal(helper.previewActive(), false);
    assert.equal(helper.previewActive(forge.element), true);
    assert.equal(helper.previewActive(database.element), false);
    document.fire('focusin', forge.element);
    assert.equal(changes, 1, 'repeated input in one workspace does not notify every preview');
    document.fire('focusin', database.element);
    assert.equal(helper.previewActive(database.element), true);
    document.fire('wheel', { ownerDocument: document });
    assert.equal(helper.previewActive(), true);
    world.fire('blur');
    assert.equal(helper.previewActive(), false);
    assert.equal(helper.previewActive(forge.element), false);
    world.fire('focus');
    assert.equal(helper.previewActive(), true);
    document.fire('pointerdown', forge.element);
    forge.overlay.open = false;
    forge.window.hidePopout();
    assert.equal(helper.previewActive(), true);
    const before = changes; off(); document.fire('pointerdown', database.element);
    assert.equal(changes, before, 'disposed previews are not notified');
});

function mapView(shared, raf) {
    const world = { window: { RRDetachedWindow: shared }, console, ...raf, setTimeout, clearTimeout,
        document: { getElementById: () => null }, Reactor3D: {} };
    const MapEditor3D = vm.runInNewContext(read('MapEditor3D.js') + '\nMapEditor3D;', world);
    const view = Object.create(MapEditor3D.prototype);
    const calls = { draws: 0, steps: 0, resizes: 0 };
    Object.assign(view, { enabled: true, frame: null, flyKeys: new Set(['w']), flyFast: true,
        keepCanvasFilling() { calls.resizes++; return false; }, stepFly() {},
        stepAnimations() { calls.steps++; return false; }, previewActive: () => true, animating: () => true,
        effectLightsAnimate: () => false, idleInterval: () => 1000,
        render() { calls.draws++; }, rebuild() { assert.fail('switching focus must retain the loaded map'); } });
    return { view, calls, world };
}

function characterView(shared, raf) {
    const world = { window: { RRDetachedWindow: shared }, console, ...raf, setTimeout, clearTimeout,
        RRCharacterPoses: { POSES: [] }, THREE: { LoopOnce: 1, LoopRepeat: 2 } };
    vm.runInNewContext(read('forge/Character3D/Character3DBuilder.js'), world);
    const builder = Object.create(world.window.Character3DBuilder.prototype);
    const calls = { draws: 0, deltas: [] };
    let clockAt = raf.performance.now();
    const action = { time: 0, stop() {}, play() {}, setLoop() {}, getClip: () => ({ duration: 2 }), isRunning: () => true };
    const view = { bones: [], plan: 'human', group: { position: {} }, frame: 0, loop: 0,
        actions: new Map([['idle', { meta: {} }]]), action, textures: new Map(), renderer: { dispose() {} },
        clock: { getDelta() { const now = raf.performance.now(), delta = (now - clockAt) / 1000; clockAt = now; return delta; } },
        mixer: { update(delta) { calls.deltas.push(delta); action.time += delta; } } };
    Object.assign(builder, { _view: view, pose: 'idle', _thumbQueue: [], _thumbEpoch: 0,
        root: { ownerDocument: { hidden: false }, querySelector: () => null },
        _refreshThumbs() {}, _poseAction: () => action, _plant() {},
        _render() { calls.draws++; view.needsDraw = false; }, _skinWorker() { assert.fail('an empty painter must not start a worker'); },
        _dropHeldPreview() {}, _clearModel() {} });
    builder._bindPreviewActivity();
    builder._syncPose();
    return { builder, view, action, calls };
}

test('map and Forge alternate animation work without polling, rebuilding, catching up or duplicating draws', t => {
    const shared = activity(), raf = frames();
    const map = mapView(shared, raf), character = characterView(shared, raf);
    t.after(() => { map.view.stopLoop(); character.builder.detach(); });
    map.view.startLoop();
    for (let frame = 0; frame < 60; frame++) raf.step();
    assert.equal(map.calls.draws, 60);
    assert.equal(character.calls.draws, 0);
    assert.equal(character.calls.deltas.length, 0);
    shared.set('forge');
    assert.equal(map.view.flyKeys.size, 0);
    assert.equal(map.view.flyFast, false);
    const mapLayoutReads = map.calls.resizes;
    for (let frame = 0; frame < 60; frame++) {
        character.builder._draw(); character.builder._draw(); raf.step();
    }
    assert.equal(character.calls.draws, 60, 'input and the animation share one render per frame');
    assert.equal(map.calls.draws, 60);
    assert.equal(map.calls.steps, 60, 'inactive maps do not even advance animation or scan their scene');
    assert.equal(map.calls.resizes, mapLayoutReads);
    shared.set('forge', false);
    assert.equal(raf.pending.size, 0, 'leaving the application cancels every recurring callback');
    const poseTime = character.action.time;
    raf.step(10000);
    assert.equal(character.action.time, poseTime);
    shared.set('forge'); raf.step();
    assert.ok(Math.abs(character.calls.deltas.at(-1) - 0.016) < 1e-6, 'resuming discards the inactive wall-clock gap');
    assert.ok(Math.abs(character.action.time - poseTime - 0.016) < 1e-6, 'the pose continues instead of restarting');
    shared.set('map'); raf.step();
    assert.equal(map.calls.draws, 61);
    assert.equal(character.calls.draws, 61);
    map.view.stopLoop(); character.builder.detach();
    assert.equal(shared.listeners.size, 0);
    assert.equal(raf.pending.size, 0);
});

test('pending character changes are deferred while another workspace is active', () => {
    const raf = frames(), shared = activity();
    const fixture = characterView(shared, raf);
    fixture.builder._queueRebuild();
    assert.equal(fixture.builder._rebuildOwed, true);
    assert.equal(raf.pending.size, 0);
    fixture.builder._rebuild();
    assert.equal(fixture.builder._rebuildOwed, true);
    assert.equal(fixture.builder._view, fixture.view);
    fixture.builder._stopThumbs();
});

test('map effects pause their own loops and video playback with the map', () => {
    const shared = activity(), raf = frames(), fixture = mapView(shared, raf);
    const activeStates = [];
    let plays = 0;
    const video = { paused: false, ended: false, pause() { this.paused = true; }, play() { plays++; this.paused = false; return Promise.resolve(); } };
    fixture.view.effectPlays = [{ plane: { userData: { video } }, layer: { setWorkspaceActive: active => activeStates.push(active) } }];
    fixture.view.startLoop();
    shared.set('forge');
    assert.equal(video.paused, true);
    assert.deepEqual(activeStates, [true, false]);
    shared.set('map');
    assert.equal(video.paused, false);
    assert.equal(plays, 1);
    assert.deepEqual(activeStates, [true, false, true]);
    fixture.view.stopLoop();
});

test('a paused map retains the playtest memory-release deadline without polling frames', () => {
    const shared = activity(), raf = frames(), fixture = mapView(shared, raf);
    let timer = null, parked = 0;
    fixture.world.window.reactor = { playtestManager: { ownsGpu: () => true } };
    fixture.world.setTimeout = callback => { timer = callback; return 1; };
    fixture.world.clearTimeout = () => { timer = null; };
    fixture.view.park = () => parked++;
    fixture.view.startLoop(); shared.set('forge');
    assert.equal(raf.pending.size, 0);
    assert.equal(parked, 0);
    assert.equal(typeof timer, 'function');
    timer();
    assert.equal(parked, 1);
    shared.set('map'); shared.set('forge');
    assert.equal(typeof timer, 'function');
    fixture.view.stopLoop();
    assert.equal(timer, null);
});

test('an inactive character defers WebGL startup and a closed one cannot finish a late startup', async () => {
    const shared = activity(), raf = frames();
    const world = { window: { RRDetachedWindow: shared, THREE: {} }, console, ...raf, setTimeout, clearTimeout };
    vm.runInNewContext(read('forge/Character3D/Character3DBuilder.js'), world);
    const builder = Object.create(world.window.Character3DBuilder.prototype);
    let creates = 0;
    Object.assign(builder, { root: { ownerDocument: {}, querySelector: () => ({}) }, _thumbEpoch: 0, pack: {}, eyeSource: {},
        _t: value => value, _status() {}, _refreshThumbs() {},
        _makeView() { creates++; this._view = {}; }, _rebuild() {}, _draw() {} });
    builder._bindPreviewActivity();
    await builder._start();
    assert.equal(creates, 0);
    assert.equal(builder._startOwed, true);
    shared.set('forge');
    assert.equal(creates, 1);
    assert.equal(builder._startOwed, false);
    builder._view = null; builder.pack = null;
    let finish;
    world.RRHumanBody = { loadPack: () => new Promise(resolve => { finish = resolve; }) };
    const pending = builder._start();
    builder.detach();
    finish({}); await pending;
    assert.equal(creates, 1, 'closing while the pack loads must not create a late renderer');
    assert.equal(shared.listeners.size, 0);
});

test('inactive characters defer shading without creating a worker or copying vertex buffers', () => {
    let callback;
    const world = { window: {}, console, setTimeout(handler) { callback = handler; return 1; }, clearTimeout() {} };
    vm.runInNewContext(read('forge/Character3D/Character3DBuilder.js'), world);
    const builder = Object.create(world.window.Character3DBuilder.prototype);
    builder._previewPaused = true;
    builder._shadingWorker = () => assert.fail('inactive shading must not start');
    builder._queueShading(); callback();
    assert.equal(builder._shadingOwed, true);
});

test('map media decoding pauses with its workspace and does not restart from load events', async () => {
    const shared = activity();
    const world = { window: { RRDetachedWindow: shared }, document: events() };
    const Manager = vm.runInNewContext(read('MediaSurfacePreviewManager.js') + '\nMediaSurfacePreviewManager;', world);
    const manager = new Manager({});
    let plays = 0;
    const video = { ...events(), src: 'movie.webm', paused: true, currentTime: 4,
        pause() { this.paused = true; }, play() { plays++; this.paused = false; return Promise.resolve(); } };
    const owner = { video, listeners: [], source: { autoPlay: true } };
    video.addEventListener('canplay', () => { if (owner.source.autoPlay) video.play(); });
    manager.threeOwners.set('movie', owner);
    manager._keepPlaying(owner, video);
    assert.equal(plays, 1);
    shared.set('forge');
    assert.equal(video.paused, true);
    assert.equal(owner.source.autoPlay, false);
    video.fire('canplay'); video.fire('loadeddata');
    assert.equal(plays, 1);
    shared.set('map');
    assert.equal(video.paused, false);
    assert.equal(owner.source.autoPlay, true);
    assert.equal(video.currentTime, 4);
    assert.equal(plays, 2);
    manager.beforeMapChange = () => {};
    manager.destroy();
    assert.equal(shared.listeners.size, 0);
});
