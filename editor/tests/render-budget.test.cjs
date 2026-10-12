const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const repo = path.resolve(__dirname, '..', '..');
require(path.join(repo, 'runtime/libs/three.js'));
const R = require(path.join(repo, 'runtime/reactor_3d.js'));
const T = global.THREE;

function field() {
    return { rrLightCount: { value: 32 }, rrLightPos: { value: new Float32Array(128) },
        rrLightColor: { value: new Float32Array(128) }, rrLightAim: { value: new Float32Array(128) } };
}
function contributes(p, position, color, aim) {
    const d = p.map((v, i) => v - position[i]), distance = Math.hypot(...d);
    if (distance >= Math.max(position[3], .001)) return false;
    if (color[3] < .5) return true;
    const along = d.reduce((n, v, i) => n + v * aim[i], 0);
    if (color[3] < 1.5) return along / Math.max(distance, .0001) > aim[3];
    return along >= 0 && along <= position[3]
        && Math.hypot(...d.map((v, i) => v - aim[i] * along)) < aim[3];
}
test('cell culling retains every contributing point, spot and beam, including bit 31 and boundaries', () => {
    let seed = 872346;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const u = field(), origin = new Float32Array([-32, -8, -32]);
    const [nx, ny, nz] = R.LightGrid.size, step = R.LightGrid.step;
    const data = new Uint32Array(nx * ny * nz);
    for (let round = 0; round < 8; round++) {
        for (let i = 0; i < 32; i++) {
            const at = i * 4, axis = new T.Vector3(random() - .5, random() - .5, random() - .5).normalize();
            u.rrLightPos.value.set([random() * 60 - 30, random() * 26 - 6, random() * 60 - 30, .001 + random() * 60], at);
            u.rrLightColor.value.set([1, 1, 1, i % 3], at);
            u.rrLightAim.value.set([...axis.toArray(), i % 3 === 2 ? .005 + random() * 5 : .01 + random() * .989], at);
        }
        R.LightGrid.fill(data, origin, 32, u.rrLightPos.value, u.rrLightColor.value, u.rrLightAim.value);
        for (let sample = 0; sample < 6000; sample++) {
            const cell = [Math.floor(random() * nx), Math.floor(random() * ny), Math.floor(random() * nz)];
            const point = cell.map((v, k) => origin[k] + (v + (sample % 3 ? random() : .0000001)) * step);
            const mask = data[(cell[2] * ny + cell[1]) * nx + cell[0]];
            for (let i = 0; i < 32; i++) if (contributes(point, u.rrLightPos.value.subarray(i * 4, i * 4 + 4),
                u.rrLightColor.value.subarray(i * 4, i * 4 + 4), u.rrLightAim.value.subarray(i * 4, i * 4 + 4))) {
                assert.notEqual((mask & (1 << i)) >>> 0, 0, `Missing light ${i}, sample ${sample}, round ${round}`);
            }
        }
    }
});
test('moving lights, grid shifts and removals replace masks immediately; independent previews disable them', () => {
    const u = field(); u.rrLightCount.value = 8;
    for (let i = 0; i < 8; i++) u.rrLightPos.value.set([1, 1, 1, 2], i * 4);
    R.LightGrid.update(u, { x: 0, y: 0 });
    const first = u.rrLightGrid.value.image.data.slice();
    for (let i = 0; i < 8; i++) u.rrLightPos.value.set([24, 20, 24, 2], i * 4);
    R.LightGrid.update(u, { x: 0, y: 0 });
    assert.notDeepEqual(u.rrLightGrid.value.image.data, first);
    const second = u.rrLightGrid.value.image.data.slice();
    R.LightGrid.update(u, { x: 60, y: 60 });
    assert.notDeepEqual(u.rrLightGrid.value.image.data, second);
    u.rrLightCount.value = 0; R.LightGrid.update(u, null); assert.equal(u.rrLightGridEnabled.value, 0);
    const old = R._lightUniforms;
    try { R._lightUniforms = null; const own = R.lightUniforms(); R.LightGrid.ensure(own); own.rrLightGridEnabled.value = 1;
        R.packLightUniforms([], null); assert.equal(own.rrLightGridEnabled.value, 0);
        assert.notEqual(own.rrLightGrid.value, u.rrLightGrid.value); own.rrLightGrid.value.dispose();
    } finally { R._lightUniforms = old; u.rrLightGrid.value.dispose(); }
});

