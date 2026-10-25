'use strict';
// What a frame no longer makes and throws away, and the waits it no longer
// takes: three's math kept unboxed (packed glTF arrays, normals worked out
// over the index), the render lists sorted with whole-number answers, the
// split pass, the door walk and the drawn lists filled in place, and a new
// program's uniforms read between frames rather than inside one.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const root = path.join(__dirname, '..', '..');
require(path.join(root, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
const Reactor3D = require(path.join(root, 'runtime', 'reactor_3d.js'));
require(path.join(root, 'runtime', 'reactor_3d_lighting.js'));
// The split as an integrated GPU draws it (a discrete one lights per pixel: HalfLight.WEAK_ONLY).
Reactor3D.HalfLight.WEAK_ONLY = false;
require(path.join(root, 'runtime', 'reactor_3d_models.js'));
require(path.join(root, 'runtime', 'reactor_3d_doors.js'));

test('a worker-parsed glTF has its arrays of numbers rebuilt, everything else kept', () => {
    const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2.5, 0, 0, 1];
    const nodes = [{ name: 'a', matrix, translation: [1, 2.5, 3] }, { name: 'b', children: [0] }];
    const json = { nodes, meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], asset: { version: '2.0' }, empty: [] };
    const packed = Reactor3D.packJsonArrays(json);
    assert.equal(packed, json, 'the record itself');
    assert.equal(json.nodes, nodes, 'an array of records is kept');
    assert.notEqual(json.nodes[0].matrix, matrix, 'an array of numbers is a new one');
    assert.deepEqual(json.nodes[0].matrix, matrix);
    assert.deepEqual(json.nodes[0].translation, [1, 2.5, 3]);
    assert.deepEqual(json.nodes[1].children, [0]);
    assert.deepEqual(json.empty, []);
    assert.equal(json.asset.version, '2.0');
    const source = require('node:fs').readFileSync(path.join(root, 'runtime', 'reactor_3d_models.js'), 'utf8');
    assert.match(source, /json: Reactor3D\.packJsonArrays\(data\.json\),/, 'the parse worker\'s answer goes through it');
});

/** A quad of four vertices drawn as two indexed triangles, with no normals of its own. */
function quad() {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    const bin = new Uint8Array(60);
    bin.set(new Uint8Array(positions.buffer), 0);
    bin.set(new Uint8Array(indices.buffer), 48);
    const json = {
        asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
        accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' }, { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 48 }, { buffer: 0, byteOffset: 48, byteLength: 12 }],
        buffers: [{ byteLength: 60 }]
    };
    return { json, bin };
}

test('a primitive with no normals has them worked out over its index', () => {
    const { json, bin } = quad();
    const template = Reactor3D.buildGlbTemplate(json, bin, '');
    let mesh = null;
    template.traverse(object => { if (object.isMesh && !mesh) mesh = object; });
    assert.ok(mesh && mesh.geometry.index, 'the indexed quad');
    const normal = mesh.geometry.getAttribute('normal');
    assert.equal(normal.count, 4);
    for (let i = 0; i < 4; i++) {
        // Taken three vertices at a time, the fourth vertex read past the end: a NaN normal, and an
        // undefined written into three's scratch vector, which boxed every number it ever held after.
        assert.ok(Math.abs(normal.getZ(i) - 1) < 1e-6 && Math.abs(normal.getX(i)) < 1e-6, 'vertex ' + i + ' faces the quad\'s way');
    }
});

test('the render lists sort in three\'s order with whole-number answers', () => {
    const S = Reactor3D.IntegerSort;
    const item = (id, groupOrder, renderOrder, material, z, variant = 0) => ({ id, groupOrder, renderOrder, material: { id: material }, materialVariant: variant, z });
    const painter = (a, b) => a.groupOrder !== b.groupOrder ? a.groupOrder - b.groupOrder : a.renderOrder !== b.renderOrder ? a.renderOrder - b.renderOrder
        : a.material.id !== b.material.id ? a.material.id - b.material.id : a.materialVariant !== b.materialVariant ? a.materialVariant - b.materialVariant : a.z !== b.z ? a.z - b.z : a.id - b.id;
    const reverse = (a, b) => a.groupOrder !== b.groupOrder ? a.groupOrder - b.groupOrder : a.renderOrder !== b.renderOrder ? a.renderOrder - b.renderOrder : a.z !== b.z ? b.z - a.z : a.id - b.id;
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const items = Array.from({ length: 400 }, (_, i) => item(i, Math.floor(random() * 2), Math.floor(random() * 3) * 0.5, Math.floor(random() * 5), Math.round(random() * 20) / 4, Math.floor(random() * 2)));
    assert.deepEqual(items.slice().sort(S.opaque).map(x => x.id), items.slice().sort(painter).map(x => x.id));
    assert.deepEqual(items.slice().sort(S.transparent).map(x => x.id), items.slice().sort(reverse).map(x => x.id));
    for (let i = 0; i < 50; i++) for (const r of [S.opaque(items[i], items[i + 1]), S.transparent(items[i], items[i + 1])]) assert.ok(r === -1 || r === 0 || r === 1);
    const calls = [];
    S.install({ setOpaqueSort: fn => calls.push(['opaque', fn]), setTransparentSort: fn => calls.push(['transparent', fn]) });
    assert.deepEqual(calls.map(c => c[0]), ['opaque', 'transparent']);
    S.enabled = false; calls.length = 0;
    S.install({ setOpaqueSort: fn => calls.push(fn), setTransparentSort: fn => calls.push(fn) });
    S.enabled = true;
    assert.equal(calls.length, 0, 'the switch keeps three\'s own');
});

