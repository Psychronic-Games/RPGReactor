'use strict';
// A moving caster's parts that draw alike in a shadow row draw as one stand-in (runtime/reactor_3d_lighting.js,
// Reactor3D.CasterMerge): the same depth from fewer draws, and nothing else about the character changes.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_lighting.js'));
const THREE = global.THREE;
const S = Reactor3D.Shadows, M = Reactor3D.CasterMerge;

function character({ cutout = false, shaped = false } = {}) {
    const scene = new THREE.Scene(), root = new THREE.Group(), bone = new THREE.Bone();
    root.add(bone);
    const skeleton = new THREE.Skeleton([bone]);
    const part = (name, material, morph) => {
        const g = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        g.clearGroups();   // a glTF primitive has none
        const n = g.attributes.position.count;
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
        g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, i) => i % 4 === 0 ? 1 : 0), 4));
        if (morph) { g.morphAttributes.position = [g.attributes.position.clone()]; }
        const mesh = new THREE.SkinnedMesh(g, material);
        mesh.name = name;
        if (morph) mesh.updateMorphTargets();
        mesh.bind(skeleton);
        root.add(mesh);
        return mesh;
    };
    const cloth = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const parts = [part('coat', cloth), part('boots', new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), part('belt', new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))];
    if (cutout) parts.push(part('hair', new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, alphaTest: 0.5, map: new THREE.Texture() })));
    if (shaped) { parts.push(part('head', new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), true)); parts.push(part('lips', new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), true)); }
    scene.add(root);
    S.markCaster(root, true);
    scene.updateMatrixWorld(true);
    return { scene, root, parts };
}

test('parts with one depth material draw as one stand-in, on the same skeleton and in the same place', () => {
    const { scene, root, parts } = character();
    const live = [];
    const merged = M.use(root, S, live);
    assert.equal(merged.size, 3, 'all three parts');
    assert.equal(live.length, 1, 'one stand-in for them');
    const standIn = live[0];
    assert.equal(standIn.skeleton, parts[0].skeleton);
    assert.equal(standIn.material, parts[0].customDepthMaterial, 'the depth material the parts were drawn with');
    assert.equal(standIn.geometry.attributes.position.count, parts.reduce((n, p) => n + p.geometry.attributes.position.count, 0));
    assert.equal(standIn.geometry.index.count, parts.reduce((n, p) => n + p.geometry.index.count, 0));
    assert.deepEqual([...standIn.matrixWorld.elements], [...new THREE.Matrix4().elements], 'bound and placed at the identity: its bones place it');
    assert.deepEqual([...standIn.bindMatrix.elements], [...new THREE.Matrix4().elements]);
    assert.equal(standIn.layers.mask, 1 << Reactor3D.SHADOW_LAYER_DYNAMIC, 'on the moving-caster layer alone: no other pass draws it');
    assert.notEqual(standIn.parent, root, 'out of the model\'s own tree');
    assert.equal(standIn.parent.parent, scene);
    assert.ok(parts.every(p => p.visible === false), 'the parts leave the pass to it');
    M.done(live);
    assert.equal(standIn.visible, false);
    assert.ok(parts.every(p => p.visible === true), 'and come back after');
    assert.equal(M.use(root, S, []).size, 3);
    assert.equal(root.userData.rrCasterStandIns.list[0].mesh, standIn, 'made once');
});

