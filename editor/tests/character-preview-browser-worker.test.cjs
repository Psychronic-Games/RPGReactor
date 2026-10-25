'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PreviewWorker, snapshotContext } = require('../src/forge/Character3D/CharacterPreviewBrowser.js');

function fixture(options = {}) {
    const workers = [];
    const client = new PreviewWorker(Object.assign({ workerURL: 'https://example.test/CharacterPreviewBrowserEntry.js', createWorker() {
        const worker = { messages: [], postMessage(data) { this.messages.push(structuredClone(data)); }, terminate() { this.terminated = true; },
            reply(data) { this.onmessage({ data }); } };
        workers.push(worker); return worker;
    } }, options));
    return { client, workers };
}
const request = key => ({ key, recipe: { gender: 0 }, options: { skinSize: 32 }, cacheKey: 'species' });

test('browser worker deduplicates full builds and retains only one active worker', async () => {
    const { client, workers } = fixture();
    client.configure({ eyeSource: { width: 1 }, emblemPictures: new Map([['logo', { width: 2 }]]) });
    const a = client.build(request('a')), duplicate = client.build(request('a')), b = client.build(request('b'));
    assert.equal(a, duplicate); assert.equal(workers.length, 1);
    assert.deepEqual(workers[0].messages.map(m => m.type), ['context', 'build']);
    workers[0].reply({ id: 1, result: { height: 1.7 } });
    assert.equal((await a).height, 1.7);
    assert.deepEqual(workers[0].messages.map(m => m.type), ['context', 'build', 'build']);
    workers[0].reply({ id: 2, result: { height: 1.8 } });
    assert.equal((await b).height, 1.8); client.dispose(); assert.ok(workers[0].terminated);
});

test('browser cancellation and resource revisions reject stale work without settling its replacement', async () => {
    const { client, workers } = fixture();
    const old = client.build(request('same')); const rejected = assert.rejects(old, { name: 'AbortError' });
    client.configure({ eyeSource: { width: 2 } }); await rejected;
    const next = client.build(request('same'));
    workers[0].reply({ id: 1, result: { stale: true } });
    const sent = workers[0].messages;
    assert.equal(sent.filter(m => m.type === 'context').length, 2);
    assert.equal(sent.at(-2).context.eyeSource.width, 2);
    workers[0].reply({ id: 1, result: { staleAgain: true } });
    workers[0].reply({ id: 2, result: { fresh: true } });
    assert.deepEqual(await next, { fresh: true }); client.dispose();
});

test('browser cancellation, bounded queue, worker failure and timeout all release resources', async () => {
    const { client, workers } = fixture({ maxQueued: 1 });
    const active = client.build(request('active')), queued = client.build(request('queued'));
    const activeRejected = assert.rejects(active, /decode failed/), queuedRejected = assert.rejects(queued, { name: 'AbortError' });
    await assert.rejects(client.build(request('overflow')), { code: 'PREVIEW_QUEUE_FULL' });
    assert.ok(client.cancel('queued')); await queuedRejected;
    workers[0].onerror({ message: 'decode failed', preventDefault() {} }); await activeRejected;
    assert.ok(workers[0].terminated);
    const recovery = client.build(request('recovery')); assert.equal(workers.length, 2);
    workers[1].reply({ id: 3, result: { ok: true } }); assert.ok((await recovery).ok); client.dispose();
    const timeout = fixture({ timeoutMs: 5 });
    await assert.rejects(timeout.client.build(request('timeout')), /timed out/);
    assert.ok(timeout.workers[0].terminated); timeout.client.dispose();
});

test('browser snapshot preserves render resources and excludes mutable fitting caches', async () => {
    const outfit = { rest: Float32Array.of(1, 2), _reference: Float32Array.of(3), callable() {} };
    const picture = { width: 1, height: 1, data: Uint8Array.of(1, 2, 3, 255) };
    const snap = snapshotContext({ transfers: [{ key: 'project:coat', outfit, picture }], emblemPictures: { logo: picture } });
    assert.equal(snap.transfers[0].outfit.rest, outfit.rest);
    assert.equal(snap.transfers[0].outfit._reference, undefined);
    assert.equal(snap.transfers[0].outfit.callable, undefined);
    assert.equal(snap.emblemPictures.get('logo'), picture);
    const foreign = vm.runInNewContext('new Map([["logo", {width: 3}]])');
    assert.equal(snapshotContext({ emblemPictures: foreign }).emblemPictures.get('logo').width, 3);
    const client = new PreviewWorker(); await assert.rejects(client.build(request('missing')), { code: 'PREVIEW_WORKER_UNAVAILABLE' }); client.dispose();
});

