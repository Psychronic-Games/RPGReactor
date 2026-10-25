'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
require('../../runtime/libs/three.js');
const Reactor3D = require('../../runtime/reactor_3d.js');
const THREE = global.THREE;

function flatLights(context, lights) {
    const keys = ['_lights', 'LIGHT_MODE', 'LIGHT_OCCLUSION', 'viewport', 'roundLightTexture', 'coneLightTexture',
        'surfaceHeightAt', 'facadeAt', 'clampConeReach', 'lightEyeInterior', 'lightSegmentBlocked'];
    const saved = Object.fromEntries(keys.map(key => [key, Reactor3D[key]]));
    const dataMap = global.$dataMap;
    context.after(() => {
        Object.assign(Reactor3D, saved);
        global.$dataMap = dataMap;
    });
    Reactor3D.LIGHT_MODE = 'flat';
    Reactor3D.LIGHT_OCCLUSION = false;
    Reactor3D.viewport = () => null;
    Reactor3D.roundLightTexture = Reactor3D.coneLightTexture = () => new THREE.Texture();
    Reactor3D.surfaceHeightAt = () => 0;
    Reactor3D.facadeAt = () => null;
    global.$dataMap = { width: 20, height: 20, data: [] };
    Reactor3D.setLights(lights);
    return makeScene();
}

function makeScene() {
    const scene = Object.create(Reactor3D.MapScene.prototype);
    scene._scene = new THREE.Scene();
    scene._materials = [];
    return scene;
}

function versions(pool) {
    return ['position', 'uv', 'color'].map(name => pool.geometry.attributes[name].version);
}

function matchesFresh(scene) {
    const fresh = makeScene();
    fresh.syncLights({ x: 5, y: 5 });
    for (const kind of ['round', 'cone']) {
        const actual = scene.lightPool(kind), expected = fresh.lightPool(kind);
        assert.equal(actual.count, expected.count);
        assert.equal(actual.mesh.visible, expected.mesh.visible);
        assert.equal(actual.geometry.drawRange.count, expected.geometry.drawRange.count);
        for (const name of ['position', 'uv', 'color']) {
            const size = actual.count * 4 * actual.geometry.attributes[name].itemSize;
            assert.deepEqual(actual.geometry.attributes[name].array.slice(0, size), expected.geometry.attributes[name].array.slice(0, size));
        }
        expected.geometry.dispose();
        expected.mesh.material.dispose();
    }
}

test('unchanged flat lights retain all GPU attributes; flicker uploads only color', context => {
    const light = { x: 3, y: 4, radius: 2, intensity: 0.1, colour: 0xff8844 };
    const scene = flatLights(context, [light]);
    scene.syncLights();
    const pool = scene.lightPool('round'), initial = versions(pool);
    const buffers = Object.values(pool.geometry.attributes).map(attribute => attribute.array.slice());
    for (let frame = 0; frame < 60; frame++) scene.syncLights();
    assert.deepEqual(versions(pool), initial);
    Object.values(pool.geometry.attributes).forEach((attribute, index) => assert.deepEqual(attribute.array, buffers[index]));
    light.intensity = 0.2;
    scene.syncLights();
    assert.deepEqual(versions(pool), [initial[0], initial[1], initial[2] + 1]);
    matchesFresh(scene);
    light.colour = 0x4488ff;
    scene.syncLights();
    assert.deepEqual(versions(pool), [initial[0], initial[1], initial[2] + 2]);
    matchesFresh(scene);
    light.x++;
    scene.syncLights();
    assert.deepEqual(versions(pool), [initial[0] + 1, initial[1], initial[2] + 2]);
    light.radius++;
    scene.syncLights();
    assert.deepEqual(versions(pool), [initial[0] + 2, initial[1], initial[2] + 2]);
    matchesFresh(scene);
});

test('pooled lights remain correct across reordering, removal, shape edits and reappearance', context => {
    const beam = { x: 3, y: 4, radius: 2, type: Reactor3D.LIGHT_BEAM, width: 1 };
    const spot = { x: 8, y: 5, radius: 3, type: Reactor3D.LIGHT_SPOT, yaw: 30, angle: 50, colour: 0x8844ff };
    const round = { x: 2, y: 9, radius: 2 };
    const scene = flatLights(context, [beam, spot, round]);
    const sync = () => { scene.syncLights(); matchesFresh(scene); };
    sync();
    Reactor3D.setLights([spot, round, beam]); sync();
    Reactor3D.setLights([beam]); sync();
    let initial = versions(scene.lightPool('cone'));
    beam.type = Reactor3D.LIGHT_SPOT; sync();
    assert.deepEqual(versions(scene.lightPool('cone')), [initial[0] + 1, initial[1] + 1, initial[2]]);
    initial = versions(scene.lightPool('cone'));
    beam.yaw = 90; sync();
    beam.angle = 70; sync();
    assert.deepEqual(versions(scene.lightPool('cone')), [initial[0] + 2, initial[1], initial[2]]);
    beam.radius = 0; sync();
    beam.radius = 6; sync();
    Reactor3D.setLights([]); sync();
    Reactor3D.setLights([round, beam, spot]); sync();
    beam.type = Reactor3D.LIGHT_BEAM; beam.width = 0.5; sync();
    beam.type = undefined; sync();
});