test('parts under different nodes, bound differently, land where their own skins put them', () => {
    const { scene, root, parts } = character();
    // Each part on its own node, as a glTF character's are, with a bind matrix of its own.
    const node = new THREE.Group(); node.position.set(0.3, 0.1, -0.2); root.add(node); node.add(parts[1]);
    parts[1].bind(parts[1].skeleton, new THREE.Matrix4().makeTranslation(0.1, 0.5, 0));
    parts[0].skeleton.bones[0].position.set(0.2, 0, 0); parts[0].skeleton.bones[0].rotation.y = 0.7;
    scene.updateMatrixWorld(true);
    const live = [];
    assert.equal(M.use(root, S, live).size, 3, 'one stand-in, whatever node holds each part');
    const standIn = live[0];
    standIn.skeleton.update();
    // Each vertex where the part's own skin puts it, and the stand-in's where it puts the same vertex.
    const own = new THREE.Vector3(), merged = new THREE.Vector3();
    // Where the part's vertices begin in the stand-in: after those of the parts merged before it.
    const order = root.userData.rrCasterStandIns.list[0].parts;
    let offset = 0, worst = 0;
    for (const part of order) { if (part === parts[1]) break; offset += part.geometry.attributes.position.count; }
    for (let i = 0; i < parts[1].geometry.attributes.position.count; i++) {
        own.fromBufferAttribute(parts[1].geometry.attributes.position, i); parts[1].applyBoneTransform(i, own); own.applyMatrix4(parts[1].matrixWorld);
        merged.fromBufferAttribute(standIn.geometry.attributes.position, offset + i); standIn.applyBoneTransform(offset + i, merged); merged.applyMatrix4(standIn.matrixWorld);
        worst = Math.max(worst, own.distanceTo(merged));
    }
    assert.ok(worst < 1e-5, 'the same place, to float rounding: ' + worst);
    M.done(live);
});

test('a cut-out keeps its own draw, and a part mid-expression draws itself', () => {
    const { root, parts } = character({ cutout: true, shaped: true });
    const live = [];
    let merged = M.use(root, S, live);
    assert.equal(merged.has(parts[3]), false, 'one cut-out: nothing to merge it with');
    assert.equal(merged.has(parts[4]) && merged.has(parts[5]), true, 'the shaped parts at rest join theirs');
    M.done(live);
    parts[4].morphTargetInfluences[0] = 0.4;
    merged = M.use(root, S, live);
    assert.equal(merged.has(parts[4]) || merged.has(parts[5]), false, 'mid-expression: they draw themselves');
    assert.equal(merged.has(parts[0]), true, 'the rest still merge');
    M.done(live);
});

test('a part hidden for a moment sits its group out; a changed part makes the stand-in again', () => {
    const { root, parts } = character();
    parts[1].visible = false;
    assert.equal(M.use(root, S, []), null, 'a group with a part hidden now is drawn as before');
    parts[1].visible = true;
    const first = (M.use(root, S, []), root.userData.rrCasterStandIns.list[0].mesh);
    M.done([]);
    parts[1].geometry = parts[1].geometry.clone();
    M.use(root, S, []);
    assert.notEqual(root.userData.rrCasterStandIns.list[0].mesh, first);
    assert.equal(first.parent, null, 'the old one is gone');
});

test('only the moving-caster pass merges, and a face that hides a character hides its stand-in', () => {
    const lighting = require('node:fs').readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d_lighting.js'), 'utf8');
    assert.match(lighting, /const swapped = this\._swapCasters\(roots, true, renderer, scene\);/);
    assert.match(lighting, /const swapped = this\._swapCasters\(this\._static\);/);
    const { root } = character();
    const live = [];
    M.use(root, S, live);
    root.visible = false;
    const hidden = M.follow(live);
    assert.equal(live[0].visible, false);
    M.unfollow(hidden);
    assert.equal(live[0].visible, true);
    M.done(live);
});

// Rigid parts (2026-11-05): a parked vehicle of 41 pieces was 82 shadow draws a frame in the first Reactor room on
// the owner's laptop, and each party member's worn gauntlet three more per face.
function vehicle() {
    const scene = new THREE.Scene(), root = new THREE.Group();
    root.position.set(4, 0, 7); root.rotation.y = 0.6;
    const metal = new THREE.MeshBasicMaterial();
    const parts = [];
    for (let i = 0; i < 4; i++) {
        const g = new THREE.BoxGeometry(0.5, 0.3, 0.8); g.clearGroups();
        const mesh = new THREE.Mesh(g, i === 3 ? new THREE.MeshBasicMaterial() : metal);
        mesh.position.set(i * 0.6, 0.2 * i, -0.3); mesh.rotation.z = 0.2 * i;
        (i === 2 ? parts[1] : root).add(mesh);   // one piece hangs from another
        parts.push(mesh);
    }
    scene.add(root);
    S.markCaster(root, true);
    scene.updateMatrixWorld(true);
    return { scene, root, parts };
}

