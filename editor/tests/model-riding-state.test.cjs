/**
 * The model state `riding`: a character seated on a vehicle (reactor_3d_models.js, reactor_rig_motions.js).
 * Riding outranks every movement state the way swimming and climbing outrank the gaits: a rider on a vehicle
 * that rolls at 20 tiles a second, jumps or fords plays its riding motion (the rig's own Ride stance when the
 * model has none) and nothing else, and what it holds in its hands is put away for the ride.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
// (VEH_SEAMS_RUNTIME: another copy of the runtime folder, for a check that a test fails when a rule is taken out.)
const runtimeRoot = process.env.VEH_SEAMS_RUNTIME || path.join(root, 'runtime');
// (VEH_SEAMS_EDITOR_SRC: another copy of the editor files this test reads, for the same check.)
const editorSrc = process.env.VEH_SEAMS_EDITOR_SRC || path.join(root, 'editor', 'src');
const R = require(path.join(runtimeRoot, 'reactor_3d.js'));
global.self = global; global.window = global;
require(path.join(runtimeRoot, 'libs', 'three.js'));
const THREE = global.THREE;
const P = require(path.join(runtimeRoot, 'reactor_rig_motions.js'));

const DEG = Math.PI / 180;
const MOVEMENT = ['idle', 'moving', 'walking', 'dashing', 'jumping', 'swimming', 'treading', 'climbing'];

/** A body cut into the rig's parts: each limb's chain names itself first and what carries it after. */
function doll() {
    const object = new THREE.Group();
    const chains = {
        Hips: ['Hips'], Spine: ['Spine', 'Hips'], Chest: ['Chest', 'Spine', 'Hips'], Head: ['Head', 'Chest', 'Spine', 'Hips'],
        LeftUpperArm: ['LeftUpperArm', 'Chest', 'Spine', 'Hips'], LeftLowerArm: ['LeftLowerArm', 'LeftUpperArm', 'Chest', 'Spine', 'Hips'],
        RightUpperArm: ['RightUpperArm', 'Chest', 'Spine', 'Hips'], RightLowerArm: ['RightLowerArm', 'RightUpperArm', 'Chest', 'Spine', 'Hips'],
        LeftUpperLeg: ['LeftUpperLeg', 'Hips'], LeftLowerLeg: ['LeftLowerLeg', 'LeftUpperLeg', 'Hips'],
        RightUpperLeg: ['RightUpperLeg', 'Hips'], RightLowerLeg: ['RightLowerLeg', 'RightUpperLeg', 'Hips']
    };
    const parts = {};
    for (const [name, chain] of Object.entries(chains)) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial());
        mesh.name = name;
        mesh.userData.parts = chain.map(partName => ({ name: partName, pivot: [0, 1, 0] }));
        object.add(mesh);
        parts[name] = mesh;
    }
    return { object, parts, binding: R.prepareModelInstance(object, []) };
}

const rigRules = (animations = []) => R.readModelAnimationRules({ animations, rig: { template: 'humanoid' } });
/** The turn a pose of `[x, y, z]` degrees gives a part with nothing above it turning. */
const pose = rotate => new THREE.Quaternion().setFromEuler(new THREE.Euler(rotate[0] * DEG, rotate[1] * DEG, rotate[2] * DEG, 'XYZ'));
/** The angle between two turns, in degrees (by the chord, so a turn that did not change measures 0 and not the rounding of an arc cosine). */
const angleBetween = (a, b) => {
    const chord = Math.min(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w), Math.hypot(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w));
    return 4 * Math.asin(Math.min(1, chord / 2)) / DEG;
};
/** At 20 tiles a second: moving and dashing by every test the engine makes, a third of a tile a frame. */
const atSpeed = (frame, extra) => Object.assign({ frame, moving: true, dashing: true, distance: 20 / 60, scale: 1, airborne: false, swimming: false, climbing: false }, extra);
const standing = (frame, extra) => Object.assign({ frame, moving: false, dashing: false, distance: 0, scale: 1 }, extra);