test('colour levels preserve source geometry for shadows/collision and restore state after a failed draw', t => {
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(45, 1, .1, 100);
    camera.position.z = 10;
    const original = new T.BoxGeometry(), reduced = new T.BoxGeometry(), mesh = new T.Mesh(original, new T.MeshBasicMaterial());
    scene.add(mesh);
    t.mock.method(R, 'tier', () => 'weak');
    t.mock.method(R.GeometryDetail, 'begin', () => { mesh.geometry = reduced; return [[mesh, original]]; });
    const renderer = { domElement: { height: 1080 }, render() {
        assert.equal(mesh.geometry, reduced);
        R.GeometryDetail.withOriginal(() => assert.equal(mesh.geometry, original));
        assert.equal(mesh.geometry, reduced);
        throw Error('draw failed');
    } };
    assert.throws(() => R.renderScene(renderer, scene, camera), /draw failed/);
    assert.equal(mesh.geometry, original);
    assert.equal(scene.matrixWorldAutoUpdate, true);
    assert.equal(camera.matrixWorldAutoUpdate, true);
    assert.equal(R.GeometryDetail._active, undefined);
});
test('projected error tightens with camera approach and respects shear; mutable and skinned geometry falls back', t => {
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0], 3));
    g.setIndex(new T.BufferAttribute(new Uint32Array(100002), 1));
    const m = new T.MeshBasicMaterial(); m.__reactorModel = true;
    const mesh = new T.Mesh(g, m), c = new T.PerspectiveCamera(50, 1, .1, 1000); mesh.updateMatrixWorld();
    assert.equal(R.GeometryDetail.eligible(mesh), true);
    g.setDrawRange(3, 100000); assert.equal(R.GeometryDetail.eligible(mesh), false);
    g.setDrawRange(0, 100000); assert.equal(R.GeometryDetail.eligible(mesh), false);
    g.setDrawRange(0, Infinity);
    const uv = new T.InterleavedBuffer(new Float32Array(6), 2);
    g.setAttribute('uv', new T.InterleavedBufferAttribute(uv, 2, 0));
    const uvState = { source: g, signature: R.GeometryDetail.signature(g), dead: false };
    uv.needsUpdate = true; assert.equal(R.GeometryDetail.fresh(uvState), false);
    const state = { source: g, signature: R.GeometryDetail.signature(g), dead: false };
    g.attributes.position.needsUpdate = true; assert.equal(R.GeometryDetail.fresh(state), false);
    // A skinned body qualifies (index only; its weights guide the simplifier)
    // unless switched off or opted out; with no placed instance to measure it
    // from, it is drawn at full detail.
    mesh.isSkinnedMesh = true;
    g.setAttribute('skinIndex', new T.BufferAttribute(new Uint16Array(12), 4)); g.setAttribute('skinWeight', new T.Float32BufferAttribute(new Float32Array(12), 4));
    assert.equal(R.GeometryDetail.eligible(mesh), true);
    R.GeometryDetail.skinned = false; assert.equal(R.GeometryDetail.eligible(mesh), false); R.GeometryDetail.skinned = true;
    mesh.userData.rrNoDetail = true; assert.equal(R.GeometryDetail.eligible(mesh), false); delete mesh.userData.rrNoDetail;
    assert.equal(R.GeometryDetail.pixelsPerUnit(mesh, c, 1080), Infinity);
    const holder = new T.Group(); holder.userData.glbSize = { x: 1, y: 2, z: 1 }; holder.add(mesh); holder.position.z = -20; holder.updateMatrixWorld(true);
    c.position.set(0, 1, 0); c.updateMatrixWorld();
    const far = R.GeometryDetail.pixelsPerUnit(mesh, c, 1080); holder.position.z = -5; holder.updateMatrixWorld(true);
    assert.ok(Number.isFinite(far) && R.GeometryDetail.pixelsPerUnit(mesh, c, 1080) > far * 3, 'measured from where the instance stands');
    holder.userData.rrNoCull = true; assert.equal(R.GeometryDetail.pixelsPerUnit(mesh, c, 1080), Infinity, 'a ragdoll keeps full detail');
    holder.remove(mesh); mesh.isSkinnedMesh = false; g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight'); c.position.set(0, 0, 0); mesh.updateMatrixWorld(true);
    c.position.z = 100; c.updateMatrixWorld(); const distant = R.GeometryDetail.pixelsPerUnit(mesh, c, 1080);
    c.position.z = 10; c.updateMatrixWorld(); assert.ok(R.GeometryDetail.pixelsPerUnit(mesh, c, 1080) > distant * 9);
    const matrix = new T.Matrix4().makeShear(2, 3, -1, .5, -.2, 1.3);
    const bound = R.GeometryDetail.scaleBound(matrix.elements);
    for (let i = 0; i < 200; i++) {
        const v = new T.Vector3(Math.sin(i), Math.cos(i * 1.7), Math.sin(i * 3.1)).normalize().applyMatrix4(matrix);
        assert.ok(v.length() <= bound + 1e-10);
    }
    const scene = new T.Scene(); scene.add(mesh); scene.overrideMaterial = new T.MeshDepthMaterial();
    assert.deepEqual(R.GeometryDetail.begin(scene, c, 1080), []);
});
test('disposed geometry ignores late worker replies; a worker failure drops its queue', t => {
    const D = R.GeometryDetail, g = new T.BoxGeometry(); g.setIndex(new T.BufferAttribute(new Uint32Array(100002), 1));
    const worker = { postMessage() {}, terminate() { this.terminated = true; } };
    t.mock.method(D, 'dispatch', () => {});
    const old = { states: D._states, queue: D._queue, busy: D._busy, worker: D._worker, failed: D._failed };
    try {
        D._states = new WeakMap(); D._queue = []; D._failed = false; D._worker = worker;
        const state = D.state(g); D._busy = state; g.dispose();
        D.receive({ id: state.id, levels: [{ indices: new Uint32Array([0,1,2]), error: .0001 }] });
        assert.equal(state.levels.length, 0);
        D._queue.push({}); D.fail(); assert.equal(D._queue.length, 0); assert.equal(worker.terminated, true);
    } finally { Object.assign(D, { _states: old.states, _queue: old.queue, _busy: old.busy, _worker: old.worker, _failed: old.failed }); }
});

