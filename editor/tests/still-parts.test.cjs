'use strict';
// A rigid model's parts that never move draw as one mesh per material in the view (runtime/reactor_3d_models.js,
// Reactor3D.StillParts): the same triangles where they were, from fewer draws, and the parts any rule moves keep
// their own draws.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const THREE = global.THREE;
const S = Reactor3D.StillParts;

const material = (options) => {
    const m = new THREE.MeshBasicMaterial(Object.assign({ map: new THREE.Texture() }, options || {}));
    m.__reactorModel = true;
    Reactor3D.litMaterial(m);
    return m;
};
const box = (w, h, d) => { const g = new THREE.BoxGeometry(w, h, d); g.clearGroups(); return g; };

/** A placed vehicle as the game builds one: meshes on a model root, an animation root, rules that name parts. */
function vehicle({ rules = [], extra } = {}) {
    const scene = new THREE.Scene(), group = new THREE.Group();
    group.name = 'character-models';
    scene.add(group);
    const object = new THREE.Group();
    const hull = material(), track = material({ alphaTest: 0.5 });
    const part = (name, geometry, mat, at, turn) => {
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.name = name;
        mesh.position.fromArray(at);
        if (turn) mesh.rotation.set(turn[0], turn[1], turn[2]);
        mesh.userData.parts = [{ name, pivot: at.slice() }];
        object.add(mesh);
        return mesh;
    };
    const parts = {
        hull: part('hull', box(4, 1, 2), hull, [0, 0.5, 0]),
        deck: part('deck', box(3, 0.2, 1.8), hull, [0.2, 1.1, 0], [0, 0.3, 0]),
        skirt: part('skirt', box(4, 0.4, 0.1), hull, [0, 0.3, 1.05], [0.1, 0, 0]),
        trackL: part('track_L', box(4, 0.5, 0.4), track, [0, 0.25, 1.2]),
        trackR: part('track_R', box(4, 0.5, 0.4), track, [0, 0.25, -1.2]),
        turret: part('Full-Turret', box(1.5, 0.6, 1.2), hull, [0, 1.5, 0]),
        wheel: part('wheel_01', (() => { const g = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12); g.clearGroups(); return g; })(), hull, [1.5, 0.3, 1.0], [Math.PI / 2, 0, 0])
    };
    if (extra) extra(object, part, { hull, track });
    // Shadows: what markCaster gives every placed model's meshes.
    object.traverse(node => { if (node.isMesh) { node.castShadow = true; node.layers.enable(Reactor3D.SHADOW_LAYER_STATIC); } });
    const binding = Reactor3D.prepareModelInstance(object, []);
    object.position.set(5.5, 0, 7.5);
    object.rotation.y = 0.8;
    object.scale.setScalar(0.5);
    group.add(object);
    const holder = { object, binding, character: {}, rules: Reactor3D.readModelAnimationRules({ animations: rules }) };
    const mapScene = { _modelInstances: new Map([['e1', holder]]) };
    return { scene, group, object, binding, holder, mapScene, parts, hull, track };
}

const TURRET_RULE = { name: 'Turn-Turret-Right', part: 'Full-Turret', type: 'pose', trigger: 'action', rotate: [0, -90, 0], move: [0, 0, 0], resize: [1, 1, 1], period: 45, hold: true };
const WHEEL_RULE = { name: 'roll', part: 'wheel', type: 'spin', trigger: 'moving', axis: 'z', speed: 6 };

