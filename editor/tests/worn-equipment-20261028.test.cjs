'use strict';
// Worn equipment (runtime/reactor_3d_models.js › Reactor3D.Worn): an armor whose model (Database › Armors) is a Prop
// Builder wearable is put on the rigged humanoid that wears it. The Prop Builder writes where it is worn (model.json
// `wear`: the rig part and the reference body's joints, in the model's own coordinates); the game matches that part's
// line from joint to joint to the wearer's own, at rest, and the wearer's bone holds it from then on.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const forge = path.join(__dirname, '..', 'src', 'forge');
for (const name of ['HumanBody', 'HumanTargets', 'CharacterOutfit', 'CharacterAtlas', 'CharacterWardrobe', 'CharacterProps', 'CharacterSpecies', 'CharacterSkin', 'CharacterHair', 'CreatureBody', 'CharacterGlb', 'CharacterShading', 'CharacterDetail', 'CharacterModel']) require(path.join(forge, 'Character3D', name + '.js'));
const PropModel = require(path.join(forge, 'Props', 'PropModel.js'));
const Accessory = require(path.join(forge, 'Props', 'AccessoryProp.js'));
const R = require(path.join(root, 'runtime', 'reactor_3d.js'));
global.self = global; global.window = global;
require(path.join(root, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;

test.before(async () => { await Accessory.prepare(); });

test('the Prop Builder says where a wearable is worn; a pair spread out for show is worn by nobody', () => {
    const grappler = PropModel.sidecar(Accessory.build({ accessory: { id: 'grappler' }, pivot: 'attachment' }));
    assert.equal(grappler.wear.part, 'RightLowerArm');
    for (const joint of ['Hips', 'Chest', 'Head', 'RightLowerArm', 'RightHand', 'LeftUpperLeg']) assert.equal(grappler.wear.joints[joint].length, 3, joint);
    // Wherever its origin is put, the joints are in the saved model's own coordinates: the forearm's own length.
    const bottom = PropModel.sidecar(Accessory.build({ accessory: { id: 'grappler' }, pivot: 'bottom' }));
    const length = w => Math.hypot(...w.joints.RightHand.map((v, k) => v - w.joints.RightLowerArm[k]));
    assert.ok(Math.abs(length(grappler.wear) - length(bottom.wear)) < 1e-4);
    assert.equal(PropModel.sidecar(Accessory.build({ accessory: { id: 'backpack' }, pivot: 'attachment' })).wear.part, 'Chest');
    assert.equal(PropModel.sidecar(Accessory.build({ accessory: { id: 'hoops' }, pivot: 'bottom' })).wear, undefined);
});

/** A wearer: a model root (scaled as a placed model is) holding an armature (a file's centimetre scale) and its rig's bones, the right arm held out to the side. */
function wearer() {
    const object = new THREE.Group(), armature = new THREE.Group();
    object.scale.setScalar(1.7);
    armature.scale.setScalar(0.01);
    object.add(armature);
    const bone = (name, parent, at) => {
        const node = new THREE.Bone();
        node.name = 'mixamorig' + name;
        node.userData.__reactorRigBone = true;
        node.userData.parts = [{ name, pivot: [0, 0, 0] }];
        node.position.set(...at);
        parent.add(node);
        return node;
    };
    const hips = bone('Hips', armature, [0, 100, 0]), chest = bone('Chest', hips, [0, 30, 0]);
    const upper = bone('RightUpperArm', chest, [-18, 10, 0]), fore = bone('RightLowerArm', upper, [-28, 0, 0]), hand = bone('RightHand', fore, [-26, 0, 0]);
    return { object, fore, hand };
}

/** A worn prop as the loader leaves it: a mesh with two marked points at its forearm's joints, moved to stand centred. */
function prop(from, to, shift) {
    const template = new THREE.Group(), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from([...from, ...to, from[0], from[1] + 0.01, from[2]]), 3));
    geometry.setIndex([0, 1, 2]);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.position.set(...shift);
    template.add(mesh);
    template.userData.glbRecentre = shift;
    return { template, mesh, json: { wear: { part: 'RightLowerArm', joints: { RightLowerArm: from, RightHand: to } } } };
}