/** Run frames `from` to `to` and answer, per frame, each named part's turn and the whole body's lift. */
function play(model, rules, state, from, to, names) {
    const frames = [];
    for (let frame = from; frame < to; frame++) {
        R.applyModelAnimation(model.binding, rules, state(frame));
        frames.push({ lift: model.binding.root.position.y, turn: Object.fromEntries(names.map(name => [name, model.parts[name].quaternion.clone()])) });
    }
    return frames;
}
/** How far (degrees) a part's turn wanders over the frames. */
const wander = (frames, name) => Math.max(...frames.map(frame => angleBetween(frame.turn[name], frames[0].turn[name])));

test('riding is a state of its own: true for a rider, and every movement state is false while it lasts', () => {
    for (const body of [{}, { moving: true }, { moving: true, dashing: true }, { airborne: true }, { swimming: true }, { swimming: true, moving: true }, { climbing: true }]) {
        const rider = Object.assign({ riding: true }, body), label = JSON.stringify(body);
        assert.equal(R.moveTriggerActive('riding', rider), true, `riding while ${label}`);
        for (const trigger of MOVEMENT) assert.equal(R.moveTriggerActive(trigger, rider), false, `${trigger} is not in force on a rider while ${label}`);
        assert.equal(R.isIdleState(rider), false, `a rider is not idle while ${label}`);
        // Rules that play always or on demand are no movement trigger, for a rider as for anyone.
        assert.equal(R.moveTriggerActive('always', rider), null);
        assert.equal(R.moveTriggerActive('action', rider), null);
        // Nobody else rides.
        assert.equal(R.moveTriggerActive('riding', body), false, `on foot while ${label}`);
        assert.equal(R.moveTriggerActive('riding', Object.assign({ riding: false }, body)), false);
    }
});

test('a state that says nothing of riding is read exactly as before', () => {
    const expected = {
        idle: [true, false, false, false, false, false, false],
        moving: [false, true, true, false, false, true, false],
        walking: [false, true, false, false, false, false, false],
        dashing: [false, false, true, false, false, false, false],
        jumping: [false, false, false, true, false, false, false],
        swimming: [false, false, false, false, false, true, false],
        treading: [false, false, false, false, true, false, false],
        climbing: [false, false, false, false, false, false, true]
    };
    const bodies = [{}, { moving: true }, { moving: true, dashing: true }, { airborne: true }, { swimming: true }, { swimming: true, moving: true }, { climbing: true }];
    for (const trigger of MOVEMENT) {
        assert.deepEqual(bodies.map(body => R.moveTriggerActive(trigger, body)), expected[trigger], trigger);
        assert.deepEqual(bodies.map(body => R.moveTriggerActive(trigger, Object.assign({ riding: false }, body))), expected[trigger], trigger + ', riding false');
    }
    assert.deepEqual(bodies.map(body => R.isIdleState(body)), expected.idle);
    assert.equal(R.moveTriggerActive('always', {}), null);
    assert.equal(R.moveTriggerActive('action', { moving: true }), null);
});

test('the reader keeps the riding trigger, and a rig brings its Ride stance to any model that has no riding motion', () => {
    assert.equal(R.readModelAnimationRules({ animations: [{ name: 'Seat', type: 'pose', part: 'Hips', trigger: 'riding', rotate: [10, 0, 0] }] })[0].trigger, 'riding');
    assert.equal(R.readModelAnimationRules({ animations: [{ name: 'Seat', type: 'clip', clip: 'Seat', trigger: 'riding' }] })[0].trigger, 'riding');
    assert.equal(R.readModelAnimationRules({ animations: [{ name: 'x', trigger: 'flying' }] })[0].trigger, 'always', 'an unknown trigger is still Always');

    const rules = rigRules();
    const ride = rules.filter(rule => rule.trigger === 'riding');
    assert.equal(ride.length, 9);
    assert.ok(ride.every(rule => rule.name === 'Ride' && rule.defaultMotion && rule.type === 'pose' && rule.keys.length === 2));
    // A model with a riding motion or clip of its own keeps it, and gets no stance on top.
    const own = rigRules([{ name: 'Seat', type: 'pose', part: 'Hips', trigger: 'riding', rotate: [10, 0, 0] }]);
    assert.deepEqual(own.filter(rule => rule.trigger === 'riding').map(rule => rule.name), ['Seat']);
    const clip = rigRules([{ name: 'Seat', type: 'clip', clip: 'Seat', trigger: 'riding' }]);
    assert.deepEqual(clip.filter(rule => rule.trigger === 'riding').map(rule => rule.type), ['clip']);
    // Switched off with the rest of the rig's defaults; a rig that is no humanoid has none.
    assert.equal(R.readModelAnimationRules({ animations: [], rig: { template: 'humanoid' }, defaultMotions: false }).length, 0);
    assert.equal(R.readModelAnimationRules({ animations: [], rig: { template: 'quadruped' } }).some(rule => rule.trigger === 'riding'), false);
});

