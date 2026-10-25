// Draw batches: the pieces and the plants are laid and edited a chunk at a
// time, and drawn a region at a time (Reactor3D.DrawBatches,
// reactor_3d_world.js). Also the light volume's steps and the windows PIXI no
// longer lays out while nobody can see them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { runtimeSource } = require('./helpers/runtime-source.cjs');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime/libs/three.js'));
const THREE = global.THREE;
const R = require(path.join(repoRoot, 'runtime/reactor_3d.js'));
const B = R.DrawBatches;

const block = (id, x, y, material = 'Stone') => ({ id, kind: 'block', x, y, z: 0, rot: 0, material });
const wideMap = pieces => ({ width: 160, height: 80, reactor3d: { version: 1, elevation: new Array(160 * 80).fill(0), pieces } });
const sceneFor = map => {
    const scene = Object.create(R.MapScene.prototype);
    scene._scene = new THREE.Scene(); scene._meshes = []; scene._materials = []; scene._textures = [];
    scene.addPieces(map, () => null);
    return scene;
};
const drawn = scene => { const out = []; scene.piecesGroup().traverseVisible(o => { if (o.isMesh) out.push(o); }); return out; };
const forget = scene => B.release(scene, true);

test('chunks of one material in a region are drawn as one mesh; the chunks stay, hidden, for picks and edits', () => {
    // Chunks 0 and 1 (cells 1 and 20) share region 0; cell 70 is region 1, alone.
    const map = wideMap([block(1, 1, 1), block(2, 20, 1), block(3, 70, 1)]);
    const scene = sceneFor(map);
    try {
        assert.equal(scene._pieceMeshes.length, 3, 'laid a chunk at a time, as before');
        B.flush();
        const batch = scene._drawBatches;
        const merged = drawn(scene).filter(m => m.userData.rrBatch);
        assert.equal(merged.length, 1, 'one draw for the two chunks of region 0');
        const [a, b, c] = scene._pieceMeshes;
        assert.equal(a.visible, false); assert.equal(b.visible, false);
        assert.equal(c.visible, true, 'one chunk alone in its region is drawn as itself');
        assert.equal(merged[0].geometry.attributes.position.count, a.geometry.attributes.position.count + b.geometry.attributes.position.count);
        assert.equal(merged[0].material, a.material, 'the chunks\' own material');
        assert.ok(merged[0].geometry.boundingSphere && merged[0].geometry.boundingBox.containsBox(a.geometry.boundingBox));
        assert.equal(scene._meshes.includes(merged[0]), false, 'the editor picks the chunks (mapScene._meshes), never the copy');
        assert.equal(a.userData.rrBatchedIn, merged[0].userData.rrBatch);
        const hits = []; merged[0].raycast(new THREE.Raycaster(), hits); assert.equal(hits.length, 0, 'a ray passes through the copy');
        assert.ok(R.Shadows._static.has(merged[0]) && !R.Shadows._static.has(a), 'the region casts in the static rows, the chunks no longer');
        assert.ok(batch.batches.size >= 2, 'the lone chunk stays listed for a neighbour to join');
    } finally { forget(scene); }
});

test('an edit lays its chunk again and the region is made again from the arrays; the switch takes it all apart', () => {
    const map = wideMap([block(1, 1, 1), block(2, 20, 1), block(3, 21, 1)]);
    const scene = sceneFor(map);
    try {
        B.flush();
        const before = drawn(scene).find(m => m.userData.rrBatch);
        const count = before.geometry.attributes.position.count;
        map.reactor3d.pieces = map.reactor3d.pieces.slice(0, 2);
        scene.updatePieces(map, () => null, { x0: 20, y0: 0, x1: 22, y1: 2 });
        B.flush();
        const after = drawn(scene).find(m => m.userData.rrBatch);
        assert.notEqual(after, before, 'made again');
        assert.equal(before.parent, null, 'the old one left the scene');
        assert.ok(after.geometry.attributes.position.count < count, 'without the piece taken away');
        assert.equal(drawn(scene).filter(m => m.userData.pieces).length, 1, 'and only it is drawn');
        B.enabled = false;
        B.flush();
        assert.equal(drawn(scene).filter(m => m.userData.rrBatch).length, 0);
        assert.ok(scene._pieceMeshes.every(m => m.visible), 'every chunk drawn as itself again');
        assert.ok(scene._pieceMeshes.every(m => R.Shadows._static.has(m)), 'and casting as itself');
        B.enabled = true;
        B.flush();
        assert.equal(drawn(scene).filter(m => m.userData.rrBatch).length, 1, 'and batched again when switched back on');
    } finally { B.enabled = true; forget(scene); }
});