const worldOf = (mesh, index) => new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index).applyMatrix4(mesh.matrixWorld);

test('a worn prop lies along the wearer\'s own part, from joint to joint, and its bone carries it', () => {
    const w = wearer(), holder = { object: w.object, wornRest: R.Worn.rest(w.object) };
    assert.deepEqual(Object.keys(holder.wornRest.joints).sort(), ['Chest', 'Hips', 'RightHand', 'RightLowerArm', 'RightUpperArm']);
    // The prop's forearm points down and forward, 0.24 long, in its own coordinates; the loader moved it by `shift`.
    const p = prop([0, 0, 0], [-0.12, -0.13, 0.16], [0.1, 0.14, -0.11]);
    const worn = R.Worn.put(holder, p.template, p.json, { scale: 1 }, null);
    assert.ok(worn, 'put on');
    assert.equal(worn.parent, w.fore, 'the forearm\'s bone holds it');
    const mesh = worn.children[0];
    w.object.updateMatrixWorld(true);
    const elbow = w.fore.getWorldPosition(new THREE.Vector3()), wrist = w.hand.getWorldPosition(new THREE.Vector3());
    assert.ok(worldOf(mesh, 0).distanceTo(elbow) < 1e-4, 'its elbow on the wearer\'s elbow');
    assert.ok(worldOf(mesh, 1).distanceTo(wrist) < 1e-4, 'its wrist on the wearer\'s wrist');
    // The arm moves: the prop goes with it.
    w.fore.rotation.set(0, 0, 1.1);
    w.object.updateMatrixWorld(true);
    assert.ok(worldOf(mesh, 1).distanceTo(w.hand.getWorldPosition(new THREE.Vector3())) < 1e-4, 'and stays there through a motion');
    // The binding's scale is laid over the fit.
    const bigger = R.Worn.put(holder, p.template, p.json, { scale: 1.5 }, null);
    w.object.updateMatrixWorld(true);
    const reach = worldOf(bigger.children[0], 1).distanceTo(worldOf(bigger.children[0], 0)), arm = w.hand.getWorldPosition(new THREE.Vector3()).distanceTo(w.fore.getWorldPosition(new THREE.Vector3()));
    assert.ok(Math.abs(reach / arm - 1.5) < 1e-4);
});

test('a prop worn on a part the wearer has none of, or with no wear of its own, is not put on', () => {
    const w = wearer(), holder = { object: w.object, wornRest: R.Worn.rest(w.object) };
    const p = prop([0, 0, 0], [0, -0.2, 0], [0, 0, 0]);
    assert.equal(R.Worn.put(holder, p.template, { wear: { part: 'LeftLowerArm', joints: p.json.wear.joints } }, {}, null), null);
    assert.equal(R.Worn.put(holder, p.template, {}, {}, null), null);
});

test('what a party member wears follows its armors: put on when equipped, taken off when not', async () => {
    const w = wearer(), holder = { object: w.object, wornRest: R.Worn.rest(w.object) };
    const p = prop([0, 0, 0], [-0.12, -0.13, 0.16], [0, 0, 0]);
    let armors = [{ id: 114 }];
    const saved = { databaseModelSpec: R.databaseModelSpec, loadModel: R.loadModel, loadModelSidecar: R.loadModelSidecar };
    global.Game_Player = class {};
    global.$gameParty = { leader: () => ({ armors: () => armors }) };
    global.Graphics = { frameCount: 100 };
    R.databaseModelSpec = (section, id) => (section === 'armors' && id === 114 ? { name: 'Props/Grappler', file: 'Grappler', ext: '.glb', scale: 1 } : null);
    R.loadModel = () => Promise.resolve(p.template);
    R.loadModelSidecar = () => Promise.resolve(p.json);
    try {
        const player = new global.Game_Player();
        R.Worn.update(holder, player, null);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(holder.worn.length, 1, 'the Grappler is on');
        assert.equal(holder.worn[0].parent, w.fore);
        holder._reactorGrappler = null;
        // Looked at again only every CHECK_EVERY frames, and nothing changes while the armors stay.
        global.Graphics.frameCount += R.Worn.CHECK_EVERY;
        R.Worn.update(holder, player, null);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(holder.worn.length, 1);
        assert.equal(holder._reactorGrappler, null, 'nothing taken off, nothing looked for again');
        armors = [];
        global.Graphics.frameCount += R.Worn.CHECK_EVERY;
        R.Worn.update(holder, player, null);
        assert.equal(holder.worn.length, 0, 'taken off');
        assert.equal(w.fore.children.length, 1, 'only the hand is left on the forearm');
        assert.equal(holder._reactorGrappler, undefined, 'the grapple looks for its harpoon again');
    } finally {
        Object.assign(R, saved);
        delete global.Game_Player; delete global.$gameParty; delete global.Graphics;
    }
});