test('the Ride stance: seated astride, held still, and nothing the rider\'s points set is in it', () => {
    assert.equal(fs.readFileSync(path.join(editorSrc, 'database', 'RigMotionPresets.js'), 'utf8'),
        fs.readFileSync(path.join(runtimeRoot, 'reactor_rig_motions.js'), 'utf8'), 'the editor and the game share one preset file');
    const ride = P.byId('ride');
    assert.deepEqual([ride.name, ride.template, ride.trigger], ['Ride', 'humanoid', 'riding']);
    assert.equal(P.DEFAULTS.humanoid.riding, 'ride');
    assert.ok(P.forTemplate('humanoid').includes(ride), 'offered among the humanoid presets');
    const tracks = Object.fromEntries(ride.rules.map(rule => [rule.part, rule]));
    assert.deepEqual(Object.keys(tracks).sort(), ['LeftLowerArm', 'LeftLowerLeg', 'LeftUpperArm', 'LeftUpperLeg', 'RightLowerArm', 'RightLowerLeg', 'RightUpperArm', 'RightUpperLeg', 'Spine']);
    for (const rule of ride.rules) {
        assert.deepEqual([rule.type, rule.trigger, rule.name], ['pose', 'riding', 'Ride']);
        // Held: the same pose at both ends of the motion, and no move of the body, so nothing breathes or bobs.
        assert.deepEqual(rule.keys.map(stop => stop.at), [0, 1]);
        assert.deepEqual(rule.keys[0].rotate, rule.keys[1].rotate);
        assert.ok(rule.keys.every(stop => stop.move === undefined));
    }
    const at = part => tracks[part].keys[0].rotate;
    // Thighs forward 70 degrees and a little apart, shins back 100, the back bent 30 forward, arms out ahead.
    assert.deepEqual([at('LeftUpperLeg')[0], at('RightUpperLeg')[0]], [-70, -70]);
    assert.ok(at('LeftUpperLeg')[2] > 0 && at('RightUpperLeg')[2] === -at('LeftUpperLeg')[2], 'knees apart, mirrored');
    assert.deepEqual([at('LeftLowerLeg'), at('RightLowerLeg')], [[100, 0, 0], [100, 0, 0]]);
    assert.deepEqual(at('Spine'), [30, 0, 0]);
    assert.ok(at('LeftUpperArm')[0] <= -60 && at('RightUpperArm')[0] === at('LeftUpperArm')[0], 'both arms forward');
    // Drawn in, not out: a rig's arms hang some way out at rest and a raised arm keeps that, so 10 degrees in
    // leaves the Demo hero's hands a bar's width apart (1.14 tiles at a height of 3; measured, lab-stance.cjs).
    assert.deepEqual([at('LeftUpperArm')[2], at('RightUpperArm')[2]], [-10, 10], 'drawn in, mirrored');
    assert.ok(at('LeftLowerArm')[0] < 0 && at('LeftLowerArm')[0] === at('RightLowerArm')[0], 'elbows a little bent');
    // A preset of the rig lands whole in the rules: the runtime reads every key.
    const read = R.readModelAnimationRules({ animations: ride.rules });
    assert.equal(read.length, 9);
    assert.ok(read.every(rule => rule.trigger === 'riding' && rule.keys.length === 2));
});