test('nothing changed, nothing looked at: the scan waits for laid chunks, a group\'s count, or its once-a-second look', () => {
    const scene = sceneFor(wideMap([block(1, 1, 1), block(2, 20, 1)]));
    try {
        B.flush();
        const state = scene._drawBatches;
        const merged = drawn(scene).find(m => m.userData.rrBatch);
        let looked = 0;
        const groupsChanged = B.groupsChanged;
        B.groupsChanged = function() { looked++; return groupsChanged.apply(this, arguments); };
        try { for (let i = 0; i < 10; i++) B.flush(); } finally { B.groupsChanged = groupsChanged; }
        assert.equal(looked, 10, 'only the group counts are compared');
        assert.equal(drawn(scene).find(m => m.userData.rrBatch), merged, 'the same mesh');
        // A chunk taken away by hand (not through updatePieces) changes the group's count.
        const gone = scene._pieceMeshes[1];
        gone.parent.remove(gone);
        B.flush();
        assert.equal(merged.parent, null, 'the region is made again');
        assert.equal(scene._pieceMeshes[0].visible, true, 'the one left is drawn as itself');
        assert.ok(state.counts.size >= 1);
    } finally { forget(scene); }
});

test('glass batches (its layers blend alike in any order); a finish, a textured see-through and an animated part do not', () => {
    const scene = sceneFor(wideMap([]));
    try {
        const group = scene.piecesGroup();
        const make = material => { const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(); box.clearGroups(); const m = new THREE.Mesh(box, material); m.userData.pieces = true; m.matrixAutoUpdate = false; m.updateMatrix(); group.add(m); return m; };
        const clear = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.3 });
        const textured = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: new THREE.Texture() });
        const plain = new THREE.MeshBasicMaterial();
        const g1 = make(clear), g2 = make(clear), t1 = make(textured), t2 = make(textured), f1 = make(plain), f2 = make(plain), m1 = make(plain), m2 = make(plain);
        f1.userData.pieceFinish = f2.userData.pieceFinish = 'mirror';
        m1.matrixAutoUpdate = m2.matrixAutoUpdate = true;
        for (const m of [g1, g2, t1, t2, f1, f2, m1, m2]) B.add(scene, m, 0, 0);
        B.flush();
        assert.equal(g1.visible, false, 'glass merged');
        assert.ok([t1, t2, f1, f2, m1, m2].every(m => m.visible), 'the rest drawn one by one');
    } finally { forget(scene); }
});

