const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const runtimePath = path.join(root, 'runtime', 'reactor_video_surfaces.js');
const mainSource = fs.readFileSync(path.join(root, 'runtime', 'reactor_main.js'), 'utf8');
const source = fs.readFileSync(runtimePath, 'utf8');
const runtime = require(runtimePath);

test('movie paths stay relative to movies and allow only supported video files', () => {
    assert.equal(runtime.sanitizeMoviePath('cinematics/intro.webm'), 'cinematics/intro.webm');
    assert.equal(runtime.sanitizeMoviePath('chapter 1/Arrival.MP4'), 'chapter 1/Arrival.MP4');
    for (const unsafe of [
        '../secret.mp4', 'clips/../../secret.webm', '/tmp/movie.mp4',
        'C:\\movie.mp4', 'https://example.test/movie.mp4', 'javascript:alert(1).webm',
        'clip.avi', 'movies\\clip.mp4', 'clips/\x00hidden.mp4'
    ]) {
        assert.equal(runtime.sanitizeMoviePath(unsafe), null, unsafe);
    }
    assert.equal(runtime.movieUrl('chapter 1/Arrival.mp4'), 'movies/chapter%201/Arrival.mp4');
    assert.equal(runtime.sanitizeMoviePath('clips/100% #1?.mp4'), 'clips/100% #1?.mp4');
    assert.equal(runtime.movieUrl('clips/100% #1?.mp4'), 'movies/clips/100%25%20%231%3F.mp4');
    assert.equal(runtime.sanitizeMoviePath('clips/%2e%2e/safe.mp4'), 'clips/%2e%2e/safe.mp4');
    assert.equal(runtime.movieUrl('clips/%2e%2e/safe.mp4'), 'movies/clips/%252e%252e/safe.mp4');
});

test('show arguments normalize to a plain, bounded descriptor', () => {
    const descriptor = runtime.normalizeShowArgs({
        surfaceId: '7', file: 'screens/status.webm', target: 'this event',
        width: '640', height: '360', opacity: '128', audio: 'true', volume: '25',
        playbackRate: '1.5', rotationX: '10', rotationY: '-20', rotationZ: '30',
        corners: JSON.stringify([[0, 0], [600, 5], [620, 355], [-10, 350]]),
        loop: 'false', scanlines: 'true', wait: 'true', layer: 'above', depth: '2'
    }, { eventId: () => 12 });
    assert.equal(descriptor.id, 7);
    assert.equal(descriptor.target, 'event');
    assert.equal(descriptor.eventId, 12);
    assert.equal(descriptor.opacity, 128 / 255);
    assert.equal(descriptor.muted, false);
    assert.equal(descriptor.volume, 0.25);
    assert.equal(descriptor.layer, 5);
    assert.equal(descriptor.customCorners, true);
    assert.deepEqual(descriptor.corners[2], { x: 620, y: 355 });
    assert.equal(descriptor.loop, false);
    assert.equal(descriptor.wait, true);
    assert.equal(descriptor.waitReleased, false);
    assert.equal(descriptor.loop, false, 'wait normalizes looping playback to one completion');
    assert.doesNotThrow(() => JSON.stringify(descriptor));
    assert.equal(Object.values(descriptor).some(value => typeof value === 'function'), false);

    assert.equal(runtime.normalizeShowArgs({ id: 1, file: '../x.mp4' }), null);
    assert.equal(runtime.normalizeShowArgs({ id: 1.2, file: 'x.mp4' }), null);
    assert.equal(runtime.normalizeShowArgs({ id: 1, file: 'x.mp4', target: 'event' }), null);
    assert.equal(runtime.normalizeShowArgs({ id: 1, file: 'x.mp4', playbackRate: 0 }), null);
});

test('runtime accepts the editor command payload shape', () => {
    const descriptor = runtime.normalizeShowArgs({
        id: 17, target: 'thisEvent', movie: 'cutscenes/arrival.webm', mapId: 4,
        eventId: 0, x: 123.5, y: 222.25, z: -3, width: 512, height: 288,
        opacity: 190, loop: false, muted: false, volume: 72, playbackRate: 1.25,
        placementMode: '3d', corners: [
            { x: 1, y: 2 }, { x: 501, y: 5 },
            { x: 490, y: 280 }, { x: 9, y: 275 }
        ],
        rotationX: 12, rotationY: -34, rotationZ: 6,
        layer: 3, depth: 4.5, cullingDistance: 60, scanlines: 0.35, wait: true
    }, { eventId: () => 8 });
    assert.equal(descriptor.target, 'event');
    assert.equal(descriptor.eventId, 8);
    assert.equal(descriptor.file, 'cutscenes/arrival.webm');
    assert.equal(descriptor.cullDistance, 60);
    assert.equal(descriptor.scanlines, 0.35);
    assert.equal(descriptor.scaleX, 1);
    assert.equal(descriptor.scaleY, 1);
    assert.equal(descriptor.mapId, 0, 'map identity is runtime-owned');
});

