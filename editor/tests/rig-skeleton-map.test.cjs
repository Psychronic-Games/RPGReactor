'use strict';
// A rig laid on a model that skins over its own skeleton (Reactor3D.mapRigToSkeleton): each rig bone names the file's
// bone that stands where its head was fitted. A rig bone whose nearest bone went to a surer match takes the free
// bone of its own name, and the rig's root is a bone that carries what its children took. Then the fades that thin
// what stands between the eye and the party: a ridden vehicle is its rider's body (Reactor3D.cutawayMarkRide).
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

/** A skinned model over bones `[name, parent index, x, y, z]` (places in the model's own frame). */
function skinned(defs) {
    const bones = defs.map(([name]) => Object.assign(new THREE.Bone(), { name }));
    const root = new THREE.Group();
    defs.forEach(([, parent, x, y, z], i) => {
        const above = parent >= 0 ? defs[parent] : null;
        bones[i].position.set(x - (above ? above[2] : 0), y - (above ? above[3] : 0), z - (above ? above[4] : 0));
        if (parent >= 0) bones[parent].add(bones[i]);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 1, 0, 0], 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(12).fill(0), 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    mesh.add(bones[0]);
    root.add(mesh);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    return { root, bones };
}
const rigOf = rows => ({ template: 'humanoid', markers: {}, weights: {}, bones: rows.map(([name, parent, head]) => ({ name, parent, head, tail: [head[0], head[1] + 0.1, head[2]] })) });
const taken = (bones, name) => { const bone = bones.find(b => b.userData.parts && b.userData.parts[0].name === name); return bone ? bone.name : null; };

// The file's skeleton as one export had it: a coat's bone ahead of the pelvis, the thighs lower than the hip markers
// and the forearms hanging beside them.
const FILE = [
    ['mixamorig_Hips', -1, 0, 0.92, 0], ['Bone_003', 0, 0, 0.99, 0.16], ['mixamorig_Spine', 0, 0, 1.02, 0.02], ['mixamorig_Spine1', 2, 0, 1.14, 0.12],
    ['mixamorig_LeftArm', 3, 0.24, 1.35, 0.04], ['mixamorig_LeftForeArm', 4, 0.27, 1.02, 0.02], ['mixamorig_RightArm', 3, -0.24, 1.35, 0.04], ['mixamorig_RightForeArm', 6, -0.27, 1.02, 0.02],
    ['mixamorig_LeftUpLeg', 0, 0.18, 0.83, 0.11], ['mixamorig_LeftLeg', 8, 0.2, 0.4, 0.05], ['mixamorig_RightUpLeg', 0, -0.18, 0.83, 0.11], ['mixamorig_RightLeg', 10, -0.2, 0.4, 0.05]
];
const RIG = [
    ['Hips', -1, [0, 1.04, 0.17]], ['Spine', 0, [0, 1.14, 0.13]],
    ['LeftUpperArm', 1, [0.24, 1.35, 0.04]], ['LeftLowerArm', 2, [0.28, 1.01, 0.01]], ['RightUpperArm', 1, [-0.24, 1.35, 0.04]], ['RightLowerArm', 4, [-0.28, 1.01, 0.01]],
    ['LeftUpperLeg', 0, [0.2, 1.04, 0.05]], ['LeftLowerLeg', 6, [0.2, 0.36, 0.05]], ['RightUpperLeg', 0, [-0.2, 1.04, 0.05]], ['RightLowerLeg', 8, [-0.2, 0.36, 0.05]]
];

test('a thigh whose nearest bone is the forearm hanging beside it takes the bone of its own name', () => {
    const { root, bones } = skinned(FILE);
    assert.equal(Reactor3D.mapRigToSkeleton(root, rigOf(RIG)), true);
    assert.equal(taken(bones, 'LeftLowerArm'), 'mixamorig_LeftForeArm');
    assert.equal(taken(bones, 'RightLowerArm'), 'mixamorig_RightForeArm');
    assert.equal(taken(bones, 'LeftUpperLeg'), 'mixamorig_LeftUpLeg');
    assert.equal(taken(bones, 'RightUpperLeg'), 'mixamorig_RightUpLeg');
    assert.equal(taken(bones, 'LeftLowerLeg'), 'mixamorig_LeftLeg');
    assert.equal(root.userData.rigMapped, RIG.length, 'every rig bone has a bone');
});

test('the rig\'s root is the bone that carries the spine and the legs, not an accessory nearer its marker', () => {
    const { root, bones } = skinned(FILE);
    Reactor3D.mapRigToSkeleton(root, rigOf(RIG));
    assert.equal(taken(bones, 'Hips'), 'mixamorig_Hips');
    assert.equal(bones.find(b => b.name === 'Bone_003').userData.parts, undefined, 'the coat\'s bone is nobody\'s');
    assert.equal(taken(bones, 'Spine'), 'mixamorig_Spine1', 'the spine still lands by place');
});

test('a skeleton with no bone of a rig bone\'s name leaves it without one', () => {
    const { root, bones } = skinned(FILE.filter(row => !/UpLeg/.test(row[0])).map(row => (row[0] === 'mixamorig_LeftLeg' || row[0] === 'mixamorig_RightLeg' ? [row[0], 0, row[2], row[3], row[4]] : row)));
    Reactor3D.mapRigToSkeleton(root, rigOf(RIG));
    assert.equal(taken(bones, 'LeftUpperLeg'), null);
    assert.equal(taken(bones, 'LeftLowerArm'), 'mixamorig_LeftForeArm', 'and nothing else is moved for it');
});

test('a ridden vehicle is a body to the see-through fades for as long as it is ridden, by each of the instances that share its materials', () => {
    const material = new THREE.MeshBasicMaterial();
    const instance = () => { const group = new THREE.Group(); group.add(new THREE.Mesh(new THREE.BufferGeometry(), material)); return group; };
    const a = instance(), b = instance();
    assert.equal(Reactor3D.cutawayMarkRide(a, true), true);
    assert.equal(material.userData.rrCutBody.value, 2);
    assert.equal(Reactor3D.cutawayMarkRide(a, true), false, 'asked again: nothing to do');
    Reactor3D.cutawayMarkRide(b, true);
    Reactor3D.cutawayMarkRide(a, false);
    assert.equal(material.userData.rrCutBody.value, 2, 'another of the model is still ridden');
    Reactor3D.cutawayMarkRide(b, false);
    assert.equal(material.userData.rrCutBody.value, 0, 'scenery again');
    // One a battle marked as a body is that again when the ride is over, and a battle's mark does not end a ride.
    Reactor3D.cutawayMarkMaterials(a);
    assert.equal(material.userData.rrCutBody.value, 1);
    Reactor3D.cutawayMarkRide(a, true);
    Reactor3D.cutawayMarkMaterials(a);
    assert.equal(material.userData.rrCutBody.value, 2);
    Reactor3D.cutawayMarkRide(a, false);
    assert.equal(material.userData.rrCutBody.value, 1);
});
