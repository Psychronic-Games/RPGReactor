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

// Parts at rest (StillParts.atRest): the parts a rule can move, merged while they stand still.
// Off in the game until it has been seen in a battle and the editor (runtime 20261111.5); switched on here to test it.
test('the merge of parts at rest is off until it is switched on', () => { assert.equal(S.atRest, false); S.atRest = true; });
/** Every triangle of the model's own parts, in world space, whatever layer they are on: what the view must show. */
const partTriangles = v => {
    v.scene.updateMatrixWorld();
    const out = [], p = new THREE.Vector3();
    v.object.traverse(node => {
        if (!node.isMesh) return;
        const g = node.geometry, index = g.index, pos = g.attributes.position;
        for (let i = 0; i < index.count; i += 3) {
            const tri = [];
            for (let c = 0; c < 3; c++) {
                p.fromBufferAttribute(pos, index.getX(i + c)).applyMatrix4(node.matrixWorld);
                tri.push([p.x, p.y, p.z].map(x => (Math.round(x * 1e4) / 1e4 + 0).toFixed(4)).join(','));
            }
            const lead = tri.indexOf([...tri].sort()[0]);
            out.push(node.material.id + ':' + [tri[lead], tri[(lead + 1) % 3], tri[(lead + 2) % 3]].join(' '));
        }
    });
    return out.sort();
};
const shownMerged = v => merged(v).filter(mesh => mesh.visible);
const restGroups = v => v.holder.rrStillParts.groups.filter(group => group.resting);

test('the parts a rule can move merge while they stand, and draw themselves from the update one moves', () => {
    const v = vehicle({ rules: [TURRET_RULE, WHEEL_RULE] });
    const before = viewTriangles(v);
    settle(v, S.SETTLE * 4);
    assert.equal(restGroups(v).length, 1, 'the turret and the wheel share the hull material: one group at rest');
    assert.equal(shownMerged(v).length, 3, 'hull, tracks, and the parts at rest');
    assert.equal(viewDraws(v), 3, '7 draws become 3');
    assert.deepEqual(viewTriangles(v), before, 'every triangle where it was');
    for (const name of ['turret', 'wheel']) {
        assert.equal(v.parts[name].layers.mask & 1, 0, name + ' leaves the view to the merged mesh');
        assert.ok(v.parts[name].layers.mask & (1 << Reactor3D.SHADOW_LAYER_STATIC), name + ' keeps its shadow layer');
        assert.equal(v.parts[name].parent, v.binding.root, name + ' stays in the model');
    }
    const rest = restGroups(v)[0];
    assert.equal(rest.mesh.layers.mask, 1);
    assert.equal(rest.mesh.castShadow, false);
    assert.equal(rest.mesh.parent, v.object.parent, 'beside the model');
    assert.ok(rest.mesh.matrixWorld.equals(v.binding.root.matrixWorld), 'at the animation root');

    // The rule turns the turret: the same update, both parts draw themselves; the still groups are not touched.
    const stillMeshes = shownMerged(v).filter(mesh => mesh !== rest.mesh), geometry = rest.mesh.geometry;
    v.parts.turret.rotation.y = -0.4;
    S.update(v.mapScene);
    assert.equal(rest.mesh.visible, false, 'hidden before the frame draws');
    assert.equal(v.parts.turret.layers.mask & 1, 1);
    assert.equal(v.parts.wheel.layers.mask & 1, 1);
    assert.deepEqual(shownMerged(v), stillMeshes, 'the hull and the tracks stay merged');
    assert.equal(v.parts.hull.layers.mask & 1, 0);
    assert.deepEqual(viewTriangles(v), partTriangles(v), 'the turret shows where the rule put it');
    assert.equal(v.holder.rrStillParts.volatile.size, 0, 'a rule\'s part is not marked as one that moves by itself');
    // Still turning: nothing is merged between two different poses.
    for (let i = 0; i < S.SETTLE * 4; i++) { v.parts.turret.rotation.y -= 0.01; S.update(v.mapScene); assert.equal(rest.mesh.visible, false); }

    // Back where it was merged: shown again after SETTLE updates, the same geometry, nothing copied.
    v.parts.turret.rotation.y = 0;
    S.update(v.mapScene);
    assert.equal(rest.mesh.visible, false, 'not the update it arrives: the frames between show it arriving');
    settle(v, S.SETTLE);
    assert.equal(rest.mesh.visible, true);
    assert.equal(rest.mesh.geometry, geometry);
    assert.equal(rest.bakes, 1);
    assert.deepEqual(viewTriangles(v), before);

    // Come to rest somewhere new: merged there, after a longer wait.
    v.parts.turret.rotation.y = 0.7;
    S.update(v.mapScene);
    settle(v, S.SETTLE);
    assert.equal(rest.mesh.visible, false, 'a new place waits a SETTLE longer for each merge made');
    settle(v, S.SETTLE * 2);
    assert.equal(rest.mesh.visible, true);
    assert.notEqual(rest.mesh.geometry, geometry);
    assert.equal(rest.bakes, 2);
    assert.equal(viewDraws(v), 3);
    assert.deepEqual(viewTriangles(v), partTriangles(v), 'merged where the turret now stands');
});

