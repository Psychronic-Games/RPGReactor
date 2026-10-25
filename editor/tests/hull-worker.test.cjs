'use strict';
// A model's heights (ReactorFight.Action.buildHull) worked out on a background thread (Action.HullWorker): the
// worker's program is the same buildHull, reading a copy of the model's meshes with three.js of its own. These
// tests run that program in a realm of its own, as a worker would, and hold its answer to the main thread's to
// the bit; then the waiting: a model counts by its footprint until its heights come back, a Tactical unit thinks
// once none is out, and with the switch off they are worked out at once.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fightWorld } = require('./helpers/fight-world.cjs');

const runtime = path.join(__dirname, '..', '..', 'runtime');
const threeSource = fs.readFileSync(path.join(runtime, 'libs', 'three.js'), 'utf8');
const R = require(path.join(runtime, 'reactor_3d.js'));
global.self = global; global.window = global;
require(path.join(runtime, 'libs', 'three.js'));
const THREE = global.THREE;
delete global.THREE;

/** A fight world with the action driver, the real three, and the 3D runtime's own model helpers. */
function world(options = {}) {
    const w = fightWorld(Object.assign({ action: true, tactical: !!options.tactical, mapNote: '<3d>', mapSidecar: { version: 1, mode: '3d', pieces: [] } }, options));
    const facade = Object.create(R);
    Object.assign(facade, { isMap3D: () => true, collisionKeysFor: spec => ({ model: spec.model, pose: spec.model + '|' + (spec.pitch || 0) }), _glbCache: {}, _sidecarJson: {} });
    w.Reactor3D = facade;
    w.THREE = THREE;
    return w;
}

/** The worker's program run in a realm of its own: `send(job)` answers as the worker would. */
function workerRealm(source) {
    const replies = [];
    const ctx = { console, Math, JSON, Object, Array, Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int16Array, Int8Array, Int32Array, Map, Set, Error, String, Number };
    ctx.importScripts = () => vm.runInContext(threeSource, ctx, { filename: 'three.js' });
    ctx.postMessage = message => replies.push(message);
    vm.createContext(ctx);
    vm.runInContext('self = globalThis;', ctx);
    vm.runInContext(source, ctx, { filename: 'hull-worker.js' });
    return { send(job) { ctx.onmessage({ data: job }); return replies.pop(); } };
}

/** A copy that left the worker's realm, so strict equality reads values (a vm realm's arrays are its own). */
const plain = hull => hull && Object.assign({}, hull, { low: Array.from(hull.low), high: Array.from(hull.high),
    gapLow: hull.gapLow && Array.from(hull.gapLow), gapHigh: hull.gapHigh && Array.from(hull.gapHigh) });

// The models: each made afresh per call, so what one reading caches on it (a box) never reaches the other.
const MODELS = {
    'boxes, a nested group and a mesh with no index': () => {
        const root = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 2, 3, 2, 2));
        body.position.set(0.3, 0.5, -0.2);
        const turret = new THREE.Group();
        turret.position.set(0.5, 1, 0); turret.rotation.y = 0.4;
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 1, 9).toNonIndexed());
        top.scale.set(1, 1.3, 0.9);
        turret.add(top);
        root.add(body, turret);
        root.userData.glbSize = { x: 4, y: 2.5, z: 2 };
        return root;
    },
    'quantized positions in an interleaved buffer': () => {
        const root = new THREE.Group();
        const n = 60, data = new Int16Array(n * 4), index = new Uint16Array((n - 2) * 3);
        for (let i = 0; i < n; i++) { data[i * 4] = Math.round(Math.sin(i * 1.7) * 30000); data[i * 4 + 1] = (i * 997) % 32767; data[i * 4 + 2] = Math.round(Math.cos(i * 0.9) * 30000); data[i * 4 + 3] = 7; }
        for (let t = 0; t < n - 2; t++) index.set([t, t + 1, t + 2], t * 3);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(data, 4), 3, 0, true));
        geometry.setIndex(new THREE.BufferAttribute(index, 1));
        const mesh = new THREE.Mesh(geometry);
        mesh.scale.setScalar(1.5); mesh.rotation.x = 0.2;
        root.add(mesh);
        root.userData.glbSize = { x: 3, y: 1.5, z: 3 };
        return root;
    },
    'a skinned mesh posed by its bones, its box never measured': () => {
        const root = new THREE.Group();
        const geometry = new THREE.BoxGeometry(1, 3, 1, 2, 6, 2);
        const position = geometry.getAttribute('position'), skinIndex = [], skinWeight = [];
        for (let v = 0; v < position.count; v++) { const up = (position.getY(v) + 1.5) / 3; skinIndex.push(0, 1, 0, 0); skinWeight.push(1 - up, up, 0, 0); }
        geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
        geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
        const hip = new THREE.Bone(), chest = new THREE.Bone();
        hip.position.y = -1.5; chest.position.y = 1.5; hip.add(chest);
        const mesh = new THREE.SkinnedMesh(geometry);
        mesh.add(hip);
        mesh.bind(new THREE.Skeleton([hip, chest]));
        chest.rotation.z = 0.9;
        root.add(mesh);
        root.userData.glbSize = { x: 1.5, y: 3, z: 1 };
        return root;
    }
};