test('instanced plants merge in order of their thinning share, so the share drawn is a prefix of each chunk', () => {
    const scene = sceneFor(wideMap([]));
    try {
        const group = new THREE.Group(); scene.piecesGroup().add(group);
        const template = { position: new THREE.BufferAttribute(new Float32Array(9), 3), index: new THREE.BufferAttribute(new Uint16Array([0, 1, 2]), 1) };
        const material = new THREE.MeshBasicMaterial();
        const hook = function() {};
        const chunk = (ranks, x0) => {
            const g = new THREE.InstancedBufferGeometry();
            g.setAttribute('position', template.position); g.setIndex(template.index);
            const shape = new Float32Array(ranks.length * 4), base = new Float32Array(ranks.length * 4);
            ranks.forEach((r, i) => { shape[i * 4 + 3] = r; base[i * 4] = x0 + i; });
            g.setAttribute('aFolShape', new THREE.InstancedBufferAttribute(shape, 4));
            g.setAttribute('aFolBase', new THREE.InstancedBufferAttribute(base, 4));
            g.instanceCount = ranks.length;
            g.boundingBox = new THREE.Box3(new THREE.Vector3(x0, 0, 0), new THREE.Vector3(x0 + 16, 1, 16));
            const m = new THREE.Mesh(g, material);
            m.name = 'foliage:grass'; m.onBeforeRender = hook; m.matrixAutoUpdate = false; m.updateMatrix();
            m.userData.rrFoliageChunk = { count: ranks.length, x0, z0: 0, x1: x0 + 16, z1: 16, y0: 0, y1: 1, layer: 0, key: x0 };
            group.add(m);
            B.add(scene, m, x0, 0, { name: 'aFolShape', component: 3 });
            return m;
        };
        chunk([0, 0.5, 1], 0); chunk([0.2, 0.4, 0.9, 0.95], 16);
        B.flush();
        const merged = group.children.find(m => m.userData.rrBatch);
        assert.ok(merged, 'one draw for the region');
        const shape = merged.geometry.attributes.aFolShape.array, base = merged.geometry.attributes.aFolBase.array;
        const ranks = []; for (let i = 0; i < 7; i++) ranks.push(shape[i * 4 + 3]);
        assert.deepEqual(ranks, [0, 0.2, 0.4, 0.5, 0.9, 0.95, 1].map(Math.fround), 'ascending across both chunks');
        assert.equal(base[4 * 1], 16, 'each instance\'s other attributes travel with it');
        assert.equal(merged.geometry.instanceCount, 7);
        assert.equal(merged.geometry.attributes.position, template.position, 'the template shared, not copied');
        assert.equal(merged.onBeforeRender, hook, 'thinned by the same hook');
        assert.deepEqual([merged.userData.rrFoliageChunk.x0, merged.userData.rrFoliageChunk.x1, merged.userData.rrFoliageChunk.count, merged.userData.rrFoliageChunk.key], [0, 32, 7, -1],
            'the region\'s footprint, and no chunk\'s key (an edit removing chunks by key passes it by)');
    } finally { forget(scene); }
});

test('a batch lets go of its arrays once uploaded, and every batch is made again when the context comes back', () => {
    const scene = sceneFor(wideMap([block(1, 1, 1), block(2, 20, 1)]));
    try {
        const listeners = {};
        const renderer = { domElement: { addEventListener(type, fn) { listeners[type] = fn; } } };
        B.flush(renderer);
        const merged = drawn(scene).find(m => m.userData.rrBatch);
        const position = merged.geometry.attributes.position;
        assert.equal(position.onUploadCallback, B._dropArray);
        position.onUploadCallback();
        assert.equal(position.array, null, 'the GPU\'s copy alone');
        assert.ok(scene._pieceMeshes[0].geometry.attributes.position.array, 'the chunks keep theirs');
        assert.equal(typeof listeners.webglcontextrestored, 'function', 'the canvas is watched');
        listeners.webglcontextrestored();
        B.flush(renderer);
        const again = drawn(scene).find(m => m.userData.rrBatch);
        assert.notEqual(again, merged, 'made again from the chunks before the next draw');
        assert.ok(again.geometry.attributes.position.array, 'with arrays to upload');
    } finally { forget(scene); }
});