test('the real worker reduces dense geometry without changing source vertex data', async () => {
    const moduleCode = fs.readFileSync(path.join(repo, 'runtime/libs/meshopt_simplifier.js'), 'utf8');
    const { MeshoptSimplifier } = await import('data:text/javascript;base64,' + Buffer.from(moduleCode).toString('base64'));
    const geometry = new T.PlaneGeometry(2, 2, 32, 32);
    const positions = geometry.attributes.position.array.slice(), attributes = geometry.attributes.uv.array.slice();
    const beforeP = positions.slice(), beforeUV = attributes.slice();
    let result;
    const self = { postMessage(value) { result = value; } };
    const code = fs.readFileSync(path.join(repo, 'runtime/libs/reactor_geometry_worker.js'), 'utf8').replace(/^import .*;$/m, '');
    vm.runInNewContext(code, { self, MeshoptSimplifier, Float32Array, Uint32Array, Error });
    await self.onmessage({ data: { id: 7, positions, indices: new Uint32Array(geometry.index.array), attributes, stride: 2, weights: [1, 1] } });
    assert.equal(result.id, 7); assert.equal(result.error, undefined); assert.ok(result.levels.length);
    assert.ok(result.levels[0].indices.length < geometry.index.count / 2);
    for (const level of result.levels) for (const index of level.indices) assert.ok(index < positions.length / 3);
    assert.deepEqual(positions, beforeP); assert.deepEqual(attributes, beforeUV);
});
test('asynchronous coverage uses its captured pose, ignores ended effects and releases failure state', t => {
    const M = R.EffectMeasure, old = { pending: M._pending, failed: M._failed, worker: M._worker };
    const pixels = new Uint8ClampedArray(4 * 4 * 4); pixels[(1 * 4 + 1) * 4 + 3] = 255;
    const args = [{ x: 0, y: 0, w: 40, h: 40 }, 40, 40, { x: 20, y: 20 }, 10, 20, 1];
    const track = { history: [], _measurePending: 1 }, expected = { history: [] }, play = { track, frames: 90 };
    R.EffekseerScene.measurePixels(expected, pixels, 4, 4, ...args);
    try {
        M._pending = new Map([[1, { play, track, frame: 3, mw: 4, mh: 4, args }]]);
        M.receive({ id: 1, pixels }); assert.equal(play.lastLit, 3);
        assert.deepEqual(track, expected); assert.equal(M._pending.size, 0);
        const ended = { track: { history: [], _measurePending: 2 }, done: true };
        M._pending.set(2, { play: ended, track: ended.track }); M.receive({ id: 2, pixels });
        assert.equal(ended.track.history.length, 0); assert.equal(ended.track._measurePending, undefined);
        const failure = { _measurePending: 3 }; M._pending.set(3, { track: failure });
        M._worker = { terminate() {} }; M.fail(); assert.equal(failure._measurePending, undefined); assert.equal(M._pending.size, 0);
    } finally { M._pending = old.pending; M._failed = old.failed; M._worker = old.worker; }
});