test('a group at rest whose part changes in any other way is let go, and the switch gives the parts their draws', () => {
    const v = vehicle({ rules: [TURRET_RULE, WHEEL_RULE] });
    settle(v, S.SETTLE * 4);
    const rest = restGroups(v)[0];
    assert.equal(rest.mesh.visible, true);
    S.atRest = false;
    try {
        S.update(v.mapScene);
        assert.equal(rest.mesh.visible, false);
        assert.equal(v.parts.turret.layers.mask & 1, 1);
        assert.equal(v.parts.hull.layers.mask & 1, 0, 'the parts no rule moves stay merged');
        assert.deepEqual(viewTriangles(v), partTriangles(v));
    } finally { S.atRest = true; }
    S.update(v.mapScene);
    assert.equal(rest.mesh.visible, true, 'on again: shown where it was merged');
    assert.equal(S.stats().resting, 1);

    // A part hidden (an effect, a variant): the group is gone at once, the other part draws itself.
    v.parts.wheel.visible = false;
    S.update(v.mapScene);
    assert.equal(restGroups(v).length, 0);
    assert.equal(rest.mesh.parent, null);
    assert.equal(v.parts.turret.layers.mask & 1, 1);
    assert.equal(v.parts.wheel.layers.mask & 1, 1);
    assert.equal(v.parts.hull.layers.mask & 1, 0, 'the still groups are not made again for it');
    assert.equal(v.holder.rrStillParts.builds, 1);

    // The whole model's switch still returns every draw.
    const w = vehicle({ rules: [TURRET_RULE, WHEEL_RULE] });
    settle(w, S.SETTLE * 4);
    assert.equal(viewDraws(w), 3);
    S.enabled = false;
    S.update(w.mapScene);
    assert.equal(viewDraws(w), 7);
    assert.equal(merged(w).length, 0);
});

test('a material made see-through on parts at rest (a fade) is drawn by the parts', () => {
    const v = vehicle({ rules: [TURRET_RULE, WHEEL_RULE] });
    const own = material();
    v.parts.turret.material = own; v.parts.wheel.material = own;
    settle(v, S.SETTLE * 4);
    const rest = restGroups(v)[0];
    assert.equal(rest.material, own);
    assert.equal(rest.mesh.visible, true);
    own.transparent = true;
    S.update(v.mapScene);
    assert.equal(restGroups(v).length, 0);
    assert.equal(v.parts.turret.layers.mask & 1, 1);
    assert.equal(v.parts.wheel.layers.mask & 1, 1);
});
// --- Parts by colour: plain-coloured materials that differ in colour alone draw as one mesh with a colour a vertex ---