function settle(v, times) {
    for (let i = 0; i < (times || S.SETTLE + 1); i++) S.update(v.mapScene);
    v.scene.updateMatrixWorld();
}
const merged = v => v.group.children.filter(child => child.userData.rrStillParts);
/** Meshes the view (layer 0) draws in the model's tree and beside it. */
const viewDraws = v => {
    let n = 0;
    v.group.traverseVisible(node => { if (node.isMesh && (node.layers.mask & 1)) n++; });
    return n;
};
/** Every triangle the view draws, in world space, as sorted text. */
const viewTriangles = v => {
    v.scene.updateMatrixWorld();
    const out = [], p = new THREE.Vector3();
    v.group.traverseVisible(node => {
        if (!node.isMesh || !(node.layers.mask & 1)) return;
        const g = node.geometry, index = g.index, pos = g.attributes.position;
        const count = index ? index.count : pos.count;
        for (let i = 0; i < count; i += 3) {
            const tri = [];
            for (let c = 0; c < 3; c++) {
                p.fromBufferAttribute(pos, index ? index.getX(i + c) : i + c).applyMatrix4(node.matrixWorld);
                tri.push([p.x, p.y, p.z].map(x => (Math.round(x * 1e4) / 1e4 + 0).toFixed(4)).join(','));
            }
            // A triangle's winding as it faces: rotate so the smallest vertex leads, keep the order.
            const lead = tri.indexOf([...tri].sort()[0]);
            out.push(node.material.id + ':' + [tri[lead], tri[(lead + 1) % 3], tri[(lead + 2) % 3]].join(' '));
        }
    });
    return out.sort();
};

test.beforeEach(() => { S.enabled = true; S.releaseAll(); S.SETTLE = 2; });
test.after(() => { S.releaseAll(); S.SETTLE = 30; });

test('the still parts merge per material, the parts rules move keep their draws, and the picture is the same', () => {
    const v = vehicle({ rules: [TURRET_RULE, WHEEL_RULE] });
    const before = viewTriangles(v);
    assert.equal(viewDraws(v), 7);
    S.update(v.mapScene);
    assert.equal(merged(v).length, 0, 'not before the model has stood SETTLE updates');
    settle(v);
    const meshes = merged(v);
    assert.equal(meshes.length, 2, 'one for the hull material (hull, deck, skirt), one for the tracks');
    assert.equal(viewDraws(v), 4, 'two merged, the turret and the wheel: 7 draws become 4');
    assert.equal(v.parts.turret.layers.mask & 1, 1, 'a part a rule turns keeps its own draw');
    assert.equal(v.parts.wheel.layers.mask & 1, 1, 'a wheel keeps its own draw');
    for (const name of ['hull', 'deck', 'skirt', 'trackL', 'trackR']) assert.equal(v.parts[name].layers.mask & 1, 0, name + ' leaves the view to its merged mesh');
    assert.deepEqual(viewTriangles(v), before, 'every triangle where it was, wound as it was, in the same material');
    for (const mesh of meshes) {
        assert.equal(mesh.layers.mask, 1, 'on the view layer alone: shadows draw the parts as before');
        assert.equal(mesh.castShadow, false);
        assert.notEqual(mesh.parent, v.object, 'beside the model, outside its tree');
        assert.equal(mesh.parent, v.object.parent);
    }
    // The parts are still the model's, casting as they did.
    for (const name of ['hull', 'trackL']) {
        assert.equal(v.parts[name].parent, v.binding.root);
        assert.ok(v.parts[name].layers.mask & (1 << Reactor3D.SHADOW_LAYER_STATIC), 'its shadow layer kept');
    }
    let found = 0;
    v.object.traverse(node => { if (node.userData.rrStillParts) found++; });
    assert.equal(found, 0, 'code that walks the model never meets a merged mesh');
});

