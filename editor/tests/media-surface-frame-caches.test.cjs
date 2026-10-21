/**
 * Media surfaces on a 3D map, placed once per frame instead of twice, and a
 * plane's turn written only when it changes. Both are skipped work, so the
 * planes must come out exactly as the uncached path leaves them.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
require(path.join(root, 'runtime', 'reactor_3d.js'));
global.self = global; global.window = global;
require(path.join(root, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
const surfaces = require(path.join(root, 'runtime', 'reactor_media_surfaces.js'));

function mapOwner(descriptor) {
    const owner = Object.create(surfaces.MediaSurfaceOwner.prototype);
    owner.descriptor = descriptor;
    owner.threeMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    owner.threeScanMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    owner.threeState = { camera: new THREE.PerspectiveCamera(40, 1.3, 0.1, 100) };
    owner.threeState.camera.position.set(4, 6, 12);
    return owner;
}

function state(mesh) {
    return [...mesh.position.toArray(), ...mesh.quaternion.toArray(), ...mesh.rotation.toArray().slice(0, 4),
        ...mesh.scale.toArray(), mesh.visible];
}

test('a map surface is turned only when its angles change, and ends exactly where turning it every tick did', () => {
    const saved = { map: global.$gameMap, data: global.$dataMap, enabled: surfaces.turnCache.enabled };
    try {
        global.$gameMap = { tileWidth: () => 48, tileHeight: () => 48, event: () => null };
        global.$dataMap = { width: 10, height: 10, reactor3d: {} };
        const raw = { id: 3, file: 'poster.png', target: 'map', x: 2.5, y: 1, z: 2, width: 96, height: 64,
            rotationX: -12, rotationY: 30, rotationZ: 4, depth: 0.5, cullingDistance: 9 };
        const cached = mapOwner(surfaces.normalizeShowArgs(raw, null));
        const plain = mapOwner(surfaces.normalizeShowArgs(raw, null));
        for (let tick = 0; tick < 40; tick++) {
            if (tick === 10) for (const o of [cached, plain]) o.descriptor = surfaces.normalizeShowArgs({ ...raw, rotationY: 75 }, null);
            // Someone else turning the plane is undone, as it always was.
            if (tick === 20) for (const o of [cached, plain]) o.threeMesh.quaternion.set(0, 0, 0, 1);
            if (tick === 25) for (const o of [cached, plain]) o.threeScanMesh.rotation.order = 'YXZ';
            if (tick === 30) for (const o of [cached, plain]) o.threeState.camera.position.set(40, 6, 40);
            surfaces.turnCache.enabled = true;
            cached.updateThreePosition();
            surfaces.turnCache.enabled = false;
            plain.updateThreePosition();
            assert.deepEqual(state(cached.threeMesh), state(plain.threeMesh), 'plane, tick ' + tick);
            assert.deepEqual(state(cached.threeScanMesh), state(plain.threeScanMesh), 'scanlines, tick ' + tick);
        }
        assert.equal(cached.threeMesh.visible, false, 'the far camera culls it');
    } finally {
        global.$gameMap = saved.map; global.$dataMap = saved.data; surfaces.turnCache.enabled = saved.enabled;
    }
});

test('a 3D surface drawn by the first pass is not placed again by the second, unless the frame changed it', () => {
    const saved = { map: global.$gameMap, enabled: surfaces.secondPlacement.enabled };
    try {
        const manager = new surfaces.MediaSurfaceManager();
        global.$gameMap = { mapId: () => 4, tileWidth: () => 48, tileHeight: () => 48 };
        const store = manager.store(global.$gameMap, true);
        const descriptor = manager.storedDescriptor(Object.assign(surfaces.normalizeShowArgs(
            { id: 1, file: 'panel.webm', target: 'map', x: 1, y: 1 }, null), { generation: 1, mapId: 4 }));
        store.surfaces['1'] = descriptor;
        const calls = [];
        const owner = {
            generation: 1, backend: 'three', descriptor,
            needsRecreate: () => false,
            update() { calls.push('update'); },
            captureCurrentTime(value) { calls.push(value === owner.descriptor ? 'clock' : 'clock?'); },
            cleanup() { calls.push('cleanup'); }
        };
        manager._owners.set(1, owner);
        const spriteset = {};

        manager.updateSpriteset(spriteset);
        manager.updateSpriteset(spriteset, true);
        assert.deepEqual(calls.splice(0), ['update', 'clock'], 'placed once; the second pass keeps the clock');

        // A command that replaced the descriptor mid-frame is placed again.
        const moved = manager.storedDescriptor(Object.assign({}, descriptor, { x: 3 }));
        store.surfaces['1'] = moved;
        manager.updateSpriteset(spriteset, true);
        assert.deepEqual(calls.splice(0), ['update']);
        assert.equal(owner.descriptor, moved);

        // A flat (PIXI) surface is drawn after the update: both passes place it.
        owner.backend = 'pixi';
        manager.updateSpriteset(spriteset);
        manager.updateSpriteset(spriteset, true);
        assert.deepEqual(calls.splice(0), ['update', 'update']);

        owner.backend = 'three';
        surfaces.secondPlacement.enabled = false;
        manager.updateSpriteset(spriteset);
        manager.updateSpriteset(spriteset, true);
        assert.deepEqual(calls.splice(0), ['update', 'update'], 'switched off, both passes place it');

        // A surface gone from the store is cleaned up while the owners are walked.
        delete store.surfaces['1'];
        manager.updateSpriteset(spriteset, true);
        assert.deepEqual(calls.splice(0), ['cleanup']);
        assert.equal(manager._owners.size, 0);
    } finally {
        global.$gameMap = saved.map; surfaces.secondPlacement.enabled = saved.enabled;
    }
});