test('2D corners are local offsets and command units are unambiguous', () => {
    const descriptor = runtime.normalizeShowArgs({
        id: 1, file: 'panel.mp4', target: 'screen', x: 408, y: 312,
        width: 400, height: 200, corners: [
            { x: -200, y: -100 }, { x: 200, y: -100 },
            { x: 200, y: 100 }, { x: -200, y: 100 }
        ], opacity: 1, volume: 1, scaleX: 2, scaleY: 0.5
    });
    assert.deepEqual(descriptor.corners[0], { x: -200, y: -100 });
    assert.equal(descriptor.x, 408);
    assert.equal(descriptor.y, 312);
    assert.equal(descriptor.opacity, 1 / 255);
    assert.equal(descriptor.volume, 0.01);
    assert.equal(descriptor.scaleX, 2);
    assert.equal(descriptor.scaleY, 0.5);
    assert.equal(runtime.normalizeShowArgs({ id: 2, file: 'alpha.webm', alpha: 1 }).opacity, 1);

    const restored = runtime.normalizeShowArgs(JSON.parse(JSON.stringify(descriptor)));
    assert.equal(restored.opacity, 1 / 255, 'persisted normalized values are not normalized twice');
    assert.equal(restored.volume, 0.01);

    const owner = Object.create(runtime.VideoSurfaceOwner.prototype);
    owner.descriptor = descriptor;
    assert.deepEqual(owner.transformedCorners(), [
        { x: -400, y: -50 }, { x: 400, y: -50 },
        { x: 400, y: 50 }, { x: -400, y: 50 }
    ]);
    let position;
    owner.pixiContainer = {
        visible: false,
        position: { set: (x, y) => { position = [x, y]; } }
    };
    descriptor.cullDistance = 1;
    owner.updatePixiPosition();
    assert.deepEqual(position, [408, 312], 'the anchor is translated once, independently of local corners');
    assert.equal(owner.pixiContainer.visible, true);
});

test('transform keeps identity and media while updating runtime transform fields', () => {
    const shown = runtime.normalizeShowArgs({ id: 3, file: 'nested/panel.mp4', width: 320, height: 180 });
    shown.mapId = 9;
    shown.generation = 44;
    const transformed = runtime.normalizeTransformArgs({
        id: 3, x: 8, y: 12, width: 400, rotationY: 25, alpha: 0.5,
        cullDistance: 300, scanlines: true
    }, shown);
    assert.equal(transformed.file, shown.file);
    assert.equal(transformed.mapId, 9);
    assert.equal(transformed.generation, 44);
    assert.equal(transformed.x, 8);
    assert.equal(transformed.width, 400);
    assert.deepEqual(transformed.corners, [
        { x: -200, y: -90 }, { x: 200, y: -90 },
        { x: 200, y: 90 }, { x: -200, y: 90 }
    ]);
    assert.equal(runtime.normalizeTransformArgs({ id: 4, x: 1 }, shown), null);

    const warped = runtime.normalizeTransformArgs({
        id: 3, x0: -1, y0: -2, x1: 3, y1: -4,
        x2: 5, y2: 6, x3: -7, y3: 8
    }, shown);
    assert.deepEqual(warped.corners, [
        { x: -1, y: -2 }, { x: 3, y: -4 }, { x: 5, y: 6 }, { x: -7, y: 8 }
    ]);
});

