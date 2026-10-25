'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const file = path.join(__dirname, '../src/forge/Character3D/CharacterCloth.js');
const source = fs.readFileSync(file, 'utf8');
const Cloth = require(file);

/** A two-column cape, clear of the floor, carried by a moving anchor. */
function fixture(key = 'cape') {
    const rest = Float32Array.of(-0.1, 1, 0, -0.1, 0.5, 0, 0.1, 1, 0, 0.1, 0.5, 0);
    const bones = [{ name: 'Hips', parent: -1, head: [0, 1, 0] },
        { name: 'Cape0', parent: 0, head: [-0.1, 1, 0], tail: [-0.1, 0.5, 0], cloth: true },
        { name: 'Cape1', parent: 0, head: [0.1, 1, 0], tail: [0.1, 0.5, 0], cloth: true }];
    const parts = [{ name: 'Cape', cloth: true, positions: rest.slice(), joints: Uint8Array.of(1, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0), weights: Float32Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0) }];
    const links = { down: [0, 1, 0.5, 2, 3, 0.5], across: [0, 2, 0.2, 1, 3, 0.2], bend: [], shear: [] };
    const g = { kind: 'cape', anchor: 0, chains: 2, rows: 1, length: [1, 1], ring: false, rest, boneIds: [1, 2], links, gap: 0.008, stiff: 0.01, drag: 0.08, part: 0, sheet: Int32Array.of(0, 1, 2, 3) };
    return { bones, parts, cloth: { key, bones: 3, regions: [g], colliders: [] } };
}
function clip(name = 'closed action', once = true) {
    const times = Float32Array.of(0, 0.1, 0.2, 0.3, 0.4);
    const values = Float32Array.from([0, 0.5, 0, -0.5, 0].flatMap(a => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)]));
    return { name, once, times, tracks: [{ bone: 0, values }] };
}
/** Run the real generated worker module in a separate realm, with message copies and ordered delivery. */
function browser() {
    const urls = new Map(), instances = [], jobs = [], errors = [];
    let next = 1, revoked = 0;
    class Blob { constructor(parts) { this.code = parts.join(''); } }
    class Worker {
        constructor(url) {
            instances.push(this);
            const self = { postMessage: data => { if (data.error) errors.push(data.error); setImmediate(() => this.onmessage?.({ data: structuredClone(data) })); } };
            this.context = vm.createContext({ self });
            vm.runInContext(urls.get(url).code, this.context);
            this.queue = Promise.resolve();
        }
        postMessage(data) {
            const copy = structuredClone(data);
            jobs.push(copy);
            this.queue = this.queue.then(() => new Promise(resolve => setImmediate(() => { this.context.self.onmessage({ data: copy }); resolve(); })));
        }
        terminate() { this.terminated = true; }
    }
    const window = {}, context = vm.createContext({ window, document: {}, Blob, Worker, URL: { createObjectURL(blob) { const id = 'blob:' + next++; urls.set(id, blob); return id; }, revokeObjectURL(id) { revoked++; urls.delete(id); } }, setTimeout });
    vm.runInContext(source, context);
    return { api: window.RRCharacterCloth, instances, jobs, errors, revoked: () => revoked };
}
const clothTracks = made => made.tracks.filter(t => t.cloth).map(t => ({ bone: t.bone, times: Array.from(t.times), values: Array.from(t.values) }));

test('a one-shot cloth bake in the worker matches the synchronous bake, including closed source actions', async () => {
    const b = browser(), result = fixture(), raw = clip();
    const expected = Cloth.bake(result, raw, { quality: 'preview' });
    const actual = await b.api.bakeAsync(structuredClone(result), raw, { quality: 'preview' });
    assert.deepEqual(clothTracks(actual), clothTracks(expected));
    assert.equal(b.jobs.find(j => j.clip).clip.once, true);
    assert.equal(b.revoked(), 1, 'the generated worker URL is released');
    assert.deepEqual(b.errors, []);
});

test('a real summer dress sends its fabric faces to the worker and bakes the same contact correction', async () => {
    const Model = require('../src/forge/Character3D/CharacterModel.js');
    const Body = require('../src/forge/Character3D/HumanBody.js');
    const Poses = require('../src/forge/Character3D/CharacterPoses.js');
    const pack = await Body.loadPack(), b = browser();
    const result = Model.build(pack, { age: 30, gender: 0, outfit: [{ id: 'dress' }], hair: { style: 'bald' } }, {}, { quality: 'preview', skinSize: 32 });
    const raw = Poses.clip(result.bones, 'kneel', result.parts[0]);
    const copy = structuredClone(result);
    const actual = await b.api.bakeAsync(copy, raw, { quality: 'preview' });
    const expected = Cloth.bake(result, raw, { quality: 'preview' });
    assert.deepEqual(clothTracks(actual), clothTracks(expected));
    assert.ok(b.jobs.find(j => j.build).build.parts.some(p => p?.index?.length > 100));
    assert.deepEqual(b.errors, []);
});