/** A motorcycle as the Demo's: parts of plain paints, some sharing one, a wheel a rule turns. */
function bike({ paints } = {}) {
    const plain = (hex, options) => { const m = new THREE.MeshBasicMaterial(Object.assign({ color: hex }, options || {})); m.__reactorModel = true; m.userData.baseColor = m.color.clone(); Reactor3D.litMaterial(m); return m; };
    const mats = paints || { red: plain(0xcc2211), black: plain(0x111111), chrome: plain(0xdddddd), glass: plain(0x88aacc, { transparent: true, opacity: 0.5, depthWrite: false }) };
    const v = vehicle({ rules: [WHEEL_RULE], extra(object, part) {
        part('tank', box(1, 0.5, 0.6), mats.red, [0, 2.2, 0]);
        part('fender', box(0.8, 0.2, 0.5), mats.red, [1, 2.0, 0], [0, 0.4, 0]);
        part('seat', box(0.9, 0.2, 0.5), mats.black, [-0.6, 2.3, 0]);
        part('pipe', box(1.4, 0.1, 0.1), mats.chrome, [0, 1.9, 0.4]);
        part('screen', box(0.1, 0.5, 0.6), mats.glass, [0.8, 2.6, 0]);
    } });
    v.mats = mats; v.plain = plain;
    v.named = name => { let out = null; v.object.traverse(node => { if (node.name === name) out = node; }); return out; };
    return v;
}
const colourGroups = v => v.holder.rrStillParts.groups.filter(group => group.colour);
/** Updates with the view's draw of each group by colour between them, as the game's frames give. */
function settleDrawn(v, times) {
    for (let i = 0; i < (times || S.SETTLE * 3 + S.WARM + 4); i++) {
        S.update(v.mapScene);
        for (const mesh of merged(v)) if (mesh.onAfterRender !== THREE.Object3D.prototype.onAfterRender) mesh.onAfterRender();
    }
    v.scene.updateMatrixWorld();
}

test('by colour: plain paints that differ in colour alone draw as one mesh, each vertex its part\'s colour', () => {
    const was = S.byColour;
    try {
        S.byColour = true;
        const v = bike();
        const tank = v.named('tank'), fender = v.named('fender'), seat = v.named('seat'), pipe = v.named('pipe'), screen = v.named('screen');
        const before = viewDraws(v);
        settleDrawn(v);
        const groups = colourGroups(v);
        assert.equal(groups.length, 1, 'one group for the three paints');
        const group = groups[0];
        assert.equal(group.parts.length, 4, 'tank, fender, seat, pipe');
        assert.equal(group.warming, false, 'drawn by the view: its parts have left it');
        for (const part of [tank, fender, seat, pipe]) {
            assert.equal(part.layers.mask & 1, 0, part.name + ' is off the view\'s layer');
            assert.ok(part.layers.mask & (1 << Reactor3D.SHADOW_LAYER_STATIC), part.name + ' still casts');
            { let inTree = false; for (let n = part.parent; n; n = n.parent) if (n === v.object) inTree = true; assert.ok(inTree, part.name + ' stays in the model\'s tree'); }
        }
        assert.equal(screen.layers.mask & 1, 1, 'a see-through part keeps its own draw');
        assert.equal(viewDraws(v), before - 3 - 3 - 1, 'the paints\' four parts in one draw; the hull\'s four and the tracks\' two each in one, as before');
        const mesh = group.mesh, material = mesh.material;
        assert.equal(mesh.layers.mask, 1, 'on the view\'s layer alone');
        assert.equal(mesh.castShadow, false);
        assert.ok(material !== v.mats.red, 'a material of its own');
        assert.equal(material.vertexColors, true);
        assert.deepEqual([material.color.r, material.color.g, material.color.b], [1, 1, 1]);
        assert.equal(material.customProgramCacheKey(), v.mats.red.customProgramCacheKey(), 'the program its sources run, but for the vertex colours');
        // Each part's vertices carry its material's colour, in the order the parts were merged.
        const colour = mesh.geometry.attributes.color;
        assert.equal(colour.itemSize, 3);
        let at = 0;
        for (const part of group.parts) {
            const n = part.geometry.attributes.position.count, c = part.material.color;
            for (const v of [at, at + n - 1]) assert.deepEqual([colour.getX(v), colour.getY(v), colour.getZ(v)], [Math.fround(c.r), Math.fround(c.g), Math.fround(c.b)]);
            at += n;
        }
        assert.equal(at, colour.count);
        assert.equal(S.stats().colour, 1);
    } finally { S.byColour = was; }
});