test('manager stores descriptors only, uses stable generations, and stop removes them', () => {
    const previousMap = global.$gameMap;
    const map = { _mapId: 6, mapId() { return this._mapId; } };
    global.$gameMap = map;
    const manager = new runtime.VideoSurfaceManager();
    const first = manager.show({ id: 2, file: 'one.webm', wait: true }, null);
    assert.equal(first.generation, 1);
    const serialized = JSON.parse(JSON.stringify(map[runtime.STORE_KEY]));
    assert.equal(serialized.mapId, 6);
    assert.equal(serialized.surfaces['2'].file, 'one.webm');
    assert.equal(source.includes('map[STORE_KEY] = store'), true);

    const second = manager.show({ id: 2, file: 'two.mp4' }, null);
    assert.equal(second.generation, 2);
    assert.equal(Object.keys(map[runtime.STORE_KEY].surfaces).length, 1);
    assert.equal(map[runtime.STORE_KEY].surfaces['2'].file, 'two.mp4');
    assert.equal(manager.stop({ id: 2 }), true);
    assert.equal(map[runtime.STORE_KEY].surfaces['2'], undefined);
    global.$gameMap = previousMap;
});

test('replacement and transfer release waits while same-map suspension preserves them', () => {
    const previousMap = global.$gameMap;
    const map = { _mapId: 4, mapId() { return this._mapId; } };
    global.$gameMap = map;
    const manager = new runtime.VideoSurfaceManager();
    manager._spriteset = {};
    const interpreter = {
        _waitMode: '',
        setWaitMode(mode) { this._waitMode = mode; }
    };
    const first = manager.show({ id: 1, file: 'loop.webm', loop: true, wait: true }, interpreter);
    assert.equal(interpreter._waitMode, runtime.WAIT_MODE);
    manager.show({ id: 1, file: 'replacement.webm' }, null);
    assert.equal(interpreter._waitMode, '');
    assert.equal(interpreter._reactorVideoSurfaceWait, null);

    const looping = manager.descriptor(1);
    manager.armWait(interpreter, looping);
    manager.ended(looping.id, looping.generation);
    assert.equal(interpreter._waitMode, runtime.WAIT_MODE,
        'a looping surface waits for an explicit stop or replacement');
    manager.releaseWaiters(looping.id, looping.generation);

    const active = manager.descriptor(1);
    manager.armWait(interpreter, active);
    manager.stop(1);
    assert.equal(interpreter._waitMode, '');

    const third = manager.show({ id: 1, file: 'third.mp4', wait: true }, interpreter);
    const cleanupCalls = [];
    manager._owners.set(1, {
        generation: third.generation,
        cleanup(reason) {
            cleanupCalls.push(reason);
        }
    });
    manager.teardownRuntime('suspend');
    assert.deepEqual(cleanupCalls, ['suspend']);
    assert.equal(interpreter._waitMode, runtime.WAIT_MODE);
    assert.equal(manager.descriptor(1).waitReleased, false,
        'same-map renderer suspension preserves the event wait');
    manager.teardownRuntime('transfer');
    assert.equal(interpreter._waitMode, '');
    assert.equal(manager.descriptor(1).waitReleased, true);
    global.$gameMap = previousMap;
});

test('active map spritesets can arm pending owners and terminal flags survive save loading', () => {
    const previousMap = global.$gameMap;
    const map = { _mapId: 8, mapId() { return this._mapId; } };
    global.$gameMap = map;
    const manager = new runtime.VideoSurfaceManager();
    manager._spriteset = {};
    const interpreter = { _waitMode: '', setWaitMode(mode) { this._waitMode = mode; } };
    const descriptor = manager.show({ id: 9, file: 'pending.webm', wait: true }, interpreter);
    assert.equal(manager._owners.size, 0, 'Node has no DOM owner');
    assert.equal(manager.isWaiting(interpreter), true, 'renderer initialization may still be pending');
    descriptor.ended = true;
    descriptor.waitReleased = true;
    const loaded = runtime.normalizeShowArgs(JSON.parse(JSON.stringify(descriptor)));
    assert.equal(loaded.ended, true);
    assert.equal(loaded.waitReleased, true);
    global.$gameMap = previousMap;
});

test('wait is never armed without an active map spriteset', () => {
    const previousMap = global.$gameMap;
    global.$gameMap = { _mapId: 3, mapId() { return this._mapId; } };
    const manager = new runtime.VideoSurfaceManager();
    const interpreter = { _waitMode: '', setWaitMode(mode) { this._waitMode = mode; } };
    const descriptor = manager.show({ id: 3, file: 'pending.mp4', wait: true }, interpreter);
    assert.equal(descriptor.wait, false);
    assert.equal(descriptor.waitReleased, true);
    assert.equal(interpreter._waitMode, '');
    assert.equal(manager._waiters.size, 0);
    assert.equal(manager.show({ id: 4, file: 'bad.mp4', target: 'thisEvent' }, interpreter), null);
    global.$gameMap = previousMap;
});

