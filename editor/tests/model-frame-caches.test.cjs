/**
 * The model pass's per-frame caches: the keyed-pose sampler that writes into
 * the caller's arrays, the table of which rules reach which parts, the
 * quaternion writes that skip an unchanged value, and the still models that
 * are not placed again. Each is a cache, never an approximation, so every
 * test drives the same frames with the cache on and off and requires the
 * same numbers, bit for bit, through the changes that must invalidate it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const R = require(path.join(root, 'runtime', 'reactor_3d.js'));
global.self = global; global.window = global;
require(path.join(root, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;

function seeded(seed) {
    return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

test('the frame loop samples keyed poses exactly as sampleModelKeys does', () => {
    const random = seeded(99);
    const vec = scale => [0, 1, 2].map(() => Math.round((random() - 0.5) * scale * 100) / 100);
    const out = { rotate: [0, 0, 0], move: [0, 0, 0], resize: [1, 1, 1] };
    let checked = 0;
    for (let n = 0; n < 400; n++) {
        const count = 1 + Math.floor(random() * 5);
        const keys = [];
        for (let k = 0; k < count; k++) {
            const key = { at: k === 0 && random() < 0.3 ? 0 : Math.round(random() * 100) / 100, rotate: vec(720) };
            if (random() < 0.6) key.move = vec(2);
            if (random() < 0.5) key.resize = vec(2).map(v => 1 + v);
            keys.push(key);
        }
        keys.sort((a, b) => a.at - b.at);
        if (random() < 0.3) keys[keys.length - 1].at = 1;
        // A loop whose ends meet a whole turn on runs through the seam.
        if (random() < 0.3) keys[keys.length - 1].rotate = keys[0].rotate.map(v => v + 360);
        const rule = { keys, trigger: random() < 0.5 ? 'always' : 'action' };
        for (const p of [0, 1, random(), random(), random(), keys[0].at, keys[keys.length - 1].at]) {
            const expected = R.sampleModelKeys(rule, p);
            R._sampleModelKeysInto(rule, p, out);
            for (const name of ['rotate', 'move', 'resize']) {
                for (let i = 0; i < 3; i++) {
                    assert.ok(Object.is(out[name][i], expected[name][i]), `${name}[${i}] at ${p} of rule ${n}`);
                }
            }
            checked++;
        }
    }
    assert.ok(checked > 2000);
});

/** A model cut into named parts, ready for the animation pass. */
function partsModel() {
    const object = new THREE.Group();
    const names = [['hull'], ['turret', 'hull'], ['cannon', 'turret', 'hull'], ['wheel-front'], ['wheel-back'], ['arm'], ['arm-lower', 'arm'], ['lid']];
    for (let i = 0; i < names.length; i++) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
        mesh.name = names[i][0];
        mesh.position.set(i * 0.1, i * 0.05, -i * 0.07);
        mesh.userData.parts = names[i].map((name, d) => ({ name, pivot: [d * 0.1, 0.2 + i * 0.01, -0.05 * d] }));
        object.add(mesh);
    }
    return { object, binding: R.prepareModelInstance(object, []) };
}

function partsRules() {
    return R.readModelAnimationRules({
        animations: [
            { name: 'Aim', type: 'pose', trigger: 'always', part: 'turret', rotate: [0, 40, 0], move: [0, 0.1, 0], period: 12 },
            { name: 'Recoil', type: 'pose', trigger: 'always', part: 'cannon', rotate: [10, 0, 0], move: [0, 0, -0.2], resize: [1, 1.2, 1], period: 7 },
            { name: 'Roll', type: 'spin', trigger: 'always', part: 'wheel', axis: 'x', speed: 90 },
            { name: 'Wave', type: 'swing', trigger: 'always', part: 'arm', axis: 'z', degrees: 30, period: 40 },
            { name: 'Bob', type: 'bob', trigger: 'always', part: 'Arm-Lower', axis: 'y', amount: 0.2, period: 30 },
            { name: 'Breathe', type: 'pose', trigger: 'always', part: 'hull', period: 30, cycles: 1,
                keys: [{ at: 0.25, rotate: [4, 0, 0], move: [0, 0.02, 0] }, { at: 0.75, rotate: [-3, 2, 0], resize: [1.02, 1, 1] }] },
            { name: 'Open', type: 'pose', trigger: 'action', part: 'lid', rotate: [-80, 0, 0], period: 10, hold: true }
        ]
    });
}

function transforms(object) {
    const values = [];
    object.traverse(node => values.push(...node.position.toArray(), ...node.quaternion.toArray(),
        ...node.scale.toArray(), ...node.rotation.toArray().slice(0, 3)));
    return values;
}