test('the game and the editor bring the batches up to date before a frame\'s first pass', () => {
    const core = read('runtime/reactor_3d.js');
    assert.match(core, /Reactor3D\.prepareWorldFrame = function\(renderer, mapScene, scene, camera, shadows, scale\) \{\n[\s\S]{0,200}?Reactor3D\.DrawBatches\.flush\(renderer\);/);
    assert.match(read('editor/src/MapEditor3D.js'), /renderFrame\(scene\) \{\n[\s\S]{0,200}?Reactor3D\.DrawBatches\.flush\(this\.renderer\);/);
    assert.match(read('runtime/reactor_3d_world.js'), /if \(Reactor3D\.DrawBatches\) Reactor3D\.DrawBatches\.add\(this, mesh,/);
    assert.match(read('runtime/reactor_3d_foliage.js'), /batches\.add\(this, mesh, cx \* size, cy \* size, FOLIAGE_SORT\)/);
    assert.match(read('editor/src/utils/MeshBvh.js'), /mesh\.visible \|\| \(mesh\.userData && mesh\.userData\.rrBatchedIn\)/, 'a hidden batched chunk is still picked');
});

test('the light volume stays laid while the focus strays less than REGION_STEP tiles, and reuses its retired targets', () => {
    const L = R.LightVolume;
    const at = (x, z) => ({ origin: [x, -4, z], dims: [128, 64, 128] });
    assert.equal(L.near(at(10, 10), at(17, 3), 8), true);
    assert.equal(L.near(at(10, 10), at(18, 10), 8), false);
    assert.equal(L.near(at(10, 10), { origin: [10, 0, 10], dims: [128, 64, 128] }, 8), false, 'another height is another volume');
    assert.ok(L.REGION_STEP > 0);
    const saved = L._spare;
    try {
        L._spare = null;
        const first = L.makeVolume({ origin: [0, 0, 0], dims: [4, 2, 4] }, {});
        L.retire(first);
        const second = L.makeVolume({ origin: [8, 0, 0], dims: [4, 2, 4] }, {});
        assert.equal(second.static, first.static, 'the same targets, filled again layer by layer');
        assert.equal(L._spare, null);
        const other = L.makeVolume({ origin: [0, 0, 0], dims: [8, 2, 4] }, {});
        assert.notEqual(other.static, first.static, 'another size makes its own');
        L.dispose(other); L.dispose(second);
    } finally { L._spare = saved; }
    assert.match(read('runtime/reactor_3d_lighting.js'), /if \(laid && this\.REGION_STEP > 0 && this\.near\(laid, region, this\.REGION_STEP\)\) region = laid;/);
});

test('PIXI v8 asks every window each frame: a hidden one, and a closed one laid out closed, are passed over', () => {
    const core = runtimeSource('reactor_core.js');
    const head = 'Window.prototype.updateTransform = function';
    const start = core.indexOf(head), end = core.indexOf('\n};', start);
    const context = { Window: { SKIP_UNSEEN_LAYOUT: true }, PIXI: { TextureSource: {} } };
    const updateTransform = vm.runInNewContext('(function' + core.slice(start + head.length, end + 2) + ')', context);
    let laid = 0;
    const win = { visible: true, _openness: 255, _clipMask: null };
    for (const name of ['_updateClientArea', '_updateFrame', '_updateContentsBack', '_updateCursor', '_updateContents', '_updateArrows', '_updatePauseSign', '_updateFilterArea', '_localizeFilterArea']) win[name] = () => { if (name === '_updateClientArea') laid++; };
    updateTransform.call(win); assert.equal(laid, 1, 'open: laid out');
    win.visible = false; updateTransform.call(win); assert.equal(laid, 1, 'hidden: passed over');
    win.visible = true; win._openness = 0; updateTransform.call(win); assert.equal(laid, 2, 'closed: laid out once, closed');
    updateTransform.call(win); updateTransform.call(win); assert.equal(laid, 2, 'and then passed over');
    win._openness = 40; updateTransform.call(win); assert.equal(laid, 3, 'opening again: laid out every frame');
    context.Window.SKIP_UNSEEN_LAYOUT = false; win._openness = 0; updateTransform.call(win); updateTransform.call(win);
    assert.equal(laid, 5, 'the switch off lays out every window every frame');
});
