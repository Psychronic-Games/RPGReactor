'use strict';
// Every moving caster in one draw per shadow face (runtime/reactor_3d_lighting.js, Reactor3D.CasterCrowd): the
// casters' shapes in one pool bound to one skeleton of their own bones, a face drawing the characters it can see
// as ranges of it in one call. Measured 2026-11-05 on the owner's laptop: a party of seven with worn gauntlets
// was 170-350 shadow draws a frame at about 19 us each.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_lighting.js'));
const THREE = global.THREE;
const S = Reactor3D.Shadows, M = Reactor3D.CasterMerge, C = Reactor3D.CasterCrowd;

function fakeGl() {
    const calls = { plain: [], multi: [] };
    const gl = {
        drawElements(mode, count, type, offset) { calls.plain.push([count, offset]); },
        getExtension(name) {
            return name === 'WEBGL_multi_draw' ? { multiDrawElementsWEBGL(mode, counts, co, type, offsets, oo, n) { calls.multi.push({ counts: [...counts.slice(0, n)], offsets: [...offsets.slice(0, n)] }); } } : null;
        }
    };
    return { gl, calls, shadows: S, renderer: { getContext: () => gl } };
}

function skinnedBox(skeleton, name, material, offset) {
    const g = new THREE.BoxGeometry(0.2, 0.4, 0.2); g.clearGroups(); g.translate(offset, 0.2, 0);
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = 0; si[i * 4 + 1] = 1; sw[i * 4] = 0.7; sw[i * 4 + 1] = 0.3; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const mesh = new THREE.SkinnedMesh(g, material);
    mesh.name = name;
    return mesh;
}

/** A character: a root, two bones (a hand under the hip), `parts` skinned boxes, optionally a gauntlet of rigid pieces on the hand. */
function character(scene, x, { parts = 3, gauntlet = false, bind = null } = {}) {
    const root = new THREE.Group(); root.position.set(x, 0, 2);
    const hip = new THREE.Bone(), hand = new THREE.Bone(); hand.position.set(0.3, 0.5, 0); hip.add(hand); root.add(hip);
    scene.add(root); scene.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton([hip, hand]);
    const meshes = [];
    for (let i = 0; i < parts; i++) {
        const mesh = skinnedBox(skeleton, 'part' + i, new THREE.MeshBasicMaterial(), i * 0.25);
        root.add(mesh);
        mesh.bind(skeleton, bind ? bind.clone() : undefined);
        meshes.push(mesh);
    }
    const pieces = [];
    if (gauntlet) {
        const steel = new THREE.MeshBasicMaterial();
        for (let i = 0; i < 3; i++) { const g = new THREE.BoxGeometry(0.05, 0.1, 0.05); g.clearGroups(); const m = new THREE.Mesh(g, steel); m.position.set(0.04 * i, 0, 0); hand.add(m); pieces.push(m); }
    }
    S.markCaster(root, true);
    scene.updateMatrixWorld(true);
    return { root, hip, hand, meshes, pieces, skeleton };
}

/** World position of vertex `i` of `mesh`, through its skin when it has one. */
function world(mesh, i) {
    const v = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i);
    if (mesh.isSkinnedMesh) { mesh.skeleton.update(); mesh.applyBoneTransform(i, v); }
    return v.applyMatrix4(mesh.matrixWorld);
}

function pass(scene, roots, env) {
    const live = [];
    for (const root of roots) M.use(root, S, live);
    const state = C.begin(scene, live, roots, env.shadows, env.renderer);
    return { live, state };
}

function finish(state, live) { C.end(state); M.done(live); }

