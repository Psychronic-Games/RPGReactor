'use strict';
// The geometry worker hands back each distance level, and the whole mesh as a level of its own, with its triangles in
// vertex cache order (runtime 20261118.2): the same triangles, fewer vertices shaded again.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'libs', 'reactor_geometry_worker.js'), 'utf8');
const from = source.indexOf('const CACHE = 32;'), to = source.indexOf('\n};', source.indexOf('const cacheOrder = ')) + 3;
const cacheOrder = new Function(source.slice(from, to) + '\nreturn cacheOrder;')();

/** Vertices shaded a triangle with a first-in first-out cache of `size` (the card's post-transform cache, roughly). */
function acmr(index, size = 16) {
    const fifo = new Int32Array(size).fill(-1); let head = 0, miss = 0;
    for (const v of index) { let hit = false; for (let i = 0; i < size; i++) if (fifo[i] === v) { hit = true; break; }
        if (!hit) { miss++; fifo[head++ % size] = v; } }
    return miss / (index.length / 3);
}

/** A grid of `n` by `n` quads, its triangles shuffled (an order no cache likes). */
function shuffledGrid(n, seed = 7) {
    const tris = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const a = y * (n + 1) + x, b = a + 1, c = a + n + 1, d = c + 1; tris.push([a, c, b], [b, c, d]); }
    let s = seed; const random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = tris.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [tris[i], tris[j]] = [tris[j], tris[i]]; }
    return { index: Uint32Array.from(tris.flat()), vertices: (n + 1) * (n + 1) };
}

const key = (index, t) => [index[t * 3], index[t * 3 + 1], index[t * 3 + 2]].join(',');

test('the same triangles, each wound as it was, in an order the vertex cache serves', () => {
    const { index, vertices } = shuffledGrid(60);
    const ordered = cacheOrder(index, vertices);
    assert.equal(ordered.length, index.length);
    const before = new Map(), after = new Map();
    for (let t = 0; t < index.length / 3; t++) before.set(key(index, t), (before.get(key(index, t)) || 0) + 1);
    for (let t = 0; t < ordered.length / 3; t++) after.set(key(ordered, t), (after.get(key(ordered, t)) || 0) + 1);
    assert.deepEqual([...after].sort(), [...before].sort(), 'every triangle once, its corners in their own order');
    const was = acmr(index), now = acmr(ordered);
    assert.ok(was > 2.2, 'shuffled: nearly every vertex shaded again ' + was.toFixed(2));
    assert.ok(now < 0.9, 'ordered: ' + now.toFixed(2));
});

test('a mesh too small to order, and the recipe that keeps old levels from being read back', () => {
    const one = Uint32Array.of(0, 1, 2);
    assert.equal(cacheOrder(one, 3), one);
    assert.match(source, /const RECIPE = 'levels-5:[^']*vcache32';/);
    assert.match(source, /levels\.unshift\(\{ indices: cacheOrder\(job\.indices, vertices\), error: 0, loose: false, whole: true \}\)/);
});