test('a worn prop casts as its wearer does: drawn into the shadow rows with a depth material, never its own lit one', () => {
    const w = wearer(), holder = { object: w.object, wornRest: R.Worn.rest(w.object) };
    const p = prop([0, 0, 0], [-0.12, -0.13, 0.16], [0, 0, 0]);
    const marked = [], saved = R.Shadows;
    R.Shadows = { markCaster: (root, dynamic) => { marked.push([root, dynamic]); return root; } };
    try {
        // A wearer that is not yet a caster: nothing now; marking it later takes the prop in with it.
        R.Worn.put(holder, p.template, p.json, { scale: 1 }, null);
        assert.deepEqual(marked, []);
        // A moving wearer: marked again, prop and all, so its lit material never samples the shadow atlas it is drawn into.
        w.object.userData.reactorShadowCaster = 'dynamic';
        R.Worn.put(holder, p.template, p.json, { scale: 1 }, null);
        assert.equal(marked.length, 1);
        assert.equal(marked[0][0], w.object);
        assert.equal(marked[0][1], true);
    } finally {
        R.Shadows = saved;
    }
});

test('a Builder\'s metal shines as it did in the Builder, over its own colour; another file\'s waits for its Surface', () => {
    assert.equal(R.isBuilderGlb({ asset: { generator: 'RPG Reactor Character Builder' } }), true);
    assert.equal(R.isBuilderGlb({ asset: { generator: 'Khronos glTF Blender I/O v4.2.57' } }), false);
    const object = new THREE.Group();
    const part = (own) => {
        const material = new THREE.MeshBasicMaterial();
        material.__reactorLit = true;
        material.userData.glbShine = { reflect: 0.74, gloss: 0.73, metal: 0.9, tint: '#ffffff' };
        if (own) material.userData.glbShineOwn = true;
        object.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
        return material;
    };
    const builder = part(true), imported = part(false);
    const saved = R.Reflections;
    R.Reflections = { wanted: false, hook() {} };
    try {
        R.applyModelSurface(object, null);
        const shine = R.shineOf(builder);
        assert.ok(shine, 'the Builder\'s plate shines with no Surface of its own');
        assert.equal(+shine.vector.z.toFixed(2), 0.9, 'as metal');
        assert.equal(shine.vector.w, R.BUILDER_METAL_KEEP, 'over its own colour');
        assert.equal(shine.albedo.value, 1, 'reflecting in that colour');
        assert.equal(R.Reflections.wanted, false, 'without the live capture of the world');
        assert.equal(R.shineOf(imported), null, 'another file\'s metal waits for a Surface');
        // A Surface set on the model stands over both.
        R.applyModelSurface(object, { reflect: 0.5, gloss: 0.9, metal: 1, tint: '#ffd27f', texture: 0 });
        assert.equal(R.shineOf(builder).vector.w, 0);
        assert.equal(R.shineOf(builder).albedo.value, 0);
        assert.equal(R.Reflections.wanted, true);
    } finally {
        R.Reflections = saved;
    }
});
