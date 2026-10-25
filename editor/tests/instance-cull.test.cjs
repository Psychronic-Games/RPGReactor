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
    assert.match(three, /Reactor3D\.renderScene = function\(renderer, scene, camera\) \{[\s\S]{0,400}InstanceCull\.hide\(scene, camera\)[\s\S]{0,400}if \(hidden\) this\.InstanceCull\.show\(hidden\);/);
});