test('a level the view picks gets vertex buffers of its own, a slice at a time, the same triangles drawn', () => {
    require(path.join(__dirname, '..', '..', 'runtime', 'libs', 'three.js'));
    const R = require(path.join(__dirname, '..', '..', 'runtime', 'reactor_3d.js')), T = global.THREE, D = R.GeometryDetail;
    // A 30k-vertex mesh whose level uses a few of them.
    const count = 30000, source = new T.BufferGeometry();
    const positions = new Float32Array(count * 3), uvs = new Float32Array(count * 2);
    for (let v = 0; v < count; v++) { positions[v * 3] = v; positions[v * 3 + 1] = v * 2; positions[v * 3 + 2] = -v; uvs[v * 2] = v / count; uvs[v * 2 + 1] = 1 - v / count; }
    source.setAttribute('position', new T.BufferAttribute(positions, 3)); source.setAttribute('uv', new T.BufferAttribute(uvs, 2));
    source.setIndex(new T.BufferAttribute(new Uint32Array([0, 1, 2]), 1));
    const levelIndex = Uint32Array.of(29000, 5, 17000, 5, 17000, 12);
    const shared = new T.BufferGeometry(); shared.setAttribute('position', source.attributes.position); shared.setAttribute('uv', source.attributes.uv); shared.setIndex(new T.BufferAttribute(levelIndex, 1));
    const level = { geometry: shared, error: 0.01, loose: false, whole: false };
    const state = { source, levels: [level], dead: false };
    const fresh = D.fresh; D.fresh = () => true;
    const savedGraphics = global.Graphics; global.Graphics = { frameCount: 1 };
    try {
        assert.equal(D.drawn(state, level), shared, 'drawn from the shared buffers until its own are made');
        for (let i = 0; i < 20 && !level.compact; i++) { Graphics.frameCount++; D.pumpCompact(50); }
        const own = D.drawn(state, level);
        assert.notEqual(own, shared);
        assert.equal(own.attributes.position.count, 4, 'only the four vertices it uses');
        assert.ok(own.index.array instanceof Uint16Array);
        for (let i = 0; i < levelIndex.length; i++) {
            const a = levelIndex[i], b = own.index.array[i];
            assert.deepEqual([...own.attributes.position.array.slice(b * 3, b * 3 + 3)], [...positions.slice(a * 3, a * 3 + 3)]);
            assert.deepEqual([...own.attributes.uv.array.slice(b * 2, b * 2 + 2)], [...uvs.slice(a * 2, a * 2 + 2)]);
        }
        // A level that uses most of its buffer, or the whole mesh, keeps the shared buffers; so does every level with the switch off.
        const most = { geometry: shared, whole: true }; assert.equal(D.drawn(state, most), shared); assert.equal(D._compactQueue.length, 0);
        D.COMPACT = false; const off = { geometry: shared }; assert.equal(D.drawn(state, off), shared); assert.equal(D._compactQueue.length, 0);
    } finally {
        D.COMPACT = true; D.fresh = fresh; D._compactQueue.length = 0;
        if (savedGraphics === undefined) delete global.Graphics; else global.Graphics = savedGraphics;
    }
});

test('a mesh with shape keys has its own triangle list put in cache order in place; a see-through one does not', () => {
    require(path.join(__dirname, '..', '..', 'runtime', 'libs', 'three.js'));
    const R = require(path.join(__dirname, '..', '..', 'runtime', 'reactor_3d.js')), T = global.THREE, D = R.GeometryDetail;
    const shaped = (transparent, count = 40000) => {
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.BufferAttribute(new Float32Array(count * 3), 3));
        g.setIndex(new T.BufferAttribute(new Uint32Array(count).map((v, i) => (i * 7919) % count), 1));
        g.morphAttributes.position = [new T.BufferAttribute(new Float32Array(count * 3), 3)];
        const m = new T.MeshBasicMaterial({ transparent }); m.__reactorModel = true;
        const mesh = new T.Mesh(g, m); return mesh;
    };
    const opaque = shaped(false), clear = shaped(true), plain = shaped(false); plain.geometry.morphAttributes = {};
    assert.equal(D.orderable(opaque), true);
    assert.equal(D.orderable(clear), false, 'a see-through mesh blends in the order it is drawn');
    assert.equal(D.orderable(plain), false, 'without shapes it takes levels instead');
    // The worker's answer is laid into the list it was asked for, and only if that list is still the one sent.
    const savedDispatch = D.dispatch; D.dispatch = () => {};
    try {
        D.askOrder(opaque);
        assert.equal(D.orderable(opaque), false, 'asked once');
        const job = D._orderQueue.pop(), g = opaque.geometry, before = g.index.version;
        const order = g.index.array.slice().reverse();
        D._busy = job; D.receive({ id: job.id, order });
        assert.deepEqual([...g.index.array], [...order]);
        assert.equal(g.index.version, before + 1, 'uploaded again');
        assert.equal(g.userData.rrCacheOrdered, true);
        // A list changed since it was sent is left alone.
        const other = shaped(false); D.askOrder(other); const late = D._orderQueue.pop(); other.geometry.index.needsUpdate = true;
        const was = other.geometry.index.array.slice();
        D._busy = late; D.receive({ id: late.id, order: was.slice().reverse() });
        assert.deepEqual([...other.geometry.index.array], [...was]);
    } finally { D.dispatch = savedDispatch; D._busy = null; D._orderQueue.length = 0; }
    assert.match(source, /if \(job\.orderOnly\) \{\n\s*try \{ const order = cacheOrder\(job\.indices, job\.vertices\);/);
});
