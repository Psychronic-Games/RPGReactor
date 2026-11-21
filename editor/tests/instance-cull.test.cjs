'use strict';
// Skinned instances are culled by a world sphere from where they stand and
// how big they are (never the skin's rest bounds), per shadow face and view.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const root = path.join(__dirname, '..', '..');
require(path.join(root, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
const Reactor3D = require(path.join(root, 'runtime', 'reactor_3d.js'));
require(path.join(root, 'runtime', 'reactor_3d_models.js'));

function world() {
    const scene = new THREE.Scene(), group = new THREE.Group();
    scene.add(group); scene.userData.rrModelsGroup = group;
    const place = (x, z, skinned = true) => {
        const object = new THREE.Group(); object.position.set(x, 0, z);
        object.userData.glbSize = { x: 1, y: 2, z: 1 }; object.userData.rrSkinned = skinned;
        group.add(object); scene.updateMatrixWorld(true); return object;
    };
    const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 100); camera.position.set(0, 1, 0); camera.lookAt(0, 1, -10);
    scene.updateMatrixWorld(true);
    return { scene, place, camera };
}

test('an instance the camera cannot see is hidden for the draw and shown after; one in view, beside the edge or rigid is not', () => {
    const { scene, place, camera } = world();
    const ahead = place(0, -10), behind = place(0, 20), edge = place(12.5, -10), rigid = place(0, 20, false);
    const hidden = Reactor3D.InstanceCull.hide(scene, camera);
    assert.deepEqual(hidden, [behind]);
    assert.equal(behind.visible, false);
    assert.ok(ahead.visible && edge.visible && rigid.visible, 'the sphere reaches 1.5 spans and a tile past the frustum edge');
    Reactor3D.InstanceCull.show(hidden);
    assert.equal(behind.visible, true);
});

/** A figure of bones: a hip at its feet's place, a head 1.6 up, a hand 0.5 to its side; `held`: a rigid box that far along x from the hand. */
function figure(place, x, z, held = 0) {
    const object = place(x, z);
    // Plain objects for joints, as the engine's own skeletons have (not THREE.Bone), known only through the skin.
    const hip = new THREE.Object3D(), head = new THREE.Object3D(), hand = new THREE.Object3D();
    hip.position.set(0, 0.9, 0); head.position.set(0, 0.7, 0); hand.position.set(0.5, 0.2, 0);
    hip.add(head); hip.add(hand); object.add(hip);
    const skeleton = new THREE.Skeleton([hip, head, hand]);
    for (const part of ["body", "hair"]) { const skin = new THREE.SkinnedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial()); skin.name = part; skin.skeleton = skeleton; object.add(skin); }
    object.userData.rrJoints = [hip, head, hand];
    if (held) { const item = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial()); item.position.set(held, 0, 0); hand.add(item); }
    object.updateMatrixWorld(true);
    return object;
}

test('an instance the wide sphere keeps is measured by its bones as they stand, and hidden when they are outside the view', () => {
    const { scene, place, camera } = world();
    const C = Reactor3D.InstanceCull;
    assert.equal(C.tight, false, 'built and left off: it bought no frames where it was measured (2026-11-16)');
    C.tight = true;
    // The camera looks down -z with 45 degrees to each side: at z = -10 the picture's edge is at x = 10.
    const inside = figure(place, 0, -10), atEdge = figure(place, 10.3, -10), beside = figure(place, 12.5, -10), far = figure(place, 0, 20);
    let hidden = C.hide(scene, camera);
    assert.deepEqual(hidden, [beside, far], 'a body and a half outside the edge is not drawn; nor one behind the camera, as before');
    assert.ok(inside.visible && atEdge.visible, 'a figure whose margin reaches into the picture is');
    assert.deepEqual(C.last, { measured: 1, hidden: 1 }, 'only the one neither plainly in nor plainly out is measured');
    assert.equal(beside.children[1].skeleton.bones[0].isBone, undefined, 'its joints are not THREE.Bone');
    C.show(hidden);
    assert.ok(beside.visible && far.visible);
    // What it holds reaches back into the picture: kept.
    const armed = figure(place, 12.5, -12, -3);
    hidden = C.hide(scene, camera);
    assert.ok(!hidden.includes(armed), 'a long thing in its hand is part of it');
    C.show(hidden);
    // A pose that leaves where the instance stands (a lunge toward the picture) is measured where the bones are.
    const lunging = figure(place, 12.5, -14);
    lunging.children[0].position.x = -2.6; lunging.updateMatrixWorld(true);
    hidden = C.hide(scene, camera);
    assert.ok(!hidden.includes(lunging));
    C.show(hidden);
    // The switch as it ships: every instance the wide sphere keeps is drawn.
    C.tight = false;
    hidden = C.hide(scene, camera); assert.deepEqual(hidden, [far]); C.show(hidden);
});

test('an instance that cannot be measured is kept: no bones, or bones not yet where it stands', () => {
    const { scene, place, camera } = world();
    const C = Reactor3D.InstanceCull;
    const plain = place(12.5, -10);
    const unplaced = figure(place, 12.5, -12);
    C.tight = true;
    // Its bones still at the world's origin (added, never drawn): a matrix nobody has worked out yet.
    for (const joint of unplaced.userData.rrJoints) joint.matrixWorld.identity();
    assert.equal(C.hide(scene, camera), null);
    assert.ok(plain.visible && unplaced.visible);
    assert.equal(C.last.hidden, 0);
    C.tight = false;
});

test('a ragdoll, a hidden instance and the kill switch are left alone', () => {
    const { scene, place, camera } = world();
    const ragdoll = place(0, 20); ragdoll.userData.rrNoCull = true;
    const away = place(0, 30); away.visible = false;
    assert.equal(Reactor3D.InstanceCull.hide(scene, camera), null);
    assert.equal(away.visible, false);
    Reactor3D.InstanceCull.enabled = false;
    try { place(0, 25); assert.equal(Reactor3D.InstanceCull.hide(scene, camera), null); } finally { Reactor3D.InstanceCull.enabled = true; }
    assert.equal(Reactor3D.InstanceCull.hide(new THREE.Scene(), camera), null, 'a scene with no models group (a preview) is untouched');
});

test('renderScene and every shadow face draw through the cull and always show again', () => {
    const fs = require('node:fs');
    const three = fs.readFileSync(path.join(root, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(three, /Reactor3D\.renderScene = function\(renderer, scene, camera\) \{[\s\S]{0,800}InstanceCull\.hide\(scene, camera\)[\s\S]{0,400}if \(hidden\) this\.InstanceCull\.show\(hidden\);/);
});