for (const [name, make] of Object.entries(MODELS)) {
    for (const dense of [false, true]) {
        test(`the worker's heights are the main thread's to the bit: ${name}${dense ? ', read from its vertices' : ''}`, () => {
            const w = world(), A = w.ReactorFight.Action;
            if (dense) Object.assign(w.Reactor3D, { DENSE_TRIANGLES: 4, DENSE_SAMPLES: 25 });
            const spec = { model: 'm', size: 3, scale: 1.2, stretch: [1, 1.1, 0.9], pitch: 0.1, roll: -0.05 };
            const json = { transform: { offset: [0.1, 0, -0.2], rotate: [0, 30, 0], scale: [1, 1, 1.2] } };
            const here = A.buildHull(w.Reactor3D, make(), json, spec);
            assert.ok(here, 'the model has heights');
            const template = make();
            const snap = A.HullWorker.snapshot(w.Reactor3D, template, json, spec);
            assert.ok(snap, 'the worker reads this model');
            if (dense) assert.ok(snap.payload.nodes.every(n => !n.index), 'a mesh read from its vertices sends no index');
            const reply = workerRealm(A.HullWorker.source(w.Reactor3D, 'three.js')).send(Object.assign({ id: 1 }, snap.payload));
            assert.equal(reply.error, undefined);
            assert.deepEqual(plain(reply.hull), plain(here));
            // The boxes measured there are kept on the model, as a reading here keeps them.
            A.HullWorker._jobs.set(7, { resolve: () => {}, reject: () => {}, made: snap.made });
            A.HullWorker.receive(Object.assign({}, reply, { id: 7 }));
            const kept = [];
            template.traverse(node => { if (node.isMesh) kept.push(node.isSkinnedMesh ? node.boundingBox : node.geometry.boundingBox); });
            const measured = make(), boxes = [];
            measured.updateMatrixWorld(true);
            new THREE.Box3().setFromObject(measured);
            measured.traverse(node => { if (node.isMesh) boxes.push(node.isSkinnedMesh ? node.boundingBox : node.geometry.boundingBox); });
            assert.deepEqual(kept.map(b => b && [b.min.toArray(), b.max.toArray()]), boxes.map(b => b && [b.min.toArray(), b.max.toArray()]));
        });
    }
}

test('a model with morph targets or a part that is no mesh is measured on the main thread', () => {
    const w = world(), A = w.ReactorFight.Action, spec = { model: 'm', size: 2 };
    const morphed = MODELS['boxes, a nested group and a mesh with no index']();
    morphed.children[0].geometry.morphAttributes.position = [morphed.children[0].geometry.getAttribute('position').clone()];
    assert.equal(A.HullWorker.snapshot(w.Reactor3D, morphed, null, spec), null);
    const lined = MODELS['boxes, a nested group and a mesh with no index']();
    lined.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(9, 9, 9)])));
    assert.equal(A.HullWorker.snapshot(w.Reactor3D, lined, null, spec), null);
});

/** A Worker that holds its messages until the test lets them through: each answered by the program as a worker runs it. */
function heldWorkers(w) {
    const held = [];
    let realm = null;
    w.Worker = class { constructor(url) { realm = workerRealm(w.__sources.get(url)); this.terminated = false; } postMessage(job) { held.push([this, job]); } terminate() { this.terminated = true; } };
    w.__sources = new Map();
    w.Blob = class { constructor(parts) { this.text = parts.join(''); } };
    const RealURL = URL;
    w.URL = class extends RealURL {
        static createObjectURL(blob) { const url = 'blob:hull-' + w.__sources.size; w.__sources.set(url, blob.text); return url; }
        static revokeObjectURL() {}
    };
    w.document = { baseURI: 'file:///game/index.html' };
    vm.runInContext('Worker = globalThis.Worker; Blob = globalThis.Blob; URL = globalThis.URL; document = globalThis.document;', w);
    return { held, deliver() { while (held.length) { const [worker, job] = held.shift(); worker.onmessage({ data: realm.send(job) }); } } };
}
const settled = () => new Promise(resolve => setImmediate(resolve));