test('the crowd draws every vertex where each character\'s own skin puts it', () => {
    const scene = new THREE.Scene(), env = fakeGl();
    const a = character(scene, 0, { gauntlet: true });
    const b = character(scene, 3, { parts: 1, bind: new THREE.Matrix4().makeTranslation(0.1, 0.3, -0.2) });   // a lone skin, bound off the identity
    a.hip.rotation.z = 0.4; a.hand.rotation.x = 0.9; b.hip.position.y = 0.2; scene.updateMatrixWorld(true);
    const { live, state } = pass(scene, [a.root, b.root], env);
    assert.equal(state.pools.length, 1, 'one depth material, one pool');
    const pool = state.pools[0], mesh = pool.mesh;
    assert.equal(mesh.visible, true);
    assert.equal(pool.used.length, 3, 'the clothes\' stand-in, the gauntlet\'s and the lone skin');
    assert.ok(live.every(m => m.visible === false), 'the stand-ins it took leave the pass to it');
    assert.equal(b.meshes[0].visible, false, 'and so does the lone skin');
    mesh.skeleton.update();
    let worst = 0;
    for (const entry of pool.used) {
        const source = entry.key.isMesh ? entry.key : entry.key.part;   // a stand-in, or a lone part
        // Corner by corner: the pool keeps only the vertices the triangles use, in the order they first use them.
        const sourceIndex = (entry.key.isMesh ? entry.key.geometry : entry.key.geometry).index;
        for (let j = 0; j < entry.iCount; j++) {
            const own = world(source, sourceIndex.getX(j));
            const at = mesh.geometry.index.getX(entry.iStart + j);
            assert.ok(at >= entry.vStart && at < entry.vStart + entry.vCount, 'its corners lie in its own room');
            const crowd = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, at);
            mesh.applyBoneTransform(at, crowd); crowd.applyMatrix4(mesh.matrixWorld);
            worst = Math.max(worst, own.distanceTo(crowd));
        }
    }
    assert.ok(worst < 1e-5, 'the same place, to float rounding: ' + worst);
    finish(state, live);
    assert.equal(mesh.visible, false, 'the pool hides after the pass');
    assert.equal(b.meshes[0].visible, true, 'and what it drew is shown again');
    assert.ok(a.pieces.every(p => p.visible));
});

test('a face draws the characters it did not cull, in one multi-draw', () => {
    const scene = new THREE.Scene(), env = fakeGl();
    const a = character(scene, 0), b = character(scene, 3), c = character(scene, 6);
    const { live, state } = pass(scene, [a.root, b.root, c.root], env);
    const mesh = state.pools[0].mesh;
    b.root.visible = false;   // InstanceCull hid it for this face
    const off = C.face();
    assert.equal(off, null);
    mesh.onBeforeRender();
    env.gl.drawElements(4, 999, 5125, 0);
    mesh.onAfterRender();
    assert.equal(env.calls.multi.length, 1, 'one call');
    assert.equal(env.calls.plain.length, 0);
    const drawn = env.calls.multi[0];
    const byRoot = new Map(state.pools[0].used.map(e => [e.root, e]));
    const ea = byRoot.get(a.root), ec = byRoot.get(c.root);
    assert.deepEqual(drawn.offsets, [ea.iStart * 4, ec.iStart * 4], 'a and c, not b');
    assert.deepEqual(drawn.counts, [ea.iCount, ec.iCount]);
    // Nobody in a face: the pool sits that face out.
    a.root.visible = c.root.visible = false;
    const gone = C.face();
    assert.deepEqual(gone, [mesh]);
    assert.equal(mesh.visible, false);
    C.unface(gone);
    assert.equal(mesh.visible, true);
    a.root.visible = b.root.visible = c.root.visible = true;
    // Ordinary draws pass through untouched.
    env.gl.drawElements(4, 6, 5125, 0);
    assert.deepEqual(env.calls.plain, [[6, 0]]);
    finish(state, live);
});