const worldOf = (mesh, i) => new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.matrixWorld);

test("a rigid model's pieces draw as one stand-in on its root, each vertex where it stood", () => {
    const { root, parts } = vehicle();
    const live = [];
    const merged = M.use(root, S, live);
    assert.equal(merged.size, 4, 'every piece, the one hanging from another too');
    assert.equal(live.length, 1, 'one stand-in: all four share the rigid depth material');
    const standIn = live[0];
    assert.equal(standIn.isSkinnedMesh, undefined);
    assert.equal(standIn.material, parts[0].customDepthMaterial);
    assert.deepEqual([...standIn.matrixWorld.elements], [...root.matrixWorld.elements], 'placed at its anchor, the root');
    assert.equal(standIn.layers.mask, 1 << Reactor3D.SHADOW_LAYER_DYNAMIC);
    assert.ok(standIn.geometry.boundingSphere, 'culled per face by its bounds');
    let offset = 0, worst = 0;
    for (const part of root.userData.rrCasterStandIns.list[0].parts) {
        for (let i = 0; i < part.geometry.attributes.position.count; i++) worst = Math.max(worst, worldOf(part, i).distanceTo(worldOf(standIn, offset + i)));
        offset += part.geometry.attributes.position.count;
    }
    assert.ok(worst < 1e-5, 'the same place, to float rounding: ' + worst);
    M.done(live);
    assert.ok(parts.every(p => p.visible));
    // The whole model driving off: the stand-in follows its root, made once.
    root.position.x += 3; root.updateMatrixWorld(true);
    M.use(root, S, live);
    assert.equal(live[0], standIn, 'not made again');
    assert.deepEqual([...standIn.matrixWorld.elements], [...root.matrixWorld.elements]);
    M.done(live);
});

test('a worn piece rides its bone: one stand-in for its parts, following the bone without being made again', () => {
    const { scene, root, parts } = character();
    const hand = parts[0].skeleton.bones[0];
    const gauntlet = new THREE.MeshBasicMaterial();
    const pieces = [0, 1, 2].map(i => { const g = new THREE.BoxGeometry(0.05, 0.1, 0.05); g.clearGroups(); const m = new THREE.Mesh(g, gauntlet); m.position.set(0.05 * i, 0, 0); hand.add(m); return m; });
    S.markCaster(root, true);
    scene.updateMatrixWorld(true);
    const live = [];
    const merged = M.use(root, S, live);
    assert.ok(pieces.every(p => merged.has(p)), "the gauntlet's pieces merge");
    const rigid = root.userData.rrCasterStandIns.list.find(e => e.anchor);
    assert.equal(rigid.anchor, hand, 'anchored on the bone they hang from');
    assert.equal(live.length, 2, "the clothes' stand-in and the gauntlet's");
    M.done(live);
    hand.rotation.x = 1.1; hand.position.y = 0.4; scene.updateMatrixWorld(true);
    M.use(root, S, live);
    assert.equal(root.userData.rrCasterStandIns.list.find(e => e.anchor), rigid, 'the hand moving is not the pieces moving');
    assert.equal(root.userData.rrCasterStandIns.stale, false);
    const n = pieces[2].geometry.attributes.position.count;
    let worst = 0;
    for (let i = 0; i < n; i++) worst = Math.max(worst, worldOf(pieces[2], i).distanceTo(worldOf(rigid.mesh, 2 * n + i)));
    assert.ok(worst < 1e-5, 'where the hand holds them now: ' + worst);
    M.done(live);
});