test('merged geometry keeps uvs, normals through the normal matrix, and turns a mirrored part over', () => {
    const a = box(1, 2, 3), b = box(1, 1, 1);
    const ma = new THREE.Matrix4().compose(new THREE.Vector3(1, 2, 3), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.7, -0.2)), new THREE.Vector3(1, 2.5, 0.5));
    const mb = new THREE.Matrix4().makeScale(-1, 1, 1);
    const g = S.merge([{ geometry: a, matrix: ma }, { geometry: b, matrix: mb }]);
    assert.equal(g.attributes.position.count, a.attributes.position.count + b.attributes.position.count);
    assert.equal(g.index.count, a.index.count + b.index.count);
    assert.deepEqual(Object.keys(g.attributes).sort(), Object.keys(a.attributes).sort());
    assert.equal(g.groups.length, 0);
    const n = a.attributes.position.count, nm = new THREE.Matrix3().getNormalMatrix(ma);
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    // Vertices come in the order the triangles first use them: compared through the index, corner by corner.
    for (let k = 0; k < a.index.count; k++) {
        const i = a.index.getX(k), o = g.index.getX(k);
        assert.ok(o < n, 'the first part\'s corners are its own vertices');
        p.fromBufferAttribute(a.attributes.position, i).applyMatrix4(ma);
        q.fromBufferAttribute(g.attributes.position, o);
        assert.ok(p.distanceTo(q) < 1e-5, 'position ' + k);
        assert.equal(g.attributes.uv.getX(o), a.attributes.uv.getX(i));
        assert.equal(g.attributes.uv.getY(o), a.attributes.uv.getY(i));
        p.fromBufferAttribute(a.attributes.normal, i).applyMatrix3(nm);
        q.fromBufferAttribute(g.attributes.normal, o);
        assert.ok(p.distanceTo(q) < 1e-5, 'normal ' + k + ', not renormalized');
    }
    // The mirrored box: each triangle's order turned, so it faces the way the mirrored draw faced.
    const corner = k => new THREE.Vector3().fromBufferAttribute(g.attributes.position, g.index.getX(k));
    const source = k => new THREE.Vector3().fromBufferAttribute(b.attributes.position, b.index.getX(k)).applyMatrix4(mb);
    for (let t = 0; t < b.index.count; t += 3) {
        const at = a.index.count + t;
        assert.ok(corner(at).distanceTo(source(t)) < 1e-6);
        assert.ok(corner(at + 1).distanceTo(source(t + 2)) < 1e-6);
        assert.ok(corner(at + 2).distanceTo(source(t + 1)) < 1e-6);
    }
});

test('a carved piece brings only the vertices it uses', () => {
    const whole = box(1, 1, 1), piece = new THREE.BufferGeometry();
    for (const name of Object.keys(whole.attributes)) piece.setAttribute(name, whole.attributes[name]);
    piece.setIndex(new THREE.BufferAttribute(new Uint16Array(Array.from(whole.index.array).slice(0, 6)), 1));
    const g = S.merge([{ geometry: piece, matrix: new THREE.Matrix4() }, { geometry: piece, matrix: new THREE.Matrix4().makeTranslation(2, 0, 0) }]);
    assert.equal(g.attributes.position.count, 8, 'four vertices a piece, not the whole box twice');
    assert.equal(g.index.count, 12);
});

test('the merged mesh stands at the model root and shows only while the model does', () => {
    const v = vehicle({ rules: [TURRET_RULE] });
    settle(v);
    const mesh = merged(v)[0];
    v.scene.updateMatrixWorld();
    assert.ok(mesh.matrixWorld.equals(v.binding.root.matrixWorld), 'placed at the animation root');
    v.object.position.x += 3;
    v.binding.root.rotation.y = 0.5;   // a whole-model rule turns the animation root
    v.scene.updateMatrixWorld();
    const e = mesh.matrixWorld.elements, f = v.binding.root.matrixWorld.elements;
    for (let i = 0; i < 16; i++) assert.ok(Math.abs(e[i] - f[i]) < 1e-12, 'follows the root in the same walk');
    v.object.visible = false;
    assert.equal(mesh.visible, false, 'a reflection that hides the model hides its merged mesh');
    v.object.visible = true;
    assert.equal(mesh.visible, true);
    mesh.visible = false;   // a pass hides it for a draw…
    assert.equal(mesh.visible, false);
    S.update(v.mapScene);   // …and the next update shows it again with its model
    assert.equal(mesh.visible, true);
    assert.equal(Reactor3D.GeometryDetail.eligible(mesh), false, 'it takes no distance levels of its own');
});