test('a rider at 20 tiles a second plays Ride, not Run', () => {
    const rules = rigRules();
    const limbs = ['LeftUpperLeg', 'RightUpperLeg', 'Spine', 'LeftUpperArm'];

    // On foot at that speed the rig runs: the thighs swing, the body rises and falls.
    const runner = doll();
    const ran = play(runner, rules, frame => atSpeed(frame), 0, 120, limbs).slice(20);
    assert.ok(wander(ran, 'LeftUpperLeg') > 40, `a runner's thigh swings ${wander(ran, 'LeftUpperLeg').toFixed(1)} degrees`);
    assert.ok(Math.max(...ran.map(frame => frame.lift)) > 0.02, 'and the body bobs');

    // Seated: the same travel, the same dash, and the stance alone.
    const rider = doll();
    const rode = play(rider, rules, frame => atSpeed(frame, { riding: true }), 0, 120, limbs).slice(20);
    for (const name of limbs) assert.ok(wander(rode, name) < 1e-9, `${name} holds still on a rider (it wandered ${wander(rode, name)} degrees)`);
    assert.ok(rode.every(frame => frame.lift === 0), 'the body does not bob');
    const last = rode[rode.length - 1].turn;
    assert.ok(angleBetween(last.LeftUpperLeg, pose([-70, 0, 10])) < 1e-6, 'the left thigh is forward 70 degrees, 10 out');
    assert.ok(angleBetween(last.RightUpperLeg, pose([-70, 0, -10])) < 1e-6, 'the right thigh mirrors it');
    assert.ok(angleBetween(last.Spine, pose([30, 0, 0])) < 1e-6, 'the back is bent 30 degrees forward');
    // The arm rides the bent back: the spine's turn, then its own.
    assert.ok(angleBetween(last.LeftUpperArm, pose([30, 0, 0]).multiply(pose([-80, 0, -10]))) < 1e-6, 'the arm is out ahead of the bent back');
});

test('nothing of the body\'s own states plays under a rider: no breath at a standstill, no jump in the air, no stroke in a ford', () => {
    const rules = rigRules();
    const watched = ['Chest', 'Head', 'LeftUpperArm', 'LeftUpperLeg', 'LeftLowerLeg'];
    const seatedAt = frames => frames[frames.length - 1].turn;
    // What the stance alone gives, to compare every other body state with.
    const still = doll();
    const reference = seatedAt(play(still, rules, frame => standing(frame, { riding: true }), 0, 200, watched));
    assert.ok(angleBetween(reference.Chest, pose([30, 0, 0])) < 1e-6, 'the chest is carried by the bent back and turns by nothing of its own');

    for (const [label, body, moves] of [
        ['at a standstill', {}, 'Chest'],
        ['in the air', { airborne: true }, 'LeftUpperLeg'],
        ['in deep water, moving', { swimming: true, moving: true, distance: 0.1 }, 'LeftUpperArm'],
        ['in deep water, still', { swimming: true }, 'LeftLowerLeg'],
        ['on a ladder', { climbing: true, climbHeight: 0.3 }, 'LeftUpperLeg']]) {
        // On foot the state's own motion plays (so the comparison means something).
        const walker = doll();
        const onFoot = play(walker, rules, frame => standing(frame, Object.assign({}, body, body.climbing ? { climbHeight: frame * 0.02 } : null)), 0, 200, watched).slice(40);
        assert.ok(wander(onFoot, moves) > 0.5 || angleBetween(onFoot[0].turn[moves], new THREE.Quaternion()) > 0.5, `on foot ${label}, ${moves} moves`);
        // Seated, the stance holds and nothing else is laid on it.
        const rider = doll();
        const rode = play(rider, rules, frame => standing(frame, Object.assign({ riding: true }, body, body.climbing ? { climbHeight: frame * 0.02 } : null)), 0, 200, watched).slice(40);
        for (const name of watched) {
            assert.ok(wander(rode, name) < 1e-9, `${name} holds still on a rider ${label}`);
            assert.ok(angleBetween(seatedAt(rode)[name], reference[name]) < 1e-6, `${name} is the stance's own on a rider ${label}`);
        }
        assert.ok(rode.every(frame => frame.lift === 0 && rider.binding.root.quaternion.w === 1), `the whole body is not moved ${label}`);
    }
});

