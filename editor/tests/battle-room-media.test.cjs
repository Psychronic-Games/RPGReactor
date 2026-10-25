const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '../../runtime', file), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(play) {
    const listeners = new Map(), failures = [];
    const document = {
        addEventListener(type, fn) { listeners.set(type, fn); },
        removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); }
    };
    const scope = { document };
    vm.runInNewContext(read('reactor_battle_room.js'), scope);
    const view = Object.create(scope.ReactorBattleRoomView.prototype);
    const media = { element: { play, pause() {}, removeAttribute() {}, load() {} }, fail: e => failures.push(e) };
    return { view, media, listeners, failures };
}
function error(name, message = name) { return Object.assign(new Error(message), { name }); }

function videoFixture() {
    const surfaces = require('../../runtime/reactor_media_surfaces.js');
    const errors = [], warnings = [], disposed = [];
    const video = { videoWidth: 0, pauseCount: 0, play: () => Promise.resolve(), pause() { this.pauseCount++; }, removeAttribute() {}, load() {}, cancelVideoFrameCallback(id) { this.cancelled = id; } };
    const disposable = class { dispose() { disposed.push(this); } };
    const scope = {
        document: { createElement: () => video },
        Reactor3D: { effectAnchorWorld: () => null }, RPGReactorMediaSurfaces: surfaces,
        THREE: {
            PlaneGeometry: disposable, MeshBasicMaterial: class extends disposable { constructor(o) { super(); Object.assign(this, o); } },
            Mesh: class { constructor(geometry, material) { Object.assign(this, { geometry, material, userData: {} }); } removeFromParent() {} },
            VideoTexture: class extends disposable { constructor(image) { super(); Object.assign(this, { image, isVideoTexture: true, userData: {}, _requestVideoFrameCallbackId: 9 }); } },
            Vector3: class {}
        }
    };
    vm.runInNewContext(read('reactor_battle_room.js'), scope);
    const view = Object.create(scope.ReactorBattleRoomView.prototype);
    view.assets = { mediaUrl: () => 'screen.webm', warn: s => warnings.push(s) };
    view.renderer = { getContext: () => ({ INVALID_VALUE: 0x0501, getError: () => errors.shift() || 0 }) };
    view.effectActive = () => true;
    const record = { effects: [{ type: 'video', video: { file: 'screen.webm' } }], object: { add() {}, userData: {} } };
    return { surfaces, view, record, video, errors, warnings, disposed };
}

test('room video waits for a frame and stops failed GPU uploads through the shared watcher', async () => {
    const f = videoFixture(), warn = console.warn;
    f.surfaces.watchVideoImport.reported = false;
    console.warn = () => {};
    try {
        f.view.updateMedia(f.record);
        const media = f.record.media.get(0);
        f.video.onloadeddata(); assert.equal(media.texture, undefined, 'zero-sized frames are never uploaded');
        f.video.videoWidth = 64; f.video.onloadeddata();
        assert.equal(typeof media.texture.onUpdate, 'function');
        for (let i = 0; i < 3; i++) { f.errors.push(0x0501); media.texture.onUpdate(); }
        assert.equal(media.texture.userData.rrImportFailed, true);
        assert.equal(f.video.cancelled, 9);
        f.view.updateMedia(f.record);
        assert.equal(media.failed, true); assert.equal(media.plane.visible, false);
        assert.equal(f.warnings.length, 1); assert.ok(f.video.pauseCount > 0);
        f.view.updateMedia(f.record); assert.equal(f.warnings.length, 1, 'failed media is not recreated or reported repeatedly');
        f.view.stopMedia(media); assert.ok(f.disposed.includes(media.texture));
    } finally { console.warn = warn; f.surfaces.watchVideoImport.reported = false; }
    await settle();
});

test('successful room video uploads stay active and late ready events cannot revive disposed media', async () => {
    const f = videoFixture(); f.view.updateMedia(f.record);
    const media = f.record.media.get(0), ready = f.video.onloadeddata;
    f.video.videoWidth = 64; ready();
    for (let i = 0; i < 10; i++) media.texture.onUpdate();
    assert.equal(media.failed, undefined); assert.equal(media.plane.visible, true); assert.deepEqual(f.warnings, []);
    const texture = media.texture; f.view.stopMedia(media); ready();
    assert.equal(media.texture, texture); assert.ok(f.disposed.includes(texture));
    await settle();
});

test('room autoplay rejection retries once per gesture and releases listeners after success', async () => {
    let calls = 0, resolve;
    const f = fixture(() => ++calls === 1 ? Promise.reject(error('NotAllowedError')) : new Promise(r => resolve = r));
    f.view.playMedia(f.media); await settle();
    assert.equal(f.listeners.size, 3); assert.deepEqual(f.failures, []);
    f.listeners.get('pointerdown')(); f.listeners.get('keydown')();
    assert.equal(calls, 2, 'overlapping gestures do not start overlapping plays');
    resolve(); await settle(); assert.equal(f.listeners.size, 0);
    assert.equal(f.media.playPending, false);
});