test('a worn piece in the crowd follows its bone', () => {
    const scene = new THREE.Scene(), env = fakeGl();
    const a = character(scene, 0, { gauntlet: true });
    let { live, state } = pass(scene, [a.root], env);
    finish(state, live);
    a.hand.rotation.y = 1.3; a.hip.position.x = 0.5; scene.updateMatrixWorld(true);
    ({ live, state } = pass(scene, [a.root], env));
    const pool = state.pools[0], mesh = pool.mesh;
    const piece = pool.used.find(e => e.key.isMesh && !e.key.isSkinnedMesh);
    assert.ok(piece, 'the gauntlet is in the crowd');
    mesh.skeleton.update();
    const standIn = piece.key;
    standIn.matrixWorld.copy(a.hand.matrixWorld);   // where CasterMerge places it this pass
    let worst = 0;
    for (let j = 0; j < piece.iCount; j++) {
        const own = new THREE.Vector3().fromBufferAttribute(standIn.geometry.attributes.position, standIn.geometry.index.getX(j)).applyMatrix4(a.hand.matrixWorld);
        const at = mesh.geometry.index.getX(piece.iStart + j);
        const crowd = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, at);
        mesh.applyBoneTransform(at, crowd);
        worst = Math.max(worst, own.distanceTo(crowd));
    }
    assert.ok(worst < 1e-5, 'on the hand as it moved: ' + worst);
    finish(state, live);
});

test('arrivals over the pass\'s budget draw themselves until their turn', () => {
    const scene = new THREE.Scene(), env = fakeGl();
    const budget = C.APPEND_VERTICES;
    try {
        C.APPEND_VERTICES = 1;   // one entry a pass
        const a = character(scene, 0), b = character(scene, 3);
        let { live, state } = pass(scene, [a.root, b.root], env);
        assert.equal(state.pools[0].used.length, 1, 'one taken in');
        const waiting = live.find(m => m.visible);
        assert.ok(waiting, 'the other stand-in still draws itself');
        finish(state, live);
        ({ live, state } = pass(scene, [a.root, b.root], env));
        assert.equal(state.pools[0].used.length, 2, 'both, a pass later');
        assert.ok(live.every(m => !m.visible));
        finish(state, live);
    } finally { C.APPEND_VERTICES = budget; }
});

test('off: nothing changes', () => {
    const scene = new THREE.Scene(), env = fakeGl();
    C.enabled = false;
    try {
        const a = character(scene, 0);
        const { live, state } = pass(scene, [a.root], env);
        assert.equal(state, null);
        assert.ok(live.every(m => m.visible), 'the stand-ins draw as before');
        finish(state, live);
    } finally { C.enabled = true; }
    const lighting = require('node:fs').readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d_lighting.js'), 'utf8');
    // The flush clears Shadows._pending before the rows are drawn: the renderer is handed in.
    assert.match(lighting, /crowd = Reactor3D\.CasterCrowd\.begin\(scene, this\._liveStandIns, roots, this, renderer\);/, 'the moving rows use it, with their renderer');
    assert.match(lighting, /Reactor3D\.CasterCrowd\.end\(crowd\);/);
});

test('a rigid piece moving on its own is its own bone; a resting face joins, one mid-expression draws itself', () => {
    const scene = new THREE.Scene(), env = fakeGl();
    const a = character(scene, 0, { gauntlet: true });
    // The pieces move against the hand (as pose blending between updates makes them): out of CasterMerge, into the crowd as themselves.
    for (let k = 0; k < M.MOVES_VOLATILE + 1; k++) {
        a.pieces[0].rotation.z += 0.2; scene.updateMatrixWorld(true);
        const { live, state } = pass(scene, [a.root], env); finish(state, live);
    }
    a.pieces[0].rotation.z += 0.2; scene.updateMatrixWorld(true);
    let { live, state } = pass(scene, [a.root], env);
    const pool = state.pools[0], entry = pool.entries.get(a.pieces[0]);
    assert.ok(entry, 'the moving piece is in the crowd');
    assert.equal(a.pieces[0].visible, false);
    pool.mesh.skeleton.update();
    const g = a.pieces[0].geometry;
    let worst = 0;
    for (let j = 0; j < entry.iCount; j++) {
        const own = new THREE.Vector3().fromBufferAttribute(g.attributes.position, g.index.getX(j)).applyMatrix4(a.pieces[0].matrixWorld);
        const at = pool.geometry.index.getX(entry.iStart + j);
        const crowd = new THREE.Vector3().fromBufferAttribute(pool.geometry.attributes.position, at);
        pool.mesh.applyBoneTransform(at, crowd);
        worst = Math.max(worst, own.distanceTo(crowd));
    }
    assert.ok(worst < 1e-5, 'where it stands this frame: ' + worst);
    finish(state, live);

    // A lone skin with expression shapes.
    const b = character(scene, 4, { parts: 1 });
    const head = b.meshes[0];
    head.geometry.morphAttributes.position = [head.geometry.attributes.position.clone()];
    head.updateMorphTargets();
    S.markCaster(b.root, true);
    ({ live, state } = pass(scene, [b.root], env));
    assert.equal(head.visible, false, 'at rest it joins');
    assert.ok(state.pools.every(p => p.material === S.casterMaterialFor(head.material, true)), 'with the plain material: the copy has no shapes');
    finish(state, live);
    head.morphTargetInfluences[0] = 0.5;
    ({ live, state } = pass(scene, [b.root], env));
    assert.equal(head.visible, true, 'mid-expression it draws itself');
    finish(state, live);
});