test('until its heights come back a model counts by its footprint; once they are in it is measured again; off, they are worked out at once', async () => {
    const w = world(), A = w.ReactorFight.Action, workers = heldWorkers(w);
    const spec = { model: 'tank', size: 3 };
    w.Reactor3D._glbCache.tank = { template: MODELS['boxes, a nested group and a mesh with no index']() };
    const epoch = A.hullEpoch;
    assert.equal(A.hullOf(w.Reactor3D, spec), A.HULL_PENDING, 'out on the worker');
    assert.equal(A.hullsPending(), 1);
    assert.equal(A.hullOf(w.Reactor3D, spec), A.HULL_PENDING, 'asked again, not sent twice');
    assert.equal(workers.held.length, 1);
    workers.deliver();
    await settled();
    assert.equal(A.hullsPending(), 0);
    assert.ok(A.hullEpoch > epoch, 'whoever measured it measures it again');
    const hull = A.hullOf(w.Reactor3D, spec);
    assert.deepEqual(plain(hull), plain(A.buildHull(w.Reactor3D, MODELS['boxes, a nested group and a mesh with no index'](), null, spec)));
    assert.equal(A.hullOf(w.Reactor3D, spec), hull, 'kept');
    // Off: worked out where it is asked for.
    A.HullWorker.enabled = false;
    const other = { model: 'tank', size: 3, pitch: 0.3 };
    const now = A.hullOf(w.Reactor3D, other);
    assert.ok(now && now !== A.HULL_PENDING);
    assert.equal(workers.held.length, 0);
});

test('a worker that never answers is waited for no longer than WAIT_MS: the heights are worked out here then', () => {
    const w = world(), A = w.ReactorFight.Action;
    heldWorkers(w);
    const spec = { model: 'tank', size: 3 };
    w.Reactor3D._glbCache.tank = { template: MODELS['boxes, a nested group and a mesh with no index']() };
    A.HullWorker.WAIT_MS = 0;
    assert.equal(A.hullOf(w.Reactor3D, spec), A.HULL_PENDING);
    const until = Date.now() + 5; while (Date.now() < until) { /* past the wait */ }
    assert.equal(A.hullsPending(), 0);
    assert.ok(A.hullOf(w.Reactor3D, spec) && A.hullOf(w.Reactor3D, spec) !== A.HULL_PENDING);
});

test('a buildHull put in the engine\'s place runs on the main thread, as written', () => {
    const w = world(), A = w.ReactorFight.Action;
    const workers = heldWorkers(w);
    const own = A.buildHull;
    let called = 0;
    A.buildHull = function() { called++; return own.apply(this, arguments); };
    w.Reactor3D._glbCache.tank = { template: MODELS['boxes, a nested group and a mesh with no index']() };
    const hull = A.hullOf(w.Reactor3D, { model: 'tank', size: 3 });
    assert.ok(hull && hull !== A.HULL_PENDING);
    assert.equal(called, 1);
    assert.equal(workers.held.length, 0);
});

test('a Tactical unit thinks once no model\'s heights are out on the worker', () => {
    const w = world({ tactical: true }), F = w.ReactorFight;
    let out = 1;
    F.Action.hullsPending = () => out;
    let begun = 0;
    const begin = F.AI.begin;
    F.AI.begin = function() { begun++; return begin.apply(this, arguments); };
    assert.equal(F.AI.think(w.$gameFight, { id: 1 }, null), null, 'it waits');
    assert.equal(begun, 0, 'and has not begun to think');
    out = 0;
    try { F.AI.think(w.$gameFight, { id: 1 }, null); } catch (error) { /* a unit of no battle: only whether it began matters */ }
    assert.equal(begun, 1);
});

/** requestIdleCallback held until the test runs the idle time between frames: `idle()` runs what is waiting. */
function idleTime(w) {
    const waiting = [];
    w.requestIdleCallback = (callback, options) => { waiting.push([callback, options]); return waiting.length; };
    return { waiting, idle() { const now = waiting.splice(0); for (const [callback] of now) callback({ didTimeout: false, timeRemaining: () => 10 }); return now.length; } };
}