test('room teardown consumes a pending play rejection and never rearms playback', async () => {
    let reject;
    const f = fixture(() => new Promise((_, r) => reject = r));
    f.view.playMedia(f.media); f.view.stopMedia(f.media);
    reject(error('AbortError')); await settle();
    assert.equal(f.media.disposed, true); assert.equal(f.listeners.size, 0); assert.deepEqual(f.failures, []);
});

test('room disposal removes blocked autoplay listeners, and synchronous failures are contained', async () => {
    const f = fixture(() => { throw error('NotAllowedError'); });
    f.view.playMedia(f.media); assert.equal(f.listeners.size, 3);
    f.view.stopMedia(f.media); assert.equal(f.listeners.size, 0);
    const broken = fixture(() => Promise.reject(error('NotSupportedError')));
    broken.view.playMedia(broken.media); await settle();
    assert.equal(broken.failures[0].name, 'NotSupportedError'); assert.equal(broken.listeners.size, 0);
});

test('active room playback interruptions remain retryable; older play APIs need no promise', async () => {
    const f = fixture(() => Promise.reject(error('AbortError')));
    f.view.playMedia(f.media); await settle();
    assert.equal(f.listeners.size, 3); assert.deepEqual(f.failures, []);
    f.media.element.play = () => undefined;
    f.listeners.get('keydown')(); await settle(); assert.equal(f.listeners.size, 0);
});

test('game ignores only browser play interruption rejections; other errors remain fatal', () => {
    const fatal = [], scope = { SceneManager: { onError: e => fatal.push(e.reason) } };
    const source = read('reactor_managers.js');
    vm.runInNewContext(source.slice(source.indexOf('SceneManager.onReject ='), source.indexOf('SceneManager.onUnload =')), scope);
    let prevented = 0;
    for (const cause of ['a call to pause()', 'a new load request']) {
        scope.SceneManager.onReject({ reason: error('AbortError', 'The play() request was interrupted by ' + cause + '.'), preventDefault() { prevented++; } });
    }
    assert.equal(prevented, 2); assert.deepEqual(fatal, []);
    for (const e of [error('AbortError', 'The fetch request was aborted'), error('TypeError'), error('NotAllowedError'), 'The play() request was interrupted']) {
        scope.SceneManager.onReject({ reason: e });
    }
    assert.equal(fatal.length, 4);
});

test('a room picture goes through the game\'s image loader (an encrypted .png_ decrypts as Show Picture\'s does)', () => {
    const disposable = class { dispose() {} };
    const scope = {
        document: { createElement: () => { throw new Error('no element is made for a picture the loader reads'); } },
        Reactor3D: { effectAnchorWorld: () => null }, RPGReactorMediaSurfaces: require('../../runtime/reactor_media_surfaces.js'),
        THREE: {
            PlaneGeometry: disposable, MeshBasicMaterial: class extends disposable { constructor(o) { super(); Object.assign(this, o); } },
            Mesh: class { constructor(geometry, material) { Object.assign(this, { geometry, material, userData: {} }); } removeFromParent() {} },
            Texture: class extends disposable { constructor(image) { super(); Object.assign(this, { image, userData: {} }); } },
            Vector3: class {}, SRGBColorSpace: 'srgb', LinearFilter: 1
        }
    };
    vm.runInNewContext(read('reactor_battle_room.js'), scope);
    const view = Object.create(scope.ReactorBattleRoomView.prototype);
    const asked = [], warnings = [];
    // The picture's bitmap: loading, then read.
    const bitmap = { ready: false, isReady() { return this.ready; }, isError: () => false, image: { width: 64, height: 32 } };
    view.assets = { loadImage: file => { asked.push(file); return bitmap; }, mediaUrl: () => { throw new Error('a picture is not asked for by its URL'); }, warn: s => warnings.push(s) };
    view.effectActive = () => true;
    const record = { effects: [{ type: 'video', video: { file: 'Psychronic-logo-1.png' } }], object: { add() {}, userData: {} } };
    view.updateMedia(record);
    const media = record.media.get(0);
    assert.deepEqual(asked, ['Psychronic-logo-1.png']);
    assert.equal(media.failed, undefined);
    assert.equal(media.texture, undefined, 'nothing is drawn while it loads');
    bitmap.ready = true;
    view.updateMedia(record);
    assert.equal(media.texture && media.texture.image, bitmap.image, 'once read, it is the plane\'s picture');
    assert.equal(media.plane.visible, true);
    // One the loader cannot read fails as a missing picture does, once.
    const broken = { isReady: () => false, isError: () => true };
    view.assets.loadImage = () => broken;
    const other = { effects: [{ type: 'video', video: { file: 'Gone.png' } }], object: { add() {}, userData: {} } };
    view.updateMedia(other);
    assert.equal(other.media.get(0).failed, true);
    assert.equal(warnings.length, 1);
});
