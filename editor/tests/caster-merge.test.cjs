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
    assert.match(lighting, /const swapped = this\._swapCasters\(roots, true\);/);
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
