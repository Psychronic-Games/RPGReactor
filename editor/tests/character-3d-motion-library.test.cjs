/**
 * The game's rigged humanoids play the shared motion library (runtime/reactor_3d_motions.js) in each
 * movement state they have no motion of their own for: the library's walk, run, jump, swim, treading
 * and climb, made for the model's own skeleton when they first play, whatever its rest pose, its bone
 * frames or its armature's turn and scale. The model's own clips and animations win; the rig's
 * procedural motions are left for the states the library has none for (idle, riding).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const R = require(path.join(root, 'runtime', 'reactor_3d.js'));
global.self = global; global.window = global;
require(path.join(root, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
require(path.join(root, 'runtime', 'reactor_rig_motions.js'));
const Library = require(path.join(root, 'runtime', 'reactor_3d_motions.js'));
require(path.join(root, 'runtime', 'reactor_3d_models.js'));

const carol = JSON.parse(fs.readFileSync(path.join(root, 'template', 'Demo', '3d', 'Actors', 'Captain_Carol_Everson_Reduced', 'model.json'), 'utf8')).rig;
const rigOf = () => R.readModelRig({ rig: { template: 'humanoid', bones: carol.bones } });
const headOf = name => carol.bones.find(b => b.name === name).head;

/** A model with no skeleton of its own: the rig grows one. */
function plainModel() {
    const object = new THREE.Group();
    object.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.7, 0.2)));
    R.applyModelRig(object, rigOf());
    return object;
}

/**
 * A model skinned over a file skeleton as exporters write one: an armature turned a quarter and scaled
 * to centimeters, every bone resting at a turn of its own, collarbones, a mid spine, toes and an end bone.
 */
function fileModel() {
    const object = new THREE.Group();
    const armature = new THREE.Group();
    armature.rotation.x = -Math.PI / 2;
    armature.scale.setScalar(0.01);
    object.add(armature);
    const mid = (a, b) => a.map((v, i) => (v + b[i]) / 2);
    const plan = [
        ['mixamorig:Hips', null, headOf('Hips')], ['mixamorig:Spine', 'mixamorig:Hips', headOf('Spine')],
        ['mixamorig:Spine1', 'mixamorig:Spine', mid(headOf('Spine'), headOf('Chest'))], ['mixamorig:Spine2', 'mixamorig:Spine1', headOf('Chest')],
        ['mixamorig:Neck', 'mixamorig:Spine2', headOf('Neck')], ['mixamorig:Head', 'mixamorig:Neck', headOf('Head')],
        ['mixamorig:HeadTop_End', 'mixamorig:Head', [0, 1.7, 0.1]]
    ];
    for (const [S, s] of [['Left', 1], ['Right', -1]]) {
        plan.push([`mixamorig:${S}Shoulder`, 'mixamorig:Spine2', [s * 0.06, 1.36, 0.04]], [`mixamorig:${S}Arm`, `mixamorig:${S}Shoulder`, headOf(S + 'UpperArm')],
            [`mixamorig:${S}ForeArm`, `mixamorig:${S}Arm`, headOf(S + 'LowerArm')], [`mixamorig:${S}Hand`, `mixamorig:${S}ForeArm`, headOf(S + 'Hand')],
            [`mixamorig:${S}UpLeg`, 'mixamorig:Hips', headOf(S + 'UpperLeg')], [`mixamorig:${S}Leg`, `mixamorig:${S}UpLeg`, headOf(S + 'LowerLeg')],
            [`mixamorig:${S}Foot`, `mixamorig:${S}Leg`, headOf(S + 'Foot')], [`mixamorig:${S}ToeBase`, `mixamorig:${S}Foot`, [s * 0.19, 0.03, 0.13]]);
    }
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
    const bones = new Map();
    object.updateMatrixWorld(true);
    for (const [name, parent, head] of plan) {
        const bone = new THREE.Bone();
        bone.name = name;
        (parent ? bones.get(parent) : armature).add(bone);
        bone.quaternion.setFromEuler(new THREE.Euler(random() * 2, random() * 2, random() * 2));
        bone.parent.updateMatrixWorld(true);
        bone.position.copy(bone.parent.worldToLocal(object.localToWorld(new THREE.Vector3(...head))));
        bone.updateMatrixWorld(true);
        bones.set(name, bone);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 0.1, 1, 0], 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    armature.add(mesh);
    mesh.bind(new THREE.Skeleton([...bones.values()]));
    object.__reactorClips = [new THREE.AnimationClip('Walking', 1, [])];
    R.applyModelRig(object, rigOf());
    return { object, bones };
}