test('the stance eases in when the ride begins and out when it ends', () => {
    const rules = rigRules(), model = doll();
    const thigh = () => model.parts.LeftUpperLeg.quaternion.clone();
    for (let frame = 0; frame < 40; frame++) R.applyModelAnimation(model.binding, rules, standing(frame));
    // The first frame seated is already on its way, and it is there within the engine's own fade.
    R.applyModelAnimation(model.binding, rules, standing(40, { riding: true }));
    const first = angleBetween(thigh(), pose([-70, 0, 10]));
    assert.ok(first > 1 && first < 70, `one frame in, the thigh is ${first.toFixed(1)} degrees from the stance`);
    for (let frame = 41; frame < 41 + R.MOTION_FADE_FRAMES; frame++) R.applyModelAnimation(model.binding, rules, standing(frame, { riding: true }));
    assert.ok(angleBetween(thigh(), pose([-70, 0, 10])) < 1e-6, 'seated when the fade is over');
    // Off again: back to the body's own motion, with nothing of the stance left.
    for (let frame = 60; frame < 60 + R.MOTION_FADE_FRAMES + 2; frame++) R.applyModelAnimation(model.binding, rules, standing(frame));
    assert.ok(angleBetween(thigh(), new THREE.Quaternion()) < 1e-6, 'the thigh hangs again');
});

/** A model with clips of its own: one node the clips move, and a mixer. */
function clipped(names) {
    const object = new THREE.Group(), bone = new THREE.Object3D();
    bone.name = 'Bone';
    object.add(bone);
    const clips = names.map(name => new THREE.AnimationClip(name, 1, [new THREE.NumberKeyframeTrack('Bone.position[y]', [0, 1], [0, 1])]));
    return { object, binding: R.prepareModelInstance(object, clips) };
}
const clipRule = (name, trigger) => ({ name, type: 'clip', clip: name, trigger });
const playing = binding => (binding.clipAction ? binding.clipAction.getClip().name : null);

