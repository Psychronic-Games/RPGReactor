/**
 * What the editor's 3D view gives back. A map scene going away takes its
 * shadow casters out of Reactor3D.Shadows (the lists held every rebuilt
 * scene's models), so models are swept on a map change; and while a playtest
 * has had the GPU for a while the view gives its scene and models back and
 * builds them again when the editor is in front.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const mapSource = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor3D.js'), 'utf8');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

function mapEditorClass(context = {}) {
    return vm.runInNewContext(`${mapSource}\nMapEditor3D;`, {
        console, window: {}, performance: { now: () => 0 },
        document: { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [], getElementById: () => null },
        require, setTimeout, clearTimeout, ...context
    });
}

test('forgetScene drops the casters under a scene, from both lists, and keeps the rest', () => {
    const shadows = Reactor3D.Shadows;
    const scene = { name: 'old', parent: null };
    const group = { parent: scene };
    const other = { name: 'next', parent: null };
    const prop = { parent: group }, walker = { parent: { parent: group } }, kept = { parent: other };
    try {
        shadows._static.add(prop);
        shadows._dynamic.add(walker);
        shadows._static.add(kept);
        const generation = shadows._generation;
        assert.equal(shadows.forgetScene(scene), 2);
        assert.ok(!shadows._static.has(prop) && !shadows._dynamic.has(walker), 'the old scene\'s casters are gone');
        assert.ok(shadows._static.has(kept), 'another scene\'s caster stays');
        assert.ok(shadows._generation > generation, 'the static rows are judged again');
        assert.equal(shadows.forgetScene(null), 0);
        assert.equal(shadows.forgetScene(scene), 0, 'nothing left to drop');
    } finally {
        shadows._static.clear();
        shadows._dynamic.clear();
    }
});

test('a map scene forgets its casters before clear() detaches its groups', () => {
    const order = [];
    const savedForget = Reactor3D.Shadows.forgetScene;
    Reactor3D.Shadows.forgetScene = scene => { order.push(['forget', scene]); return 0; };
    try {
        const fake = { _scene: { id: 1 }, clear() { order.push(['clear']); } };
        Reactor3D.MapScene.prototype.destroy.call(fake);
        assert.deepEqual(order.map(entry => entry[0]), ['forget', 'clear']);
        assert.equal(order[0][1].id, 1);
    } finally {
        Reactor3D.Shadows.forgetScene = savedForget;
    }
});

test('the editor view forgets its scene\'s casters first thing in clearScene, and sweeps models on a map change', () => {
    const body = mapSource.slice(mapSource.indexOf('    clearScene() {'));
    const forget = body.indexOf('Reactor3D.Shadows?.forgetScene?.(this.mapScene.scene())');
    assert.ok(forget > 0 && forget < body.indexOf('this.eventGroup.parent?.remove'), 'before the groups are taken out');
    assert.equal(mapEditorClass().SWEEP_MODELS_ON_MAP_CHANGE, true);
});

function parkableView(MapEditor3D, calls) {
    const view = Object.create(MapEditor3D.prototype);
    view.enabled = true;
    view.renderer = { info: { memory: {} }, getContext: () => null, resetState() { calls.push('resetState'); }, setRenderTarget() {}, clear() { calls.push('clear'); } };
    view.projectController = { app: { render() { calls.push('render2d'); } } };
    view._rebuildGeneration = 1;
    view.clearScene = () => calls.push('clearScene');
    view.releaseGraphics = () => { calls.push('releaseGraphics'); return {}; };
    view.unbindGraphics = () => calls.push('unbind');
    view.rebuild = () => { calls.push('rebuild'); return Promise.resolve(true); };
    return view;
}

test('a playtest with the GPU for PARK_AFTER_MS parks the view once; the editor in front builds it again', () => {
    const MapEditor3D = mapEditorClass();
    assert.equal(MapEditor3D.PARK_AFTER_MS, 5000);
    const calls = [];
    const view = parkableView(MapEditor3D, calls);
    view.parkForPlaytest(1000);
    view.parkForPlaytest(5999);
    assert.equal(view._parked, undefined, 'not before the delay');
    view.parkForPlaytest(6000);
    assert.equal(view._parked, true);
    assert.deepEqual(calls.slice(0, 4), ['clearScene', 'releaseGraphics', 'unbind', 'render2d']);
    assert.ok(calls.includes('clear'), 'the parked view shows its clear color');
    assert.equal(view._rebuildGeneration, 2, 'a rebuild in flight is dropped');
    const count = calls.length;
    view.parkForPlaytest(9000);
    assert.equal(calls.length, count, 'parked once');
    view.unpark();
    assert.equal(view._parked, false);
    assert.equal(calls[calls.length - 1], 'rebuild');
    assert.equal(view._playtestSince, null, 'the next playtest waits the full delay again');
});

test('PARK_AFTER_MS 0 keeps the view whole; a disabled view has nothing to park', () => {
    const MapEditor3D = mapEditorClass();
    const calls = [];
    const view = parkableView(MapEditor3D, calls);
    MapEditor3D.PARK_AFTER_MS = 0;
    view.parkForPlaytest(0);
    view.parkForPlaytest(60000);
    assert.equal(view._parked, undefined);
    MapEditor3D.PARK_AFTER_MS = 5000;
    view.enabled = false;
    assert.equal(view.park(), false);
    assert.deepEqual(calls, []);
});

test('the render loop parks under a playtest and unparks when the editor is back', () => {
    const loop = mapSource.slice(mapSource.indexOf('    startLoop() {'), mapSource.indexOf('    stopLoop() {'));
    assert.match(loop, /const playtest = MapEditor3D\.playtestRunning\(\);\s*if \(playtest\) this\.parkForPlaytest\(now\);\s*else this\._playtestSince = null;/);
    assert.match(loop, /if \(this\.suspended \|\| MapEditor3D\.coveredByDatabase\(\) \|\| playtest\) \{ this\._covered = true;/);
    assert.ok(loop.indexOf('if (this._parked) this.unpark();') > loop.indexOf('|| playtest)'), 'unparked only once uncovered');
});

function effectMediaWorld() {
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const videos = [];
    const images = [];
    const document = {
        addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [], getElementById: () => null,
        createElement() {
            const video = { paused: true, ended: false, plays: 0, pauses: 0, loads: 0,
                play() { this.plays++; this.paused = false; return Promise.resolve(); },
                pause() { this.pauses++; this.paused = true; },
                removeAttribute(name) { if (name === 'src') this.src = ''; },
                load() { this.loads++; } };
            videos.push(video);
            return video;
        }
    };
    class Image { constructor() { images.push(this); } }
    const MapEditor3D = mapEditorClass({ THREE: global.THREE, Reactor3D, document, Image });
    const view = Object.create(MapEditor3D.prototype);
    view.requestRender = () => {};
    const effect = file => ({ video: { file, loop: true }, scale: [1, 1, 1] });
    return { MapEditor3D, view, videos, images, effect, project: { path: path.join(repoRoot, 'fixture') } };
}

function disposedCount(texture) {
    let count = 0;
    texture.addEventListener('dispose', () => count++);
    return () => count;
}

test('a view\'s video planes of one file share one video and texture; the last release frees them', () => {
    const { MapEditor3D, view, videos, effect, project } = effectMediaWorld();
    assert.equal(MapEditor3D.SHARE_EFFECT_MEDIA, true);
    const first = view._videoEffectPlane(effect('screen.mp4'), project, null);
    const second = view._videoEffectPlane(effect('screen.mp4'), project, null);
    const other = view._videoEffectPlane(effect('static.mp4'), project, null);
    assert.equal(videos.length, 2, 'one video per file');
    assert.equal(first.userData.video, second.userData.video);
    assert.equal(first.userData.texture, second.userData.texture);
    assert.notEqual(first.material, second.material, 'each plane keeps its own material');
    assert.equal(first.userData.video.plays, 1, 'the shared video is started once');
    assert.equal(view._effectMedia.size, 2);
    const video = first.userData.video;
    const disposed = disposedCount(first.userData.texture);
    MapEditor3D.releaseEffectPlane(first);
    assert.equal(video.pauses, 0, 'a plane still shows it: it keeps playing');
    assert.equal(first.userData.video, null, 'the released plane lets go of its media');
    assert.equal(disposed(), 0);
    assert.equal(view._effectMedia.size, 2);
    MapEditor3D.releaseEffectPlane(first);
    assert.equal(disposed(), 0, 'a second release of one plane counts nothing');
    MapEditor3D.releaseEffectPlane(second);
    assert.equal(video.pauses, 1);
    assert.equal(video.src, '', 'the decoder is let go');
    assert.equal(video.loads, 1);
    assert.equal(disposed(), 1);
    assert.equal(view._effectMedia.size, 1, 'the entry leaves the view');
    const again = view._videoEffectPlane(effect('screen.mp4'), project, null);
    assert.equal(videos.length, 3, 'a plane after the last release makes a fresh video');
    MapEditor3D.releaseEffectPlane(again);
    MapEditor3D.releaseEffectPlane(other);
    assert.equal(view._effectMedia.size, 0);
});

test('a looping and a one-shot plane of one file keep separate videos; pictures share too', () => {
    const { view, videos, images, effect, project } = effectMediaWorld();
    const looping = view._videoEffectPlane(effect('screen.mp4'), project, null);
    const once = view._videoEffectPlane({ video: { file: 'screen.mp4', loop: false }, scale: [1, 1, 1] }, project, null);
    assert.equal(videos.length, 2);
    assert.equal(looping.userData.video.loop, true);
    assert.equal(once.userData.video.loop, false);
    const picture = view._videoEffectPlane(effect('poster.png'), project, null);
    const picture2 = view._videoEffectPlane(effect('poster.png'), project, null);
    assert.equal(images.length, 1);
    assert.equal(picture.userData.texture, picture2.userData.texture);
    assert.equal(picture.userData.video, null);
});

test('the 2D model preview path (MapEditor3D.prototype) and SHARE_EFFECT_MEDIA false keep a copy per plane', () => {
    const { MapEditor3D, view, videos, effect, project } = effectMediaWorld();
    const a = MapEditor3D.prototype._videoEffectPlane(effect('screen.mp4'), project, null);
    const b = MapEditor3D.prototype._videoEffectPlane(effect('screen.mp4'), project, null);
    assert.equal(videos.length, 2);
    assert.notEqual(a.userData.texture, b.userData.texture);
    assert.equal(a.userData.effectMedia, undefined);
    assert.ok(!Object.prototype.hasOwnProperty.call(MapEditor3D.prototype, '_effectMedia'), 'nothing is kept on the prototype');
    const own = a.userData.video;
    const disposed = disposedCount(a.userData.texture);
    MapEditor3D.releaseEffectPlane(a);
    assert.equal(own.pauses, 1, 'an unshared plane frees its own video');
    assert.equal(disposed(), 1);
    MapEditor3D.SHARE_EFFECT_MEDIA = false;
    try {
        const c = view._videoEffectPlane(effect('screen.mp4'), project, null);
        const d = view._videoEffectPlane(effect('screen.mp4'), project, null);
        assert.equal(videos.length, 4, 'one video per plane');
        assert.notEqual(c.userData.texture, d.userData.texture);
        assert.equal(view._effectMedia, undefined);
        const cVideo = c.userData.video;
        MapEditor3D.releaseEffectPlane(c);
        assert.equal(cVideo.pauses, 1);
        assert.equal(d.userData.video.pauses, 0, 'the other plane\'s video is its own');
    } finally {
        MapEditor3D.SHARE_EFFECT_MEDIA = true;
    }
});

test('disposeEffectPlays hands every plane to the refcounted release', () => {
    const body = mapSource.slice(mapSource.indexOf('    disposeEffectPlays(filter) {'), mapSource.indexOf('    animateModels(now) {'));
    assert.match(body, /MapEditor3D\.releaseEffectPlane\(play\.plane\)/);
    assert.doesNotMatch(body, /userData\.texture\.dispose|video\.pause/);
});

function pixiGc() {
    const context = { console, performance, setTimeout, clearTimeout, navigator: { userAgent: 'node' }, self: {} };
    vm.createContext(context);
    vm.runInContext(`${fs.readFileSync(path.join(repoRoot, 'runtime', 'libs', 'pixi.js'), 'utf8')};this.PIXI = PIXI;`, context);
    const gc = new context.PIXI.GCSystem({ scheduler: { repeat: () => 1, cancel() {} }, tick: 0 });
    gc.init({});
    // A tile batch's buffer, kept alive by the renderable that draws it, as PIXI's systems wire them.
    // Everything was last drawn two minutes ago, when the 3D view took over.
    const unloaded = [];
    const longAgo = performance.now() - 120000;
    const buffer = { autoGarbageCollect: true, _gcLastUsed: longAgo, unload() { unloaded.push('buffer'); } };
    const orphan = { autoGarbageCollect: true, _gcLastUsed: longAgo, unload() { unloaded.push('orphan'); } };
    const renderGroup = { gcTick: 7, instructionSet: { gcTick: 7 }, structureDidChange: false };
    const mesh = { autoGarbageCollect: true, _gcLastUsed: longAgo, parentRenderGroup: renderGroup,
        _onTouch(now) { buffer._gcLastUsed = now; }, unload() { unloaded.push('mesh'); } };
    const sheet = { autoGarbageCollect: false, _gcLastUsed: longAgo, unload() { unloaded.push('sheet'); } };
    const renderables = { items: { 1: mesh } }, resources = { items: { 2: buffer, 3: sheet, 4: orphan } };
    gc.addResourceHash(renderables, 'items', 'renderable', -1);
    gc.addResourceHash(resources, 'items', 'resource', 0);
    return { gc, unloaded, renderGroup, renderables, resources };
}

test('PIXI\'s own collector keeps the last-drawn 2D map while the 2D view does not draw; release2DGraphics frees it', () => {
    const MapEditor3D = mapEditorClass();
    assert.equal(MapEditor3D.RELEASE_2D_GRAPHICS, true);
    const { gc, unloaded, renderGroup, renderables, resources } = pixiGc();
    gc.run();
    assert.deepEqual(unloaded, ['orphan'], 'only what no renderable holds: the last 2D frame\'s renderables count as used forever');
    unloaded.length = 0;
    const flushes = [];
    assert.equal(MapEditor3D.release2DGraphics({ gc, gl: { flush: () => flushes.push(1) } }), true);
    assert.deepEqual(unloaded.sort(), ['buffer', 'mesh'], 'the mesh and its buffer are freed; PIXI uploads them on its next draw');
    assert.equal(renderables.items[1], null);
    assert.equal(resources.items[3].autoGarbageCollect, false, 'a texture PIXI does not collect stays');
    assert.equal(renderGroup.structureDidChange, true, 'the 2D view rebuilds its instructions when it draws again');
    assert.equal(gc.maxUnusedTime, 60000, 'the collector keeps its minute afterwards');
    assert.equal(flushes.length, 1);
});

test('RELEASE_2D_GRAPHICS false, a disabled collector or a failing one leaves the 2D view as it was', () => {
    const MapEditor3D = mapEditorClass({ console: { error() {} } });
    const { gc, unloaded } = pixiGc();
    MapEditor3D.RELEASE_2D_GRAPHICS = false;
    assert.equal(MapEditor3D.release2DGraphics({ gc }), false);
    MapEditor3D.RELEASE_2D_GRAPHICS = true;
    assert.deepEqual(unloaded, []);
    gc.enabled = false;
    assert.equal(MapEditor3D.release2DGraphics({ gc }), false);
    assert.deepEqual(unloaded, []);
    assert.equal(MapEditor3D.release2DGraphics(null), false);
    const failing = { enabled: true, maxUnusedTime: 60000, run() { throw new Error('lost'); } };
    assert.equal(MapEditor3D.release2DGraphics({ gc: failing }), false);
    assert.equal(failing.maxUnusedTime, 60000);
});

test('the 3D view releases the 2D graphics when it takes over, while PIXI still owns the context', () => {
    const create = mapSource.slice(mapSource.indexOf('    createCanvas() {'), mapSource.indexOf('    reportGpuTier() {'));
    const separate = create.slice(0, create.indexOf('const pixiRenderer = app?.renderer;'));
    assert.match(separate, /app\?\.stop\?\.\(\);\s*this\._released2D = MapEditor3D\.release2DGraphics\(app\?\.renderer\);/);
    const shared = create.slice(create.indexOf('const pixiRenderer = app?.renderer;'));
    const release = shared.indexOf('this._released2D = MapEditor3D.release2DGraphics(pixiRenderer);');
    assert.ok(release > shared.indexOf('app.stop?.();'), 'after PIXI stops drawing');
    assert.ok(release < shared.indexOf('pixiRenderer.resetState?.();'), 'before its state is handed over');
    assert.ok(release < shared.indexOf('new THREE.WebGLRenderer'));
    const teardown = mapSource.slice(mapSource.indexOf('    teardown() {'), mapSource.indexOf('    showPixi(visible) {'));
    assert.match(teardown, /try \{ app\?\.render\?\.\(\); \} catch \(_\) \{\}\s*this\._pixiWasRunning = false;\s*this\._released2D = false;/);
});

test('a park after the takeover release does not draw the 2D map again', () => {
    const MapEditor3D = mapEditorClass();
    const calls = [];
    const view = parkableView(MapEditor3D, calls);
    view._released2D = true;
    assert.equal(view.park(), true);
    assert.ok(!calls.includes('render2d'), 'it would only upload the map again');
    assert.ok(calls.includes('clear'), 'the parked view still shows its clear color');
});