test('stationary light caches still observe changing terrain, facades, walls and camera occlusion', context => {
    const light = { x: 3, y: 4, radius: 5, type: Reactor3D.LIGHT_SPOT };
    const scene = flatLights(context, [light]);
    let ground = 0, facade = null, reach = 5, blocked = false, queries = 0;
    const camera = new THREE.PerspectiveCamera();
    Reactor3D.LIGHT_OCCLUSION = true;
    Reactor3D.viewport = () => ({ camera: () => camera });
    Reactor3D.surfaceHeightAt = () => { queries++; return ground; };
    Reactor3D.facadeAt = () => facade;
    Reactor3D.clampConeReach = () => reach;
    Reactor3D.lightEyeInterior = () => true;
    Reactor3D.lightSegmentBlocked = () => blocked;
    const sync = () => { scene.syncLights(); matchesFresh(scene); };
    sync();
    const pool = scene.lightPool('cone'), initial = versions(pool);
    ground = 2; sync();
    reach = 2; sync();
    facade = { height: 3, lift: 2, z: 8 }; sync();
    light.groundY = 7; sync();
    assert.deepEqual(versions(pool), [initial[0] + 4, initial[1], initial[2]]);
    blocked = true; sync();
    assert.equal(pool.count, 0);
    blocked = false; sync();
    assert.equal(pool.count, 1);
    assert.ok(queries >= 4);
});

function originalUp(camera, tilt) {
    const up = new THREE.Vector3(0, 1, 0);
    return camera && tilt ? up.lerp(new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion), tilt).normalize() : up;
}

function originalFacing(camera, tilt) {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    else right.normalize();
    const forward = new THREE.Vector3().crossVectors(right, originalUp(camera, tilt)).normalize();
    const up = new THREE.Vector3().crossVectors(forward, right).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, forward));
}

test('billboard caches match original orientation, invalidate on camera/tilt changes, and resist scratch mutation', context => {
    const tilt = Reactor3D.BILLBOARD_TILT;
    context.after(() => { Reactor3D.BILLBOARD_TILT = tilt; });
    const cameras = [new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera()];
    cameras[1].rotation.set(0.3, 0.8, -0.2);
    const object = new THREE.Object3D();
    for (const value of [0, 0.35, 1]) {
        Reactor3D.BILLBOARD_TILT = value;
        for (const camera of [...cameras, ...cameras]) {
            assert.deepEqual(Reactor3D.billboardUp(camera).toArray(), originalUp(camera, value).toArray());
            Reactor3D.billboardUp(camera).set(99, 98, 97);
            Reactor3D.aimCharacterBillboard(object, camera);
            assert.deepEqual(object.quaternion.toArray(), originalFacing(camera, value).toArray());
        }
        cameras[0].rotation.set(0.4, 0.6, Math.PI / 2);
        Reactor3D.aimCharacterBillboard(object, cameras[0]);
        assert.deepEqual(object.quaternion.toArray(), originalFacing(cameras[0], value).toArray());
    }
    assert.deepEqual(Reactor3D.billboardUp(null).toArray(), [0, 1, 0]);
});

test('one billboard basis per camera change, without rewriting unchanged object rotations', context => {
    const tilt = Reactor3D.BILLBOARD_TILT, up = Reactor3D.billboardUp;
    context.after(() => { Reactor3D.BILLBOARD_TILT = tilt; Reactor3D.billboardUp = up; });
    Reactor3D.BILLBOARD_TILT = 0.35;
    const camera = new THREE.PerspectiveCamera(), other = new THREE.PerspectiveCamera();
    camera.rotation.set(0.3, 0.8, -0.2);
    const objects = Array.from({ length: 20 }, () => new THREE.Object3D());
    let bases = 0, writes = 0;
    Reactor3D.billboardUp = function(...args) { bases++; return up.apply(this, args); };
    for (const object of objects) object.quaternion._onChange(() => { writes++; });
    for (let frame = 0; frame < 60; frame++) for (const object of objects) Reactor3D.aimCharacterBillboard(object, camera);
    assert.equal(bases, 1);
    assert.equal(writes, 20);
    Reactor3D.aimCharacterBillboard(new THREE.Object3D(), other);
    Reactor3D.aimCharacterBillboard(objects[0], camera);
    assert.equal(bases, 2, 'alternating cameras retain independent cached bases');
    objects[0].quaternion.identity();
    Reactor3D.aimCharacterBillboard(objects[0], camera);
    assert.deepEqual(objects[0].quaternion.toArray(), originalFacing(camera, Reactor3D.BILLBOARD_TILT).toArray());
    camera.rotation.y += 0.1;
    Reactor3D.aimCharacterBillboard(objects[0], camera);
    assert.equal(bases, 3);
    Reactor3D.BILLBOARD_TILT = 1;
    Reactor3D.aimCharacterBillboard(objects[0], camera);
    assert.equal(bases, 4);
});
