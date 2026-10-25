'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.join(__dirname, '../src/forge/Character3D');
const { PreviewWorker, snapshotContext, renderPayload } = require(path.join(dir, 'CharacterPreviewWorker.cjs'));

class ControlledWorker extends EventEmitter {
    constructor() { super(); this.messages = []; this.terminated = 0; }
    postMessage(message) { this.messages.push(structuredClone(message)); }
    terminate() { this.terminated++; }
    complete(id, result = {}) { this.emit('message', { id, result }); }
}
const recipe = { gender: 1, bald: true, outfit: [{ id: 'tshirt', color: '#1b5492', pattern: 'emblem', emblemPicture: 'badge.png' }] };
const picture = { width: 2, height: 2, data: Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]) };
const options = { quality: 'preview', skinSize: 32, atlasSize: 64 };
const hash = values => createHash('sha256').update(new Uint8Array(values.buffer, values.byteOffset, values.byteLength)).digest('hex');

test('the client is lazy, deduplicates jobs, and serializes builds through one worker', async t => {
    const worker = new ControlledWorker(); let starts = 0;
    const pool = new PreviewWorker({ createWorker: () => { starts++; return worker; } });
    t.after(() => pool.dispose());
    pool.configure({ eyeSource: picture });
    assert.equal(starts, 0);
    const a = pool.build({ key: 'a', recipe }), duplicate = pool.build({ key: 'a', recipe });
    const mutable = structuredClone(recipe), b = pool.build({ key: 'b', recipe: mutable });
    mutable.gender = 0;
    assert.equal(a, duplicate);
    assert.equal(starts, 1);
    assert.deepEqual(worker.messages.map(m => m.type), ['context', 'build']);
    worker.complete(worker.messages[1].id, { id: 'a' });
    assert.deepEqual(await a, { id: 'a' });
    assert.equal(worker.messages.filter(m => m.type === 'context').length, 1, 'pictures sent once per revision');
    assert.equal(worker.messages.at(-1).type, 'build');
    assert.equal(worker.messages.at(-1).recipe.gender, 1, 'a queued recipe is a snapshot, not the page mutable state');
    worker.complete(worker.messages.at(-1).id, { id: 'b' });
    assert.deepEqual(await b, { id: 'b' });
});

test('changing resources rejects stale active and queued work without starting parallel builds', async t => {
    const worker = new ControlledWorker(), pool = new PreviewWorker({ createWorker: () => worker });
    t.after(() => pool.dispose());
    const a = pool.build({ key: 'a', recipe }), b = pool.build({ key: 'b', recipe });
    const canceled = [assert.rejects(a, { name: 'AbortError' }), assert.rejects(b, { name: 'AbortError' })];
    const oldId = worker.messages.at(-1).id;
    pool.configure({ emblemPictures: new Map([['badge.png', picture]]) });
    const newest = pool.build({ key: 'a', recipe });
    assert.equal(worker.messages.filter(m => m.type === 'build').length, 1, 'canceled build still occupies the only worker');
    worker.complete(oldId, { stale: true });
    assert.equal(worker.messages.filter(m => m.type === 'build').length, 2);
    const update = worker.messages.findLast(m => m.type === 'context');
    assert.deepEqual(update.context.emblemPictures.get('badge.png').data, picture.data);
    worker.complete(worker.messages.at(-1).id, { fresh: true });
    assert.deepEqual(await newest, { fresh: true });
    await Promise.all(canceled);
});

test('canceling a queued tile removes its work and queue size is bounded', async t => {
    const worker = new ControlledWorker(), pool = new PreviewWorker({ createWorker: () => worker, maxQueued: 1 });
    t.after(() => pool.dispose());
    const a = pool.build({ key: 'a', recipe }), b = pool.build({ key: 'b', recipe });
    const canceled = assert.rejects(b, { name: 'AbortError' });
    await assert.rejects(pool.build({ key: 'c', recipe }), { code: 'PREVIEW_QUEUE_FULL' });
    assert.equal(pool.cancel('b'), true);
    worker.complete(worker.messages.at(-1).id);
    await Promise.all([a, canceled]);
    assert.equal(worker.messages.filter(m => m.type === 'build').length, 1);
});

