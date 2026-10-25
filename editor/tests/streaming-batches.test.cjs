'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
require('../../runtime/libs/three.js');
const Reactor3D = require('../../runtime/reactor_3d.js');
const THREE = global.THREE;
const batches = Reactor3D.DrawBatches;

function fixture(context) {
    const owner = { _scene: new THREE.Scene(), _foliageQueue: [] };
    const group = new THREE.Group(); owner._scene.add(group);
    const material = new THREE.MeshBasicMaterial();
    const template = new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3);
    const sources = [];
    context.after(() => {
        batches.release(owner, true);
        material.dispose();
        for (const mesh of sources) mesh.geometry.dispose();
    });
    const chunk = column => {
        const geometry = new THREE.InstancedBufferGeometry();
        geometry.setAttribute('position', template);
        geometry.setAttribute('aFolShape', new THREE.InstancedBufferAttribute(new Float32Array([1, 1, 1, 0.1, 1, 1, 1, 0.8]), 4));
        geometry.setAttribute('aFolBase', new THREE.InstancedBufferAttribute(new Float32Array([column, 0, 0, 1, column, 0, 1, 1]), 4));
        geometry.instanceCount = 2;
        const start = column * Reactor3D.FOLIAGE_CHUNK;
        geometry.boundingBox = new THREE.Box3(new THREE.Vector3(start, 0, 0), new THREE.Vector3(start + Reactor3D.FOLIAGE_CHUNK, 1, Reactor3D.FOLIAGE_CHUNK));
        const mesh = new THREE.Mesh(geometry, material);
        mesh.matrixAutoUpdate = false;
        mesh.userData.rrFoliageChunk = { count: 2, x0: start, x1: start + Reactor3D.FOLIAGE_CHUNK, z0: 0, z1: Reactor3D.FOLIAGE_CHUNK,
            y0: 0, y1: 1, layer: 0, key: column * 65536 };
        group.add(mesh);
        batches.add(owner, mesh, start, 0, { name: 'aFolShape', component: 3 });
        sources.push(mesh);
        return mesh;
    };
    return { owner, group, chunk, sources, merged: () => group.children.filter(mesh => mesh.userData.rrBatch) };
}

test('streamed chunks remain drawn and merge once when their region finishes, with identical arrays', context => {
    const setup = fixture(context);
    setup.owner._foliageQueue = [[0, 0], [1, 0], [2, 0], [3, 0]];
    while (setup.owner._foliageQueue.length) {
        const [column] = setup.owner._foliageQueue.shift();
        setup.chunk(column);
        batches.flush();
        if (setup.owner._foliageQueue.length) {
            assert.equal(setup.merged().length, 0);
            assert.ok(setup.sources.every(mesh => mesh.visible), 'no holes while waiting for the merge');
        }
    }
    assert.equal(setup.merged().length, 1);
    assert.equal(setup.owner._drawBatches.builds, 1);
    assert.ok(setup.sources.every(mesh => !mesh.visible));
    const expected = batches.mergeInstanced(setup.sources), actual = setup.merged()[0].geometry;
    for (const name of Object.keys(expected.attributes)) assert.deepEqual(actual.attributes[name].array, expected.attributes[name].array);
    assert.ok(actual.boundingBox.equals(expected.boundingBox));
    expected.dispose();
});

test('finished regions merge independently while another region still streams', context => {
    const setup = fixture(context);
    setup.owner._foliageQueue = [[2, 0], [3, 0]];
    setup.chunk(0); setup.chunk(1); setup.chunk(4); setup.chunk(5);
    batches.flush();
    assert.equal(setup.merged().length, 1);
    assert.equal(setup.merged()[0].userData.rrFoliageChunk.x0, 64);
    assert.ok(setup.sources.slice(0, 2).every(mesh => mesh.visible));
    setup.owner._foliageQueue = [];
    batches.flush();
    assert.equal(setup.merged().length, 2);
    assert.equal(setup.owner._drawBatches.builds, 2);
});