test('all shadow passes, including rigid dynamic casters, see original geometry', t => {
    const D = R.GeometryDetail, original = new T.BoxGeometry(), reduced = new T.BoxGeometry();
    const mesh = new T.Mesh(reduced, new T.MeshBasicMaterial()), active = D._active;
    try {
        D._active = [[mesh, original]];
        t.mock.method(R.Shadows, '_flushOriginal', () => { assert.equal(mesh.geometry, original); throw Error('shadow interrupted'); });
        assert.throws(() => R.Shadows._flush(), /shadow interrupted/);
        assert.equal(mesh.geometry, reduced);
    } finally { D._active = active; }
});
test('a shadow face draws each caster at the coarsest level under half a texel from the light, and gives it back', () => {
    const D = R.GeometryDetail;
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0], 3));
    g.setIndex(new T.BufferAttribute(new Uint32Array(100002), 1)); g.computeBoundingSphere();
    const m = new T.MeshBasicMaterial(); m.__reactorModel = true;
    const mesh = new T.Mesh(g, m), root = new T.Group(); root.add(mesh);
    const fine = new T.BufferGeometry(), coarse = new T.BufferGeometry();
    const state = { source: g, signature: D.signature(g), levels: [{ geometry: fine, error: 0.001 }, { geometry: coarse, error: 0.01 }], id: 1, dead: false };
    const saved = D._states.get(g); D._states.set(g, state);
    const savedWorker = global.Worker; global.Worker = global.Worker || function () {};
    try {
        root.position.set(0, 0, 0); root.updateMatrixWorld(true);
        const near = D.forShadow([root], new T.Vector3(0, 0, 2), 256, 0.05);
        assert.equal(mesh.geometry, fine, 'close to the light: only the finer level is under half a texel');
        D.end(near); assert.equal(mesh.geometry, g, 'given back after the face');
        const far = D.forShadow([root], new T.Vector3(0, 0, 400), 256, 0.05);
        assert.equal(mesh.geometry, coarse, 'far from the light: the coarsest');
        D.end(far);
        const touching = D.forShadow([root], new T.Vector3(0, 0, 0.2), 256, 0.05);
        assert.equal(mesh.geometry, g, 'too close for either: full detail');
        D.end(touching);
        D.SHADOW_TEXEL_ERROR = 0; assert.deepEqual(D.forShadow([root], new T.Vector3(0, 0, 400), 256, 0.05), [], 'the kill switch');
    } finally { D.SHADOW_TEXEL_ERROR = 0.5; if (saved) D._states.set(g, saved); else D._states.delete(g); global.Worker = savedWorker; }
});

