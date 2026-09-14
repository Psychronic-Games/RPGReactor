// The surface picker: a triangle tree over a model that answers ray crossings,
// inside/outside, and "the middle of the flesh under this ray" quickly enough
// to snap a dragged rig marker on every pointer move.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
global.self = global;
global.window = global;
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
const { build, MeshSurfacePicker } = require(path.join(repoRoot, 'editor', 'src', 'database', 'MeshSurfacePicker.js'));

test('a ray through a box enters at its front, leaves at its back, and the flesh point is the middle', () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2));
    box.position.set(1, 2, 3);
    const root = new THREE.Group(); root.add(box);
    const picker = build(root, THREE);
    assert.equal(picker.count, 12, 'twelve triangles');
    const hits = picker.raycast(1, 2, 0, 0, 0, 1);
    assert.equal(hits.length, 2, 'in and out');
    assert.ok(Math.abs(hits[0].t - 2.9) < 1e-5 && hits[0].front, 'the front face first, facing the ray');
    assert.ok(Math.abs(hits[1].t - 3.1) < 1e-5 && !hits[1].front, 'the back face next, facing away');
    const flesh = picker.pickFlesh(1, 2, 0, 0, 0, 1, 1);
    assert.deepEqual(flesh.point.map(n => +n.toFixed(6)), [1, 2, 3], 'the middle of the box');
    assert.ok(Math.abs(flesh.thickness - 0.2) < 1e-5);
    assert.equal(picker.raycast(1, 2, 0, 0, 0, -1).length, 0, 'nothing behind the origin');
});

test('too thick to be a limb, or an open sheet, snaps just under the entry instead of far inside', () => {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 2));
    const picker = build(slab, THREE);
    const shallow = picker.pickFlesh(0, 0, -5, 0, 0, 1, 0.5);
    assert.ok(Math.abs(shallow.point[2] - (-1 + 0.01)) < 1e-6, 'a centimetre in from the front face');
    assert.equal(shallow.exit, null);
    const sheet = build(new THREE.Mesh(new THREE.PlaneGeometry(2, 2)), THREE);
    const onSheet = sheet.pickFlesh(0.2, 0.3, 4, 0, 0, -1, 1);
    assert.ok(onSheet && Math.abs(onSheet.point[2] - (0 - 0.01)) < 1e-6, 'through the sheet by the inset');
});

test('inside answers by crossing parity along three axes, so a stray open seam does not decide', () => {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12));
    ball.position.set(0.3, 0.2, 0.1);
    const picker = build(ball, THREE);
    assert.ok(picker.inside(0.3, 0.2, 0.1), 'the centre');
    assert.ok(picker.inside(0.3, 0.55, 0.1), 'near the top, still in');
    assert.ok(!picker.inside(0.3, 0.9, 0.1), 'above it');
    assert.ok(!picker.inside(2, 2, 2), 'far away');
    // A sheet beside the ball adds one crossing on one axis; the vote holds.
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(3, 3));
    sheet.position.set(0.3, 0.2, 2);
    const root = new THREE.Group(); root.add(ball.clone(), sheet);
    const both = build(root, THREE);
    assert.ok(both.inside(0.3, 0.2, 0.1), 'inside despite the sheet');
    assert.ok(!both.inside(0.3, 0.2, 1), 'outside despite the sheet');
});

test('a skinned mesh is read as posed and the tree stays fast on a large mesh', () => {
    // A tall box skinned to one bone, then the bone slid sideways.
    const geometry = new THREE.BoxGeometry(0.2, 1, 0.2, 1, 40, 1);
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(count * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    const bone = new THREE.Bone();
    const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    skinned.add(bone);
    skinned.bind(new THREE.Skeleton([bone]));
    bone.position.x = 2;
    skinned.updateMatrixWorld(true);
    bone.updateMatrixWorld(true);
    skinned.skeleton.update();
    const picker = build(skinned, THREE);
    assert.ok(picker.inside(2, 0, 0), 'the box moved with its bone');
    assert.ok(!picker.inside(0, 0, 0), 'and left its rest place');
    const big = new THREE.Mesh(new THREE.SphereGeometry(1, 400, 200));
    const started = performance.now();
    const large = build(big, THREE);
    const built = performance.now() - started;
    assert.ok(large.count > 150000, `${large.count} triangles`);
    const t = performance.now();
    for (let i = 0; i < 200; i++) large.raycast(-3, 0.001 * i, 0.002 * i, 1, 0, 0);
    const perRay = (performance.now() - t) / 200;
    assert.ok(perRay < 2, `a ray through ${large.count} triangles took ${perRay.toFixed(2)}ms`);
    assert.ok(built < 3000, `built in ${built.toFixed(0)}ms`);
});

test('an empty object yields no picker and an empty tree answers nothing', () => {
    assert.equal(build(new THREE.Group(), THREE), null);
    const empty = new MeshSurfacePicker(new Float32Array(0));
    assert.deepEqual(empty.raycast(0, 0, 0, 1, 0, 0), []);
    assert.equal(empty.pickFlesh(0, 0, 0, 1, 0, 0, 1), null);
});