test('the merged mesh follows its model when the model alone is walked, as the frames between updates do', () => {
    // FramePacing.swapPoses blends a moving model's place between two updates and walks only that model's matrices.
    // The merged mesh sits beside the model in its group: it stood at the update's place, and a ridden motorcycle's
    // frame showed in steps while its wheels and rider moved on (an echo on a fast screen).
    const v = vehicle({ rules: [WHEEL_RULE] });
    settle(v);
    const mesh = merged(v)[0];
    assert.ok(mesh, 'merged');
    v.object.position.x += 0.04;
    v.object.updateMatrixWorld(true);
    const e = mesh.matrixWorld.elements, f = v.binding.root.matrixWorld.elements;
    for (let i = 0; i < 16; i++) assert.ok(Math.abs(e[i] - f[i]) < 1e-12, 'placed with the model it stands for');
    // Released, the model's walk still runs and places nothing.
    S.release(v.holder.rrStillParts);
    assert.doesNotThrow(() => v.object.updateMatrixWorld(true));
});

test('a part that moves outside every rule draws itself from then on', () => {
    const v = vehicle({ rules: [TURRET_RULE] });
    settle(v);
    assert.equal(merged(v).length, 2);
    v.parts.deck.rotation.y += 0.1;   // something no rule names turns the deck
    S.update(v.mapScene);
    assert.equal(merged(v).length, 0, 'the merged meshes go before the frame draws');
    assert.ok(Object.values(v.parts).every(part => part.layers.mask & 1), 'every part draws itself');
    settle(v);
    assert.equal(v.parts.deck.layers.mask & 1, 1, 'the deck keeps its own draw');
    assert.equal(merged(v).length, 2, 'the rest merge again');
    assert.equal(viewDraws(v), 4, 'hull, skirt and wheel, the tracks, the deck, the turret');
});

test('a material swapped on a part (a flash, a variant) is followed', () => {
    const v = vehicle({ rules: [TURRET_RULE] });
    settle(v);
    const own = material();
    for (const name of ['hull', 'deck', 'skirt', 'turret', 'wheel']) v.parts[name].material = own;   // ownModelMaterials
    S.update(v.mapScene);
    assert.ok(v.parts.hull.layers.mask & 1, 'drawn by the parts while the swap settles');
    settle(v);
    const meshes = merged(v);
    assert.ok(meshes.some(mesh => mesh.material === own), 'merged again with the instance\'s own material');
    assert.equal(v.parts.hull.layers.mask & 1, 0);
    // A material made see-through (a fade) is drawn by the parts: they sort by distance one by one.
    own.transparent = true;
    S.update(v.mapScene);
    assert.ok(v.parts.hull.layers.mask & 1);
    assert.ok(!merged(v).some(mesh => mesh.material === own));
});

test('a rule added later (a placement\'s own animation) takes its part back', () => {
    const v = vehicle({ rules: [TURRET_RULE] });
    settle(v);
    assert.equal(v.parts.skirt.layers.mask & 1, 0);
    v.holder.rules = v.holder.rules.concat(Reactor3D.readModelAnimationRules({ animations: [{ name: 'flap', part: 'skirt', type: 'swing', trigger: 'always', axis: 'x', degrees: 10, period: 30 }] }));
    S.update(v.mapScene);
    assert.equal(v.parts.skirt.layers.mask & 1, 1);
    settle(v);
    assert.equal(v.parts.skirt.layers.mask & 1, 1, 'still its own draw');
    assert.equal(v.parts.hull.layers.mask & 1, 0, 'the others merged again');
});