test('by colour: the parts stay in the view until the view has drawn the group, then leave it', () => {
    const was = S.byColour;
    try {
        S.byColour = true;
        const v = bike(), tank = v.named('tank');
        settle(v, S.SETTLE * 3 + 4);
        const group = colourGroups(v)[0];
        assert.ok(group && group.mesh.parent, 'the group is made and in the scene');
        assert.equal(group.warming, true, 'not drawn yet');
        assert.equal(tank.layers.mask & 1, 1, 'its parts still draw');
        assert.equal(S.stats().colour, 0, 'and it is not counted as a saving');
        settleDrawn(v, S.WARM + 1);
        assert.equal(group.warming, false);
        assert.equal(tank.layers.mask & 1, 0);
    } finally { S.byColour = was; }
});

test('by colour: a material written through any road lets the group go that same update', () => {
    const was = S.byColour;
    try {
        S.byColour = true;
        const writers = {
            'a flash on its colour': v => { v.mats.black.color.setRGB(1, 1, 1); Reactor3D.touchMaterial(v.mats.black); },
            'its colour alone, unstamped': v => { v.mats.black.color.setRGB(0.3, 0.3, 0.3); },
            'a stamp alone': v => { Reactor3D.touchMaterial(v.mats.chrome); },
            'a blend colour': v => { v.mats.red.userData.rrBlend = { value: { x: 1, y: 1, z: 1, w: 0.7 } }; },
            'a blend holder changed in place': v => { (v.mats.red.userData.rrBlend || (v.mats.red.userData.rrBlend = { value: { x: 0, y: 0, z: 0, w: 0 } })).value.w = 0.5; },
            'a dissolve': v => { v.mats.red.userData.rrDissolve = { value: 0.4 }; },
            'a cutaway mark': v => { Reactor3D.cutawayMarkMaterials(v.object); },
            'a battle\'s stump': v => { v.mats.chrome.userData.rrFightStump = { value: 1.5 }; },
            'a shine': v => { Reactor3D.setMaterialShine(v.mats.chrome, { reflect: 0.8, gloss: 0.9, metal: 1, tint: '#ffffff', texture: 0 }, true); },
            'an opacity': v => { v.mats.red.opacity = 0.5; v.mats.red.transparent = true; },
            'hidden': v => { v.mats.red.visible = false; },
            'a recompile': v => { v.mats.red.needsUpdate = true; },
            'a material swapped on a part': v => { v.named('seat').material = v.plain(0x222222); },
            'the copy itself written to': v => { colourGroups(v)[0].mesh.material.color.setRGB(1, 0, 0); }
        };
        for (const name of Object.keys(writers)) {
            S.releaseAll();
            const v = bike();
            settleDrawn(v);
            assert.equal(colourGroups(v).length, 1, name + ': merged first');
            writers[name](v);
            S.update(v.mapScene);
            assert.equal(colourGroups(v).length, 0, name + ': the group is gone at the next update');
            assert.equal(merged(v).length, 0, name + ': no merged mesh left in the scene');
            for (const part of ['tank', 'fender', 'seat', 'pipe']) assert.equal(v.named(part).layers.mask & 1, 1, name + ': ' + part + ' draws itself');
        }
    } finally { S.byColour = was; }
});