test('a riding clip is picked first; a rider with none plays no gait, idle, jump or swim clip', () => {
    const names = ['Idle', 'Walk', 'Run', 'Jump', 'Swim', 'Seat'];
    const gaits = [clipRule('Idle', 'idle'), clipRule('Walk', 'walking'), clipRule('Run', 'dashing'), clipRule('Jump', 'jumping'), clipRule('Swim', 'swimming')];
    const bodies = [['at speed', atSpeed(0), 'Run'], ['walking', atSpeed(0, { dashing: false }), 'Walk'], ['standing', standing(0), 'Idle'],
        ['in the air', atSpeed(0, { airborne: true }), 'Jump'], ['in deep water', atSpeed(0, { swimming: true }), 'Swim']];

    // With a riding clip: it plays whatever the body under the rider is doing, and loops.
    const withSeat = R.readModelAnimationRules({ animations: gaits.concat([clipRule('Seat', 'riding')]) });
    for (const [label, body, onFoot] of bodies) {
        const model = clipped(names);
        R.applyModelAnimation(model.binding, withSeat, Object.assign({}, body));
        assert.equal(playing(model.binding), onFoot, `on foot ${label}`);
        const rider = clipped(names);
        R.applyModelAnimation(rider.binding, withSeat, Object.assign({}, body, { riding: true }));
        assert.equal(playing(rider.binding), 'Seat', `seated ${label}`);
        assert.equal(rider.binding.clipAction.loop, THREE.LoopRepeat, 'the riding clip loops');
    }
    // A clip that plays always does not take the seat from the riding clip (as it takes none from a jump or a swim).
    const seatAndHum = R.readModelAnimationRules({ animations: gaits.concat([clipRule('Hum', 'always'), clipRule('Seat', 'riding')]) });
    const both = clipped(names.concat(['Hum']));
    R.applyModelAnimation(both.binding, seatAndHum, atSpeed(0, { riding: true }));
    assert.equal(playing(both.binding), 'Seat', 'the riding clip, not the one that plays always');
    // Getting on and off changes the clip both ways.
    const model = clipped(names);
    R.applyModelAnimation(model.binding, withSeat, atSpeed(0));
    R.applyModelAnimation(model.binding, withSeat, atSpeed(1, { riding: true }));
    assert.equal(playing(model.binding), 'Seat');
    R.applyModelAnimation(model.binding, withSeat, atSpeed(2));
    assert.equal(playing(model.binding), 'Run');
    // The riding clip plays at its own rate (Speed on its card), not at 1 and not at the rate of the gait it took over from.
    const paced = R.readModelAnimationRules({ animations: [Object.assign(clipRule('Run', 'dashing'), { rate: 3 }), Object.assign(clipRule('Seat', 'riding'), { rate: 2 })] });
    const pacer = clipped(names);
    R.applyModelAnimation(pacer.binding, paced, atSpeed(0));
    assert.deepEqual([playing(pacer.binding), pacer.binding.clipAction.timeScale], ['Run', 3]);
    R.applyModelAnimation(pacer.binding, paced, atSpeed(1, { riding: true }));
    assert.deepEqual([playing(pacer.binding), pacer.binding.clipAction.timeScale], ['Seat', 2], 'the riding clip at its own rate');
    const unpaced = R.readModelAnimationRules({ animations: [Object.assign(clipRule('Run', 'dashing'), { rate: 3 }), clipRule('Seat', 'riding')] });
    const steady = clipped(names);
    R.applyModelAnimation(steady.binding, unpaced, atSpeed(0));
    R.applyModelAnimation(steady.binding, unpaced, atSpeed(1, { riding: true }));
    assert.deepEqual([playing(steady.binding), steady.binding.clipAction.timeScale], ['Seat', 1], 'a riding clip with no rate of its own plays at 1');

    // With no riding clip but a rig: the rig's Ride plays from the rest pose, and no clip plays under it.
    const rigged = R.readModelAnimationRules({ animations: gaits, rig: { template: 'humanoid' } });
    assert.ok(rigged.some(rule => rule.trigger === 'riding' && rule.type === 'pose'));
    for (const [label, body, onFoot] of bodies) {
        const walker = clipped(names);
        R.applyModelAnimation(walker.binding, rigged, Object.assign({}, body));
        assert.equal(playing(walker.binding), onFoot, `a rigged model on foot ${label}`);
        const rider = clipped(names);
        R.applyModelAnimation(rider.binding, rigged, Object.assign({}, body, { riding: true }));
        assert.equal(playing(rider.binding), null, `a rigged rider ${label} plays no clip`);
    }
    // (Nor a clip that plays always: the stance is laid on the rest pose, as a rig's Jump is in the air.)
    const riggedHum = R.readModelAnimationRules({ animations: gaits.concat([clipRule('Hum', 'always')]), rig: { template: 'humanoid' } });
    const stanceOnly = clipped(names.concat(['Hum']));
    R.applyModelAnimation(stanceOnly.binding, riggedHum, atSpeed(0, { riding: true }));
    assert.equal(playing(stanceOnly.binding), null, 'the rig\'s Ride plays from the rest pose');
    // With no riding motion at all: still no gait under a rider; a clip that plays always is the one left.
    const bare = R.readModelAnimationRules({ animations: gaits });
    const always = R.readModelAnimationRules({ animations: gaits.concat([clipRule('Hum', 'always')]) });
    for (const [label, body] of bodies) {
        const rider = clipped(names);
        R.applyModelAnimation(rider.binding, bare, Object.assign({}, body, { riding: true }));
        assert.equal(playing(rider.binding), null, `a rider with no riding motion ${label}`);
        const humming = clipped(names.concat(['Hum']));
        R.applyModelAnimation(humming.binding, always, Object.assign({}, body, { riding: true }));
        assert.equal(playing(humming.binding), 'Hum', `only the clip that plays always, ${label}`);
    }
});

test('what a rider holds is put away while seated, and comes back to the hand on foot', () => {
    const H = R.MapHeld;
    const weapon = { visible: true };
    const character = { eventId: () => 4711, _rrSeated: true };
    const state = { character, idle: false, stowed: false, shown: false, record: { object: weapon }, slots: [], pinned: [], owner: null };
    const holder = { object: new THREE.Group() };
    H.states.set('e4711', state);
    try {
        assert.equal(H.update(holder, character, null, false), false);
        assert.deepEqual([state.stowed, weapon.visible], [true, false], 'seated: put away');
        assert.equal(state.owner, null, 'and the arms are not taken for it');
        assert.equal(H.update(holder, character, null, false), false);
        assert.equal(weapon.visible, false, 'for as long as the ride lasts');
        // The frame the rider is on foot again it is taken out (a hidden model does no more than that).
        character._rrSeated = false;
        H.update(holder, character, null, true);
        assert.deepEqual([state.stowed, weapon.visible], [false, true], 'on foot: back in the hand');
        // A climb still puts it away, and somebody who neither rides nor climbs keeps it.
        character._reactorMantle = { over: false };
        H.update(holder, character, null, true);
        assert.deepEqual([state.stowed, weapon.visible], [true, false]);
        character._reactorMantle = null;
        H.update(holder, character, null, true);
        assert.deepEqual([state.stowed, weapon.visible], [false, true]);
    } finally {
        H.states.delete('e4711');
    }
});

