// Memory: what the runtime gives back once it is done with it. Background workers rest when idle
// (each holds a heap of its own), and the next job makes them again.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

function load() {
    global.self = global; global.window = global;
    require(path.resolve(__dirname, '..', '..', 'runtime/libs/three.js'));
    return require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('an idle worker is ended after the rest time, a busy one is left, and the timers do not hold a process open', async () => {
    const R = load(), I = R.IdleWorkers, rest = I.REST_MS;
    I.REST_MS = 20;
    try {
        let ended = 0, busy = true;
        I.touch('test', () => busy, () => { ended++; });
        await sleep(50);
        assert.equal(ended, 0, 'work is still out: the worker stays');
        busy = false;
        await sleep(50);
        assert.equal(ended, 1, 'idle past the rest time: ended once');
        await sleep(40);
        assert.equal(ended, 1, 'and not again');
        // A touch before the rest time starts the wait over.
        let second = 0;
        I.touch('again', () => false, () => { second++; });
        await sleep(10); I.touch('again', () => false, () => { second++; });
        await sleep(12); assert.equal(second, 0, 'the wait started over');
        await sleep(30); assert.equal(second, 1);
        I.REST_MS = 0; I.touch('off', () => false, () => { second++; }); await sleep(10);
        assert.equal(second, 1, 'a rest time of 0 switches resting off');
    } finally { I.REST_MS = rest; }
});

test('the image worker and the rock meshers are made again after a rest', async () => {
    const R = load(), I = R.IdleWorkers, rest = I.REST_MS;
    const made = [], ended = [];
    global.Worker = class { constructor(url, options) { this.name = options && options.name || String(url); made.push(this); } postMessage() {} terminate() { ended.push(this); } };
    global.Blob = class { constructor(parts) { this.parts = parts; } };
    global.createImageBitmap = async () => ({ close() {} });
    global.document = { baseURI: 'file:///game/' };
    const createObjectURL = URL.createObjectURL, revoke = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:worker'; URL.revokeObjectURL = () => {};
    I.REST_MS = 15;
    try {
        delete R.ImageWorker._worker; R.ImageWorker._jobs.clear();
        const job = R.ImageWorker.request('opaque', { src: 'img/a.png' }, null);
        assert.ok(job && made.length === 1, 'a job makes the worker');
        await sleep(40);
        assert.equal(ended.length, 0, 'a job is out: it stays');
        made[0].onmessage({ data: { id: R.ImageWorker._serial, opaque: true, width: 1, height: 1 } });
        await job; await sleep(40);
        assert.equal(ended.length, 1, 'nothing out: it rests');
        assert.equal(R.ImageWorker._worker, undefined);
        R.ImageWorker.request('opaque', { src: 'img/b.png' }, null);
        assert.equal(made.length, 2, 'the next job makes it again');
        R.ImageWorker._jobs.clear();
        await sleep(40);
        // The rock meshers.
        delete R._rockPool; made.length = 0; ended.length = 0;
        const pool = R.rockWorkerPool();
        assert.ok(pool && made.length >= 1);
        const workers = made.slice();
        let done = 0;
        pool.submit({ frames: [] }, () => { done++; }, () => []);
        await sleep(40);
        assert.equal(ended.length, 0, 'a chunk is out: the meshers stay');
        const out = Array.from(pool.jobs.values())[0];
        out.worker.onmessage({ data: { id: out.id, buckets: [] } });
        assert.equal(done, 1);
        await sleep(40);
        assert.equal(ended.length, workers.length, 'every mesher rested');
        assert.equal(R._rockPool, undefined);
        // Work handed to the rested pool goes to the one made after it.
        made.length = 0;
        pool.submit({ frames: [] }, () => { done++; }, () => []);
        assert.ok(made.length >= 1 && R._rockPool && R._rockPool !== pool, 'a new pool took the job');
        assert.equal(R._rockPool.jobs.size, 1);
        R._rockPool.jobs.clear();
    } finally {
        I.REST_MS = rest; delete global.Worker; delete global.Blob; delete global.createImageBitmap; delete global.document; delete R._rockPool; delete R.ImageWorker._worker;
        URL.createObjectURL = createObjectURL; URL.revokeObjectURL = revoke;
    }
});

function fakeRenderer() {
    const props = new Map();
    return { properties: { get: t => { let p = props.get(t); if (!p) props.set(t, p = {}); return p; } },
        uploads: 0,
        initTexture(texture) { const p = this.properties.get(texture); p.__webglInit = true; p.__version = texture.version; this.uploads++; this.lastImage = texture.image; this.lastFlip = texture.flipY; } };
}

test('a decoded bitmap is closed once its texture is on the GPU, and the texture goes back to its own image', async () => {
    const R = load(), THREE = global.THREE, W = R.ShaderWarmup;
    const renderer = fakeRenderer();
    let closed = 0;
    const image = { tagName: 'IMG', complete: true, naturalWidth: 2048, naturalHeight: 2048, src: 'file:///game/3d/a.png' };
    const made = [];
    global.createImageBitmap = async (source, options) => { const bitmap = { width: 2048, height: 2048, options, close() { closed++; } }; made.push(bitmap); return bitmap; };
    const bitmaps = W.bitmaps, worker = R.ImageWorker.bitmap;
    W.bitmaps = true; R.ImageWorker.bitmap = () => null;
    try {
        const texture = new THREE.Texture(image); texture.flipY = true; texture.needsUpdate = true;
        W.request(renderer, texture);
        await sleep(5);
        assert.equal(made.length, 1);
        assert.equal(made[0].options.imageOrientation, 'flipY', 'the flip is baked into the bitmap');
        assert.equal(texture.image, made[0]);
        assert.equal(texture.flipY, true, 'the texture keeps its own flag: textures of one picture keep one upload');
        assert.equal(W.sourceImage(texture), image, 'its file\'s picture is still known');
        W.pump(renderer);
        assert.equal(renderer.uploads, 1);
        assert.equal(renderer.lastImage, made[0], 'the bitmap is what was uploaded');
        assert.equal(closed, 1, 'then it is closed');
        assert.equal(texture.image, image, 'the texture reads its own image again');
        assert.equal(W.uploaded(renderer, texture), true, 'still on the GPU: nothing asks for it again');
        assert.equal(W.release(renderer, texture), false, 'nothing left to give back');
        // Asked again (a restored context): a new bitmap is decoded.
        texture.needsUpdate = true;
        W.request(renderer, texture); await sleep(5);
        assert.equal(made.length, 2);
        // Not on the GPU yet: the bitmap is kept.
        assert.equal(W.release(renderer, texture), false); assert.equal(texture.image, made[1]); assert.equal(closed, 1);
        // Switched off, nothing is closed.
        W.releaseImages = false;
        try { W.pump(renderer); assert.equal(closed, 1); assert.equal(texture.image, made[1]); } finally { W.releaseImages = true; }
        // Let go with its model: closed and back on the image, uploaded or not.
        W.forget(texture);
        assert.equal(closed, 2); assert.equal(texture.image, image);
        W.forget(texture);
        assert.equal(closed, 2, 'once');
    } finally { W.bitmaps = bitmaps; R.ImageWorker.bitmap = worker; delete global.createImageBitmap; }
});

test('textures of one picture share one source and one decode, and the bitmap stays until each is on the GPU', async () => {
    const R = load(), THREE = global.THREE, W = R.ShaderWarmup, P = R.ScenePictures;
    const renderer = fakeRenderer();
    let closed = 0, decodes = 0;
    global.createImageBitmap = async () => { decodes++; return { width: 2400, height: 2400, close() { closed++; } }; };
    const bitmaps = W.bitmaps, worker = R.ImageWorker.bitmap;
    W.bitmaps = true; R.ImageWorker.bitmap = () => null;
    try {
        const image = { tagName: 'IMG', complete: true, naturalWidth: 2400, naturalHeight: 2400, src: 'file:///game/img/parallaxes/Walls.png' };
        const other = { tagName: 'IMG', complete: true, naturalWidth: 64, naturalHeight: 64, src: 'file:///game/img/parallaxes/Floor.png' };
        const first = P.texture(image, true), second = P.texture(image, true), wall = first.clone(), third = P.texture(other, true);
        assert.equal(second.source, first.source, 'two pieces showing one file: one source');
        assert.equal(wall.source, first.source);
        assert.notEqual(third.source, first.source);
        assert.equal(first.userData.rrScenePicture, true);
        assert.equal(P.texture(image).userData.rrScenePicture, undefined, 'only what a caller names a picture is ever resampled');
        assert.equal(P.texture({ width: 8, height: 8 }, true).userData.rrScenePicture, undefined, 'a canvas is drawn into: left as it is');
        for (const texture of [first, second, wall]) { texture.needsUpdate = true; W.request(renderer, texture); }
        await sleep(5);
        assert.equal(decodes, 1, 'decoded once for the three of them');
        const bitmap = first.image;
        assert.equal(second.image, bitmap); assert.equal(wall.image, bitmap);
        // One a frame reaches the GPU: the copy stays for the ones still waiting.
        const queue = W.queueOf(renderer), all = queue.list.splice(0);
        queue.list.push(all[0]); W.pump(renderer);
        assert.equal(closed, 0);
        assert.equal(first.image, bitmap);
        queue.list.push(all[1], all[2]); W.pump(renderer); W.pump(renderer);
        assert.equal(closed, 1, 'closed once, after the last');
        assert.equal(first.image, image); assert.equal(wall.image, image);
    } finally { W.bitmaps = bitmaps; R.ImageWorker.bitmap = worker; delete global.createImageBitmap; }
});

test('a low-memory machine keeps scene pictures at 2048 on the longest side; tilesets and other machines keep the file\'s size', async () => {
    const R = load(), W = R.ShaderWarmup, P = R.ScenePictures, tier = R.memoryTier;
    const renderer = fakeRenderer();
    const asked = [];
    global.createImageBitmap = async (source, options) => { asked.push(options); return { width: options.resizeWidth || source.naturalWidth, height: options.resizeHeight || source.naturalHeight, close() {} }; };
    const bitmaps = W.bitmaps, worker = R.ImageWorker.bitmap;
    W.bitmaps = true; R.ImageWorker.bitmap = () => null;
    const img = (w, h, name) => ({ tagName: 'IMG', complete: true, naturalWidth: w, naturalHeight: h, src: 'file:///game/img/pictures/' + name });
    try {
        R.memoryTier = 'low';
        assert.equal(P.cap(), 2048);
        const poster = P.texture(img(4000, 2250, 'poster.jpg'), true), small = P.texture(img(1774, 887, 'sky.png'), true), tiles = P.texture(img(4096, 4096, 'tiles.png'));
        for (const texture of [poster, small, tiles]) { texture.needsUpdate = true; W.request(renderer, texture); }
        await sleep(5);
        assert.deepEqual([asked[0].resizeWidth, asked[0].resizeHeight, asked[0].resizeQuality], [2048, 1152, 'high']);
        assert.equal(asked[1].resizeWidth, undefined, 'under the cap: as the file is');
        assert.equal(asked[2].resizeWidth, undefined, 'a tileset is never resampled');
        R.memoryTier = 'normal';
        assert.equal(P.cap(), 0);
        const full = P.texture(img(4000, 2250, 'poster2.jpg'), true); full.needsUpdate = true; W.request(renderer, full);
        await sleep(5);
        assert.equal(asked[3].resizeWidth, undefined);
    } finally { R.memoryTier = tier; W.bitmaps = bitmaps; R.ImageWorker.bitmap = worker; delete global.createImageBitmap; }
});

test('a low-memory machine keeps model textures at half size, resampled where they are decoded', async () => {
    const R = load(), THREE = global.THREE, W = R.ShaderWarmup;
    const tier = R.memoryTier, nav = Object.getOwnPropertyDescriptor(global, 'navigator');
    try {
        R.memoryTier = 'normal'; assert.equal(R.textureCap(), 2048);
        R.memoryTier = 'low'; assert.equal(R.lowMemory(), true); assert.equal(R.textureCap(), 1024);
        R.lowMemoryTextureSize = 512; assert.equal(R.textureCap(), 512); R.lowMemoryTextureSize = 4096; assert.equal(R.textureCap(), 2048, 'never over the usual cap'); R.lowMemoryTextureSize = 1024;
        R.memoryTier = 'auto';
        Object.defineProperty(global, 'navigator', { value: { deviceMemory: 4 }, configurable: true }); assert.equal(R.lowMemory(), true, '4 GB reported: low');
        Object.defineProperty(global, 'navigator', { value: { deviceMemory: 8 }, configurable: true }); assert.equal(R.lowMemory(), false);
        Object.defineProperty(global, 'navigator', { value: {}, configurable: true }); assert.equal(R.lowMemory(), false, 'nothing reported: not low');
        // The decode asks for the smaller bitmap; only a model's sheet, and only when it is over the cap.
        R.memoryTier = 'low';
        const asked = [];
        global.createImageBitmap = (source, options) => { asked.push(options); return Promise.resolve({ width: options.resizeWidth || source.naturalWidth, height: options.resizeHeight || source.naturalHeight, close() {} }); };
        const worker = R.ImageWorker.enabled; R.ImageWorker.enabled = false; delete R.ImageWorker._worker;
        const renderer = { properties: { get: () => ({}) }, initTexture() {} };
        const sheet = { tagName: 'IMG', complete: true, naturalWidth: 2048, naturalHeight: 1024, src: 'a.png' };
        const model = new THREE.Texture(sheet); model.userData.rrModelTexture = true; model.flipY = false; model.needsUpdate = true;
        W.request(renderer, model); await new Promise(r => setTimeout(r, 5));
        assert.deepEqual([asked[0].resizeWidth, asked[0].resizeHeight, asked[0].resizeQuality], [1024, 512, 'high'], 'the longest side lands on the cap, aspect kept');
        assert.equal(model.image.width, 1024);
        const ground = new THREE.Texture(sheet); ground.needsUpdate = true;
        W.request(renderer, ground); await new Promise(r => setTimeout(r, 5));
        assert.equal(asked[1].resizeWidth, undefined, 'a material that is not a model sheet is left at its size');
        const small = new THREE.Texture({ tagName: 'IMG', complete: true, naturalWidth: 512, naturalHeight: 512, src: 'b.png' }); small.userData.rrModelTexture = true; small.needsUpdate = true;
        W.request(renderer, small); await new Promise(r => setTimeout(r, 5));
        assert.equal(asked[2].resizeWidth, undefined, 'under the cap: untouched');
        R.memoryTier = 'normal';
        const usual = new THREE.Texture(sheet); usual.userData.rrModelTexture = true; usual.needsUpdate = true;
        W.request(renderer, usual); await new Promise(r => setTimeout(r, 5));
        assert.equal(asked[3].resizeWidth, undefined, 'a machine with memory keeps the sheet whole');
        R.ImageWorker.enabled = worker;
    } finally { R.memoryTier = tier; delete global.createImageBitmap; delete R.ImageWorker._worker; if (nav) Object.defineProperty(global, 'navigator', nav); else delete global.navigator; }
});

test('a low-memory machine decodes two pictures at a time and keeps one rock mesher; other machines are not held back', async () => {
    const R = load(), W = R.ShaderWarmup, tier = R.memoryTier, rest = R.IdleWorkers.REST_MS;
    const made = [];
    global.Worker = class { constructor() { made.push(this); } postMessage() {} terminate() {} };
    global.Blob = class { constructor(parts) { this.parts = parts; } };
    const createObjectURL = URL.createObjectURL, revoke = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:worker'; URL.revokeObjectURL = () => {};
    R.IdleWorkers.REST_MS = 0;
    try {
        const run = async tierName => {
            R.memoryTier = tierName;
            let out = 0, most = 0;
            const finish = [];
            const jobs = [1, 2, 3, 4, 5].map(n => W.decodeTurn(() => { out++; most = Math.max(most, out); return new Promise(resolve => finish.push(() => { out--; resolve(n); })); }));
            await sleep(5);
            const started = finish.length;
            // Each one that ends lets the next begin, a failed one too.
            while (finish.length) { finish.shift()(); await sleep(2); }
            assert.deepEqual(await Promise.all(jobs), [1, 2, 3, 4, 5]);
            assert.equal(W._decodesOut, 0);
            return { started, most };
        };
        assert.deepEqual(await run('low'), { started: 2, most: 2 });
        assert.deepEqual(await run('normal'), { started: 5, most: 5 });
        R.memoryTier = 'low';
        const failed = W.decodeTurn(() => Promise.reject(new Error('no decode')));
        await assert.rejects(failed);
        assert.equal(W._decodesOut, 0, 'a failed decode gives its turn back');
        assert.equal(await W.decodeTurn(() => 7), 7);

        delete R._rockPool; made.length = 0;
        assert.ok(R.rockWorkerPool());
        assert.equal(made.length, 1, 'one mesher on a low-memory machine');
        delete R._rockPool; made.length = 0; R.memoryTier = 'normal';
        const cores = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
        assert.ok(R.rockWorkerPool());
        assert.equal(made.length, cores);
    } finally {
        R.memoryTier = tier; R.IdleWorkers.REST_MS = rest; delete global.Worker; delete global.Blob; delete R._rockPool;
        URL.createObjectURL = createObjectURL; URL.revokeObjectURL = revoke;
    }
});

test('a map scene that ends takes its light volume with it, and leaves another scene\'s alone', () => {
    const R = load(), V = R.LightVolume;
    const reset = V.reset, scene = V._scene;
    let resets = 0;
    V.reset = () => { resets++; };
    try {
        const ending = Object.create(R.MapScene.prototype), other = Object.create(R.MapScene.prototype);
        ending.clear = () => {}; other.clear = () => {};
        V._scene = ending;
        other.destroy();
        assert.equal(resets, 0);
        assert.equal(V._scene, ending);
        ending.destroy();
        assert.equal(resets, 1, 'its volume targets are given back');
        assert.equal(V._scene, null);
    } finally { V.reset = reset; V._scene = scene; }
});

test('the GLB worker splits and parses a model and decodes none of its pictures', async () => {
    const R = load();
    const source = R._glbWorkerSource();
    assert.doesNotMatch(source, /createImageBitmap|Reactor3D/, 'nothing the worker cannot reach, and no decode it would drop');
    // Run the worker's own source against a GLB with an embedded picture.
    const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, images: [{ bufferView: 0, mimeType: 'image/png' }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 8 }] }));
    const pad = Buffer.alloc((4 - json.length % 4) % 4, 0x20), bin = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const head = Buffer.alloc(12), jsonHead = Buffer.alloc(8), binHead = Buffer.alloc(8);
    head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4);
    jsonHead.writeUInt32LE(json.length + pad.length, 0); jsonHead.writeUInt32LE(0x4E4F534A, 4);
    binHead.writeUInt32LE(bin.length, 0); binHead.writeUInt32LE(0x004E4942, 4);
    const whole = Buffer.concat([head, jsonHead, json, pad, binHead, bin]);
    whole.writeUInt32LE(whole.length, 8);
    const buffer = new ArrayBuffer(whole.length);
    new Uint8Array(buffer).set(whole);
    const posted = [];
    let decodes = 0;
    const scope = { postMessage: (message, transfers) => posted.push({ message, transfers }) };
    new Function('self', 'createImageBitmap', source)(scope, () => { decodes++; return Promise.resolve({}); });
    scope.onmessage({ data: { id: 3, buffer } });
    await sleep(5);
    assert.equal(posted.length, 1);
    assert.equal(posted[0].message.id, 3);
    assert.equal(posted[0].message.json.images.length, 1);
    assert.equal(posted[0].message.bitmaps, undefined);
    assert.equal(posted[0].message.binLength, 8);
    assert.deepEqual(posted[0].transfers, [buffer], 'only the bytes travel back');
    assert.equal(decodes, 0);
    assert.equal(R._workerParts.decodeImages, undefined);
});