test('the rule-to-part table and the unchanged-quaternion skip leave every part exactly where matching each frame did', () => {
    const a = partsModel(), b = partsModel();
    let rulesA = partsRules(), rulesB = partsRules();
    const saved = [R.AnimationMatches.enabled, R.AnimationWrites.enabled];
    try {
        for (let frame = 0; frame < 240; frame++) {
            const state = { frame, moving: frame > 60 && frame < 120, distance: 0.05, scale: 1, moveScale: 1,
                action: frame >= 150 ? { name: 'Open', frame: 150, until: 160 } : null };
            // A part renamed, a rule re-aimed, a new list, a part carved in
            // after binding, and an Euler angle written by hand: each has to
            // reach both instances the same way.
            if (frame === 40) for (const m of [a, b]) m.binding.meshes[5].parts[0].name = 'Arm';
            if (frame === 80) { rulesA[1].part = 'hull'; rulesB[1].part = 'hull'; }
            if (frame === 100) { rulesA = partsRules(); rulesB = partsRules(); }
            if (frame === 130) {
                for (const m of [a, b]) {
                    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
                    mesh.userData.parts = [{ name: 'turret-hatch', pivot: [0, 0.3, 0] }, { name: 'turret', pivot: [0, 0.2, 0] }];
                    m.binding.root.add(mesh);
                    m.binding.meshes.push({ mesh, parts: mesh.userData.parts, basePosition: mesh.position.clone(),
                        baseQuaternion: mesh.quaternion.clone(), baseScale: mesh.scale.clone(), clipBase: null, acc: null });
                }
            }
            if (frame === 170) for (const m of [a, b]) m.binding.meshes[7].mesh.rotation.set(Math.PI, 0, Math.PI);
            R.AnimationMatches.enabled = true; R.AnimationWrites.enabled = true;
            R.applyModelAnimation(a.binding, rulesA, state);
            R.AnimationMatches.enabled = false; R.AnimationWrites.enabled = false;
            R.applyModelAnimation(b.binding, rulesB, state);
            assert.deepEqual(transforms(a.object), transforms(b.object), 'frame ' + frame);
        }
    } finally {
        [R.AnimationMatches.enabled, R.AnimationWrites.enabled] = saved;
    }
    assert.ok(a.binding._matchTable, 'the cached instance built a table');
    assert.equal(a.binding._matchTable.entries.length, 9, 'and rebuilt it when a part was carved in');
});

test('distance levels picked against the screen read once a sync match the ones read per model', () => {
    const saved = { viewport: R._viewport, cache: R._lodCache, graphics: global.Graphics };
    try {
        global.Graphics = { frameCount: 1, width: 816, height: 624 };
        const camera = new THREE.PerspectiveCamera(40, 816 / 624, 0.1, 500);
        R._viewport = { camera: () => camera, targetSize: () => ({ width: 1280, height: 720 }) };
        const geometries = [4000, 900, 120].map(n => new THREE.BufferGeometry().setAttribute('position',
            new THREE.BufferAttribute(new Float32Array(n * 9), 3)));
        R._lodCache = Object.assign(Object.create(null), { lodtest: { levels: geometries.map(g => [g]) } });
        const model = () => {
            const object = new THREE.Group();
            const mesh = new THREE.Mesh(geometries[0], new THREE.MeshBasicMaterial());
            mesh.userData.lodIndex = 0;
            object.add(mesh);
            return object;
        };
        const each = model(), once = model();
        const screen = { factor: 0, pixels: 0 };
        let coarsest = 0;
        for (let step = 0; step < 120; step++) {
            const eye = new THREE.Vector3(0, 2, 1 + step * 0.9 - (step > 60 ? (step - 60) * 1.7 : 0));
            screen.factor = R._lodScreenFactor();
            screen.pixels = R._lodScreenPixels();
            R.pickLod(each, 3, eye, 'lodtest');
            R.pickLod(once, 3, eye, 'lodtest', screen);
            assert.equal(once.userData.lodLevel, each.userData.lodLevel, 'step ' + step);
            assert.equal(once.children[0].geometry, each.children[0].geometry);
            coarsest = Math.max(coarsest, once.userData.lodLevel);
        }
        assert.equal(coarsest, 2, 'the sweep went out to the coarsest level and back');
    } finally {
        R._viewport = saved.viewport; R._lodCache = saved.cache; global.Graphics = saved.graphics;
    }
});

/** A scene of placed models from a synthetic template, driven through the real sync. */
function stillScene(ids) {
    const scene = Object.create(R.MapScene.prototype);
    scene._scene = new THREE.Scene();
    scene._materials = [];
    const characters = ids.map(id => ({
        _x: 3 + id, _y: 4, _realX: 3 + id, _realY: 4, _pageIndex: 0, _direction: 2, _reactorLift: 0,
        event() { return $dataMap.events[id]; }, eventId() { return id; }, direction() { return this._direction; },
        isMoving() { return this._x !== this._realX || this._y !== this._realY; },
        isTransparent() { return false; }, isDashing() { return false; }
    }));
    return { scene, characters };
}

