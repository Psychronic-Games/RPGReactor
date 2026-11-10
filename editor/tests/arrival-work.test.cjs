'use strict';
// A map's arrival, the first seconds of a new map (runtime 20261110.6): the work of merging a built character's
// parts leaves the main thread or is done on whole arrays.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_lighting.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_models.js'));
const T = global.THREE, L = R.LayeredParts;
const read = file => fs.readFileSync(path.join(repoRoot, 'runtime', file), 'utf8');

let seed = 11;
const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
function geometry(count, shapes, relative, sparse) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(count * 3).map(() => random() * 4 - 2), 3));
    if (shapes) {
        g.morphAttributes.position = Array.from({ length: shapes }, () =>
            new T.BufferAttribute(new Float32Array(count * 3).map(() => (sparse && random() < 0.8 ? 0 : random() * 0.6 - 0.3)), 3));
        g.morphTargetsRelative = relative;
    }
    return g;
}
const boundsOf = g => [g.boundingBox.min.toArray(), g.boundingBox.max.toArray(), g.boundingSphere.center.toArray(), g.boundingSphere.radius];

test('a merged body\'s box and sphere are the numbers three works out, with and without shapes', () => {
    for (const [count, shapes, relative, sparse] of [[300, 0, false, false], [300, 5, true, false], [300, 5, true, true], [300, 4, false, false], [1, 2, true, false]]) {
        const g = geometry(count, shapes, relative, sparse);
        g.computeBoundingBox(); g.computeBoundingSphere();
        const want = boundsOf(g);
        g.boundingBox = null; g.boundingSphere = null;
        L.bounds(g);
        assert.deepEqual(boundsOf(g), want, `${count} vertices, ${shapes} shapes, relative ${relative}`);
    }
});

test('the bounds are read from the arrays, not a vertex at a time; anything not plain is left to three', t => {
    const g = geometry(200, 3, true, false);
    const box = t.mock.method(g, 'computeBoundingBox'), sphere = t.mock.method(g, 'computeBoundingSphere');
    L.bounds(g);
    assert.equal(box.mock.callCount() + sphere.mock.callCount(), 0);
    assert.ok(g.boundingBox && g.boundingSphere.radius > 0);
    // Switched off, and a geometry with no vertices: three's own.
    L.FAST_BOUNDS = false;
    try { L.bounds(g); } finally { L.FAST_BOUNDS = true; }
    assert.equal(box.mock.callCount(), 1);
    const empty = new T.BufferGeometry();
    empty.setAttribute('position', new T.BufferAttribute(new Float32Array(0), 3));
    L.bounds(empty);
    assert.equal(empty.boundingSphere.radius, 0);
    assert.match(read('reactor_3d_models.js'), /        this\.bounds\(geometry\);\n        return geometry;/);
});

