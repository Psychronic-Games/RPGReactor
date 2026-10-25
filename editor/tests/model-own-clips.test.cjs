/**
 * A model's own clips named for a movement state (Walking, Running, Idle...) play in that state
 * without being added as animations, in the game and in the editor's preview; an animation set
 * for the state wins over the clip, and the clip over the rig's default motion. And a map event
 * whose first page is given a model stands as the model in both editor views without Preview Event.
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

const rig = { template: 'humanoid', markers: {} };
const triggersOf = rules => Object.fromEntries(rules.filter(rule => rule.ownClip).map(rule => [rule.clip, rule.trigger]));
const defaultsOf = rules => [...new Set(rules.filter(rule => rule.defaultMotion).map(rule => rule.name))];

test('a clip name says its movement state: walk/walking, run/running, idle/breathe, numbered or in place', () => {
    const state = name => (R.clipStateOf(name) || {}).state || null;
    assert.equal(state('Walking'), 'walking');
    assert.equal(state('walk'), 'walking');
    assert.equal(state('Running'), 'dashing');
    assert.equal(state('Sprint'), 'dashing');
    assert.equal(state('Idle_9'), 'idle');
    assert.equal(state('Breathe'), 'idle');
    assert.equal(state('Armature|Idle'), 'idle');
    assert.equal(state('IdleLoop'), 'idle');
    assert.equal(state('Walk_inplace'), 'walking');
    assert.equal(state('Jump'), 'jumping');
    assert.equal(state('Swim'), 'swimming');
    assert.equal(state('Treading Water'), 'treading');
    assert.equal(state('Climb'), 'climbing');
    // Anything that is more than the state's own word is the author's to place.
    for (const name of ['Walk_Backward_inplace', 'Walking_Woman', 'run_fast_7_inplace', 'Regular_Jump', 'Ladder_Climb_Loop', 'Rifle_Charge_inplace', 'Armature|mixamo.com|Layer0', '']) {
        assert.equal(state(name), null, name);
    }
    assert.equal(R.clipStateOf('Walking').exact, true);
    assert.equal(R.clipStateOf('walking_2_inplace').exact, false);
});

test('a rigged model with Walking and Running clips walks and runs with them, not the rig defaults', () => {
    const clips = ['Running', 'Walking'];
    const rules = R.readModelAnimationRules({ animations: [], rig }, clips);
    assert.deepEqual(triggersOf(rules), { Walking: 'walking', Running: 'dashing' });
    const defaults = defaultsOf(rules);
    assert.ok(!defaults.includes('Walk') && !defaults.includes('Run'), `defaults ${defaults}`);
    assert.ok(defaults.includes('Breathe') && defaults.includes('Jump'), 'the states the clips leave open keep the defaults');
    // Without the clips (the old call) the rig's Walk and Run play.
    assert.ok(defaultsOf(R.readModelAnimationRules({ animations: [], rig })).includes('Walk'));
    // AnimationClips are read by their names.
    const asClips = clips.map(name => new THREE.AnimationClip(name, 1, []));
    assert.deepEqual(triggersOf(R.readModelAnimationRules({ animations: [], rig }, asClips)), { Walking: 'walking', Running: 'dashing' });
});

test('an animation set for a state wins over the clip named for it', () => {
    const clips = ['Walking', 'Running', 'Idle_9'];
    const rules = R.readModelAnimationRules({ rig, animations: [
        { name: 'Stroll', type: 'clip', clip: 'Walking_Woman', trigger: 'walking' },
        { name: 'Breathe hard', part: 'Chest', type: 'pose', trigger: 'idle', keys: [{ at: 0, rotate: [5, 0, 0] }] }
    ] }, clips);
    assert.deepEqual(triggersOf(rules), { Running: 'dashing' });
    // A rule on "moving" covers both gaits.
    const moving = R.readModelAnimationRules({ animations: [{ name: 'Go', type: 'clip', clip: 'Go', trigger: 'moving' }] }, clips);
    assert.deepEqual(triggersOf(moving), { Idle_9: 'idle' });
    // A clip added on demand still walks: being playable by name says nothing of walking.
    const onDemand = R.readModelAnimationRules({ animations: [{ name: 'Walking', type: 'clip', clip: 'Walking', trigger: 'action' }] }, clips);
    assert.equal(triggersOf(onDemand).Walking, 'walking');
    // The rig's defaults switched off leave the clips playing.
    assert.deepEqual(triggersOf(R.readModelAnimationRules({ rig, defaultMotions: false, animations: [] }, clips)), { Idle_9: 'idle', Walking: 'walking', Running: 'dashing' });
});

test('the exactly named clip wins, then the first in the file; a walk alone also plays while dashing without a rig run', () => {
    assert.deepEqual(triggersOf(R.readModelAnimationRules({ animations: [] }, ['walking_2_inplace', 'Walking'])), { Walking: 'moving' });
    assert.deepEqual(triggersOf(R.readModelAnimationRules({ animations: [] }, ['Idle_10', 'Idle_11'])), { Idle_10: 'idle' });
    // With the rig's Run there to fill dashing, the walk keeps to walking.
    const rigged = R.readModelAnimationRules({ animations: [], rig }, ['Walking']);
    assert.equal(triggersOf(rigged).Walking, 'walking');
    assert.ok(defaultsOf(rigged).includes('Run'));
});

/** A model with clips of its own: one node the clips move, and a mixer. */
function clipped(names) {
    const object = new THREE.Group(), bone = new THREE.Object3D();
    bone.name = 'Bone';
    object.add(bone);
    const clips = names.map(name => new THREE.AnimationClip(name, 1, [new THREE.NumberKeyframeTrack('Bone.position[y]', [0, 1], [0, 1])]));
    return { object, clips, binding: R.prepareModelInstance(object, clips) };
}
const playing = binding => (binding.clipAction ? binding.clipAction.getClip().name : null);
const state = (frame, extra) => Object.assign({ frame, moving: false, dashing: false, distance: 0, scale: 1, airborne: false, swimming: false, climbing: false }, extra);