test('classic worker entry sequences asynchronous asset loading before off-page build and transfers owned arrays', async () => {
    const imports = [], messages = [], calls = []; let resolvePack;
    const modelArray = Float32Array.of(0, 1, 2), pixels = Uint8Array.of(10, 20, 30, 255);
    const outfit = { key: 'carol', picture: 'carol.jpg' };
    const self = {
        location: { href: 'https://example.test/src/forge/Character3D/CharacterPreviewBrowserEntry.js' },
        RRHumanBody: { loadPack(url) { calls.push(['pack', url]); return new Promise(resolve => { resolvePack = resolve; }); } },
        RRCharacterClothes: { async preload(pack, url) { calls.push(['clothes', url]); } },
        RRCharacterWardrobe: { BY_ID: new Map([['ss_carol_uniform', { transfer: 'carol' }]]), PRESETS: [] },
        RRCharacterOutfitTransfer: { BUILT_IN: ['carol'], store: { outfits: new Map(), pictures: new Map(), tints: new Map() },
            register() { throw Error('built-in must keep existing definition'); }, unregister() {} },
        RRCharacterModel: { build(pack, recipe, cache, options) {
            calls.push(['build', recipe.name, options.eyeSource?.width, cache.wardrobe.emblemPictures.size]);
            return { height: 1.7, parts: [{ name: 'Body', keepColors: true, positions: modelArray, index: Uint16Array.of(0), joints: Uint8Array.of(0) }], textures: { skin: { width: 1, height: 1, repeat: true, data: pixels } } };
        } },
        postMessage(message, transfers) { messages.push({ message, transfers }); }
    };
    const realm = vm.createContext({ self, importScripts: (...urls) => imports.push(...urls), URL, Map, Set, ArrayBuffer, Float32Array, Uint16Array, Uint8Array, DataView,
        OffscreenCanvas: function() {}, createImageBitmap() {}, performance });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/CharacterPreviewBrowserEntry.js'), 'utf8'), realm);
    assert.equal(imports[0], '../../utils/QuadricDecimator.js'); assert.equal(imports.at(-1), 'CharacterModel.js');
    self.onmessage({ data: { type: 'context', context: { eyeSource: { width: 42 }, emblemPictures: new Map([['logo', {}]]), transfers: [{ key: 'carol', id: 'ss_carol_uniform', outfit, picture: { data: pixels } }] } } });
    self.onmessage({ data: { type: 'build', id: 1, recipe: { name: 'old', outfit: [{ id: 'ss_carol_uniform' }] } } });
    self.onmessage({ data: { type: 'context', context: { eyeSource: { width: 43 } } } });
    self.onmessage({ data: { type: 'build', id: 2, recipe: { name: 'new' } } });
    await new Promise(setImmediate); assert.equal(calls.filter(c => c[0] === 'build').length, 0);
    resolvePack({}); await new Promise(setImmediate); await new Promise(setImmediate);
    assert.deepEqual(calls.filter(c => c[0] === 'build'), [['build', 'old', 42, 1], ['build', 'new', 43, 0]]);
    assert.equal(messages.length, 2); assert.equal(messages[0].message.result.parts[0].joints, undefined);
    assert.equal(messages[0].message.result.parts[0].keepColors, true);
    assert.equal(messages[0].message.result.textures.skin.repeat, true);
    assert.notEqual(messages[0].message.result.parts[0].positions.buffer, modelArray.buffer);
    assert.equal(messages[0].transfers.length, 3); assert.ok(messages[0].message.result.stats.bytes > 0);
    assert.equal(modelArray[1], 1); assert.equal(pixels[3], 255);
});

test('unsupported browser decoding returns an explicit placeholder error without attempting a model build', async () => {
    const messages = [];
    const self = { location: { href: 'https://example.test/CharacterPreviewBrowserEntry.js' },
        RRHumanBody: { loadPack() { throw Error('unsupported worker must not load assets'); } },
        RRCharacterModel: { build() { throw Error('unsupported worker must not build'); } },
        RRCharacterWardrobe: {}, RRCharacterOutfitTransfer: { BUILT_IN: [], store: { outfits: new Map(), pictures: new Map(), tints: new Map() } },
        postMessage(message) { messages.push(message); } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/CharacterPreviewBrowserEntry.js'), 'utf8'), {
        self, importScripts() {}, URL, Map, Set, performance
    });
    self.onmessage({ data: { type: 'context', context: {} } });
    self.onmessage({ data: { type: 'build', id: 1, recipe: {} } });
    await new Promise(setImmediate);
    assert.equal(messages.length, 1); assert.equal(messages[0].id, 1);
    assert.equal(messages[0].error.code, 'PREVIEW_WORKER_UNAVAILABLE');
});

test('browser static thumbnails reduce eyes and transferred pictures without altering full-quality sources', async () => {
    const messages = [], picture = { width: 512, height: 256, data: new Uint8Array(512 * 256 * 4).fill(255) };
    const self = { location: { href: 'https://example.test/CharacterPreviewBrowserEntry.js' },
        RRCharacterPreviewTextures: require('../src/forge/Character3D/CharacterPreviewTextures.js'),
        RRHumanBody: { async loadPack() { return {}; } }, RRCharacterClothes: { async preload() {} },
        RRCharacterWardrobe: { BY_ID: new Map() },
        RRCharacterOutfitTransfer: { BUILT_IN: [], store: { outfits: new Map(), pictures: new Map(), tints: new Map() } },
        RRCharacterModel: { build(pack, recipe, cache, options) {
            assert.equal(options.static, true); assert.equal(options.eyeSource.width, 128);
            return { height: 1, parts: [{ texture: 'color', normalTexture: 'relief' }], textures: { color: picture, relief: picture } };
        } }, postMessage(message) { messages.push(message); } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/CharacterPreviewBrowserEntry.js'), 'utf8'), {
        self, importScripts() {}, URL, Map, Set, performance, OffscreenCanvas: function() {}, createImageBitmap() {}
    });
    self.onmessage({ data: { type: 'context', context: { eyeSource: picture } } });
    self.onmessage({ data: { type: 'build', id: 1, recipe: {}, options: { static: true, atlasSize: 64 } } });
    await new Promise(setImmediate);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].error, undefined);
    assert.deepEqual(Object.keys(messages[0].result.textures), ['color', 'relief']);
    assert.equal(messages[0].result.textures.color.width, 64);
    assert.equal(picture.width, 512);
    assert.equal(picture.data.length, 512 * 256 * 4);
});