test('instances of one model share their merged geometry, and the last one out frees it', () => {
    const a = vehicle({ rules: [TURRET_RULE] }), b = vehicle({ rules: [TURRET_RULE] });
    // The second instance draws from the first's buffers, as clones of one template do.
    const names = ['hull', 'deck', 'skirt', 'trackL', 'trackR', 'turret', 'wheel'];
    for (const name of names) b.parts[name].geometry = a.parts[name].geometry;
    for (let i = 0; i < S.SETTLE + 1; i++) { S.update(a.mapScene); S.update(b.mapScene); }
    const ga = merged(a).map(m => m.geometry), gb = merged(b).map(m => m.geometry);
    assert.equal(ga.length, 2);
    assert.deepEqual(ga, gb, 'the same geometries');
    let disposed = 0;
    for (const g of ga) g.addEventListener('dispose', () => disposed++);
    Reactor3D.releaseModelHolder(a.holder);
    assert.equal(disposed, 0, 'still drawn by the other');
    assert.ok(a.parts.hull.layers.mask & 1, 'the released model\'s parts draw themselves');
    Reactor3D.releaseModelHolder(b.holder);
    assert.equal(disposed, 2);
    assert.equal(S._shared.size, 0);
});

test('the kill switch gives every part its draw back at the next update', () => {
    const v = vehicle({ rules: [TURRET_RULE] });
    const before = viewTriangles(v);
    settle(v);
    assert.equal(viewDraws(v), 3, 'no wheel rule here: the wheel merges with the hull');
    S.enabled = false;
    S.update(v.mapScene);
    assert.equal(merged(v).length, 0);
    assert.equal(viewDraws(v), 7);
    assert.deepEqual(viewTriangles(v), before);
    assert.equal(S._records.size, 0);
});

test('left alone: skinned models, see-through parts, and parts hidden by name', () => {
    const v = vehicle({ rules: [TURRET_RULE], extra(object, part, mats) {
        part('glass', box(1, 1, 0.1), material({ transparent: true, opacity: 0.5, depthWrite: false }), [0, 2, 0]);
        part('glass2', box(1, 1, 0.1), material({ transparent: true, opacity: 0.5, depthWrite: false }), [0, 2, 1]);
        part('Controls panel', box(0.3, 0.3, 0.1), mats.hull, [1, 1.3, 0]);
    } });
    settle(v);
    const glass = v.binding.root.children.filter(c => /^glass/.test(c.name));
    assert.ok(glass.every(g => g.layers.mask & 1), 'see-through parts sort on their own');
    assert.ok(v.binding.root.children.find(c => c.name === 'Controls panel').layers.mask & 1, 'FarParts switches it by name');

    const w = vehicle({ rules: [], extra(object) {
        const bone = new THREE.Bone(), skin = new THREE.SkinnedMesh(box(1, 1, 1), material());
        object.add(bone); object.add(skin); skin.bind(new THREE.Skeleton([bone]));
    } });
    settle(w);
    assert.equal(merged(w).length, 0, 'a skinned model is LayeredParts\' and CasterMerge\'s');
    assert.ok(w.parts.hull.layers.mask & 1);
});

test('a model that leaves its scene without being released lets its meshes go', () => {
    const v = vehicle({ rules: [TURRET_RULE] });
    settle(v);
    assert.equal(merged(v).length, 2);
    v.group.remove(v.object);
    S.update({ _modelInstances: new Map() });
    assert.equal(merged(v).length, 0);
    assert.equal(S._records.size, 0);
});

test('a model carried to another group takes its merged meshes with it', () => {
    const v = vehicle({ rules: [TURRET_RULE] });
    settle(v);
    const other = new THREE.Group();
    v.scene.add(other);
    other.add(v.object);
    const meshes = merged(v);
    assert.ok(meshes.every(mesh => mesh.visible === false), 'hidden the moment the model is elsewhere');
    S.update(v.mapScene);
    assert.ok(meshes.every(mesh => mesh.parent === other && mesh.visible));
});

test('the game\'s sync runs it after the models are placed', () => {
    const calls = [];
    const update = S.update;
    S.update = function(scene) { calls.push(scene); };
    try {
        const scene = Object.create(Reactor3D.MapScene.prototype);
        scene._scene = new THREE.Scene();
        scene._materials = [];
        scene.syncCharacterModels([]);
        assert.deepEqual(calls, [scene]);
    } finally { S.update = update; }
});