test('geometries over the same buffers share one set of detail levels, kept for the next instance, and a body is measured at its joints', () => {
    const D = R.GeometryDetail, THREE = T;
    const posted = [];
    const queue = D._queue, busy = D._busy, failed = D._failed, dispatch = D.dispatch;
    D._queue = []; D._busy = null; D._failed = false;
    // The worker is stood in for: a job is noted, and answered by hand.
    D.dispatch = function() { if (this._busy || !this._queue.length) return; this._busy = this._queue.shift(); posted.push(this._busy); };
    try {
        const position = new THREE.BufferAttribute(new Float32Array(9 * 4), 3), index = new THREE.BufferAttribute(new Uint32Array(12), 1);
        const twin = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', position); g.setIndex(index); return g; };
        const a = twin(), b = twin();
        const first = D.state(a), second = D.state(b);
        assert.equal(first, second, 'two geometries over the same buffers: one state');
        assert.equal(posted.length, 1, 'and one job for the worker');
        D.receive({ id: first.id, levels: [{ indices: new Uint32Array(6), error: 0.001 }, { indices: new Uint32Array(3), error: 0.01 }] });
        assert.equal(first.levels.length, 2);
        assert.equal(first.levels[0].geometry.attributes.position, position, 'a level draws from the shared vertex buffer');
        // An instance leaves (releaseModelInstance takes its geometry apart, then disposes it): the other keeps the levels.
        a.index = null; a.dispose();
        assert.equal(D.state(b), first);
        assert.equal(first.levels.length, 2);
        assert.equal(first.source, b, 'the state reads the buffers through a geometry that still has them');
        // The last one leaves: the levels are freed, their index lists kept.
        b.dispose();
        assert.equal(first.dead, true);
        assert.equal(first.levels.length, 0);
        const c = twin(), again = D.state(c);
        assert.notEqual(again, first);
        assert.equal(again.levels.length, 2, 'the next instance has its levels at once');
        assert.equal(posted.length, 1, 'with no second job');
        // Other buffers are another state and another job.
        const other = new THREE.BufferGeometry(); other.setAttribute('position', position); other.setIndex(new THREE.BufferAttribute(new Uint32Array(12), 1));
        assert.notEqual(D.state(other), again);
        assert.equal(posted.length, 2);
        c.dispose(); other.dispose();
    } finally { D.dispatch = dispatch; D._queue = queue; D._busy = busy; D._failed = failed; }
    // The nearest a body comes to the camera is its nearest joint less its flesh; with no skeleton, a whole span off its middle.
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100); camera.position.set(0, 0, 10); camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    const bone = z => { const o = new THREE.Object3D(); o.position.set(0, 1, z); o.updateMatrixWorld(); return o; };
    const body = { skeleton: { bones: [bone(0), bone(1.5), bone(-0.5)] } };
    assert.ok(Math.abs(D.skinnedDepth(body, camera, 10, 3) - (8.5 - 3 * D.SKINNED_FLESH)) < 1e-6);
    assert.equal(D.skinnedDepth({}, camera, 10, 3), 7);
});