const libraryClips = object => (object.__reactorClips || []).filter(clip => clip.__reactorLibrary);
const defaultsOf = rules => [...new Set(rules.filter(rule => rule.defaultMotion).map(rule => rule.name))];

test('a rigged humanoid plays the library in every state it has no motion for; the rig keeps idle and riding', () => {
    const object = plainModel();
    assert.deepEqual(libraryClips(object).filter(clip => clip.__reactorLibrary.state).map(clip => clip.__reactorLibrary.state), ['walking', 'dashing', 'jumping', 'swimming', 'treading', 'climbing']);
    const rules = R.readModelAnimationRules({ animations: [], rig: carol }, object.__reactorClips);
    const byState = Object.fromEntries(rules.filter(rule => rule.defaultMotion && rule.type === 'clip').map(rule => [rule.trigger, rule.name]));
    assert.deepEqual(byState, { walking: 'Walk', dashing: 'Run', jumping: 'Jump', swimming: 'Swim', treading: 'Tread Water', climbing: 'Climb' });
    // The procedural defaults are left for what the library has nothing for.
    const procedural = [...new Set(rules.filter(rule => rule.defaultMotion && rule.type !== 'clip').map(rule => rule.trigger))];
    assert.deepEqual(procedural.sort(), ['idle', 'riding']);
    // Turned off in the sidecar, neither plays.
    assert.deepEqual(defaultsOf(R.readModelAnimationRules({ animations: [], rig: carol, defaultMotions: false }, object.__reactorClips)), []);
    // The clips hold nothing until they play.
    assert.ok(libraryClips(object).every(clip => clip.tracks.length === 0));
});

test('a rule of the model\'s own names any library motion: Guard plays the motion-capture Guard', () => {
    const object = plainModel();
    const library = RRMotionLibrary;
    // Every library motion is there to name, not only the movement states; none holds keys yet.
    const ids = libraryClips(object).map(clip => clip.__reactorLibrary.id);
    for (const pose of library.POSES) assert.ok(ids.includes(pose.id), pose.id);
    const rules = R.readModelAnimationRules({ animations: [{ name: 'guard', type: 'clip', trigger: 'action', library: 'defend' }], rig: carol }, object.__reactorClips);
    const guard = rules.find(rule => rule.name === 'guard');
    assert.equal(guard.library, 'defend');
    assert.equal(guard.clip, R.LIBRARY_CLIP_PREFIX + 'defend');
    // A motion with no state of its own never plays by itself.
    assert.ok(!rules.some(rule => rule.defaultMotion && rule.clip === R.LIBRARY_CLIP_PREFIX + 'defend'));
    const clip = R.resolveLibraryMotion(object.__reactorClips.find(c => c.name === guard.clip));
    assert.ok(clip.tracks.length > 0 && clip.duration > 0, 'The motion is made for this skeleton when it first plays');
});

test('the model\'s own clips and animations win over the library', () => {
    const { object } = fileModel();
    // The file's Walking clip: no library walk is made for it.
    assert.ok(!libraryClips(object).some(clip => clip.__reactorLibrary.state === 'walking'));
    const rules = R.readModelAnimationRules({ animations: [{ name: 'My Swim', type: 'pose', trigger: 'swimming', keys: [{ at: 0, rotate: [10, 0, 0] }] }], rig: carol }, object.__reactorClips);
    const playing = state => rules.filter(rule => rule.trigger === state).map(rule => rule.name);
    assert.deepEqual(playing('walking'), ['Walking']);
    assert.deepEqual(playing('swimming'), ['My Swim']);
    assert.deepEqual(playing('dashing'), ['Run']);
    assert.deepEqual(playing('climbing'), ['Climb']);
    // The Motion editor lists them with the rig's defaults.
    assert.ok(defaultsOf(rules).includes('Climb') && defaultsOf(rules).includes('Breathe'));
});