test('by colour: made again only once the materials have stood unchanged for SETTLE updates, with the new colours', () => {
    const was = S.byColour;
    try {
        S.byColour = true;
        const v = bike();
        settleDrawn(v);
        const builds = v.holder.rrStillParts.builds;
        // A flash: the colour changes every update for a while.
        for (let i = 0; i < S.SETTLE * 6; i++) {
            v.mats.black.color.setRGB(0.1 + i * 0.01, 0.1, 0.1); Reactor3D.touchMaterial(v.mats.black);
            S.update(v.mapScene);
            assert.equal(colourGroups(v).length, 0, 'no group by colour while a material changes (update ' + i + ')');
            if (i < S.SETTLE * 4) assert.equal(merged(v).length, 0, 'and nothing at all at first (update ' + i + ')');
        }
        // A model whose materials never rest is grouped by its own materials meanwhile, as it was before.
        assert.ok(merged(v).length > 0 && merged(v).every(mesh => v.holder.rrStillParts.groups.some(group => group.material === mesh.material)), 'its parts\' own materials, shared');
        assert.ok(v.holder.rrStillParts.builds <= builds + 1, 'a flash is not counted against the model');
        v.mats.black.color.setRGB(0.5, 0.25, 0.125); Reactor3D.touchMaterial(v.mats.black);
        for (let i = 0; i < S.SETTLE - 1; i++) { S.update(v.mapScene); assert.equal(colourGroups(v).length, 0, 'not before SETTLE updates unchanged'); }
        settleDrawn(v, S.SETTLE + S.WARM + 3);
        const group = colourGroups(v)[0];
        assert.ok(group && !group.warming, 'merged again');
        const seat = group.parts.findIndex(part => part.mesh.name === 'seat');
        let at = 0;
        for (let i = 0; i < seat; i++) at += group.parts[i].geometry.attributes.position.count;
        const colour = group.mesh.geometry.attributes.color;
        assert.deepEqual([colour.getX(at), colour.getY(at), colour.getZ(at)], [0.5, 0.25, 0.125], 'the seat\'s vertices carry its colour as it is now');
    } finally { S.byColour = was; }
});