test('returning to a build evicted by four newer builds bakes in the worker', async () => {
    const b = browser(), first = fixture('first');
    await b.api.bakeAsync(first, clip('first'), { quality: 'preview' });
    for (let i = 0; i < 4; i++) await b.api.bakeAsync(fixture('next' + i), clip('next' + i), { quality: 'preview' });
    await b.api.bakeAsync(first, clip('return'), { quality: 'preview' });
    assert.deepEqual(b.errors, []);
    assert.equal(b.jobs.filter(j => j.build).length, 6, 'the earlier build is sent again');
});

test('concurrent requests share the expensive bake and keep each caller\'s clip metadata', async () => {
    const b = browser(), result = fixture(), raw = clip('shared');
    const [a, c] = await Promise.all([b.api.bakeAsync(result, { ...raw, seat: 'first' }), b.api.bakeAsync(result, { ...raw, seat: 'second' })]);
    assert.equal(b.jobs.filter(j => j.clip).length, 1);
    assert.equal(a.seat, 'first'); assert.equal(c.seat, 'second');
    assert.deepEqual(clothTracks(a), clothTracks(c));
});

test('a failed worker rejects promptly, then a new request registers its build on a fresh worker', async () => {
    const b = browser(), result = fixture(), raw = clip('failure');
    const work = b.api.bakeAsync(result, raw);
    b.instances[0].onerror();
    await assert.rejects(work, /cloth worker failed/);
    const made = await b.api.bakeAsync(result, clip('retry'), { quality: 'preview' });
    assert.equal(b.instances.length, 2);
    assert.equal(b.jobs.filter(j => j.build).length, 2);
    assert.ok(made.tracks.some(t => t.cloth));
    assert.deepEqual(b.errors, []);
});

test('cloth cache distinguishes changed quaternion components and per-track timing', () => {
    const b = browser(), result = fixture(), raw = clip('cache');
    b.api.bake(result, raw, { quality: 'preview' });
    const changed = structuredClone(raw);
    changed.tracks[0].values[5] = 0.1;
    assert.equal(b.api.baked(result, changed, { quality: 'preview' }), null);
    const retimed = structuredClone(raw);
    retimed.tracks[0].times = Float32Array.of(0, 0.05, 0.15, 0.25, 0.4);
    assert.equal(b.api.baked(result, retimed, { quality: 'preview' }), null);
    assert.equal(b.api.baked(result, { ...raw, skin: true }, { quality: 'preview' }), null, 'a skin-resting pose has its own floor');
});

test('a late cloth preview preserves a completed one-shot action and can restart it', () => {
    global.self = global; global.window = global;
    require('../../runtime/libs/three.js');
    const THREE = global.THREE, window = {}, context = vm.createContext({ window });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/Character3DBuilder.js'), 'utf8'), context);
    const builder = Object.create(window.Character3DBuilder.prototype), object = new THREE.Object3D(), mixer = new THREE.AnimationMixer(object);
    const make = name => new THREE.AnimationClip(name, 0.5, [new THREE.NumberKeyframeTrack('.position[x]', [0, 0.5], [0, 1])]);
    const old = mixer.clipAction(make('raw'));
    old.setLoop(THREE.LoopOnce, 1); old.clampWhenFinished = true; old.setEffectiveTimeScale(2); old.setEffectiveWeight(0.75); old.play();
    mixer.update(0.4);
    assert.equal(old.paused, true, 'the one-shot has ended and is holding its last frame');
    mixer.update(0.01);
    assert.equal(old.getEffectiveTimeScale(), 0);
    const replacement = mixer.clipAction(make('cloth')), result = {};
    builder._result = result;
    builder._view = { actions: new Map([['frontFlip', { action: old }]]), action: old, mixer };
    builder._poseAction = id => { builder._view.actions.set(id, { action: replacement, meta: { once: true } }); return replacement; };
    let draws = 0; builder._plant = () => {}; builder._draw = () => draws++;
    builder._clothReady('frontFlip', result);
    assert.equal(builder._view.action, replacement);
    assert.equal(replacement.loop, THREE.LoopOnce); assert.equal(replacement.clampWhenFinished, true);
    assert.equal(replacement.repetitions, 1); assert.equal(replacement.paused, true);
    assert.equal(replacement.time, 0.5); assert.equal(replacement.timeScale, 2); assert.equal(replacement.weight, 0.75);
    assert.equal(draws, 1);
    replacement.reset().play(); mixer.update(0.1);
    assert.ok(Math.abs(replacement.time - 0.2) < 1e-6, 'restarting the pose advances at the original speed');
});

test('a bake without worker support rejects a simulation error instead of leaving a pending promise', { timeout: 1000 }, async () => {
    const result = fixture('broken');
    result.bones = [];
    await assert.rejects(Cloth.bakeAsync(result, clip('invalid')), /undefined|head/);
});