test('in play the model walks, runs and idles on its own clips', () => {
    const model = clipped(['Idle', 'Walking', 'Running']);
    const rules = R.readModelAnimationRules({ animations: [], rig }, model.clips);
    R.applyModelAnimation(model.binding, rules, state(0));
    assert.equal(playing(model.binding), 'Idle');
    R.applyModelAnimation(model.binding, rules, state(30, { moving: true }));
    assert.equal(playing(model.binding), 'Walking');
    R.applyModelAnimation(model.binding, rules, state(60, { moving: true, dashing: true }));
    assert.equal(playing(model.binding), 'Running');
    // An unrigged model with a walk alone walks when it dashes.
    const walker = clipped(['Walk']);
    const walkRules = R.readModelAnimationRules({ animations: [] }, walker.clips);
    R.applyModelAnimation(walker.binding, walkRules, state(0, { moving: true, dashing: true }));
    assert.equal(playing(walker.binding), 'Walk');
});

test('every runtime and editor reader of a model\'s animations hands it the model\'s clips', () => {
    const files = ['runtime/reactor_3d_models.js', 'runtime/reactor_battle_room.js', 'editor/src/utils/EventPreviewModels.js', 'editor/src/database/Database3DEditor.js'];
    for (const file of files) {
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        // A whole sidecar read for an instance: `readModelAnimationRules(sidecar)` with nothing beside it drops the clips.
        assert.ok(!/readModelAnimationRules\(sidecar\)/.test(source), `${file} reads a sidecar's rules without its clips`);
    }
    const editor = fs.readFileSync(path.join(root, 'editor/src/database/Database3DEditor.js'), 'utf8');
    assert.match(editor, /readModelAnimationRules\(\{ animations: this\.rawAnimations, rig: this\.customRig, defaultMotions: this\.defaultMotions \}, [^)]*clips/);
});

test('a map event whose first page has a model stands as it in both views without Preview Event', () => {
    const EventManager = require(path.join(root, 'editor', 'src', 'EventManager.js'));
    const page = { image: { tileId: 0, characterName: '', direction: 2 } };
    const map = { events: [null, { id: 1, x: 2, y: 3, pages: [page, page] }, { id: 2, x: 4, y: 4, pages: [page] }, { id: 3, x: 5, y: 5, pages: [page, page] }],
        reactor3d: { events: { 1: { 0: { name: 'Vay' } }, 3: { 1: { name: 'Only page 2' } } } } };
    assert.equal(EventManager.previewPage(map, map.events[1]), 0, 'a model on page 1');
    assert.equal(EventManager.previewPage(map, map.events[2]), null, 'no model: its square alone');
    assert.equal(EventManager.previewPage(map, map.events[3]), null, 'a model on another page only shows when that page is previewed');
    map.reactor3d.eventPreviews = { 1: 1, 3: 1 };
    assert.equal(EventManager.previewPage(map, map.events[1]), 1, 'a page chosen with Preview Event wins');
    assert.equal(EventManager.previewPage(map, map.events[3]), 1);
    const MapEditor3D = require(path.join(root, 'editor', 'src', 'MapEditor3D.js'));
    const View = MapEditor3D.MapEditor3D || MapEditor3D;
    if (View && View.previewPageIndex) {
        delete map.reactor3d.eventPreviews;
        assert.equal(View.previewPageIndex(map, map.events[1]), 0, 'the 3D view stands it too');
    }
});