test("a light's carrier stays out of its faces, and a gone character's room is reused", () => {
    const scene = new THREE.Scene(), env = fakeGl();
    const a = character(scene, 0), b = character(scene, 3);
    let { live, state } = pass(scene, [a.root, b.root], env);
    S._carrierHidden = b.root;   // the tile's carrier (a lamp held by b)
    C.face();
    const r = state.pools[0].ranges;
    assert.equal(r.n, 1, 'only a');
    assert.equal(r.offsets[0], state.pools[0].entries.get(state.pools[0].used.find(e => e.root === a.root).key).iStart * 4);
    S._carrierHidden = null;
    finish(state, live);
    // b leaves for good: after UNUSED_PASSES its room goes back, and the next character takes it.
    const pool = state.pools[0], gone = pool.used.find(e => e.root === b.root);
    const passes = C.UNUSED_PASSES, every = C.SWEEP_EVERY;
    try {
        C.UNUSED_PASSES = 0; C.SWEEP_EVERY = 1;
        ({ live, state } = pass(scene, [a.root], env)); finish(state, live);
        ({ live, state } = pass(scene, [a.root], env)); finish(state, live);
        assert.ok(pool.free.some(block => block.vStart === gone.vStart), 'its room is free');
        // Its bones went back with it: the pool no longer moves or holds a character that left.
        assert.equal(pool.slots.has(b.skeleton), false);
        assert.ok(!pool.bones.includes(b.hip) && !pool.bones.includes(b.hand), "b's bones are out of the pool");
        assert.ok(pool.bones.includes(a.hip), "a's stay");
        const before = pool.vertices, bones = pool.bones.length;
        const c = character(scene, 6);
        ({ live, state } = pass(scene, [a.root, c.root], env));
        const taken = pool.used.find(e => e.root === c.root);
        assert.equal(taken.vStart, gone.vStart, 'the newcomer takes it');
        assert.equal(pool.vertices, before, 'without the pool growing');
        assert.equal(pool.bones.length, bones, 'nor its bones: the newcomer took the slots given back');
        assert.ok(pool.bones.includes(c.hip) && pool.mesh.skeleton.bones.includes(c.hip) && !pool.mesh.skeleton.bones.includes(b.hip));
        finish(state, live);
    } finally { C.UNUSED_PASSES = passes; C.SWEEP_EVERY = every; }
});

test("the stand-ins' sweep leaves the crowd's pools alone", () => {
    const scene = new THREE.Scene(), env = fakeGl();
    const a = character(scene, 0);
    const { live, state } = pass(scene, [a.root], env);
    const pool = state.pools[0], mesh = pool.mesh, geometry = pool.geometry;
    finish(state, live);
    let disposed = false;
    geometry.addEventListener('dispose', () => { disposed = true; });
    M._swept = 119;   // the next sweep runs
    M.sweep(scene);
    assert.equal(mesh.parent, M.group(scene), 'still in its group');
    assert.equal(disposed, false, 'its buffers kept: sent to the GPU once');
});