test('crashes reject all requests, later work gets a new worker, and dispose cancels immediately', async () => {
    const workers = [], pool = new PreviewWorker({ createWorker: () => { const w = new ControlledWorker(); workers.push(w); return w; } });
    const a = pool.build({ key: 'a', recipe }), b = pool.build({ key: 'b', recipe });
    const failed = [assert.rejects(a, /worker broke/), assert.rejects(b, /worker broke/)];
    workers[0].emit('error', new Error('worker broke'));
    await Promise.all(failed);
    assert.equal(workers[0].terminated, 1);
    const c = pool.build({ key: 'c', recipe }), canceled = assert.rejects(c, { name: 'AbortError' });
    assert.equal(workers.length, 2);
    pool.dispose(); pool.dispose();
    await canceled;
    assert.equal(workers[1].terminated, 1);
    await assert.rejects(pool.build({ key: 'd', recipe }), { name: 'AbortError' });
});

test('a stalled worker times out without running a build on the page', async () => {
    const worker = new ControlledWorker(), pool = new PreviewWorker({ createWorker: () => worker, timeoutMs: 10 });
    await assert.rejects(pool.build({ key: 'a', recipe }), /timed out/);
    assert.equal(worker.terminated, 1);
    pool.dispose();
});

test('render transfer preserves cached source arrays and carries material metadata without rig internals', () => {
    const source = { parts: [{ name: 'Tail', positions: new Float32Array([1, 2, 3]), normals: new Float32Array([0, 1, 0]), index: new Uint16Array([0]), normalTexture: 'relief', wet: true, joints: new Uint8Array([0]), weights: new Float32Array([1]) }], textures: { relief: picture }, bones: [{}], cloth: { largeCache: true }, height: 1.8 };
    const payload = renderPayload(source);
    const sent = structuredClone(payload.result, { transfer: payload.transfers });
    assert.equal(payload.result.parts[0].positions.byteLength, 0);
    assert.deepEqual(source.parts[0].positions, new Float32Array([1, 2, 3]));
    assert.deepEqual(source.textures.relief.data, picture.data);
    assert.equal(sent.parts[0].normalTexture, 'relief'); assert.equal(sent.parts[0].wet, true);
    assert.equal(sent.parts[0].joints, undefined); assert.equal(sent.bones, undefined); assert.equal(sent.cloth, undefined);
    assert.equal(renderPayload(source).result.parts[0].positions[2], 3, 'the same cached arrays can be sent again');
    const snapshot = snapshotContext({ transfers: [{ key: 'preview:one', outfit: { tri: source.parts[0].index, _cached: () => {}, build: () => {} }, picture }] });
    assert.equal(snapshot.transfers[0].outfit._cached, undefined);
    assert.equal(snapshot.transfers[0].outfit.build, undefined);
    assert.deepEqual(structuredClone(snapshot).transfers[0].picture.data, picture.data);
});

test('resource snapshots preserve browser-realm Maps and typed pictures', () => {
    const foreign = vm.runInNewContext("new Map([['badge.png', {width: 1, height: 1, data: new Uint8Array([23, 45, 67, 255])}]])");
    assert.equal(foreign instanceof Map, false, 'this reproduces NW browser and Node constructor separation');
    const snapshot = structuredClone(snapshotContext({ emblemPictures: foreign }));
    assert.equal(snapshot.emblemPictures.size, 1);
    assert.deepEqual(Array.from(snapshot.emblemPictures.get('badge.png').data), [23, 45, 67, 255]);
    assert.equal(snapshotContext({ emblemPictures: { 'badge.png': picture } }).emblemPictures.get('badge.png'), picture, 'plain-object callers remain supported');
});

