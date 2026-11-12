/**
 * A crowd of skinned characters (150 sleepers on one online map) costs what is seen of it:
 * a body held still keeps its matrices, the reflection capture and the mirrors show the few
 * nearest, and dense geometry takes its levels on any GPU once a scene is heavy, in the
 * mirrors' pictures too.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_lighting.js'));
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

test('a mirror or water keeps the characters nearest the player and leaves the rest of a crowd out', () => {
    const holders = [];
    for (let i = 0; i < 30; i++) { const { root } = body(); root.position.set(i, 0, 0); new THREE.Group().add(root); holders.push({ object: root }); }
    const scene = { reflectionHolders: () => holders, reflectionSubject: () => holders[0] };
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(29, 10, 0);
    const hidden = Reactor3D.MapScene.prototype.mirrorHidden.call(scene, camera);
    assert.equal(hidden.length, 30 - 1 - Reactor3D.MIRRORED_CHARACTERS, 'the player and the nearest to them stay in');
    assert.ok(Reactor3D.MIRRORED_CHARACTERS >= Reactor3D.REFLECTED_CHARACTERS, 'a sharp mirror keeps at least what the capture does');
    assert.ok(Reactor3D.MIRRORED_CHARACTERS_WEAK < Reactor3D.MIRRORED_CHARACTERS, 'fewer on a weak GPU');
    assert.ok(!hidden.includes(holders[0].object) && !hidden.includes(holders[Reactor3D.MIRRORED_CHARACTERS].object));
    assert.ok(hidden.includes(holders[29].object), 'the farthest from the player is left out, though nearest the camera');
    assert.equal(Reactor3D.MapScene.prototype.mirrorHidden.call(scene, camera), hidden, 'one list, filled again each frame');
    assert.equal(hidden.length, 30 - 1 - Reactor3D.MIRRORED_CHARACTERS);
});

test('a mirror draws with the distance levels, chosen from its own camera, and puts the full geometry back', () => {
    const detail = Reactor3D.GeometryDetail, warmup = Reactor3D.ShaderWarmup, begin = detail.begin;
    const full = new THREE.BufferGeometry(), level = new THREE.BufferGeometry();
    const mesh = new THREE.Mesh(full, new THREE.MeshBasicMaterial());
    const scene = new THREE.Scene();
    scene.add(mesh);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 5, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const asked = [], drawn = [];
    let target = null;
    const renderer = {
        getRenderTarget: () => target, setRenderTarget: t => { target = t; },
        render: (s, c) => drawn.push({ geometry: mesh.geometry, camera: c, active: detail._active })
    };
    try {
        Reactor3D.ShaderWarmup = undefined;
        detail.begin = (s, c, height) => { asked.push({ camera: c, height }); mesh.geometry = level; return [[mesh, full]]; };
        const plane = { normal: new THREE.Vector3(0, 1, 0), point: new THREE.Vector3(0, 0, 0), object: null };
        const seen = Reactor3D.Mirrors.renderLevel(renderer, scene, camera, [plane], 0, 64, 48, []);
        assert.equal(seen.length, 1);
        assert.equal(drawn.length, 1);
        assert.equal(drawn[0].geometry, level, 'the mirror drew the level');
        assert.equal(asked[0].camera, drawn[0].camera, 'chosen from the reflected camera');
        assert.notEqual(asked[0].camera, camera);
        assert.equal(asked[0].height, 48, 'at the picture\'s own height');
        assert.ok(drawn[0].active, 'what is swapped is known while it draws (withOriginal)');
        assert.equal(mesh.geometry, full, 'the full geometry is back after');
        assert.equal(detail._active, null);
    } finally { detail.begin = begin; Reactor3D.ShaderWarmup = warmup; }
});

test('a body small on screen or out of view keeps the update\'s pose between updates; a near one is blended', () => {
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 500);
    camera.position.set(0, 2, 10); camera.lookAt(0, 1, 0); camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    const place = (x, y, z) => { const { root } = body(); root.position.set(x, y, z); root.userData.glbSize = { x: 0.5, y: 1.7, z: 0.5 }; root.updateMatrixWorld(true); return root; };
    const near = { posedOnce: true }, far = { posedOnce: true }, behind = { posedOnce: true };
    Reactor3D.animationDue(near, {}, place(0, 0, 4), camera);
    Reactor3D.animationDue(far, {}, place(0, 0, -150), camera);
    Reactor3D.animationDue(behind, {}, place(0, 0, 60), camera);
    assert.equal(near.blendPose, true, 'near the camera: blended');
    assert.equal(far.blendPose, false, 'a speck in the distance: the update\'s pose');
    assert.equal(behind.blendPose, false, 'behind the camera: the update\'s pose');
    const player = { posedOnce: true };
    global.$gamePlayer = {};
    try { Reactor3D.animationDue(player, global.$gamePlayer, place(0, 0, -150), camera); } finally { delete global.$gamePlayer; }
    assert.equal(player.blendPose, true, 'the player\'s own body always is');
    const core = require('node:fs').readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    const capture = core.slice(core.indexOf('    capturePoses() {'), core.indexOf('    readPose(node, into, k) {'));
    assert.match(capture, /if \(holder\.blendPose === false \|\| holder\.matricesHeld\) continue;/, 'left out of the blend, and out of its bone walks');
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

test('a still body in view keeps its matrices on an update its motion is not sampled in', () => {
    const { root, bones } = body();
    // In view (its pose is not held), standing where it was placed, and this update's stride passed it over.
    const holder = { stillNow: true, poseHeld: false, sampled: false };
    Reactor3D.holdModelMatrices(holder, {}, root);
    assert.equal(holder.matricesHeld, true, 'nothing wrote its joints: the walk would make the same matrices');
    bones[1].position.x = 5;
    root.updateMatrixWorld(true);
    assert.equal(bones[1].matrixWorld.elements[12], 0, 'left out of the walk');
    holder.sampled = true;
    Reactor3D.holdModelMatrices(holder, {}, root);
    root.updateMatrixWorld(true);
    assert.equal(holder.matricesHeld, false);
    assert.equal(bones[1].matrixWorld.elements[12], 5, 'sampled again, it is walked that update');
    // What else moves a body's joints keeps it in the walk, sampled or not.
    for (const extra of [{ wornRest: {} }, { mantlePose: {} }, { effects: [{}] }]) {
        const other = body(), h = Object.assign({ stillNow: true, poseHeld: false, sampled: false }, extra);
        Reactor3D.holdModelMatrices(h, {}, other.root);
        assert.equal(!!h.matricesHeld, false, Object.keys(extra)[0]);
    }
    for (const character of [{ _reactorKnockedOut: true }, { _reactorRagdoll: {} }]) {
        const other = body(), h = { stillNow: true, poseHeld: false, sampled: false };
        Reactor3D.holdModelMatrices(h, character, other.root);
        assert.equal(!!h.matricesHeld, false);
    }
    // The switch: only the asleep and the out of view, as before.
    Reactor3D.holdUnsampled = false;
    try {
        const other = body(), h = { stillNow: true, poseHeld: false, sampled: false };
        Reactor3D.holdModelMatrices(h, {}, other.root);
        assert.equal(!!h.matricesHeld, false);
        h.poseHeld = true;
        Reactor3D.holdModelMatrices(h, {}, other.root);
        assert.equal(h.matricesHeld, true);
    } finally { Reactor3D.holdUnsampled = true; }
});