test('a shape\'s moves are copied whole into the merged body', () => {
    const part = count => {
        const g = geometry(count, 0, false, false);
        g.setAttribute('normal', new T.BufferAttribute(new Float32Array(count * 3).fill(0).map((v, i) => (i % 3 === 1 ? 1 : 0)), 3));
        g.setAttribute('uv', new T.BufferAttribute(new Float32Array(count * 2), 2));
        g.setIndex(new T.BufferAttribute(new Uint16Array([0, 1, 2]), 1));
        return g;
    };
    const smile = new T.BufferAttribute(new Float32Array(4 * 3).map((v, i) => i + 1), 3);
    smile.name = 'smile';
    const head = part(4), hat = part(3);
    head.morphAttributes.position = [smile];
    const mesh = g => { const m = new T.Mesh(g, new T.MeshBasicMaterial()); m.updateMatrix(); return m; };
    const merged = L.geometry([mesh(head), mesh(hat)], () => new T.Color(1, 1, 1));
    const moves = merged.morphAttributes.position[0];
    assert.equal(moves.name, 'smile');
    assert.deepEqual(Array.from(moves.array), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.ok(merged.boundingSphere.radius > 0);
});

test('a picture element is decoded in the image worker from its own bytes, and here when the worker cannot', async t => {
    const made = [], asked = [];
    const had = global.createImageBitmap;
    global.createImageBitmap = async (image, options) => { made.push([image, options]); return { here: true }; };
    const worker = R.ImageWorker.bitmap;
    try {
        const picture = { tagName: 'IMG' }, canvas = { tagName: 'CANVAS' };
        R.ImageWorker.bitmap = (image, options) => { asked.push([image, options]); return Promise.resolve({ far: true }); };
        assert.deepEqual(await L.decode(picture), { far: true });
        assert.deepEqual(asked[0][1], { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        assert.equal(made.length, 0, 'nothing decoded on the main thread');
        // A canvas has no bytes of its own; a worker that cannot read the picture; no worker at all.
        assert.deepEqual(await L.decode(canvas), { here: true });
        R.ImageWorker.bitmap = () => Promise.reject(new Error('gone'));
        assert.deepEqual(await L.decode(picture), { here: true });
        R.ImageWorker.bitmap = () => null;
        assert.deepEqual(await L.decode(picture), { here: true });
        assert.equal(made.length, 3);
        assert.deepEqual(made[2][1], { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        L.DECODE_FAR = false;
        R.ImageWorker.bitmap = () => { throw new Error('not asked'); };
        try { assert.deepEqual(await L.decode(picture), { here: true }); } finally { L.DECODE_FAR = true; }
    } finally { global.createImageBitmap = had; R.ImageWorker.bitmap = worker; }
    assert.match(read('reactor_3d_models.js'), /\? image : this\.decode\(image\)\)\)\);/);
});

test('a material let go loses its warm marks with its program, so it waits for the next one', () => {
    const W = R.ShaderWarmup, material = new T.MeshBasicMaterial();
    material.__rrWarm = material.version; material.__rrWarmMap = material.map; material.__rrSeen = 123;
    W._materials.set(material, { ready: true, version: material.version, started: 0 });
    W.watch(material);
    const before = W.forgotten;
    material.dispose();
    assert.equal(material.__rrWarm, undefined);
    assert.equal(material.__rrSeen, 0);
    assert.equal(W._materials.get(material), undefined, 'its compile record too: a ready one would pass it for drawn');
    assert.equal(W.forgotten, before + 1);
    // A twin (made over the original, with listeners of its own) is watched for itself.
    const twin = Object.create(material);
    twin._listeners = {};
    assert.equal(Object.prototype.hasOwnProperty.call(twin, '__rrWarmWatch'), false);
    assert.match(read('reactor_3d.js'), /if \(!Object\.prototype\.hasOwnProperty\.call\(material, "__rrWarmWatch"\)\) this\.watch\(material\);/);
});

/** A renderer that can compile in the background, with a record of what was bound when it was asked to. */
function fakeRenderer(linked) {
    const calls = [], programs = new Map();
    let bound = null;
    return {
        calls, programs,
        extensions: { has: name => name === 'KHR_parallel_shader_compile' },
        getRenderTarget: () => bound,
        setRenderTarget: target => { bound = target; },
        compileAsync: scene => { calls.push(bound); return new Promise(() => {}); },
        properties: { get: material => ({ currentProgram: programs.has(material) || linked() ? { isReady: () => linked() } : null }) }
    };
}

test('the light bake\'s program is compiled with a picture of its own bound, not whatever was', () => {
    const V = R.LightVolume, renderer = fakeRenderer(() => false);
    const screen = null, atlas = V._dynAtlas;
    V._dynAtlas = null;
    try {
        const bake = { scene: new T.Scene(), camera: new T.Camera() };
        renderer.setRenderTarget(screen);
        assert.equal(V.bakeReady(renderer, bake), false);
        assert.equal(renderer.calls.length, 1);
        assert.ok(renderer.calls[0] && renderer.calls[0].isWebGLRenderTarget, 'a render target was bound for the compile');
        assert.equal(renderer.calls[0], V.compileTarget());
        assert.equal(renderer.getRenderTarget(), screen, 'and what was bound is bound again');
        // Asked again while it compiles: not started twice.
        V.bakeReady(renderer, bake);
        assert.equal(renderer.calls.length, 1);
        // The moving lights' own picture, once there is one.
        V._dynAtlas = new T.WebGLRenderTarget(4, 4);
        V.bakeReady(renderer, { scene: new T.Scene(), camera: new T.Camera() });
        assert.equal(renderer.calls[1], V._dynAtlas);
    } finally { if (V._dynAtlas && V._dynAtlas !== atlas) V._dynAtlas.dispose(); V._dynAtlas = atlas; }
});

test('the haze sits out until its programs are built, then never asks again; the wait gives up', () => {
    const H = R.HalfHaze, W = R.ShaderWarmup;
    let linked = false;
    const renderer = fakeRenderer(() => linked);
    assert.ok(H.warmList().length >= 3);
    assert.equal(H.ready(renderer), false);
    assert.equal(H._expected, true, 'its programs are asked for (warmAhead starts one a pass)');
    linked = true;
    assert.equal(H.ready(renderer), true);
    linked = false;
    assert.equal(H.ready(renderer), true, 'ready once, it is not asked again');
    // Another renderer has its own wait, and a compile that never answers does not hide the haze for good.
    const other = fakeRenderer(() => false);
    assert.equal(H.ready(other), false);
    H._waits.set(other, performance.now() - W.TIMEOUT_MS - 1);
    assert.equal(H.ready(other), true);
    // Without background compiles nothing is held; switched off, neither.
    assert.equal(H.ready({ extensions: { has: () => false } }), true);
    H.WAIT = false;
    try { assert.equal(H.ready(fakeRenderer(() => false)), true); } finally { H.WAIT = true; }
    assert.match(read('reactor_3d.js'), /    draw\(renderer, target, camera, list, split\) \{\n        if \(!this\.ready\(renderer\)\) return;/);
});