test('bush chunks also defer redundant merges, including the chunk with key zero', context => {
    const setup = fixture(context);
    context.after(() => { for (const mesh of setup.sources) Reactor3D.Shadows._static.delete(mesh); });
    setup.owner._foliageQueue = [[2, 0]];
    for (const column of [0, 1]) {
        const mesh = setup.chunk(column);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', mesh.geometry.attributes.position);
        geometry.setIndex([0, 1, 2]);
        geometry.boundingBox = mesh.geometry.boundingBox.clone();
        mesh.geometry.dispose(); mesh.geometry = geometry;
        delete mesh.userData.rrFoliageChunk;
        mesh.userData.rrBushChunk = column * 65536;
        Reactor3D.Shadows.markCaster(mesh, false);
    }
    batches.flush();
    assert.equal(setup.merged().length, 0);
    assert.ok(setup.sources.every(mesh => mesh.visible));
    assert.ok(setup.sources.every(mesh => Reactor3D.Shadows._static.has(mesh)));
    setup.owner._foliageQueue = [];
    batches.flush();
    assert.equal(setup.merged().length, 1);
    assert.equal(setup.owner._drawBatches.builds, 1);
    assert.ok(Reactor3D.Shadows._static.has(setup.merged()[0]));
    assert.ok(setup.sources.every(mesh => !Reactor3D.Shadows._static.has(mesh)));
});

test('context restoration while streaming keeps source chunks visible until a fresh final batch is ready', context => {
    const setup = fixture(context), listeners = {};
    const renderer = { domElement: { addEventListener(name, listener) { listeners[name] = listener; } } };
    setup.chunk(0); setup.chunk(1); batches.flush(renderer);
    const previous = setup.merged()[0];
    previous.geometry.attributes.aFolBase.onUploadCallback();
    assert.equal(previous.geometry.attributes.aFolBase.array, null);
    setup.owner._foliageQueue = [[3, 0]];
    setup.chunk(2); batches.flush(renderer);
    listeners.webglcontextrestored();
    batches.flush(renderer);
    assert.equal(setup.merged().length, 0);
    assert.ok(setup.sources.every(mesh => mesh.visible && mesh.geometry.attributes.aFolBase.array));
    setup.owner._foliageQueue = [];
    batches.flush(renderer);
    assert.equal(setup.merged().length, 1);
    assert.ok(setup.merged()[0].geometry.attributes.aFolBase.array);
    assert.equal(setup.merged()[0].geometry.instanceCount, 6);
});

test('editing an existing streamed region reveals its chunks, removes stale geometry, and resumes after an empty last job', context => {
    const setup = fixture(context);
    setup.chunk(0); setup.chunk(1); batches.flush();
    const previous = setup.merged()[0];
    setup.owner._foliageQueue = [[3, 0]];
    const changed = setup.sources[0];
    setup.group.remove(changed);
    setup.chunk(0); setup.chunk(2);
    batches.flush();
    assert.equal(previous.parent, null);
    assert.equal(setup.merged().length, 0);
    assert.ok(setup.group.children.every(mesh => mesh.visible));
    setup.owner._foliageQueue.shift();
    batches.flush();
    assert.equal(setup.merged().length, 1, 'queue progress is sufficient even when no new mesh was generated');
    assert.equal(setup.merged()[0].geometry.instanceCount, 6);
    assert.equal(changed.userData.rrBatchedIn, undefined);
});

test('waiting batches do not repeatedly rescan unchanged chunks, and can disable coalescing or cancel safely', context => {
    const setup = fixture(context);
    const coalesce = batches.COALESCE_STREAMING, leave = batches.leave;
    context.after(() => { batches.COALESCE_STREAMING = coalesce; batches.leave = leave; });
    setup.owner._foliageQueue = [[2, 0]];
    setup.chunk(0); setup.chunk(1); batches.flush();
    let scans = 0;
    const batch = [...setup.owner._drawBatches.batches.values()][0];
    const originalMembers = batch.members;
    batch.members = new Proxy(originalMembers, { get(target, key) { if (key === 'length') scans++; return Reflect.get(target, key); } });
    for (let frame = 0; frame < 10; frame++) batches.flush();
    assert.equal(scans, 0);
    batch.members = originalMembers;
    batches.COALESCE_STREAMING = false; batches.flush();
    assert.equal(setup.merged().length, 1);
    batches.COALESCE_STREAMING = true;
    setup.chunk(3); batches.flush();
    assert.equal(setup.merged().length, 0);
    setup.group.clear(); setup.owner._foliageQueue = [];
    batches.flush();
    assert.equal(setup.owner._drawBatches.batches.size, 0);
});