/** Joint places in the model's frame, by the library's name for each. */
function placesOf(object, skeleton) {
    object.updateMatrixWorld(true);
    const toRoot = new THREE.Matrix4().copy(object.matrixWorld).invert();
    return skeleton.joints.map(joint => joint.node.getWorldPosition(new THREE.Vector3()).applyMatrix4(toRoot).toArray());
}

/** The library's own forward kinematics for its bones at frame f of a clip, the hips raised by its height. */
function libraryPlaces(bones, made, f, rise) {
    const turn = [], place = [];
    const mul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
    const rotate = (q, v) => { const p = mul(mul(q, [v[0], v[1], v[2], 0]), [-q[0], -q[1], -q[2], q[3]]); return [p[0], p[1], p[2]]; };
    const local = bones.map(() => [0, 0, 0, 1]);
    for (const track of made.tracks) if (!track.path) local[track.bone] = Array.from(track.values.subarray(f * 4, f * 4 + 4));
    bones.forEach((bone, i) => {
        if (bone.parent < 0) { turn[i] = local[i]; place[i] = [bone.head[0], bone.head[1] + rise, bone.head[2]]; return; }
        turn[i] = mul(turn[bone.parent], local[i]);
        const offset = rotate(turn[bone.parent], bone.head.map((v, k) => v - bones[bone.parent].head[k]));
        place[i] = place[bone.parent].map((v, k) => v + offset[k]);
    });
    return place;
}

for (const [label, make] of [['a skeleton the rig grows', () => ({ object: plainModel() })], ['a file skeleton, turned, scaled and resting at turns of its own', fileModel]]) {
    test(`the library's walk lands on ${label} as the library moves it`, () => {
        const { object } = make();
        const walk = libraryClips(object).find(clip => clip.__reactorLibrary.id === 'walk') || libraryClips(object).find(clip => clip.__reactorLibrary.id === 'run');
        const id = walk.__reactorLibrary.id;
        const skeleton = walk.__reactorLibrary.skeleton;
        const binding = R.prepareModelInstance(object, object.__reactorClips);
        assert.ok(binding.mixer, 'the library clips give the model a mixer');
        R.resolveLibraryMotion(walk);
        assert.ok(walk.tracks.length >= skeleton.joints.length && walk.duration > 0.5);
        for (const track of walk.tracks) for (const v of track.values) assert.ok(Number.isFinite(v));
        const action = binding.mixer.clipAction(walk);
        action.play();
        const bones = skeleton.joints.map(joint => ({ name: joint.name, parent: joint.parent, head: joint.head }));
        const full = Library.clip(bones, id);
        const span = 1.7;
        for (const f of [0, Math.floor(full.times.length / 3), Math.floor(full.times.length * 2 / 3)]) {
            binding.mixer.setTime(full.times[f]);
            const got = placesOf(object, skeleton), want = libraryPlaces(bones, full, f, full.heights[f]);
            got.forEach((place, i) => {
                const off = Math.hypot(...place.map((v, k) => v - want[i][k]));
                // The keys the clip keeps miss the library's own frames by less than half a degree a joint.
                assert.ok(off < (f === 0 ? 0.002 : 0.02) * span, `${skeleton.joints[i].name} at frame ${f}: ${off.toFixed(4)} off`);
            });
        }
        // Every copy of the model shares what was made; each binds its own joints.
        const second = make().object;
        const again = libraryClips(second).find(clip => clip.__reactorLibrary.id === id);
        assert.equal(again.__reactorLibrary.skeleton.signature, skeleton.signature);
        R.resolveLibraryMotion(again);
        assert.equal(again.tracks[0].values, walk.tracks[0].values);
        assert.notEqual(again.tracks[0].name, walk.tracks[0].name);
    });
}

