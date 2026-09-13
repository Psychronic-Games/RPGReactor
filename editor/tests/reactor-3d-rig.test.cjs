/**
 * In-editor rigging: a humanoid skeleton fitted to a static mesh, skin
 * weights solved and stored, the runtime rebuilding the identical
 * skinned model — and the existing pose-rule engine driving bones as
 * parts. Behavioral, against the real three.js the editor ships.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const ModelRigger = require(path.join(repoRoot, 'editor', 'src', 'database', 'ModelRigger.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

test('the humanoid template derives a 17-bone skeleton from its markers', () => {
    const markers = ModelRigger.defaultMarkers({ x: 0.6, y: 1.8, z: 0.3 });
    for (const marker of ModelRigger.MARKERS) {
        assert.ok(Array.isArray(markers[marker.key]), `marker ${marker.key} exists`);
        if (marker.mirror) {
            const twin = markers[marker.mirror];
            assert.equal(markers[marker.key][0], -twin[0], `${marker.key} mirrors ${marker.mirror}`);
        }
    }
    const bones = ModelRigger.bonesFromMarkers(markers);
    assert.equal(bones.length, 17);
    const byName = Object.fromEntries(bones.map((bone, i) => [bone.name, { ...bone, index: i }]));
    assert.equal(byName.Hips.parent, -1, 'Hips is the root');
    assert.equal(bones[byName.Head.parent].name, 'Neck');
    assert.equal(bones[byName.LeftHand.parent].name, 'LeftLowerArm');
    assert.equal(bones[byName.RightUpperLeg.parent].name, 'Hips');
    for (const bone of bones) {
        if (bone.parent >= 0) {
            assert.ok(bone.parent < byName[bone.name].index, 'parents precede children');
        }
    }
    // Left bones live at positive x, right at negative — the solver's
    // side gate keys off this.
    assert.ok(byName.LeftUpperArm.head[0] > 0 && byName.RightUpperArm.head[0] < 0);
});

test('weights split a column between two bones, welded across seams', () => {
    // A vertical strip of quads from y=0 to y=2 over a two-bone chain.
    const bones = [
        { name: 'Lower', parent: -1, head: [0, 0, 0], tail: [0, 1, 0] },
        { name: 'Upper', parent: 0, head: [0, 1, 0], tail: [0, 2, 0] }
    ];
    const positions = [];
    const index = [];
    const rows = 9;
    for (let r = 0; r <= rows; r++) {
        const y = 2 * r / rows;
        positions.push(-0.1, y, 0, 0.1, y, 0);
    }
    for (let r = 0; r < rows; r++) {
        const a = r * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    // A duplicated vertex (a UV-seam twin of the top-left corner) must
    // weight identically to its twin.
    const seamTwin = positions.length / 3;
    positions.push(-0.1, 2, 0);
    index.push(seamTwin, rows * 2, rows * 2 + 1);

    const [result] = ModelRigger.computeWeights(
        [{ positions: Float32Array.from(positions), index }], bones, { height: 2 });
    const dominant = v => result.indices[v * 4 + (result.weights[v * 4] >= result.weights[v * 4 + 1] ? 0 : 1)];
    assert.equal(dominant(0), 0, 'the bottom row belongs to the lower bone');
    assert.equal(dominant(rows * 2), 1, 'the top row belongs to the upper bone');
    for (let v = 0; v < positions.length / 3; v++) {
        const sum = result.weights[v * 4] + result.weights[v * 4 + 1]
            + result.weights[v * 4 + 2] + result.weights[v * 4 + 3];
        assert.equal(sum, 255, `vertex ${v} weights are normalized`);
    }
    for (let k = 0; k < 4; k++) {
        assert.equal(result.indices[seamTwin * 4 + k], result.indices[rows * 2 * 4 + k],
            'seam twins share bone indices');
        assert.equal(result.weights[seamTwin * 4 + k], result.weights[rows * 2 * 4 + k],
            'seam twins share weights');
    }
});

test('rig bytes round-trip through base64 in both codecs', () => {
    const bytes = Uint8Array.from({ length: 301 }, (_, i) => (i * 37) % 256);
    const encoded = ModelRigger.encodeBytes(bytes);
    assert.deepEqual(Array.from(ModelRigger.decodeBytes(encoded)), Array.from(bytes));
    assert.deepEqual(Array.from(Reactor3D.decodeRigBytes(encoded)), Array.from(bytes),
        'the runtime decoder reads the editor encoder');
});

test('readModelRig validates like the other sidecar shapes', () => {
    assert.equal(Reactor3D.readModelRig(null), null);
    assert.equal(Reactor3D.readModelRig({}), null);
    assert.equal(Reactor3D.readModelRig({ rig: { bones: [] } }), null);
    const rig = Reactor3D.readModelRig({ rig: {
        bones: [
            { name: 'Root', parent: -1, head: [0, 0, 0], tail: [0, 1, 0] },
            { name: 'Child', parent: 0, head: [0, 1, 'x'], tail: [0, 2, 0] },
            { name: 'BadParent', parent: 9, head: [0, 0, 0], tail: [0, 0, 0] }
        ],
        weights: {
            0: { count: 2, indices: ModelRigger.encodeBytes(new Uint8Array(8)),
                 weights: ModelRigger.encodeBytes(Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0])) },
            'x': { count: 2, indices: '', weights: '' },
            1: { count: 5, indices: ModelRigger.encodeBytes(new Uint8Array(4)),
                 weights: ModelRigger.encodeBytes(new Uint8Array(4)) }
        }
    } });
    assert.equal(rig.bones.length, 3);
    assert.deepEqual(rig.bones[1].head, [0, 1, 0], 'a malformed component zeroes');
    assert.equal(rig.bones[2].parent, -1, 'an out-of-range parent becomes a root');
    assert.ok(rig.weights[0], 'valid weights survive');
    assert.equal(rig.weights[1], undefined, 'short weight data drops');
    assert.equal(rig.weights.x, undefined);
});

test('a rigged model skins, poses through the rule engine, and moves vertices', () => {
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE;

    // The column mesh from the weight test, as real geometry.
    const bones = [
        { name: 'Lower', parent: -1, head: [0, 0, 0], tail: [0, 1, 0] },
        { name: 'Upper', parent: 0, head: [0, 1, 0], tail: [0, 2, 0] }
    ];
    const positions = [];
    const index = [];
    const rows = 9;
    for (let r = 0; r <= rows; r++) {
        const y = 2 * r / rows;
        positions.push(-0.1, y, 0, 0.1, y, 0);
    }
    for (let r = 0; r < rows; r++) {
        const a = r * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const [weights] = ModelRigger.computeWeights(
        [{ positions: Float32Array.from(positions), index }], bones, { height: 2 });
    const rigJson = { rig: ModelRigger.buildRig({}, bones, [weights]) };

    const root = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(positions), 3));
    geometry.setIndex(index);
    root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));

    const rig = Reactor3D.readModelRig(rigJson);
    Reactor3D.applyModelRig(root, rig);

    let skinned = null;
    root.traverse(child => { if (child.isSkinnedMesh) skinned = child; });
    assert.ok(skinned, 'the weighted mesh became a SkinnedMesh');
    assert.equal(skinned.skeleton.bones.length, 2);
    assert.equal(root.userData.rigged, true);

    const binding = Reactor3D.prepareModelInstance(root, null);
    const boneEntries = binding.meshes.filter(entry => entry.mesh.isBone);
    assert.deepEqual(boneEntries.map(entry => entry.parts[0].name).sort(), ['Lower', 'Upper'],
        'both bones registered as parts');

    // Drive the pose rule engine: bend "Upper" 90 degrees about z.
    const rules = Reactor3D.readModelAnimationRules({ animations: [
        { name: 'bend', part: 'Upper', type: 'pose', rotate: [0, 0, 90], period: 1, trigger: 'always' }
    ] });
    for (let frame = 0; frame < 5; frame++) {
        Reactor3D.applyModelAnimation(binding, rules, { frame, moving: false, scale: 1 });
    }
    root.updateMatrixWorld(true);
    skinned.skeleton.update();

    const topVertex = rows * 2; // (-0.1, 2, 0) at rest, fully on Upper
    const posed = new THREE.Vector3().fromBufferAttribute(
        skinned.geometry.getAttribute('position'), topVertex);
    skinned.applyBoneTransform(topVertex, posed);
    // The upper bone hinges at (0,1,0); +90° about z sends the tip vertex
    // (-0.1, 2, 0) to (-1, 0.9, 0): the offset (-0.1, 1) rotates to (-1, -0.1).
    assert.ok(Math.abs(posed.x - (-1)) < 0.05, `tip x bent left (${posed.x})`);
    assert.ok(Math.abs(posed.y - 0.9) < 0.08, `tip y beside the hinge (${posed.y})`);

    // Rest pose returns when the rule releases (trigger stops matching).
    const restRules = Reactor3D.readModelAnimationRules({ animations: [
        { name: 'bend', part: 'Upper', type: 'pose', rotate: [0, 0, 90], period: 1, trigger: 'moving' }
    ] });
    for (let frame = 0; frame < 5; frame++) {
        Reactor3D.applyModelAnimation(binding, restRules, { frame, moving: false, scale: 1 });
    }
    root.updateMatrixWorld(true);
    skinned.skeleton.update();
    const rest = new THREE.Vector3().fromBufferAttribute(
        skinned.geometry.getAttribute('position'), topVertex);
    skinned.applyBoneTransform(topVertex, rest);
    assert.ok(Math.abs(rest.x - (-0.1)) < 0.02 && Math.abs(rest.y - 2) < 0.02,
        `the tip returns to rest (${rest.x}, ${rest.y})`);
});

test('every rig template derives a coherent skeleton', () => {
    const size = { x: 1, y: 1.2, z: 2.4 };
    const quad = ModelRigger.bonesFromMarkers(ModelRigger.defaultMarkers(size, 'quadruped'), 'quadruped');
    assert.equal(quad.length, 18);
    const quadNames = quad.map(bone => bone.name);
    assert.ok(quadNames.includes('Tail') && quadNames.includes('LeftFrontUpperLeg')
        && quadNames.includes('RightRearFoot'));
    const plant = ModelRigger.bonesFromMarkers(ModelRigger.defaultMarkers(size, 'plant'), 'plant');
    assert.deepEqual(plant.map(bone => bone.name), ['Base', 'Trunk', 'Crown']);
    const vehicle = ModelRigger.bonesFromMarkers(ModelRigger.defaultMarkers(size, 'vehicle'), 'vehicle');
    assert.deepEqual(vehicle.map(bone => bone.name),
        ['Body', 'FrontLeftWheel', 'FrontRightWheel', 'RearLeftWheel', 'RearRightWheel']);
    for (const bones of [quad, plant, vehicle]) {
        bones.forEach((bone, index) => {
            assert.ok(bone.parent < index, `${bone.name} parent precedes it`);
        });
    }
});

test('the side gate separates quadruped legs front/rear and left/right', () => {
    const bones = ModelRigger.bonesFromMarkers(
        ModelRigger.defaultMarkers({ x: 1, y: 1.2, z: 2.4 }, 'quadruped'), 'quadruped');
    const byName = Object.fromEntries(bones.map((bone, i) => [bone.name, i]));
    // One probe vertex at each paw.
    const paws = {
        LeftFrontLowerLeg: [0.21, 0.15, 0.54],
        RightFrontLowerLeg: [-0.21, 0.15, 0.54],
        LeftRearLowerLeg: [0.21, 0.15, -0.62],
        RightRearLowerLeg: [-0.21, 0.15, -0.62]
    };
    const names = Object.keys(paws);
    const positions = Float32Array.from(names.flatMap(name => paws[name]));
    const [result] = ModelRigger.computeWeights(
        [{ positions, index: null }], bones, { height: 1.2, smoothPasses: 0 });
    names.forEach((name, v) => {
        const dominant = result.indices[v * 4];
        const bone = bones[dominant].name;
        assert.ok(bone.startsWith(name.slice(0, name.indexOf('Lower'))),
            `${name} paw belongs to its own leg, got ${bone}`);
    });
});

test('phase offsets and keyframe timelines parse and play', () => {
    const rules = Reactor3D.readModelAnimationRules({ animations: [
        { name: 'Walk', part: 'LeftUpperLeg', type: 'swing', axis: 'x', degrees: 30, period: 40, phase: 0.5, trigger: 'moving' },
        { name: 'Strike', part: 'Arm', type: 'pose', trigger: 'action', period: 20, hold: true, keys: [
            { at: 0.7, rotate: [0, 0, -20] }, { at: 0.3, rotate: [-90, 0, 0] }
        ] }
    ] });
    assert.equal(rules[0].phase, 0.5);
    assert.equal(rules[1].keys.length, 2);
    assert.equal(rules[1].keys[0].at, 0.3, 'keys sort by time');
    assert.equal(rules[1].hold, false, 'a keyed timeline drops hold');

    const atRest = Reactor3D.sampleModelKeys(rules[1], 0);
    assert.deepEqual(atRest.rotate, [0, 0, 0]);
    const atKey = Reactor3D.sampleModelKeys(rules[1], 0.3);
    assert.deepEqual(atKey.rotate, [-90, 0, 0]);
    const atEnd = Reactor3D.sampleModelKeys(rules[1], 1);
    assert.deepEqual(atEnd.rotate, [0, 0, 0], 'the timeline returns to rest');
    const between = Reactor3D.sampleModelKeys(rules[1], 0.5);
    assert.ok(between.rotate[0] > -90 && between.rotate[0] < 0, 'stops interpolate');
    assert.ok(between.rotate[2] < 0, 'the next stop blends in');
});

test('a keyed action drives a bone through the timeline and back to rest', () => {
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE;
    const root = new THREE.Group();
    const bone = new THREE.Bone();
    bone.name = 'Arm';
    bone.userData.parts = [{ name: 'Arm', pivot: [0, 0, 0] }];
    root.add(bone);
    const binding = Reactor3D.prepareModelInstance(root, null);
    const rules = Reactor3D.readModelAnimationRules({ animations: [
        { name: 'Strike', part: 'Arm', type: 'pose', trigger: 'action', period: 10, cycles: 1, keys: [
            { at: 0.5, rotate: [0, 0, -90] }
        ] }
    ] });
    const play = (frame, action) =>
        Reactor3D.applyModelAnimation(binding, rules, { frame, moving: false, scale: 1, action });
    // duration = period*2*cycles = 20; at frame 10 progress = 0.5 → the key.
    play(10, { name: 'Strike', frame: 0 });
    const zAt = () => new THREE.Euler().setFromQuaternion(bone.quaternion, 'XYZ').z * 180 / Math.PI;
    assert.ok(Math.abs(zAt() - (-90)) < 1, `the key pose lands (${zAt()})`);
    play(15, { name: 'Strike', frame: 0 });
    assert.ok(zAt() > -90 && zAt() < -5, 'easing back toward rest');
    play(40, null);
    assert.ok(Math.abs(zAt()) < 0.01, 'rest after the action');
});

test('every preset motion aims at bones its template really has', () => {
    const RigMotionPresets = require(path.join(repoRoot, 'editor', 'src', 'database', 'RigMotionPresets.js'));
    for (const preset of RigMotionPresets.PRESETS) {
        const bones = ModelRigger.bonesFromMarkers(
            ModelRigger.defaultMarkers({ x: 1, y: 1.8, z: 1 }, preset.template), preset.template);
        const names = new Set(bones.map(bone => bone.name));
        for (const rule of preset.rules) {
            assert.ok(rule.part === '' || names.has(rule.part),
                `${preset.id}: part ${rule.part} exists in ${preset.template}`);
        }
        const parsed = Reactor3D.readModelAnimationRules({ animations: preset.rules });
        assert.equal(parsed.length, preset.rules.length, `${preset.id} parses fully`);
        parsed.forEach((rule, index) => {
            const raw = preset.rules[index];
            if (raw.keys) assert.equal(rule.keys.length, raw.keys.length, `${preset.id} keys survive`);
            if (raw.phase) assert.equal(rule.phase, raw.phase, `${preset.id} phase survives`);
        });
    }
});

test('keyed root motion lifts the whole model and puts it back down', () => {
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE;
    const root = new THREE.Group();
    const bone = new THREE.Bone();
    bone.name = 'Hips';
    bone.userData.parts = [{ name: 'Hips', pivot: [0, 0, 0] }];
    root.add(bone);
    const binding = Reactor3D.prepareModelInstance(root, null);
    const rules = Reactor3D.readModelAnimationRules({ animations: [
        { name: 'Jump', part: '', type: 'pose', trigger: 'action', period: 10, cycles: 1, keys: [
            { at: 0.12, move: [0, -0.05, 0] },
            { at: 0.5, move: [0, 0.5, 0] },
            { at: 0.8, move: [0, 0, 0] }
        ] }
    ] });
    const play = (frame, action) =>
        Reactor3D.applyModelAnimation(binding, rules, { frame, moving: false, scale: 1, action });
    play(10, { name: 'Jump', frame: 0 }); // progress 0.5 = apex
    assert.ok(Math.abs(binding.root.position.y - 0.5) < 0.01,
        `airborne at the apex (${binding.root.position.y})`);
    play(2, { name: 'Jump', frame: 0 }); // progress 0.1, crouch dip blending in
    assert.ok(binding.root.position.y < 0 && binding.root.position.y > -0.06,
        `crouch dips below rest (${binding.root.position.y})`);
    play(40, null);
    assert.equal(binding.root.position.y, 0, 'grounded after the action');
});

test('rig weights round-trip through the binary sidecar, matching base64 exactly', () => {
    // Two meshes' worth of quantized weights, one sparse gap.
    const results = [];
    results[0] = {
        indices: Uint8Array.from([0, 1, 0, 0, 2, 3, 0, 0]),
        weights: Uint8Array.from([200, 55, 0, 0, 128, 127, 0, 0])
    };
    results[2] = {
        indices: Uint8Array.from([4, 0, 0, 0]),
        weights: Uint8Array.from([255, 0, 0, 0])
    };
    const binary = ModelRigger.encodeWeightsBinary(results);
    const fromRigger = ModelRigger.decodeWeightsBinary(binary);
    const fromRuntime = Reactor3D.decodeRigWeightsBinary(binary);
    for (const decoded of [fromRigger, fromRuntime]) {
        assert.deepEqual(Object.keys(decoded).sort(), ['0', '2']);
        assert.equal(decoded['0'].count, 2);
        assert.deepEqual(Array.from(decoded['0'].indices), Array.from(results[0].indices));
        assert.deepEqual(Array.from(decoded['0'].weights), Array.from(results[0].weights));
        assert.equal(decoded['2'].count, 1);
        assert.deepEqual(Array.from(decoded['2'].indices), Array.from(results[2].indices));
    }
    assert.equal(ModelRigger.decodeWeightsBinary(new ArrayBuffer(4)), null, 'garbage refuses');

    // The same rig through both formats reads identically.
    const markers = ModelRigger.defaultMarkers({ x: 0.6, y: 1.8, z: 0.3 });
    const bones = ModelRigger.bonesFromMarkers(markers);
    const legacy = Reactor3D.readModelRig({
        rig: ModelRigger.buildRig(markers, bones, results, 'humanoid')
    });
    const built = ModelRigger.buildRigBinary(markers, bones, results, 'humanoid');
    assert.equal(built.rig.weightsFile, 'model.rig.bin');
    assert.equal(built.rig.weights, undefined, 'no base64 in the JSON era');
    built.rig.weightsBin = ModelRigger.decodeWeightsBinary(built.binary);
    const binaryRead = Reactor3D.readModelRig({ rig: built.rig });
    assert.deepEqual(
        Object.keys(binaryRead.weights).sort(),
        Object.keys(legacy.weights).sort());
    for (const key of Object.keys(legacy.weights)) {
        assert.equal(binaryRead.weights[key].count, legacy.weights[key].count);
        assert.deepEqual(
            Array.from(binaryRead.weights[key].indices),
            Array.from(legacy.weights[key].indices), 'indices agree for mesh ' + key);
        assert.deepEqual(
            Array.from(binaryRead.weights[key].weights),
            Array.from(legacy.weights[key].weights), 'weights agree for mesh ' + key);
    }
    assert.equal(binaryRead.bones.length, legacy.bones.length);
});

test('a rig on a model with its own skinned skeleton names the file bones, and poses bend them from the clip pose', () => {
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE;
    // A Mixamo-shaped export: an upper arm bone at y=1 with a forearm child
    // half a unit up, one skinned triangle per bone, bound at rest.
    const upper = new THREE.Bone(); upper.name = 'mixamorigRightArm'; upper.position.set(0, 1, 0);
    const fore = new THREE.Bone(); fore.name = 'mixamorigRightForeArm'; fore.position.set(0, 0.5, 0);
    upper.add(fore);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0.1, 1.2, 0, 0, 1.4, 0, 0, 1.5, 0, 0.1, 1.7, 0, 0, 2, 0]), 3));
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
    geometry.setIndex([0, 1, 2, 3, 4, 5]);
    const root = new THREE.Group();
    const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    root.add(upper, skinned);
    root.updateMatrixWorld(true);
    skinned.bind(new THREE.Skeleton([upper, fore]), new THREE.Matrix4());

    const rig = Reactor3D.readModelRig({ rig: { bones: [
        { name: 'RightUpperArm', parent: -1, head: [0, 1, 0], tail: [0, 1.5, 0] },
        { name: 'RightLowerArm', parent: 0, head: [0, 1.5, 0], tail: [0, 2, 0] },
        { name: 'Head', parent: -1, head: [0, 9, 0], tail: [0, 9.5, 0] }
    ] } });
    Reactor3D.applyModelRig(root, rig);
    const bones = [];
    root.traverse(node => { if (node.isBone) bones.push(node); });
    assert.equal(bones.length, 2, 'no second skeleton grows beside the file skeleton');
    assert.equal(upper.userData.parts[0].name, 'RightUpperArm');
    assert.equal(fore.userData.parts[0].name, 'RightLowerArm');
    assert.equal(root.userData.rigMapped, 2, 'a rig bone standing nowhere near a file bone stays unmapped');

    // The file's clip turns the upper arm; a pose bends the forearm.
    const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    const clip = new THREE.AnimationClip('raise', 1, [new THREE.QuaternionKeyframeTrack('mixamorigRightArm.quaternion', [0, 1], [q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w])]);
    const binding = Reactor3D.prepareModelInstance(root, [clip]);
    assert.ok(binding.mixer);
    const rules = Reactor3D.readModelAnimationRules({ animations: [
        { name: 'raise', type: 'clip', clip: 'raise', trigger: 'always' },
        { name: 'bend', part: 'RightLowerArm', type: 'pose', rotate: [0, 0, 90], period: 1, trigger: 'always' }
    ] });
    const run = (list, frames) => { for (let frame = 0; frame < frames; frame++) Reactor3D.applyModelAnimation(binding, list, { frame, moving: false, scale: 1 }); };
    run(rules, 31);
    const upperAngle = upper.quaternion.angleTo(q0) * 180 / Math.PI;
    assert.ok(upperAngle > 20 && upperAngle < 70, 'the clip still drives the named upper arm: ' + upperAngle.toFixed(1));
    const foreAngle = fore.quaternion.angleTo(q0) * 180 / Math.PI;
    assert.ok(Math.abs(foreAngle - 90) < 1, 'the forearm holds the pose without compounding across frames: ' + foreAngle.toFixed(1));
    run(rules.slice(0, 1), 10);
    assert.ok(fore.quaternion.angleTo(q0) < 1e-6, 'releasing the pose hands the forearm back to the clip');
    const laterUpper = upper.quaternion.angleTo(q0) * 180 / Math.PI;
    assert.ok(laterUpper > upperAngle, 'the clip kept playing meanwhile');
});

test('a pose on a mapped joint is read in the model frame however the file skeleton is turned and scaled', () => {
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE;
    // A Blender-style export: the armature lies on its back at 100× the scene's units.
    const armature = new THREE.Group(); armature.name = 'Armature'; armature.rotation.x = -Math.PI / 2; armature.scale.setScalar(0.01);
    const upper = new THREE.Bone(); upper.name = 'RightArm'; upper.position.set(0, 0, 100); upper.rotation.y = 0.7;
    const fore = new THREE.Bone(); fore.name = 'RightForeArm'; fore.position.set(0, 0, 50);
    upper.add(fore); armature.add(upper);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 100, 10, 0, 120, 0, 0, 140]), 3));
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]), 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
    const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    armature.add(skinned);
    const root = new THREE.Group(); root.add(armature); root.updateMatrixWorld(true);
    skinned.bind(new THREE.Skeleton([upper, fore]), new THREE.Matrix4());
    // Rig heads sit where the joints stand in the model's own frame (y up, metres).
    const at = node => root.worldToLocal(node.getWorldPosition(new THREE.Vector3())).toArray();
    const rig = Reactor3D.readModelRig({ rig: { bones: [
        { name: 'RightUpperArm', parent: -1, head: at(upper), tail: at(fore) },
        { name: 'RightLowerArm', parent: 0, head: at(fore), tail: [at(fore)[0], at(fore)[1] + 0.5, at(fore)[2]] }
    ] } });
    Reactor3D.applyModelRig(root, rig);
    assert.equal(root.userData.rigMapped, 2);
    const idle = new THREE.AnimationClip('idle', 1, [new THREE.VectorKeyframeTrack('RightArm.position', [0, 1], [0, 0, 100, 0, 0, 100])]);
    const binding = Reactor3D.prepareModelInstance(root, [idle]);
    const rules = Reactor3D.readModelAnimationRules({ animations: [
        { name: 'idle', type: 'clip', clip: 'idle', trigger: 'always' },
        { name: 'lift', part: 'RightLowerArm', type: 'pose', move: [0, 1, 0], period: 1, trigger: 'always' }
    ] });
    const before = fore.getWorldPosition(new THREE.Vector3());
    for (let frame = 0; frame < 3; frame++) Reactor3D.applyModelAnimation(binding, rules, { frame, moving: false, scale: 1 });
    root.updateMatrixWorld(true);
    const after = fore.getWorldPosition(new THREE.Vector3());
    const lift = after.sub(before);
    assert.ok(Math.abs(lift.x) < 0.02 && Math.abs(lift.z) < 0.02, 'the joint moved straight up in the model frame: ' + lift.toArray().map(n => n.toFixed(2)));
    assert.ok(lift.y > 0.5, 'and by the authored distance in scene units, not the armature\'s centimetres: ' + lift.y.toFixed(2));
});


test('the rig preview draws a chain through the markers, ending at the joints', () => {
    const size = { x: 1, y: 1.8, z: 0.5 };
    for (const [template, expected] of [['humanoid', 13], ['quadruped', 15]]) {
        const markers = ModelRigger.defaultMarkers(size, template);
        const links = ModelRigger.previewLinks(markers, template);
        assert.equal(links.length, expected, template + ' link count');
        const points = Object.values(markers);
        const onMarker = p => points.some(m => Math.hypot(m[0] - p[0], m[1] - p[1], m[2] - p[2]) < 1e-9);
        const shoulders = template === 'humanoid' ? [(markers.shoulderL[0] + markers.shoulderR[0]) / 2, (markers.shoulderL[1] + markers.shoulderR[1]) / 2, (markers.shoulderL[2] + markers.shoulderR[2]) / 2] : null;
        const onChain = p => onMarker(p) || (shoulders && Math.hypot(shoulders[0] - p[0], shoulders[1] - p[1], shoulders[2] - p[2]) < 1e-9);
        for (const link of links) assert.ok(onChain(link.head) && onChain(link.tail), template + ': every segment ends on a joint');
        // Every marker is reached by some segment, so nothing floats free.
        for (const [key, m] of Object.entries(markers)) assert.ok(links.some(l => [l.head, l.tail].some(p => Math.hypot(m[0] - p[0], m[1] - p[1], m[2] - p[2]) < 1e-9)), template + ': ' + key + ' is linked');
    }
    // The skinning bones keep their reach: the hand still runs past the wrist.
    const bones = ModelRigger.bonesFromMarkers(ModelRigger.defaultMarkers(size, 'humanoid'), 'humanoid');
    const hand = bones.find(b => b.name === 'LeftHand');
    assert.ok(hand.tail[1] < ModelRigger.defaultMarkers(size, 'humanoid').wristL[1], 'the hand bone reaches beyond the wrist');
    // A template with no chain of its own draws its bones.
    const plant = ModelRigger.previewLinks(ModelRigger.defaultMarkers(size, 'plant'), 'plant');
    assert.deepEqual(plant.map(b => b.head), ModelRigger.bonesFromMarkers(ModelRigger.defaultMarkers(size, 'plant'), 'plant').map(b => b.head));
});