//-----------------------------------------------------------------------------
// The editor: Database > 3D Models offers the state wherever a motion says when it plays, and shows it.

const Editor = require(path.join(editorSrc, 'database', 'Database3DEditor.js'));
const RRMotionEditor = require(path.join(editorSrc, 'database', 'MotionEditor.js'));
const editorSource = fs.readFileSync(path.join(editorSrc, 'database', 'Database3DEditor.js'), 'utf8');

/** The 3D Models page with no window behind it: its strings come back as written. */
function page() {
    const e = new Editor({}, {});
    e._t = (text, params = {}) => Object.entries(params).reduce((value, [key, replacement]) => value.split(`{${key}}`).join(String(replacement)), text);
    e.rawAnimations = [];
    e.rawEffects = [];
    e.playRules = [];
    return e;
}
/** The preview's state bar, as much of an element as the page asks of one. */
function simBar(e) {
    const bar = { innerHTML: '', style: {}, querySelectorAll: () => [], querySelector: () => null };
    e._detail = { querySelector: selector => (selector === '.r3d-sim-bar' ? bar : null) };
    return bar;
}

test('the editor offers While riding wherever a motion says when it plays', () => {
    // The Motion editor's own list.
    assert.ok(RRMotionEditor.TRIGGERS().some(([value, label]) => value === 'riding' && label === 'While riding'));
    // The animation card's Play when list.
    assert.match(editorSource, /<option value="riding"\$\{work\.trigger === 'riding' \? ' selected' : ''\}>\$\{this\._t\('While riding'\)\}<\/option>/);
    // Every movement trigger the game's reader keeps is one both lists offer, so no motion opens as another.
    const kept = ['idle', 'moving', 'walking', 'dashing', 'jumping', 'swimming', 'treading', 'climbing', 'riding', 'action', 'always'];
    for (const trigger of kept) {
        assert.equal(R.readModelAnimationRules({ animations: [{ name: 'x', part: 'p', trigger }] })[0].trigger, trigger, `the game keeps ${trigger}`);
        assert.ok(RRMotionEditor.TRIGGERS().some(([value]) => value === trigger), `the Motion editor offers ${trigger}`);
        assert.ok(editorSource.includes(`<option value="${trigger}"\${work.trigger === '${trigger}' ? ' selected' : ''}>`), `the card offers ${trigger}`);
    }
    // The line a motion has in the Animations list, and the line of a preset in the Preset Motions dialog.
    const e = page();
    assert.equal(e.ruleSummary({ name: 'Seat', type: 'pose', part: 'Hips', trigger: 'riding' }), 'Seat — Pose · Hips · While riding');
    assert.match(editorSource, /t === 'riding' \? 'While riding'/, 'the preset card says when Ride plays');
});

