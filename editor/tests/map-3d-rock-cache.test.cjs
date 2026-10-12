const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

global.self = global;
global.window = global;
require('../../runtime/libs/three.js');
const R = require('../../runtime/reactor_3d.js');
const source = fs.readFileSync(path.join(__dirname, '../src/MapEditor3D.js'), 'utf8');
const map = () => ({ id: 5, width: 48, height: 48, reactor3d: {
    version: 1, elevation: new Array(48 * 48).fill(0), pieces: [8, 40].map((x, i) => ({
        id: i + 1, kind: 'rock', x, y: 8, z: 0, rot: 0, material: 'Rock',
        size: [2, 3, 2], rough: 0.4, cap: 'Moss', tint: '#c8b49a'
    }))
} });

async function workers(run, { fail = false, hold = false } = {}) {
    const saved = { Worker: global.Worker, Blob: global.Blob, create: URL.createObjectURL, pool: R._rockPool };
    const calls = [], waiting = [];
    global.Worker = class {
        constructor() {
            this.context = { self: { postMessage: data => this.onmessage({ data }) },
                Math, Map, Float32Array, Float64Array, Array, Infinity, JSON };
            vm.runInNewContext(R.rockWorkerSource(), this.context);
        }
        postMessage(data) {
            calls.push(data);
            const deliver = () => fail ? this.onerror({ preventDefault() {}, message: 'test worker failure' })
                : this.context.self.onmessage({ data });
            if (hold) waiting.push(deliver);
            else setImmediate(deliver);
        }
        terminate() {}
    };
    global.Blob = class {};
    URL.createObjectURL = () => 'blob:rock-cache-test';
    delete R._rockPool;
    try {
        await run({ calls, flush: async () => {
            while (waiting.length) { waiting.shift()(); await Promise.resolve(); }
        } });
    } finally {
        global.Worker = saved.Worker;
        global.Blob = saved.Blob;
        URL.createObjectURL = saved.create;
        R._rockPool = saved.pool;
    }
}

test('editor preparation yields to workers, matches every array and reuses unchanged chunks', async () => {
    await workers(async ({ calls }) => {
        const data = map(), cache = new Map();
        let ready = false;
        const prepared = R.prepareRockChunks(data, cache).then(() => { ready = true; });
        assert.equal(ready, false, 'the complete scene waits while input can continue');
        assert.equal(cache.size, 0, 'no synchronous meshing on the editor thread');
        await prepared;
        const { chunks, floor } = R.rockChunkPlan(data, R.piecesOf(data));
        assert.equal(cache.size, chunks.length, 'every chunk is ready before building the scene');
        for (const job of chunks) {
            const expected = R.rockChunkBuckets(job.reaching, job.box, floor), actual = cache.get(job.key);
            assert.equal(actual.sig, job.sig);
            assert.equal(actual.length, expected.length);
            for (let i = 0; i < expected.length; i++) {
                assert.equal(actual[i].name, expected[i].name);
                assert.deepEqual(actual[i].surface, expected[i].surface);
                assert.equal(actual[i].cap, expected[i].cap);
                for (const key of ['positions', 'uvs', 'normals', 'colors']) {
                    assert.deepEqual(Array.from(actual[i][key]), Array.from(expected[i][key]), key);
                }
            }
        }
        const before = calls.length, bucket = cache.get(0);
        await R.prepareRockChunks(data, cache);
        assert.equal(calls.length, before, 'returning to a map does not mesh it again');
        assert.equal(cache.get(0), bucket, 'arrays reused');
        data.reactor3d.pieces = data.reactor3d.pieces.map((p, i) => i ? p : { ...p, tint: '#ffffff' });
        await R.prepareRockChunks(data, cache);
        assert.equal(calls.length, before + 1, 'a tint edit remeshes its chunk only');
        assert.notEqual(cache.get(0), bucket);
        const rockEdit = cache.get(0);
        data.reactor3d.elevation = data.reactor3d.elevation.slice();
        data.reactor3d.elevation[8 * 48 + 8] = 1;
        await R.prepareRockChunks(data, cache);
        assert.notEqual(cache.get(0), rockEdit, 'ground edits invalidate the buried faces');
        data.reactor3d.pieces = [];
        await R.prepareRockChunks(data, cache);
        assert.equal(cache.size, 0, 'deleted rocks release their arrays');
    });
});