test('by colour: left to their own material are pictures, blends, a different flag, a different shine, an unlit material', () => {
    const was = S.byColour;
    try {
        S.byColour = true;
        const v0 = bike();
        const key = S.colourKey(v0.mats.red);
        assert.ok(key, 'a plain lit paint has a key');
        assert.equal(S.colourKey(v0.mats.black), key, 'another colour, the same key');
        assert.equal(S.colourKey(v0.mats.glass), null, 'see-through');
        const withMap = v0.plain(0xffffff, { map: new THREE.Texture() });
        assert.equal(S.colourKey(withMap), null, 'a picture');
        const blended = v0.plain(0xffffff); blended.userData.rrBlend = { value: { x: 1, y: 0, z: 0, w: 0.3 } };
        assert.equal(S.colourKey(blended), null, 'a blend colour over it');
        const normal = v0.plain(0xffffff); normal.userData.rrNormalMap = new THREE.Texture();
        assert.equal(S.colourKey(normal), null, 'a normal picture');
        const unlit = new THREE.MeshBasicMaterial({ color: 0x334455 }); unlit.__reactorModel = true;
        assert.equal(S.colourKey(unlit), null, 'not lit: the ambient is written into its colour');
        const standard = new THREE.MeshStandardMaterial({ color: 0x334455 }); standard.__reactorModel = true; Reactor3D.litMaterial(standard);
        assert.equal(S.colourKey(standard), null, 'another kind of material');
        const double = v0.plain(0xffffff, { side: THREE.DoubleSide });
        assert.notEqual(S.colourKey(double), key, 'two-sided');
        const body = v0.plain(0xffffff); body.userData.rrCutBody = { value: 1 };
        assert.notEqual(S.colourKey(body), key, 'a body\'s mark');
        const shiny = v0.plain(0xffffff); Reactor3D.setMaterialShine(shiny, { reflect: 0.8, gloss: 0.9, metal: 1, tint: '#ffffff', texture: 0 }, true);
        assert.ok(S.colourKey(shiny) && S.colourKey(shiny) !== key, 'a shine: a group of its own kind');
        const shinier = v0.plain(0x999999); Reactor3D.setMaterialShine(shinier, { reflect: 0.8, gloss: 0.5, metal: 1, tint: '#ffffff', texture: 0 }, true);
        assert.notEqual(S.colourKey(shinier), S.colourKey(shiny), 'another gloss');
        const marked = v0.plain(0xffffff); marked.__reactorGhost = true;
        assert.equal(S.colourKey(marked), null, 'a mark a copy would not carry');
        // Two shines apart: two groups, never one.
        const paints = { red: shiny, black: v0.plain(0x111111), chrome: (() => { const m = v0.plain(0x777777); Reactor3D.setMaterialShine(m, { reflect: 0.8, gloss: 0.9, metal: 1, tint: '#ffffff', texture: 0 }, true); return m; })(), glass: v0.plain(0x445566) };
        S.releaseAll();
        const v = bike({ paints });
        settleDrawn(v);
        const groups = colourGroups(v);
        assert.equal(groups.length, 2, 'the two shiny paints together, the two plain ones together');
        for (const group of groups) {
            const keys = new Set(group.sources.map(source => S.colourKey(source.material)));
            assert.equal(keys.size, 1);
            const shine = group.mesh.material.userData.rrShine, from = group.sources[0].material.userData.rrShine;
            if (from) { assert.ok(shine.vector.isVector4 && shine.vector.equals(from.vector)); assert.ok(shine.tint.isColor && shine.tint.equals(from.tint)); assert.ok(shine.vector !== from.vector); }
            else assert.ok(shine === undefined);
        }
    } finally { S.byColour = was; }
});

test('by colour: a part\'s own vertex colours are multiplied in, and the switch gives the parts back their own groups', () => {
    const was = S.byColour;
    try {
        S.byColour = true;
        const v0 = bike();
        const painted = v0.plain(0x808080, { vertexColors: true }), other = v0.plain(0x404040, { vertexColors: true });
        const coloured = (w, h, d, rgb) => { const g = box(w, h, d), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(rgb, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
        S.releaseAll();
        const v = vehicle({ extra(object, part) {
            part('a', coloured(1, 1, 1, [1, 0.5, 0.25]), painted, [0, 3, 0]);
            part('b', coloured(1, 1, 1, [0.5, 0.5, 0.5]), other, [2, 3, 0]);
        } });
        settleDrawn(v);
        const group = colourGroups(v)[0];
        assert.ok(group, 'merged');
        const colour = group.mesh.geometry.attributes.color, first = group.parts[0], c = first.material.color;
        const own = first.mesh.name === 'a' ? [1, 0.5, 0.25] : [0.5, 0.5, 0.5];
        assert.deepEqual([colour.getX(0), colour.getY(0), colour.getZ(0)], [Math.fround(c.r * own[0]), Math.fround(c.g * own[1]), Math.fround(c.b * own[2])]);
        // Off: grouped by their own material again (one part each here: their own draws).
        S.byColour = false;
        S.update(v.mapScene);
        assert.equal(colourGroups(v).length, 0, 'gone at the next update');
        settle(v, S.SETTLE * 2 + 2);
        assert.equal(colourGroups(v).length, 0);
        assert.equal(merged(v).length, 2, 'the hull\'s and the tracks\' groups, by their own material');
        assert.equal(S._colourMaterials.size > 0, true, 'the copy is kept while a model is merged');
        S.releaseAll();
        assert.equal(S._colourMaterials.size, 0, 'and let go with the last model');
    } finally { S.byColour = was; }
});