test('terminal runtime reset clears stale singleton waiter references before save data replacement', () => {
    const manager = new runtime.VideoSurfaceManager();
    const interpreter = {
        _waitMode: runtime.WAIT_MODE,
        _reactorVideoSurfaceWait: { mapId: 99, id: 4, generation: 2 }
    };
    manager._waiters.set('4:2', new Set([interpreter]));
    manager.teardownRuntime('reset');
    assert.equal(manager._waiters.size, 0);
    assert.equal(interpreter._waitMode, '');
    assert.equal(interpreter._reactorVideoSurfaceWait, null);
    assert.match(source, /DataManager\.createGameObjects = function\(\)/);
});

test('backend selection supports Three world/above transitions and failed-3D PIXI fallback', () => {
    const previousThree = global.THREE;
    global.THREE = {};
    const owner = Object.create(runtime.VideoSurfaceOwner.prototype);
    owner.mapWants3D = () => true;
    owner.spriteset = { _reactor3d: { scene: {} } };
    const world = runtime.normalizeShowArgs({ id: 1, file: 'world.mp4', target: 'map', layer: 3 });
    const above = runtime.normalizeTransformArgs({ id: 1, layer: 5 }, world);
    assert.equal(owner.desiredBackend(world), 'three');
    assert.equal(owner.attachmentKeyFor(world), 'three:world');
    owner.backend = 'three';
    owner.attachmentKey = 'three:world';
    assert.equal(owner.needsRecreate(above), true);
    owner.spriteset = { _reactor3dFailed: true };
    assert.equal(owner.desiredBackend(world), 'pixi');
    assert.equal(owner.attachmentKeyFor(world), 'pixi:map');
    assert.equal(owner.desiredBackend({ ...world, target: 'screen' }), 'pixi');

    assert.match(source, /descriptor\.layer >= 5/);
    assert.match(source, /aboveBillboardsGroup/);
    assert.match(source, /createReactor3DSprite\(state\.viewport, scene\)/);
    global.THREE = previousThree;
});

test('Transform backend recreation preserves generation and active wait state', () => {
    const previousMap = global.$gameMap;
    const previousThree = global.THREE;
    global.THREE = {};
    global.$gameMap = { _mapId: 10, mapId() { return this._mapId; } };
    const manager = new runtime.VideoSurfaceManager();
    manager._spriteset = {};
    const interpreter = { _waitMode: '', setWaitMode(mode) { this._waitMode = mode; } };
    const descriptor = manager.show({ id: 6, file: 'pass.mp4', wait: true, layer: 3 }, interpreter);
    const calls = [];
    manager._owners.set(6, {
        generation: descriptor.generation,
        needsRecreate: next => next.layer >= 5,
        captureCurrentTime: next => { next.currentTime = 9.5; calls.push('capture'); },
        cleanup: reason => calls.push(reason)
    });
    manager.createOwner = next => { calls.push(['create', next.generation, next.currentTime]); return null; };
    const transformed = manager.transform({ id: 6, layer: 5 });
    assert.equal(transformed.generation, descriptor.generation);
    assert.equal(interpreter._waitMode, runtime.WAIT_MODE);
    assert.equal(transformed.waitReleased, false);
    assert.deepEqual(calls, ['capture', 'recreate', ['create', descriptor.generation, 9.5]]);
    global.$gameMap = previousMap;
    global.THREE = previousThree;
});

test('autoplay policy rejection remains pending and retries without failing the descriptor', async () => {
    const failures = [];
    let plays = 0;
    const owner = Object.create(runtime.VideoSurfaceOwner.prototype);
    Object.assign(owner, {
        cleaned: false, id: 2, generation: 7,
        manager: {
            isCurrent: () => true,
            failed: (...args) => failures.push(args)
        },
        video: {
            play() {
                plays++;
                if (plays === 1) return Promise.reject(Object.assign(new Error('gesture required'), {
                    name: 'NotAllowedError'
                }));
                return Promise.resolve();
            }
        }
    });
    owner.play();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(owner.awaitingGesture, true);
    assert.equal(failures.length, 0);
    owner.retryPlayback();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(plays, 2);
    assert.equal(owner.awaitingGesture, false);
    assert.equal(failures.length, 0);
});