test('the file\'s other joints hold their rest through a library motion, and the collarbones and toes move with it', () => {
    const { object, bones } = fileModel();
    const run = libraryClips(object).find(clip => clip.__reactorLibrary.id === 'run');
    const names = run.__reactorLibrary.skeleton.joints.map(joint => joint.name);
    for (const name of ['LeftShoulder', 'RightShoulder', 'Spine1', 'LeftToeBase', 'RightToeBase']) assert.ok(names.includes(name), name);
    const top = bones.get('mixamorig:HeadTop_End');
    const rest = top.quaternion.clone();
    const binding = R.prepareModelInstance(object, object.__reactorClips);
    top.quaternion.set(0.5, 0.5, 0.5, 0.5);
    binding.mixer.clipAction(R.resolveLibraryMotion(run)).play();
    binding.mixer.setTime(0.3);
    assert.ok(top.quaternion.angleTo(rest) < 1e-4);
});

test('a jump keeps its time in the air and leaves the flight to the game; the library is cheap to make', () => {
    const object = plainModel();
    const skeleton = libraryClips(object)[0].__reactorLibrary.skeleton;
    const bones = skeleton.joints.map(joint => ({ name: joint.name, parent: joint.parent, head: joint.head }));
    const jump = Library.stateClip(bones, 'jump');
    const full = Library.clip(bones, 'jump');
    assert.equal(jump.loop, false);
    assert.ok(jump.times[jump.times.length - 1] < full.times[full.times.length - 1] / 2, 'only the leap');
    const hips = jump.tracks.find(track => track.path === 'translation');
    const rise = Math.max(...Array.from({ length: hips.values.length / 3 }, (_, f) => hips.values[f * 3 + 1])) - bones[0].head[1];
    assert.ok(rise < 0.1, `the hips stay near their height: ${rise.toFixed(3)}`);
    const started = performance.now();
    for (const motion of Library.STATE_MOTIONS) assert.ok(Library.stateClip(bones, motion.id), motion.id);
    assert.ok(performance.now() - started < 400, 'six motions made in well under half a second');
});

test('a 17-bone humanoid without toe markers keeps its walking feet forward', () => {
    const object = plainModel(), walk = libraryClips(object).find(c => c.__reactorLibrary.id === 'walk');
    const skeleton = walk.__reactorLibrary.skeleton;
    assert.ok(!skeleton.joints.some(j => /ToeBase$/.test(j.name)));
    const bones = skeleton.joints.map(j => ({ name: j.name, parent: j.parent, head: j.head })), clip = Library.clip(bones, 'walk');
    const binding = R.prepareModelInstance(object, object.__reactorClips);
    binding.mixer.clipAction(R.resolveLibraryMotion(walk)).play();
    for (const [S, sign] of [['Left', 1], ['Right', -1]]) {
        const foot = skeleton.joints.find(j => j.name === S + 'Foot'), hips = skeleton.joints.find(j => j.name === 'Hips'), headings = [];
        for (const time of clip.times) {
            binding.mixer.setTime(time);
            object.updateMatrixWorld(true);
            const relative = joint => joint.node.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion(...joint.rest).invert());
            const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(relative(foot)), front = new THREE.Vector3(0, 0, 1).applyQuaternion(relative(hips));
            if (Math.abs(forward.y) > 0.6) continue;
            const a = Math.atan2(forward.x, forward.z) - Math.atan2(front.x, front.z), out = Math.atan2(Math.sin(a), Math.cos(a)) * 180 / Math.PI * sign;
            assert.ok(out > -1.6 && out < 18.5, `${S} points ${out.toFixed(1)} degrees outward at ${time.toFixed(2)} seconds`);
            headings.push(out);
        }
        headings.sort((a, b) => a - b);
        assert.ok(headings[headings.length >> 1] > 2, `${S}'s neutral heading points slightly out`);
    }
});
