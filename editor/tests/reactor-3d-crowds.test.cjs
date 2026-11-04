/**
 * A crowd of skinned characters (150 sleepers on one online map) costs what is seen of it:
 * a body held still keeps its matrices, the reflection capture shows the few nearest, and
 * dense geometry takes its levels on any GPU once a scene is heavy.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const THREE = global.THREE;

function body() {
    const bones = [new THREE.Bone(), new THREE.Bone()];
    bones[0].add(bones[1]);
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(bones[0]);
    mesh.bind(new THREE.Skeleton(bones));
    const root = new THREE.Group();
    root.add(mesh);
    return { root, bones };
}

test('a still body whose pose is held keeps its matrices until it is posed or moves again', () => {
    const { root, bones } = body();
    const holder = { stillNow: true, poseHeld: true, sampled: false };
    Reactor3D.holdModelMatrices(holder, {}, root);
    assert.equal(holder.matricesHeld, true);
    bones[1].position.x = 5;
    root.updateMatrixWorld(true);
    assert.equal(bones[1].matrixWorld.elements[12], 0, 'the walk stops at the held body');
    Object.assign(holder, { poseHeld: false, sampled: true });
    Reactor3D.holdModelMatrices(holder, {}, root);
    root.updateMatrixWorld(true);
    assert.equal(bones[1].matrixWorld.elements[12], 5, 'posed again, its bones follow');
    Object.assign(holder, { poseHeld: true, sampled: false, stillNow: false });
    Reactor3D.holdModelMatrices(holder, {}, root);
    assert.equal(holder.matricesHeld, false, 'a body that moved is never held');
});

test('the reflection capture keeps the nearest characters and leaves the rest of a crowd out', () => {
    const holders = [];
    for (let i = 0; i < 20; i++) { const { root } = body(); root.position.set(i, 0, 0); new THREE.Group().add(root); holders.push({ object: root }); }
    const scene = { reflectionHolders: () => holders, reflectionSubject: () => holders[19] };
    const hidden = [];
    Reactor3D.MapScene.prototype.hideCrowdFromReflection.call(scene, hidden, new THREE.Vector3(0, 0, 0));
    assert.equal(hidden.length, 20 - 1 - Reactor3D.REFLECTED_CHARACTERS, 'the nearest few and the player stay in');
    assert.ok(!hidden.includes(holders[0].object) && !hidden.includes(holders[19].object));
    assert.ok(hidden.includes(holders[18].object));
});

test('distance levels are wanted on a weak GPU always, on another once a scene draws heavy', () => {
    const tier = Reactor3D.tier;
    try {
        Reactor3D.tier = () => 'full';
        const scene = { userData: {} };
        assert.equal(Reactor3D.GeometryDetail.wanted(scene), false);
        Reactor3D.noteDrawnTriangles({ info: { render: { triangles: 30e6 } } }, scene, false);
        assert.equal(Reactor3D.GeometryDetail.wanted(scene), true);
        Reactor3D.noteDrawnTriangles({ info: { render: { triangles: 1e6 } } }, scene, true);
        assert.equal(Reactor3D.GeometryDetail.wanted(scene), true, 'the reduced count does not switch the levels straight off');
        Reactor3D.tier = () => 'weak';
        assert.equal(Reactor3D.GeometryDetail.wanted({ userData: {} }), true);
    } finally { Reactor3D.tier = tier; }
});

test('copies of a model that look alike draw with one set of materials; a flash gives one its own', () => {
    const template = new THREE.Group();
    template.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x336699 })));
    const a = Reactor3D.cloneModelTemplate(template, { shareKey: 'plain' });
    const b = Reactor3D.cloneModelTemplate(template, { shareKey: 'plain' });
    const c = Reactor3D.cloneModelTemplate(template, { shareKey: 'tinted' });
    const loose = Reactor3D.cloneModelTemplate(template);
    const mat = object => object.children[0].material;
    assert.equal(mat(a), mat(b), 'alike: shared');
    assert.notEqual(mat(a), mat(c), 'another look: its own set');
    assert.notEqual(mat(a), mat(loose), 'without a key: a copy each, as before');
    assert.notEqual(mat(a), template.children[0].material, 'never the template\'s own');
    const before = mat(b).color.getHex();
    const holder = { object: a, flash: { color: [255, 0, 0, 255], t: 0, duration: 4 } };
    Reactor3D.updateModelFlash(holder);
    assert.notEqual(mat(a), mat(b), 'the flashing copy has its own now');
    assert.notEqual(mat(a).color.getHex(), before, 'and it is tinted');
    assert.equal(mat(b).color.getHex(), before, 'the other copy is not');
});