test('a still model is not placed again, and every change places it exactly as a full placement would', async () => {
    const saved = {
        graphics: global.Graphics, map: global.$dataMap, loadModel: R.loadModel, sidecar: R.loadModelSidecar,
        enabled: R.StillModels.enabled
    };
    const template = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());
    body.position.set(0.1, 1, 0);
    template.add(body);
    template.userData.glbSize = { x: 1, y: 2, z: 1 };
    try {
        global.Graphics = { frameCount: 1, width: 816, height: 624 };
        global.$dataMap = {
            width: 20, height: 20, events: [null, { id: 1, pages: [{}] }, { id: 2, pages: [{}, {}] }, { id: 3, pages: [{}] }],
            reactor3d: { events: {
                1: { 0: { name: 'Crate', size: 2, yaw: 30, faces: { front: [0.2, 0, 1] } } },
                2: { 0: { name: 'Crate', size: 3, offset: [0.2, 0.1, 0] }, 1: { name: 'Crate', size: 1.5, pitch: 10 } },
                3: { 0: { name: 'Crate', size: 2 } }
            } }
        };
        R.loadModel = () => Promise.resolve(template);
        R.loadModelSidecar = () => Promise.resolve(null);
        const on = stillScene([1, 2, 3]), off = stillScene([1, 2, 3]);
        const sync = (enabled) => {
            R.StillModels.enabled = enabled;
            (enabled ? on : off).scene.syncCharacterModels((enabled ? on : off).characters);
        };
        sync(true); sync(false);
        await new Promise(resolve => setImmediate(resolve));
        const steps = {
            20: c => { c[0]._realX += 0.5; },
            30: c => { c[1]._direction = 6; },
            50: c => { c[0]._reactorOnLadder = true; },
            55: c => { c[0]._reactorOnLadder = false; },
            60: c => { c[2]._reactorLift = 1.5; },
            70: c => R.transformModel(c[0], { offset: [0, 0, 1], rotate: [20, 5, 0], scale: [1.5, 1, 1] }, 12),
            100: c => { c[0]._reactorTransform.to.offset[2] = 2; },
            110: c => { c[1]._pageIndex = 1; },
            120: c => { c[2]._reactorPosePitch = 1; c[2]._reactorSpin = 30; },
            130: c => { c[2]._reactorAir = 0.4; },
            140: c => { c[2]._reactorDir8 = 9; c[2]._direction = 8; },
            150: c => { $dataMap.reactor3d.events[3][0] = { name: 'Crate', size: 4 }; },
            160: () => { Graphics.frameCount -= 30; },
            170: c => R.transformModel(c[1], { offset: [1, 0, 0], rotate: [0, 0, 0], scale: [1, 1, 1] }, 0)
        };
        for (let frame = 0; frame < 200; frame++) {
            Graphics.frameCount++;
            if (steps[frame]) { steps[frame](on.characters); steps[frame](off.characters); }
            // A plugin moving a model by hand is put back, as a full placement always did.
            if (frame === 180) for (const s of [on, off]) s.scene._modelInstances.get('e3').object.position.y += 5;
            sync(true); sync(false);
            for (const key of ['e1', 'e2', 'e3']) {
                const a = on.scene._modelInstances.get(key).object, b = off.scene._modelInstances.get(key).object;
                assert.deepEqual(transforms(a), transforms(b), `${key} at frame ${frame}`);
                a.updateMatrix(); b.updateMatrix();
                assert.deepEqual(a.matrix.elements, b.matrix.elements, `${key} matrix at frame ${frame}`);
                assert.equal(a.visible, b.visible);
            }
            if (frame === 19) {
                const holders = [...on.scene._modelInstances.values()];
                assert.ok(holders.every(holder => holder.rootFrozen && !holder.object.matrixAutoUpdate), 'settled models are frozen');
                assert.ok([...off.scene._modelInstances.values()].every(holder => holder.object.matrixAutoUpdate), 'the switch off freezes nothing');
            }
            if (frame === 20) {
                const moved = on.scene._modelInstances.get('e1');
                assert.ok(!moved.rootFrozen && moved.object.matrixAutoUpdate, 'a moved model thaws before it is placed');
            }
        }
        // Switched off mid-map, every frozen model thaws on its next frame.
        R.StillModels.enabled = false;
        on.scene.syncCharacterModels(on.characters);
        assert.ok([...on.scene._modelInstances.values()].every(holder => holder.object.matrixAutoUpdate));
    } finally {
        global.Graphics = saved.graphics; global.$dataMap = saved.map;
        R.loadModel = saved.loadModel; R.loadModelSidecar = saved.sidecar; R.StillModels.enabled = saved.enabled;
        for (const key of Object.keys(R._glbCache)) if (R._glbCache[key] && R._glbCache[key].template === template) delete R._glbCache[key];
    }
});