test('a real worker builds the exact painted character while the main event loop keeps running, and caches survive transfers', async t => {
    const pool = new PreviewWorker(); t.after(() => pool.dispose());
    const browserPictures = vm.runInNewContext('new Map([["badge.png", picture]])', { picture });
    pool.configure({ eyeSource: picture, emblemPictures: browserPictures });
    let ticks = 0; const interval = setInterval(() => ticks++, 2); t.after(() => clearInterval(interval));
    const first = await pool.build({ key: 'real-one', recipe, options });
    assert.ok(first.stats.threadId > 0, 'the full build ran in a worker thread');
    assert.ok(ticks >= 2, 'the page processes timers during the expensive build');
    assert.ok(first.stats.bytes > 100000);
    const Body = require(path.join(dir, 'HumanBody.js')), Model = require(path.join(dir, 'CharacterModel.js'));
    const pack = await Body.loadPack(), expected = Model.build(pack, recipe, { wardrobe: { emblemPictures: new Map([['badge.png', picture]]) } }, { ...options, eyeSource: picture });
    assert.deepEqual(first.parts.map(p => p.name), expected.parts.map(p => p.name));
    for (let i = 0; i < first.parts.length; i++) assert.equal(hash(first.parts[i].positions), hash(expected.parts[i].positions), first.parts[i].name);
    for (const [name, texture] of Object.entries(first.textures)) assert.equal(hash(texture.data), hash(expected.textures[name].data), name + ' includes supplied eyes and emblem colors');
    const noEmblem = Model.build(pack, recipe, {}, { ...options, eyeSource: picture });
    assert.notEqual(hash(first.textures['outfit.png'].data), hash(noEmblem.textures['outfit.png'].data), 'the supplied emblem changes the actual garment picture');
    const skinHash = hash(first.textures['skin.png'].data);
    first.textures['skin.png'].data.fill(0);
    const second = await pool.build({ key: 'real-two', recipe, options });
    assert.equal(hash(second.textures['skin.png'].data), skinHash, 'page mutation cannot damage worker texture caches');
    assert.equal(hash(second.parts[0].positions), hash(expected.parts[0].positions));
});

test('built-in Captain resources preserve the uniform definition and its supplied picture', async t => {
    const pool = new PreviewWorker(); t.after(() => pool.dispose());
    const Body = require(path.join(dir, 'HumanBody.js')), Model = require(path.join(dir, 'CharacterModel.js'));
    const Taken = require(path.join(dir, 'CharacterOutfitTransfer.js')), Wardrobe = require(path.join(dir, 'CharacterWardrobe.js'));
    const own = Taken.load('carol');
    assert.ok(own, 'the shipped Captain outfit exists');
    const oldPicture = Taken.store.pictures.get('carol');
    t.after(() => { if (oldPicture) Taken.store.pictures.set('carol', oldPicture); else Taken.store.pictures.delete('carol'); });
    Taken.store.pictures.set('carol', picture);
    const captain = { gender: 0, bald: true, outfit: [{ id: 'ss_carol_uniform' }] }, pack = await Body.loadPack();
    const before = Wardrobe.BY_ID.get('ss_carol_uniform');
    const expected = Model.build(pack, captain, {}, options);
    pool.configure({ transfers: [{ key: 'carol', id: 'ss_carol_uniform', label: 'Captain', outfit: own, picture }] });
    const actual = await pool.build({ key: 'captain', recipe: captain, options });
    assert.deepEqual(actual.parts.map(p => p.name), expected.parts.map(p => p.name));
    for (let i = 0; i < actual.parts.length; i++) assert.equal(hash(actual.parts[i].positions), hash(expected.parts[i].positions), actual.parts[i].name);
    const texture = Object.keys(actual.textures).find(name => name.startsWith('outfit-carol'));
    assert.ok(texture, 'the actual transferred uniform uses its supplied source picture');
    assert.equal(hash(actual.textures[texture].data), hash(picture.data));
    assert.equal(hash(actual.textures[texture].data), hash(expected.textures[texture].data));
    assert.equal(Wardrobe.BY_ID.get('ss_carol_uniform'), before, 'the main catalog is unchanged');
});

test('a custom in-memory outfit registration is usable in the worker and removed by the next context', async t => {
    const pool = new PreviewWorker(); t.after(() => pool.dispose());
    const Taken = require(path.join(dir, 'CharacterOutfitTransfer.js'));
    const key = 'preview:worker-regression', id = 'taken_worker_regression';
    const own = Taken.load('carol');
    // Prepared user imports have one piece named "outfit", unlike the built-in Captain's "uniform".
    const prepared = { ...own, parts: [{ ...own.parts[0], id: 'outfit' }] };
    pool.configure({ transfers: [{ key, id, label: 'Prepared custom outfit', outfit: prepared, picture }] });
    const first = await pool.build({ key: 'custom', recipe: { gender: 1, bald: true, outfit: [{ id }] }, options });
    const name = 'outfit-preview-worker-regression.png';
    assert.ok(first.parts.some(p => p.texture === name), 'the worker registers an outfit absent from its built-in catalog');
    assert.equal(hash(first.textures[name].data), hash(picture.data));
    pool.configure({});
    const next = await pool.build({ key: 'removed', recipe: { gender: 1, bald: true, outfit: [{ id }] }, options });
    assert.equal(next.textures[name], undefined, 'changing project/context removes stale custom registrations and pictures');
});