test('the preview has a Riding state for a model with a riding motion, and plays it as the game does', () => {
    const e = page(), bar = simBar(e);
    // A model with nothing that rides is not offered the state.
    e.rawAnimations = [{ name: 'Walk', type: 'clip', clip: 'Walk', trigger: 'walking' }];
    e.playRules = R.readModelAnimationRules({ animations: e.rawAnimations });
    assert.deepEqual(e.previewStates(), ['standing', 'walking']);
    // A rigged model has its rig's Ride, so it is.
    e.playRules = R.readModelAnimationRules({ animations: e.rawAnimations, rig: { template: 'humanoid' } });
    assert.ok(e.previewStates().includes('riding'));
    assert.equal(e.previewStates().indexOf('riding'), e.previewStates().length - 1, 'after the body\'s own states');
    // So is one whose own motion is set to While riding, and one being set to it on the card.
    e.playRules = [];
    e.rawAnimations = [{ name: 'Seat', type: 'pose', part: 'Hips', trigger: 'riding' }];
    assert.deepEqual(e.previewStates(), ['standing', 'riding']);
    e.rawAnimations = [];
    e._work = { trigger: 'riding' };
    assert.deepEqual(e.previewStates(), ['standing', 'riding']);
    e._work = null;
    e.rawAnimations = [{ name: 'Seat', type: 'pose', part: 'Hips', trigger: 'riding' }];

    // Picking it: riding alone, shown pressed on the bar.
    e._sim.walking = true; e._sim.dashing = true;
    e.setPreviewState('riding');
    assert.equal(e.previewState(), 'riding');
    assert.deepEqual([e._sim.riding, e._sim.walking, e._sim.dashing, e._sim.jumping, e._sim.swimming, e._sim.climbing], [true, false, false, false, false, false]);
    assert.match(bar.innerHTML, /<button type="button" class="r3d-preview-state active" data-state="riding" aria-pressed="true">Riding<\/button>/);
    // A body that rides is a body: beside Riding its rest is Standing, as for one that walks. Idle is the word for
    // a thing that only moves (a car, a drone).
    assert.match(bar.innerHTML, /data-state="standing" aria-pressed="false">Standing<\/button>/, 'a model whose only state motion is riding stands');
    const car = page(), carBar = simBar(car);
    car.rawAnimations = [{ name: 'Roll', type: 'spin', part: 'Wheel', trigger: 'moving', perTile: 120 }];
    car.renderSimBar();
    assert.match(carBar.innerHTML, /data-state="standing" aria-pressed="true">Idle<\/button>.*data-state="walking" aria-pressed="false">Moving<\/button>/, 'a model that only moves idles');
    // Picking another state leaves it.
    e.setPreviewState('standing');
    assert.equal(e._sim.riding, false);
    assert.equal(e.previewState(), 'standing');
    assert.match(bar.innerHTML, /class="r3d-preview-state" data-state="riding" aria-pressed="false">Riding</);
    // A model that loses its riding motion while the state is on drops back to standing.
    e.setPreviewState('riding');
    e.rawAnimations = [{ name: 'Walk', type: 'clip', clip: 'Walk', trigger: 'walking' }];
    e.renderSimBar();
    assert.equal(e._sim.riding, false);
    assert.equal(e.previewState(), 'standing');

    // The state reaches the rule engine, keeps the preview drawing, and is cleared with the rest on another model.
    assert.match(editorSource, /climbing: !!this\._sim\.climbing,\n\s+\/\/[^\n]*\n\s+riding: !!this\._sim\.riding,/, 'the preview\'s state says riding');
    assert.match(editorSource, /\|\| !!this\._sim\.climbing \|\| !!this\._sim\.riding \|\|/, 'a riding preview keeps drawing');
    assert.match(editorSource, /this\._sim\.climbing = false;\n\s+this\._sim\.riding = false;/, 'cleared when another model is picked');
});

test('Ride, While riding and Riding are written in every one of the 17 languages', () => {
    const source = fs.readFileSync(path.join(editorSrc, 'I18nManager.js'), 'utf8');
    const from = source.indexOf('// Vehicle seams (Database > 3D Models)'), to = source.indexOf('// (end of the vehicle seams)');
    assert.ok(from > 0 && to > from, 'the block is in the file under its own header');
    const block = source.slice(from, to);
    const locales = ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr'];
    for (const locale of locales) {
        const line = block.split('\n').find(text => text.startsWith(`Object.assign(RR_TEXT_TRANSLATIONS["${locale}"], `));
        assert.ok(line, `${locale} has its line`);
        const table = JSON.parse(line.slice(line.indexOf('{'), line.lastIndexOf('}') + 1));
        assert.deepEqual(Object.keys(table), ['While riding', 'Riding', 'Ride'], locale);
        for (const [phrase, text] of Object.entries(table)) {
            assert.ok(typeof text === 'string' && text.trim().length > 0 && text !== phrase, `${locale}: ${phrase} is translated`);
        }
    }
    assert.equal(block.split('\n').filter(text => text.startsWith('Object.assign(')).length, locales.length);
});