test('opaque pieces are laid into depth first on a weak GPU, in their own sides, and the colour draw is the one there was', t => {
    const D = R.DepthFirst, THREE = T;
    const tier = R.tier, covered = R.CoveredFloor.draw;
    let tierNow = 'weak';
    R.tier = () => tierNow;
    const calls = [];
    R.CoveredFloor.draw = (renderer, scene, camera) => { calls.push({ pass: 'colour', autoClear: renderer.autoClear, materials: meshes.map(m => m.material), visible: all.map(o => o.visible) }); return 'drawn'; };
    t.after(() => { R.tier = tier; R.CoveredFloor.draw = covered; });
    const piece = (side, extra) => { const m = new THREE.MeshBasicMaterial(Object.assign({ side }, extra)); m.__reactorPieces = true; return new THREE.Mesh(new THREE.BufferGeometry(), m); };
    const scene = new THREE.Scene();
    const meshes = [];
    for (let i = 0; i < 8; i++) meshes.push(piece(i % 2 ? THREE.DoubleSide : THREE.FrontSide));
    const glass = piece(THREE.DoubleSide, { transparent: true, depthWrite: false });
    const ghost = piece(THREE.FrontSide); ghost.material.__reactorGhost = true;
    const model = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    const cutout = piece(THREE.FrontSide, { alphaTest: 0.5 });
    const skinned = piece(THREE.FrontSide); skinned.isSkinnedMesh = true;
    const all = meshes.concat([glass, ghost, model, cutout, skinned]);
    for (const o of all) scene.add(o);
    const own = meshes.map(m => m.material);
    const renderer = { autoClear: true, domElement: { width: 1440, height: 810 }, getRenderTarget: () => null,
        render(s, c) { calls.push({ pass: 'depth', autoClear: this.autoClear, materials: meshes.map(m => m.material), visible: all.map(o => o.visible) }); } };
    for (const o of [glass, ghost, model, cutout, skinned]) assert.equal(D.eligible(o), false);
    assert.equal(D.eligible(meshes[0]), true);
    // The room's floor is laid too (it makes no cuts of its own).
    const floor = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()); floor.material.__reactorGroundSlope = {};
    assert.equal(D.eligible(floor), true);
    assert.equal(D.draw(renderer, scene, {}), 'drawn');
    assert.deepEqual(calls.map(c => c.pass), ['depth', 'colour']);
    // The depth draw: each piece in a depth-only material of its own side, everything else out of the picture, the target cleared.
    assert.equal(calls[0].autoClear, true);
    calls[0].materials.forEach((m, i) => { assert.equal(m.colorWrite, false); assert.equal(m.side, own[i].side); assert.equal(m.polygonOffset, true); });
    assert.deepEqual(calls[0].visible, all.map((o, i) => i < 8));
    // The colour draw: every material and visibility as it was, and nothing cleared.
    assert.equal(calls[1].autoClear, false);
    assert.deepEqual(calls[1].materials, own);
    assert.ok(calls[1].visible.every(Boolean));
    assert.equal(renderer.autoClear, true);
    assert.deepEqual({ ...D.last }, { laid: 8, hidden: 5 });
    // The depth material makes the pieces' cuts and is never laid itself.
    assert.equal(D.material(THREE.FrontSide).__reactorPieces, true);
    assert.equal(D.eligible(new THREE.Mesh(new THREE.BufferGeometry(), D.material(THREE.FrontSide))), false);
    // Not on a full GPU, under an override material, into a small target, with little to lay, or switched off: the plain draw.
    const plain = setup => { calls.length = 0; setup(); D.draw(renderer, scene, {}); return calls.map(c => c.pass).join(); };
    assert.equal(plain(() => { tierNow = 'full'; }), 'colour'); tierNow = 'weak';
    assert.equal(plain(() => { scene.overrideMaterial = new THREE.MeshBasicMaterial(); }), 'colour'); scene.overrideMaterial = null;
    assert.equal(plain(() => { renderer.domElement = { width: 360, height: 203 }; }), 'colour'); renderer.domElement = { width: 1440, height: 810 };
    assert.equal(plain(() => { meshes[0].visible = false; }), 'colour'); meshes[0].visible = true;
    assert.ok(all.every(o => o.visible), 'what waited out of an abandoned depth draw is back');
    assert.equal(plain(() => { D.enabled = false; }), 'colour'); D.enabled = true;
    // A depth draw that throws leaves the scene as it found it.
    renderer.render = () => { throw new Error('lost'); };
    assert.throws(() => D.draw(renderer, scene, {}), /lost/);
    assert.deepEqual(meshes.map(m => m.material), own);
    assert.ok(all.every(o => o.visible));
    assert.equal(renderer.autoClear, true);
    assert.equal(D._drawing, false);
});

test('a skinned model drawn without perspective (a flat map\'s model sprite) takes a detail level by its size in the picture', () => {
    const D = R.GeometryDetail, THREE = T;
    const instanceSpan = R.instanceSpan;
    R.instanceSpan = root => 3;
    try {
        const root = new THREE.Group(); root.userData.glbSize = { x: 1, y: 3, z: 1 };
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.75);
        const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial()); mesh.isSkinnedMesh = true; root.add(mesh); root.updateMatrixWorld(true);
        // Four world units of height in a 360-pixel picture: 90 pixels a unit; the geometry's unit is two world units here.
        const flat = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100); flat.updateProjectionMatrix(); flat.updateMatrixWorld();
        assert.ok(Math.abs(D.pixelsPerUnit(mesh, flat, 360) - 180) < 1e-6);
        // And never a level for a view that is neither.
        assert.equal(D.skinnedPixelsPerUnit(mesh, { isPerspectiveCamera: false, projectionMatrix: flat.projectionMatrix, matrixWorldInverse: flat.matrixWorldInverse }, 360), Infinity);
    } finally { R.instanceSpan = instanceSpan; }
});