test('with idle time the meshes are copied out between frames, one model at a time, and the heights are the same', async () => {
    const w = world(), A = w.ReactorFight.Action, workers = heldWorkers(w), time = idleTime(w);
    w.Reactor3D._glbCache.tank = { template: MODELS['boxes, a nested group and a mesh with no index']() };
    w.Reactor3D._glbCache.rock = { template: MODELS['quantized positions in an interleaved buffer']() };
    let copied = 0;
    const snapshot = A.HullWorker.snapshot;
    A.HullWorker.snapshot = function() { copied++; return snapshot.apply(this, arguments); };
    assert.equal(A.hullOf(w.Reactor3D, { model: 'tank', size: 3 }), A.HULL_PENDING);
    assert.equal(A.hullOf(w.Reactor3D, { model: 'rock', size: 2 }), A.HULL_PENDING);
    assert.equal(copied, 0, 'nothing is copied in the frame that asks');
    await settled();
    assert.equal(time.waiting.length, 1, 'one model waits for the idle time');
    assert.ok(time.waiting[0][1] && time.waiting[0][1].timeout > 0, 'with a timeout, so a busy game still sends it');
    time.idle();
    assert.equal(copied, 1);
    assert.equal(workers.held.length, 1);
    await settled();
    time.idle();
    assert.equal(copied, 2, 'the next model in the next idle time');
    workers.deliver();
    await settled();
    assert.equal(A.hullsPending(), 0);
    assert.deepEqual(plain(A.hullOf(w.Reactor3D, { model: 'tank', size: 3 })),
        plain(A.buildHull(w.Reactor3D, MODELS['boxes, a nested group and a mesh with no index'](), null, { model: 'tank', size: 3 })));
    assert.deepEqual(plain(A.hullOf(w.Reactor3D, { model: 'rock', size: 2 })),
        plain(A.buildHull(w.Reactor3D, MODELS['quantized positions in an interleaved buffer'](), null, { model: 'rock', size: 2 })));
});

test('a model the worker cannot read, or a worker that failed while it waited, is worked out on the main thread; idleCopy off sends at once', async () => {
    const w = world(), A = w.ReactorFight.Action, workers = heldWorkers(w), time = idleTime(w);
    const morphed = MODELS['boxes, a nested group and a mesh with no index']();
    morphed.children[0].geometry.morphAttributes.position = [morphed.children[0].geometry.getAttribute('position').clone()];
    w.Reactor3D._glbCache.morph = { template: morphed };
    assert.equal(A.hullOf(w.Reactor3D, { model: 'morph', size: 3 }), A.HULL_PENDING);
    await settled();
    time.idle();
    await settled(); await settled();
    assert.equal(A.hullsPending(), 0);
    const morphHull = A.hullOf(w.Reactor3D, { model: 'morph', size: 3 });
    assert.ok(morphHull && morphHull !== A.HULL_PENDING, 'measured here');
    assert.equal(workers.held.length, 0);
    // The worker fails while a model waits for its idle time: nothing is copied, the main thread measures it.
    w.Reactor3D._glbCache.tank = { template: MODELS['boxes, a nested group and a mesh with no index']() };
    let copied = 0;
    const snapshot = A.HullWorker.snapshot;
    A.HullWorker.snapshot = function() { copied++; return snapshot.apply(this, arguments); };
    assert.equal(A.hullOf(w.Reactor3D, { model: 'tank', size: 3 }), A.HULL_PENDING);
    A.HullWorker.fail();
    await settled();
    time.idle();
    await settled(); await settled();
    assert.equal(copied, 0);
    assert.equal(A.hullsPending(), 0);
    assert.deepEqual(plain(A.hullOf(w.Reactor3D, { model: 'tank', size: 3 })),
        plain(A.buildHull(w.Reactor3D, MODELS['boxes, a nested group and a mesh with no index'](), null, { model: 'tank', size: 3 })));
    // idleCopy off: copied and sent in the frame that asks.
    const v = world(), B = v.ReactorFight.Action, sent = heldWorkers(v), vTime = idleTime(v);
    B.HullWorker.idleCopy = false;
    v.Reactor3D._glbCache.tank = { template: MODELS['boxes, a nested group and a mesh with no index']() };
    assert.equal(B.hullOf(v.Reactor3D, { model: 'tank', size: 3 }), B.HULL_PENDING);
    assert.equal(sent.held.length, 1);
    assert.equal(vTime.waiting.length, 0);
});
