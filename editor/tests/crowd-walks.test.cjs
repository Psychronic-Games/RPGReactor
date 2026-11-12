'use strict';
// A crowd's cost was walking its bodies' trees over and over (runtime 20261110.5): joints with nothing to draw
// leave the visible tree, the shadow budget and the mirror list keep what they worked out per body, and a sprite
// its model draws is updated once a drawn frame.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_lighting.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_models.js'));
const T = global.THREE, B = R.BareBones;
const read = file => fs.readFileSync(path.join(repoRoot, 'runtime', file), 'utf8');

/** A body: hips > spine > hand > (finger, slot), all joints but the slot, and a skin bound to them. */
function body() {
    const root = new T.Group(), hips = new T.Bone(), spine = new T.Bone(), hand = new T.Bone(), finger = new T.Bone(), slot = new T.Group();
    hips.add(spine); spine.add(hand); hand.add(finger); hand.add(slot); root.add(hips);
    const skin = new T.SkinnedMesh(new T.BufferGeometry(), new T.MeshBasicMaterial());
    root.add(skin);
    skin.bind(new T.Skeleton([hips, spine, hand, finger]));
    return { root, hips, spine, hand, finger, slot, skin };
}
const visited = root => { let n = 0; root.traverseVisible(() => { n++; }); return n; };

test('joints with nothing to draw under them leave the visible tree, and their matrices are still worked out', () => {
    const b = body();
    assert.equal(visited(b.root), 7);
    assert.equal(B.apply(b.root), 4);
    assert.equal(visited(b.root), 2, 'the body and its skin');
    b.hand.position.set(1, 2, 3);
    b.root.updateMatrixWorld();
    assert.deepEqual([b.hand.matrixWorld.elements[12], b.hand.matrixWorld.elements[13], b.hand.matrixWorld.elements[14]], [1, 2, 3], 'the skin still follows its joints');
});

test('something put under a bare joint shows it and every joint above it at once', () => {
    const b = body();
    B.apply(b.root);
    const sword = new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial());
    b.slot.add(sword);
    assert.deepEqual([b.hips.visible, b.spine.visible, b.hand.visible], [true, true, true]);
    assert.equal(b.finger.visible, false, 'a joint beside it stays out');
    assert.equal(sword.parent, b.slot);
    // Looked over again: the same answer; the sword gone, bare again.
    B.apply(b.root);
    assert.equal(b.hand.visible, true);
    b.slot.remove(sword);
    B.apply(b.root);
    assert.equal(b.hips.visible, false);
});

test('a light or a camera on a joint keeps it shown; a joint something else hid is left alone', () => {
    const b = body();
    b.finger.add(new T.PointLight());
    B.apply(b.root);
    assert.deepEqual([b.hips.visible, b.hand.visible, b.finger.visible], [true, true, true]);
    const c = body();
    c.spine.visible = false;
    B.apply(c.root);
    assert.equal(c.spine.userData.rrBare, undefined, 'not this one\'s to show again');
});

test('a copy of a body takes the hidden joints with it, and is watched from its first look', () => {
    const b = body();
    B.apply(b.root);
    const copy = b.root.clone();
    const hips = copy.children.find(c => c.isBone);
    assert.equal(hips.visible, false);
    assert.equal(hips.userData.rrBare, true);
    // (The copy's skin is bound afresh by the game; here the joints are found by a skin of its own.)
    const skin = copy.children.find(c => c.isSkinnedMesh), joints = [];
    hips.traverse(n => { if (n.isBone) joints.push(n); });
    skin.bind(new T.Skeleton(joints));
    B.apply(copy);
    joints[joints.length - 1].add(new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial()));
    assert.equal(hips.visible, true);
});

test('switched off, every joint is shown again', () => {
    const b = body();
    B.apply(b.root);
    B.enabled = false;
    try { B.apply(b.root); } finally { B.enabled = true; }
    assert.equal(visited(b.root), 7);
});

test('a body the shadow budget refused is not walked again until a caster is marked', () => {
    const S = R.Shadows, root = new T.Group();
    root.add(new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial()));
    let walks = 0;
    const traverse = root.traverse.bind(root);
    root.traverse = fn => { walks++; return traverse(fn); };
    const changes = S._castChanges; S._castChanges = [];
    try {
        S._setCasts(root, false);
        S._setCasts(root, false);
        S._setCasts(root, false);
        assert.equal(walks, 1);
        S._generation++;
        S._setCasts(root, false);
        assert.equal(walks, 2, 'a caster marked since: its layers are set again');
        S._setCasts(root, true);
        assert.equal(walks, 3);
    } finally { S._castChanges = changes; }
});

test('a caster\'s triangle count is kept by its own level, not by every body\'s swaps', () => {
    // Its own level, the levels ready and the distance, compared in place as three numbers (one text of them was a string made per caster, per frame).
    const lighting = read('reactor_3d_lighting.js');
    assert.match(lighting, /lod = data\.lodLevel \|\| 0, ready = detail \? detail\.levelsReady : 0;/);
    assert.match(lighting, /if \(data\.rrShadowTris !== undefined && data\.rrShadowTrisLod === lod && data\.rrShadowTrisReady === ready && data\.rrShadowTrisAt === distance\) return data\.rrShadowTris;/);
    assert.match(lighting, /data\.rrShadowTrisLod = lod; data\.rrShadowTrisReady = ready; data\.rrShadowTrisAt = distance;/);
    const S = R.Shadows, root = new T.Group();
    root.add(new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial()));
    const first = S._casterTriangles(root, 3);
    let walks = 0;
    const traverse = root.traverse.bind(root);
    root.traverse = fn => { walks++; return traverse(fn); };
    R._lodSwaps += 5;
    assert.equal(S._casterTriangles(root, 3), first);
    assert.equal(walks, 0, 'another body\'s swap does not walk this one');
    root.userData.lodLevel = 1;
    S._casterTriangles(root, 3);
    assert.equal(walks, 1, 'its own does');
});

test('whether a body has a mirror finish is asked once in a while, not each time the list is made', t => {
    const object = new T.Group();
    const asked = t.mock.method(R, 'isMirrorFinish', () => true);
    assert.equal(R.mirrorFinishKept(object, 100), true);
    assert.equal(R.mirrorFinishKept(object, 115), true);
    assert.equal(R.mirrorFinishKept(object, 100 + R.MIRROR_FINISH_FRAMES - 1), true);
    assert.equal(asked.mock.callCount(), 1);
    R.mirrorFinishKept(object, 100 + R.MIRROR_FINISH_FRAMES);
    assert.equal(asked.mock.callCount(), 2);
    // A new game counts its frames from nothing again.
    R.mirrorFinishKept(object, 3);
    assert.equal(asked.mock.callCount(), 3);
});

test('a sprite its model draws is updated in the last update of a frame only, and is due by its own last update', () => {
    const sprites = read('reactor_sprites.js');
    assert.match(sprites, /if \(this\._rrDrawnByModel && typeof SceneManager !== "undefined" && SceneManager\._finalUpdateOfFrame === false\) return;/);
    assert.match(sprites, /if \(last !== undefined && now >= last && now - last < every\) return;/);
    const models = read('reactor_3d_models.js');
    assert.match(models, /if \(holder\.bareAt === undefined \|\| tick - holder\.bareAt >= bareBones\.EVERY \|\| tick < holder\.bareAt\) \{ holder\.bareAt = tick; bareBones\.apply\(object\); \}/);
});