test('the split pass refills one record: this pass\'s materials only, none left behind', () => {
    const HL = Reactor3D.HalfLight;
    const lit = () => Reactor3D.litMaterial(new THREE.MeshBasicMaterial());
    const saved = Reactor3D.LightVolume.supported;
    Reactor3D.LightVolume.supported = () => true;
    try {
        const scene = new THREE.Scene();
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(), lit()), wall = new THREE.Mesh(new THREE.PlaneGeometry(), lit());
        const plain = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
        const pair = new THREE.Mesh(new THREE.PlaneGeometry(), [lit(), new THREE.MeshBasicMaterial()]);
        scene.add(floor, wall, plain, pair);
        const target = { depthTexture: new THREE.DepthTexture(4, 4), width: 4, height: 4, samples: 0 };
        const floorLit = floor.material, wallLit = wall.material;
        const first = HL.begin({}, scene, target);
        assert.ok(first.deferred.has(floorLit) && first.deferred.has(wallLit) && first.forward.has(plain.material));
        assert.equal(floor.material.__rrTwinOf, floorLit, 'drawn unlit by its twin');
        assert.notEqual(pair.material[0], pair.material[1], 'the pair wears its twins');
        const twins = pair.material;
        HL.restore(first);
        assert.ok(Array.isArray(pair.material) && pair.material !== twins && !pair.material[0].__rrTwinOf, 'and its own materials again');
        // The next pass: the wall gone, the floor drawn plainly now.
        scene.remove(wall);
        const floorWas = floorLit;
        floor.material = new THREE.MeshBasicMaterial();
        const second = HL.begin({}, scene, target);
        assert.equal(second, first, 'the same record');
        assert.equal(second.deferred.has(wallLit), false, 'a material this pass did not take is gone from it');
        assert.equal(second.deferred.has(floorWas), false);
        assert.ok(second.forward.has(floor.material));
        assert.equal(pair.material, twins, 'the same twin list, refilled');
        HL.restore(second);
        assert.equal(second.swaps, 0);
        assert.ok(second.swapped.every(x => x === null), 'what it swapped is let go');
    } finally { Reactor3D.LightVolume.supported = saved; }
});

test('a shut door at rest with nobody near is passed over; anyone near it is asked about as before', () => {
    const R = Reactor3D, D = R.DoorRest;
    const walkers = [{ _realX: 10, _realY: 10 }, { _realX: 30, _realY: 4 }, null, { _realX: NaN, _realY: 0 }];
    D.gather(walkers);
    const door = { piece: { width: 2 }, x: 20.5, z: 10.5 };
    assert.equal(D.walkerNear(door, 2.5), false, 'ten tiles off');
    assert.equal(D.walkerNear(door, 9), true, 'within notice and the doorway\'s half width');
    walkers[1]._realX = 20; walkers[1]._realY = 12;
    D.gather(walkers);
    assert.equal(D.walkerNear(door, 1.2), true, 'two tiles from a door two wide');
    assert.equal(D.enabled, true);
});

test('a linked program\'s uniforms are read between frames, and its material waits for that read', async () => {
    const W = Reactor3D.ShaderWarmup;
    let reads = 0;
    const program = { program: {}, isReady: () => true, getUniforms() { reads++; return { seq: [] }; }, getAttributes() { return {}; } };
    assert.equal(W.readSoon(program), false, 'queued, not read on the spot');
    assert.equal(reads, 0);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(reads, 1, 'read in the time after');
    assert.equal(W.readSoon(program), true, 'and then ready');
    W.readEarly = false;
    assert.equal(W.readSoon({ program: {}, getUniforms() { reads++; } }), true, 'the switch leaves it to the first draw');
    W.readEarly = true;
    assert.equal(W.readSoon({ program: undefined, getUniforms() {} }), true, 'a destroyed program has nothing to read');
});