test('lifecycle cleanup is deterministic and idempotent with private resources', () => {
    const calls = [];
    const owner = Object.create(runtime.VideoSurfaceOwner.prototype);
    Object.assign(owner, {
        cleaned: false, id: 5, generation: 8, listeners: [{
            target: { removeEventListener: (...args) => calls.push(['listener', ...args]) },
            type: 'ended', callback() {}, options: undefined
        }],
        descriptor: { id: 5 },
        manager: {
            descriptor: () => null,
            releaseWaiters: (...args) => calls.push(['release', ...args])
        },
        pixiMesh: {
            geometry: { destroy: () => calls.push(['pixiGeometryDestroy']) },
            destroy: () => calls.push(['pixiMeshDestroy'])
        },
        video: {
            pause: () => calls.push(['pause']),
            removeAttribute: name => calls.push(['removeAttribute', name]),
            load: () => calls.push(['load']),
            set src(value) { calls.push(['src', value]); }
        },
        audioSourceNode: { disconnect: () => calls.push(['audioDisconnect']) },
        gainNode: { disconnect: () => calls.push(['gainDisconnect']) },
        threeGeometry: { dispose: () => calls.push(['geometryDispose']) },
        threeMaterial: { dispose: () => calls.push(['materialDispose']) },
        threeTexture: { dispose: () => calls.push(['textureDispose']) }
    });
    owner.cleanup('stop');
    const count = calls.length;
    owner.cleanup('stop');
    assert.equal(calls.length, count);
    assert.equal(calls.filter(call => call[0] === 'pause').length, 1);
    assert.equal(calls.filter(call => call[0] === 'audioDisconnect').length, 1);
    assert.equal(calls.filter(call => call[0] === 'geometryDispose').length, 1);
    assert.equal(calls.filter(call => call[0] === 'pixiGeometryDestroy').length, 1);
    assert.deepEqual(calls.at(-1), ['release', 5, 8, 'stop']);
});

test('same-map owner suspension persists currentTime without terminal waiter release', () => {
    const releases = [];
    const descriptor = { id: 8, currentTime: 0 };
    const owner = Object.create(runtime.VideoSurfaceOwner.prototype);
    Object.assign(owner, {
        cleaned: false, id: 8, generation: 3, descriptor, listeners: [],
        manager: {
            descriptor: () => descriptor,
            releaseWaiters: (...args) => releases.push(args)
        },
        video: {
            currentTime: 42.25,
            pause() {}, removeAttribute() {}, load() {}, set src(value) {}
        }
    });
    owner.cleanup('suspend');
    assert.equal(descriptor.currentTime, 42.25);
    assert.deepEqual(releases, []);
});

test('runtime registers isolated commands and uses native PIXI v8 and Three APIs', () => {
    for (const command of ['ShowVideoSurface', 'TransformVideoSurface', 'StopVideoSurface']) {
        assert.match(source, new RegExp(`registerCommand\\(PLUGIN_NAME, "${command}"`));
    }
    assert.match(source, /const PLUGIN_NAME = "RPGReactor"/);
    assert.match(source, /new PIXI\.VideoSource\(/);
    assert.match(source, /new PIXI\.Texture\(\{ source:/);
    assert.match(source, /new PIXI\.PerspectiveMesh\(/);
    assert.match(source, /new THREE\.VideoTexture\(/);
    assert.match(source, /scene\.modelsGroup/);
    assert.match(source, /forceSinglePass: true/);
    assert.match(source, /geometry\.destroy\(\)/);
    assert.match(source, /WebAudio\._context/);
    assert.match(source, /WebAudio\._masterGainNode/);
    assert.doesNotMatch(source, /Texture\.from\(/);
    assert.doesNotMatch(source, /Assets\./);
    assert.doesNotMatch(source, /command261|PSYCHRONIC_VideoOverlay/);
});

test('main loads video surfaces in the required compatibility order', () => {
    const pictures = mainSource.indexOf('"js/reactor_picture_extensions.js"');
    const surfaces = mainSource.indexOf('"js/reactor_video_surfaces.js"');
    const mv = mainSource.indexOf('"js/reactor_mv_compat.js"');
    assert.ok(pictures >= 0 && surfaces > pictures && mv > surfaces);
});
