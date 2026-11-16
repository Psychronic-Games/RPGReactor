/**
 * The game's rigged humanoids play the shared motion library (runtime/reactor_3d_motions.js) in each
 * movement state they have no motion of their own for: the library's walk, run, jump, swim, treading
 * and climb, made for the model's own skeleton when they first play, whatever its rest pose, its bone
 * frames or its armature's turn and scale. The model's own clips and animations win; the rig's
 * procedural motions are left for the states the library has none for (idle, riding).
 */
const test = require('node:test');
const { cpuMicros, withinBudget } = require('./helpers/timing.cjs');
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
        // Each names its own joint: by the joint's name where that finds it in its own model (2026-11-14), else by its uuid.
        for (const made of [walk, again]) {
            const info = made.__reactorLibrary, node = info.skeleton.joints.concat(info.skeleton.holders).map(j => j.node).find(n => made.tracks[0].name.indexOf(R.clipNodeRef(n, info.root) + '.') === 0);
            assert.ok(node, 'the first track names a joint of its own model');
            assert.equal(THREE.PropertyBinding.findNode(info.root, R.clipNodeRef(node, info.root)), node, 'and the mixer finds that joint by it');
        }
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

test('a jump keeps its time in the air and leaves the flight to the game; the library is cheap to make', tc => {
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
    const started = cpuMicros();
    for (const motion of Library.STATE_MOTIONS) assert.ok(Library.stateClip(bones, motion.id), motion.id);
    withinBudget(tc, (cpuMicros() - started) / 1000, 400, 'six motions made in well under half a second');
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

test('a climb takes the rungs on a skeleton with no fingers and no toes: hands over the shoulders, feet stepping', () => {
    // Owner, 2026-11-14: the party's imported models went up a ladder standing, arms at their sides. The game
    // reads a rigged file's skeleton without its fingers, and the climb's hands and feet were placed only on a
    // skeleton that had finger and toe joints to measure.
    const object = plainModel();
    const skeleton = libraryClips(object)[0].__reactorLibrary.skeleton;
    const bones = skeleton.joints.map(joint => ({ name: joint.name, parent: joint.parent, head: joint.head }));
    assert.ok(!bones.some(bone => /HandIndex|HandMiddle|ToeBase/.test(bone.name)), 'this skeleton has neither');
    const at = name => bones.findIndex(bone => bone.name === name);
    for (const id of ['climbLadder', 'climbWall']) {
        const made = Library.clip(bones, id), steps = made.times.length;
        const hands = { Left: [], Right: [] }, feet = { Left: [], Right: [] };
        for (let f = 0; f < steps; f += 3) {
            const place = libraryPlaces(bones, made, f, made.heights[f]);
            for (const S of ['Left', 'Right']) {
                hands[S].push(place[at(S + 'Hand')][1] - place[at(S + 'Arm')][1]);
                feet[S].push(place[at(S + 'Foot')][1]);
                assert.ok(place[at(S + 'Hand')][2] > place[at('Hips')][2] + 0.1, `${id}: the ${S} hand is out in front, on the rungs`);
            }
        }
        for (const S of ['Left', 'Right']) {
            // (At rest the hand hangs 0.4 under the shoulder; on the ladder it works between shoulder height and over it.)
            assert.ok(Math.min(...hands[S]) > -0.12, `${id}: the ${S} hand never hangs: lowest ${Math.min(...hands[S]).toFixed(2)} from the shoulder`);
            assert.ok(Math.max(...hands[S]) - Math.min(...hands[S]) > 0.12, `${id}: the ${S} hand reaches from rung to rung`);
            assert.ok(Math.max(...feet[S]) - Math.min(...feet[S]) > 0.12, `${id}: the ${S} foot steps up`);
        }
    }
    // Nothing else is aimed for such a skeleton that was not before: a walk is the capture's own.
    const walk = Library.clip(bones, 'walk'), place = libraryPlaces(bones, walk, 0, walk.heights[0]);
    assert.ok(place[at('LeftHand')][1] < place[at('LeftArm')][1] - 0.2, 'a walker\'s hand hangs');
});

test('the library\'s climb keeps time with the height climbed: still on a held ladder, back the way it came going down', () => {
    const object = plainModel();
    const binding = R.prepareModelInstance(object, object.__reactorClips);
    const rules = R.readModelAnimationRules({ rig: { template: 'humanoid', bones: carol.bones }, animations: [] }, object.__reactorClips);
    const climb = rules.find(rule => rule.trigger === 'climbing');
    assert.equal(climb.type, 'clip'); assert.equal(climb.clip, R.LIBRARY_CLIP_PREFIX + 'climbLadder');
    const at = (frame, height) => { R.applyModelAnimation(binding, rules, { frame, moving: false, climbing: true, climbHeight: height, scale: 1 }); return binding.clipAction.time; };
    const length = () => binding.clipAction.getClip().duration;
    at(0, 4.25);
    assert.ok(Math.abs(at(1, 4.25) - 0.25 * length()) < 1e-6, 'a quarter of a tile up: a quarter through the cycle');
    // Held: the clock runs on and the climb does not.
    const held = at(200, 4.25);
    assert.ok(Math.abs(held - 0.25 * length()) < 1e-6, `held still after 200 frames: ${held}`);
    assert.ok(Math.abs(at(201, 4.75) - 0.75 * length()) < 1e-6, 'half a tile on: half a cycle on');
    assert.ok(Math.abs(at(202, 4.5) - 0.5 * length()) < 1e-6, 'a quarter back down: a quarter back');
    assert.ok(Math.abs(at(203, -0.25) - 0.75 * length()) < 1e-6, 'under height 0 (in the map over, a ladder\'s foot lies below it) the cycle wraps and never runs negative');
});

test('a library motion names a joint as the file\'s own clips do, so the two are one blend on the joint', () => {
    // Owner, 2026-11-14: on a ladder come to at a run, the climber's left knee, left upper arm and right hand
    // stayed at rest (a straight leg through the rungs). The library named joints by uuid, the file's Running by
    // name: two blends on one joint, and the one faded out wrote the rest pose over the other.
    const root = new THREE.Group(), hips = new THREE.Bone(), knee = new THREE.Bone(), twin = new THREE.Bone(), odd = new THREE.Bone();
    hips.name = 'Hips'; knee.name = 'LeftLeg'; twin.name = 'LeftLeg'; odd.name = 'mixamorig:Spine';
    root.add(hips); hips.add(knee); hips.add(twin); hips.add(odd);
    assert.equal(R.clipNodeRef(hips, root), 'Hips', 'by its name, where the name finds it');
    assert.equal(R.clipNodeRef(knee, root), 'LeftLeg', 'the first of a name is found by it');
    assert.equal(R.clipNodeRef(twin, root), twin.uuid, 'a second joint of the same name is not: by uuid');
    assert.equal(R.clipNodeRef(odd, root), odd.uuid, 'nor a name the mixer would read as a path');
    assert.equal(R.clipNodeRef(hips, null), hips.uuid);
    // One blend: the file's clip and the library's motion on one joint share the mixer's binding for it.
    const object = plainModel(), climb = libraryClips(object).find(clip => clip.__reactorLibrary.id === 'climbLadder');
    R.resolveLibraryMotion(climb);
    const joint = climb.__reactorLibrary.skeleton.joints.find(j => j.name === 'LeftLeg').node;
    const named = R.clipNodeRef(joint, climb.__reactorLibrary.root);
    assert.ok(climb.tracks.some(track => track.name === named + '.quaternion'));
    if (named === joint.name) {
        const own = new THREE.AnimationClip('Running', 1, [new THREE.QuaternionKeyframeTrack(joint.name + '.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])]);
        const mixer = new THREE.AnimationMixer(climb.__reactorLibrary.root);
        const a = mixer.clipAction(own).play(), b = mixer.clipAction(climb).play();
        const at = action => action._propertyBindings[action.getClip().tracks.findIndex(track => track.name === joint.name + '.quaternion')];
        assert.equal(at(a), at(b), 'the same binding: a fade between them is a fade');
    }
});

test('a library climber stands where its hands meet the rungs, and each hand closes while it is on its rung', () => {
    // Owner, 2026-11-14 (a picture from the side): open hands a fifth of a tile through the ladder.
    const object = plainModel();
    const binding = R.prepareModelInstance(object, object.__reactorClips);
    const rules = R.readModelAnimationRules({ rig: { template: 'humanoid', bones: carol.bones }, animations: [] }, object.__reactorClips);
    const holder = { object, binding, rules };
    const reach = R.rungReach(holder);
    // The library's own number: the hips' place, 0.38 of the body's scale ahead of them, and the palm's depth back.
    const info = object.__reactorClips.find(c => c.__reactorLibrary && c.__reactorLibrary.id === 'climbLadder').__reactorLibrary;
    const hips = info.skeleton.joints.find(j => j.parent < 0), top = Math.max(...info.skeleton.joints.map(j => j.head[1]));
    assert.ok(Math.abs(reach - (hips.head[2] + 0.38 * top / 1.7 + R.LADDER_PALM)) < 1e-6, 'in the model\'s own frame: ' + reach);
    assert.equal(R.rungReach({ object, binding, rules: rules.filter(rule => rule.trigger !== 'climbing') }), null, 'a model whose climb is not the library\'s hangs by its chest, as before');
    // The fingers: the right hand is on its rung for the first 0.64 of a cycle, the left half a cycle on.
    const held = []; const hands = { Right: { n: 'R' }, Left: { n: 'L' } };
    const keep = R.HandGrip.hold;
    R.HandGrip.hold = (hand, thing) => { held.push(hand.n); assert.equal(thing, null, 'closed as a loose fist: nothing of the ladder is solved'); return true; };
    try {
        const at = height => { held.length = 0; R.climbGrip({ binding, climbHands: hands }, height); return held.join(''); };
        assert.equal(at(3.0), 'RL'); assert.equal(at(3.1), 'RL', 'both on their rungs as the right hand takes its own');
        assert.equal(at(3.3), 'R', 'the left hand reaches while the right holds'); assert.equal(at(3.6), 'RL'); assert.equal(at(3.7), 'L', 'then the right reaches');
        assert.equal(at(3.9), 'L'); assert.equal(at(-0.1), 'L', 'under height 0 (a ladder\'s foot below a map\'s own ground) the cycle is the same one');
        assert.equal(R.climbGrip({ binding, climbHands: hands }, NaN), 0);
    } finally { R.HandGrip.hold = keep; }
    const models = fs.readFileSync(path.join(root, 'runtime', 'reactor_3d_models.js'), 'utf8');
    assert.match(models, /if \(character\._reactorOnLadder\) Reactor3D\.climbGrip\(holder, character\._reactorAlt\);/);
    assert.match(models, /Number\.isFinite\(holder\.rungReach\) \? Reactor3D\.LADDER_RUNGS - holder\.rungReach : Reactor3D\.LADDER_RUNGS - Reactor3D\.LADDER_CHEST_GAP/);
});
