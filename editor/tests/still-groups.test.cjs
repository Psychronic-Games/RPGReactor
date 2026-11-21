'use strict';
// A group that stands still (a map scene's root, its pieces, plants and doors) no longer has every world matrix under
// it worked out again on each walk (Reactor3D.StillGroup, runtime 20261118.1); what moves under it still moves.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const T = global.THREE;
const read = file => fs.readFileSync(path.join(repoRoot, 'runtime', file), 'utf8');

function countWalk(scene) {
    const M = T.Matrix4.prototype, mul = M.multiplyMatrices; let n = 0;
    M.multiplyMatrices = function() { n++; return mul.apply(this, arguments); };
    try { scene.updateMatrixWorld(); } finally { M.multiplyMatrices = mul; }
    return n;
}

function world() {
    const scene = R.StillGroup.hold(new T.Scene()), pieces = R.StillGroup.hold(new T.Group());
    scene.add(pieces);
    const still = [];
    for (let i = 0; i < 50; i++) { const m = new T.Mesh(); m.position.set(i, 0, 1); m.updateMatrix(); m.matrixAutoUpdate = false; pieces.add(m); still.push(m); }
    const walker = new T.Object3D(); scene.add(walker);
    return { scene, pieces, still, walker };
}

test('a still group\'s pieces are worked out once, and again only when one says it moved', () => {
    const { scene, still, walker } = world();
    assert.ok(countWalk(scene) >= 50, 'the first walk places every piece');
    assert.deepEqual(still[7].matrixWorld.elements.slice(12, 15), [7, 0, 1]);
    assert.equal(countWalk(scene), 2, 'then only what moves by itself (the walker), and the held group asking where it hangs');
    // A door swings: its leaf says so (updateMatrix), and it alone is worked out.
    still[3].rotation.y = 1; still[3].updateMatrix();
    assert.equal(countWalk(scene), 3);
    assert.ok(Math.abs(still[3].matrixWorld.elements[0] - Math.cos(1)) < 1e-6);
    // Something moving under the root by itself still moves.
    walker.position.x = 5;
    countWalk(scene);
    assert.equal(walker.matrixWorld.elements[12], 5);
});

test('a held group that moves, or is hung elsewhere, takes everything under it along', () => {
    const { scene, pieces, still } = world();
    scene.updateMatrixWorld();
    pieces.position.z = 10;
    scene.updateMatrixWorld();
    assert.deepEqual(still[7].matrixWorld.elements.slice(12, 15), [7, 0, 11], 'its own place changed');
    pieces.position.z = 0;
    scene.updateMatrixWorld();
    // A map's scene under a neighbour's offset group, then the map played again (a border crossing and back).
    const main = new T.Scene(), offset = new T.Group();
    offset.position.set(100, 0, 0);
    main.add(offset); offset.add(scene);
    main.updateMatrixWorld();
    assert.deepEqual(still[7].matrixWorld.elements.slice(12, 15), [107, 0, 1], 'under the offset');
    offset.remove(scene);
    scene.updateMatrixWorld();
    assert.deepEqual(scene.matrixWorld.elements.slice(12, 15), [0, 0, 0], 'the root itself again');
    assert.deepEqual(still[7].matrixWorld.elements.slice(12, 15), [7, 0, 1], 'and every piece with it');
});

test('the kill switch walks them all, as before; the map scene, its pieces, plants and doors are held', () => {
    const { scene } = world();
    scene.updateMatrixWorld();
    R.StillGroup.enabled = false;
    try { assert.ok(countWalk(scene) >= 50); } finally { R.StillGroup.enabled = true; }
    assert.match(read('reactor_3d.js'), /this\._scene = new THREE\.Scene\(\);\n[^\n]*\n\s*Reactor3D\.StillGroup\.hold\(this\._scene\);/);
    assert.match(read('reactor_3d_world.js'), /this\._piecesGroup\.name = "pieces";\n\s*Reactor3D\.StillGroup\.hold\(this\._piecesGroup\);/);
    assert.match(read('reactor_3d_foliage.js'), /this\._foliageGroup\.name = "foliage";\n\s*R\.StillGroup\.hold\(this\._foliageGroup\);/);
    assert.match(read('reactor_3d_doors.js'), /group\.name = "doors";\n\s*R\.StillGroup\.hold\(group\);/);
});