test('overlapping preloads share workers and obsolete chunks cannot replace a later edit', async () => {
    await workers(async ({ calls, flush }) => {
        const data = map(), cache = new Map();
        const first = R.prepareRockChunks(data, cache), second = R.prepareRockChunks(data, cache);
        assert.equal(calls.length + R._rockPool.queue.length, 2, 'one job per chunk despite overlapping rebuilds');
        data.reactor3d.pieces = data.reactor3d.pieces.map((p, i) => i ? p : { ...p, tint: '#ffffff' });
        const edited = R.prepareRockChunks(data, cache);
        await flush();
        await Promise.all([first, second, edited]);
        const job = R.rockChunkPlan(data, R.piecesOf(data)).chunks.find(c => c.key === 0);
        assert.equal(cache.get(0).sig, job.sig, 'only the current edit populates the cache');
        // An undo can want already-cached arrays while a new edit is still in flight.
        data.reactor3d.pieces = data.reactor3d.pieces.map((p, i) => i ? p : { ...p, tint: '#000000' });
        const obsolete = R.prepareRockChunks(data, cache);
        data.reactor3d.pieces = data.reactor3d.pieces.map((p, i) => i ? p : { ...p, tint: '#ffffff' });
        await R.prepareRockChunks(data, cache);
        await flush();
        await obsolete;
        assert.equal(cache.get(0).sig, job.sig, 'the pending edit cannot overwrite the undo');
    }, { hold: true });
});

test('worker failure completes preparation with the same synchronous fallback', async () => {
    await workers(async () => {
        const data = map(), cache = await R.prepareRockChunks(data);
        for (const job of R.rockChunkPlan(data, R.piecesOf(data)).chunks) assert.equal(cache.get(job.key).sig, job.sig);
        assert.equal(cache._pending.size, 0);
    }, { fail: true });
});

test('without worker support the complete map is still prepared', async () => {
    const saved = R._rockPool;
    R._rockPool = null;
    try { assert.equal((await R.prepareRockChunks(map())).size, 2); }
    finally { R._rockPool = saved; }
});

function editor(runtime) {
    const Editor = vm.runInNewContext(`${source}\nMapEditor3D;`, { console, Reactor3D: runtime, setTimeout, clearTimeout });
    return Object.create(Editor.prototype);
}

test('map cache retains two recent maps and enforces the byte budget', async () => {
    const runtime = { lowMemory: () => true, prepareRockChunks: async (data, cache) => {
        cache.set(0, [{ positions: { byteLength: data.bytes || 0 }, uvs: { byteLength: 0 }, colors: { byteLength: 0 }, normals: { byteLength: 0 } }]);
    } };
    const view = editor(runtime);
    const first = await view.prepareRockChunks({ id: 1 });
    await view.prepareRockChunks({ id: 5 });
    assert.equal(await view.prepareRockChunks({ id: 1 }), first);
    await view.prepareRockChunks({ id: 6 });
    assert.deepEqual([...view._rockMapCaches.keys()], [1, 6], 'least recently visited map evicted');
    await view.prepareRockChunks({ id: 7, bytes: 17 * 1024 * 1024 });
    assert.equal(view._rockMapCaches.size, 0, 'a large map is used by the scene but not retained');
});

test('late preparation from a previous project cannot populate the new project cache', async () => {
    let finish;
    const view = editor({ prepareRockChunks: () => new Promise(resolve => { finish = resolve; }) });
    const pending = view.prepareRockChunks({ id: 5 });
    view._rockMapCaches = new Map();
    finish();
    await pending;
    assert.equal(view._rockMapCaches.size, 0);
});