test('a rigid piece that moves draws itself; one that keeps moving is left out, the rest still merge', () => {
    const { scene, root, parts } = vehicle();
    const live = [];
    M.use(root, S, live); M.done(live);
    const wheel = parts[0];
    for (let pass = 1; pass <= M.MOVES_VOLATILE; pass++) {
        wheel.rotation.x += 0.3; scene.updateMatrixWorld(true);
        const merged = M.use(root, S, live);
        // The pass that sees it move draws every piece of that group itself (the stand-in shows the old place).
        assert.equal(merged ? merged.has(wheel) : false, false, 'pass ' + pass + ': the moved piece draws itself');
        assert.equal(root.userData.rrCasterStandIns.stale, true);
        M.done(live);
        M.use(root, S, live); M.done(live);   // made again where it stands now
    }
    assert.ok(root.userData.rrCasterStandIns.volatile.has(wheel), 'kept out from now on');
    wheel.rotation.x += 0.3; scene.updateMatrixWorld(true);
    const merged = M.use(root, S, live);
    assert.equal(merged.has(wheel), false);
    assert.ok(merged.has(parts[1]) && merged.has(parts[2]), 'the still pieces stay merged');
    assert.equal(root.userData.rrCasterStandIns.stale, false, 'and nothing is made again for the wheel');
    M.done(live);
    // A skinned character's stand-in is not made again when only a rigid piece of it moved.
    const { scene: s2, root: r2, parts: p2 } = character();
    const bolts = [0, 1].map(i => { const g = new THREE.BoxGeometry(0.1, 0.1, 0.1); g.clearGroups(); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial()); m.position.x = i; r2.add(m); return m; });
    S.markCaster(r2, true); s2.updateMatrixWorld(true);
    M.use(r2, S, live); M.done(live);
    const clothes = r2.userData.rrCasterStandIns.list.find(e => !e.anchor).mesh;
    bolts[0].position.y = 0.5; s2.updateMatrixWorld(true);
    M.use(r2, S, live); M.done(live);
    M.use(r2, S, live); M.done(live);
    assert.equal(r2.userData.rrCasterStandIns.list.find(e => !e.anchor).mesh, clothes, "the clothes' stand-in kept");
    assert.ok(p2.every(p => p.visible));
});

test('a rigid piece hidden by a node above it sits its group out', () => {
    const { scene, root, parts } = vehicle();
    const live = [];
    parts[1].visible = false;   // parts[2] hangs from parts[1]
    const merged = M.use(root, S, live);
    assert.equal(merged, null, 'the group with a hidden piece draws as before (the hidden ones not at all)');
    M.done(live);
    parts[1].visible = true; scene.updateMatrixWorld(true);
    assert.equal(M.use(root, S, live).size, 4);
    M.done(live);
});

test('shared depth materials are kept apart by morph layout, so three keeps one program for each', () => {
    const { root, parts } = character({ shaped: true });
    // No cut-out here: the head and lips are parts 3 and 4.
    const plain = parts[0].customDepthMaterial, head = parts[3].customDepthMaterial;
    assert.notEqual(head, plain, 'a part with expression shapes casts with its own shared material');
    assert.equal(parts[4].customDepthMaterial, head, 'shared with the parts of the same layout');
    assert.equal(S.casterMaterialFor(parts[0].material, true), plain, 'no geometry: the plain one, as stand-ins take');
    const live = [];
    M.use(root, S, live);
    assert.ok(live.every(mesh => !mesh.geometry.morphAttributes.position), 'stand-ins carry no shapes');
    assert.ok(live.every(mesh => mesh.material === plain), 'and draw with the plain material');
    M.done(live);
});

test("a skeleton is checked once in a still stretch (the shadow rows' faces), and again after it", () => {
    const bone = new THREE.Bone(), skeleton = new THREE.Skeleton([bone]);
    Reactor3D.SkeletonUpdates.install(skeleton);
    bone.updateMatrixWorld(true);
    skeleton.update();
    const before = skeleton.boneMatrices[12];
    Reactor3D.SkeletonUpdates.still(() => {
        skeleton.update();
        bone.position.x = 2; bone.updateMatrixWorld(true);
        skeleton.update();
        assert.equal(skeleton.boneMatrices[12], before, 'not looked at again inside the stretch');
    });
    assert.equal(Reactor3D.SkeletonUpdates.epoch, 0);
    skeleton.update();
    assert.equal(skeleton.boneMatrices[12], 2, 'outside it, the change is seen');
    const lighting = require('node:fs').readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d_lighting.js'), 'utf8');
    assert.match(lighting, /bones\.still\(\(\) => this\._flushRows\(\)\)/, 'the shadow rows run in one');
});
