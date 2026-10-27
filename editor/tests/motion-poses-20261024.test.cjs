'use strict';
// Motions made easy (2026-10-24): a rigged humanoid adds motion capture first (Forge › 3D Character Builder's), a
// state's motion replacing what played there; a motion made by hand is a row of whole-body key poses, made, moved,
// mirrored and copied as one; the preview follows the motion picked and a state button works with one open.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');
const read2 = read;
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime/libs/three.js'));
global.Reactor3D = require(path.join(repoRoot, 'runtime/reactor_3d.js'));
const RRMotionEditor = require(path.join(repoRoot, 'editor/src/database/MotionEditor.js'));
const plain = value => JSON.parse(JSON.stringify(value));

function editorWith(tracks, frames = 60) {
    const host = { _t: text => text, rawAnimations: [], _sim: {}, renderRuleList() {}, saveRules() {} };
    const editor = new RRMotionEditor(host);
    editor.motion = { name: 'Leap', original: 'Leap', trigger: 'jumping', frames, repeat: false, hold: false, tracks: plain(tracks) };
    editor.render = () => {};
    return editor;
}
const key = (at, rotate) => ({ at, rotate, move: [0, 0, 0] });

test('the poses are the moments any part is keyed at, near ones as one', () => {
    const editor = editorWith([
        { part: 'LeftUpperArm', keys: [key(0, [0, 0, 0]), key(0.5, [30, 0, 0]), key(1, [0, 0, 0])] },
        { part: 'RightUpperArm', keys: [key(0.005, [0, 0, 0]), key(0.6, [10, 0, 0])] },
        { part: '', other: { type: 'spin' } }
    ]);
    assert.deepEqual(editor.poseTimes(), [0, 0.5, 0.6, 1]);
    editor.playhead = 0.502;
    assert.equal(editor.poseHere(), 0.5);
});

test('a pose added keys every part as it stands; moved, every part\'s key goes with it; removed, from every part', () => {
    const editor = editorWith([
        { part: 'LeftUpperArm', keys: [key(0, [0, 0, 0]), key(1, [40, 0, 0])] },
        { part: 'RightUpperArm', keys: [key(0, [0, 0, 0]), key(1, [0, 0, 20])] }
    ]);
    editor.playhead = 0.5;
    editor.addPose();
    assert.deepEqual(editor.poseTimes(), [0, 0.5, 1]);
    assert.ok(editor.motion.tracks.every(t => t.keys.some(k => k.at === 0.5)), 'every part keyed at the new pose');
    const halfway = editor.motion.tracks[0].keys.find(k => k.at === 0.5).rotate[0];
    assert.ok(halfway > 10 && halfway < 30, 'keyed as it stood there, between its poses: ' + halfway);
    const at = editor.movePose(0.5, 0.3);
    assert.equal(at, 0.3);
    assert.deepEqual(editor.poseTimes(), [0, 0.3, 1]);
    editor.removePose(0.3);
    assert.deepEqual(editor.poseTimes(), [0, 1]);
    // A part never loses its last key.
    editor.removePose(0); editor.removePose(1);
    assert.ok(editor.motion.tracks.every(t => t.keys.length >= 1));
});

test('mirror swaps the sides of the pose at the playhead, each turn seen in a mirror; a part with no partner mirrors in place', () => {
    assert.equal(RRMotionEditor.mirrorPart('LeftUpperLeg'), 'RightUpperLeg');
    assert.equal(RRMotionEditor.mirrorPart('mixamorig:RightHand'), 'mixamorig:LeftHand');
    assert.equal(RRMotionEditor.mirrorPart('Spine'), null);
    const editor = editorWith([
        { part: 'LeftUpperArm', keys: [key(0.5, [10, 20, 30])] },
        { part: 'Spine', keys: [key(0.5, [5, 15, 0])] }
    ]);
    editor.playhead = 0.5;
    editor.mirrorPose();
    const pose = Object.fromEntries(editor.motion.tracks.map(t => [t.part, t.keys.find(k => Math.abs(k.at - 0.5) < 0.01).rotate]));
    assert.deepEqual(plain(pose.RightUpperArm), [10, -20, -30], 'the right arm takes the left\'s turn, mirrored');
    assert.deepEqual(plain(pose.LeftUpperArm), [0, 0, 0], 'the left, with no right to take from, rests');
    assert.deepEqual(plain(pose.Spine).map(v => v + 0), [5, -15, 0], 'the middle turns back the other way');
});

test('a pose copied is put down at another moment, the whole body', () => {
    const editor = editorWith([
        { part: 'LeftUpperArm', keys: [key(0, [0, 0, 0]), key(1, [60, 0, 0])] },
        { part: 'Head', keys: [key(0, [0, 0, 0]), key(1, [0, 30, 0])] }
    ]);
    editor.playhead = 1;
    const copied = plain(editor.poseAtPlayhead());
    editor.playhead = 0.4;
    editor.writePose(copied);
    const at = t => editor.motion.tracks.find(x => x.part === t).keys.find(k => Math.abs(k.at - 0.4) < 0.01).rotate;
    assert.deepEqual(plain(at('LeftUpperArm')), [60, 0, 0]);
    assert.deepEqual(plain(at('Head')), [0, 30, 0]);
});

test('the storyboard: the seconds between poses are the timing; a gap changed moves every pose after it', () => {
    const editor = editorWith([
        { part: 'LeftUpperArm', keys: [key(0, [0, 0, 0]), key(0.5, [40, 0, 0]), key(1, [0, 0, 0])] },
        { part: 'Head', keys: [key(0, [0, 0, 0]), key(0.5, [0, 20, 0]), key(1, [0, 0, 0])] }
    ], 60);
    assert.equal(editor.seconds(), 1);
    assert.equal(editor.gapAfter(0), 0.5);
    assert.equal(editor.gapAfter(2), 0, 'the last pose stands at the end');
    editor.setGap(0, 0.2);
    assert.equal(Math.round(editor.seconds() * 100) / 100, 0.7, 'the motion shrinks by what the gap lost');
    assert.equal(editor.gapAfter(0), 0.2);
    assert.equal(editor.gapAfter(1), 0.5, 'the gap after it keeps its seconds');
    assert.equal(editor.poseTimes().length, 3);
});

test('the next pose is a copy of the one shown, a beat on; a pose deleted closes the gap', () => {
    const editor = editorWith([
        { part: 'LeftUpperArm', keys: [key(0, [30, 0, 0]), key(1, [0, 0, 0])] }
    ], 60);
    editor.playhead = 0;
    const at = editor.insertPose(0, 0.3);
    assert.equal(Math.round(editor.seconds() * 100) / 100, 1.3);
    assert.equal(editor.poseTimes().length, 3);
    assert.equal(editor.gapAfter(0), 0.3);
    assert.equal(editor.gapAfter(1), 1, 'what followed keeps its seconds');
    const copy = editor.motion.tracks[0].keys.find(k => Math.abs(k.at - at) < 0.01);
    assert.deepEqual(plain(copy.rotate), [30, 0, 0], 'a copy of the pose it follows');
    editor.deletePose(1);
    assert.equal(editor.poseTimes().length, 2);
    assert.equal(Math.round(editor.seconds() * 100) / 100, 1);
    // An empty motion's first pose is wherever the first part is bent.
    const empty = editorWith([], 18);
    assert.equal(empty.insertPose(0), 0);
});

test('a part picked joins at rest in every pose, so bending it in one leaves the others alone', () => {
    const editor = editorWith([{ part: 'Head', keys: [key(0, [0, 0, 0]), key(0.5, [0, 20, 0])] }]);
    editor.pickPart('LeftUpperArm');
    const arm = editor.motion.tracks.find(t => t.part === 'LeftUpperArm');
    assert.deepEqual(arm.keys.map(k => k.at), [0, 0.5]);
});

test('the storyboard is what opens: pose cards, the seconds between, + for the next; the per-part timeline a link away', () => {
    const src = read('editor/src/database/MotionEditor.js');
    assert.match(src, /this\.perPart = false;/);
    assert.match(src, /\$\{this\.perPart \? '' : this\.poseBody\(partName, track, pose, slider\)\}/);
    for (const cls of ['r3d-motion-board', 'r3d-motion-card', 'r3d-motion-card-add', 'r3d-motion-gap-sec', 'r3d-motion-pose-remove', 'r3d-motion-pose-mirror', 'r3d-motion-pose-copy', 'r3d-motion-pose-paste', 'r3d-motion-perpart', 'r3d-motion-backtoposes'])
        assert.ok(src.includes(cls), cls);
    assert.ok(!src.includes('r3d-motion-posekey'), 'no strip of numbered dots to drag');
    // The part being bent is lit on the model.
    assert.match(src, /this\.host\._markMotionPart\?\.\(track && !track\.other && this\.bending\(\) \? track\.part : null\);/);
    const host = read('editor/src/database/Database3DEditor.js');
    assert.match(host, /_markMotionPart\(part\) \{/);
    assert.match(host, /fit\(this\._motionPartBox, this\._motionPart \? this\._matchedMeshes\(this\._motionPart\) : \(\(this\._binding && this\._binding\.meshes\) \|\| \[\]\), false\);/);
});

test('the picker is themed and offers no hand-keyed presets', () => {
    const src = read('editor/src/database/Database3DEditor.js');
    assert.ok(!src.includes('r3d-picker-keyed'));
    assert.ok(!/rr-btn-primary r3d-picker/.test(src), 'no unstyled primary button');
    assert.match(src, /class="rr-btn-chip r3d-picker-add"/);
});

test('a humanoid adds motion capture first; a state\'s motion replaces what played there; the preview follows', () => {
    const src = read('editor/src/database/Database3DEditor.js');
    const D = { libraryTrigger: id => ({ walk: 'walking', run: 'dashing', jump: 'jumping', fall: 'jumping', swim: 'swimming', tread: 'treading', climbLadder: 'climbing', climbWall: 'climbing' }[id] || 'action') };
    assert.match(src, /static libraryTrigger\(id\) \{\n\s*return \{ walk: 'walking', run: 'dashing', jump: 'jumping', fall: 'jumping', swim: 'swimming', tread: 'treading', climbLadder: 'climbing', climbWall: 'climbing' \}\[id\] \|\| 'action';/);
    assert.equal(D.libraryTrigger('jump'), 'jumping');
    assert.equal(D.libraryTrigger('wave'), 'action');
    assert.match(src, /if \(this\._libraryMotions\(\)\.length\) \{ this\.showMotionPicker\(\); return; \}/);
    assert.match(src, /if \(replaced\.length\) this\.rawAnimations = this\.rawAnimations\.filter\(raw => !\(raw && raw\.trigger === trigger\)\);/);
    assert.match(src, /this\.rawAnimations\.push\(\{ name, type: 'clip', trigger, library: id \}\);/);
    assert.match(src, /if \(trigger !== 'action' && trigger !== 'always' && this\.previewStates\(\)\.includes\(trigger\)\) this\.setPreviewState\(trigger\);/);
    // A state button with a motion open: its own state plays it through, another closes it and shows that state.
    assert.match(src, /if \(editor\.motion\.trigger === state\) \{ editor\.playing = true;[^\n]*\n\s*else \{ editor\.commit\(\); editor\.close\(\); \}/);
    // A motion picked in the list is seen in its state.
    assert.match(src, /if \(raw\.trigger && this\.previewStates\(\)\.includes\(raw\.trigger\) && this\.previewState\(\) !== raw\.trigger\) this\.setPreviewState\(raw\.trigger, \{ keepEditor: true \}\);/);
});

test('a motion played once ends on its last pose: + after it moves the end, and the game eases back to rest after', () => {
    const editor = editorWith([{ part: 'LeftUpperLeg', keys: [key(0, [0, 0, 0])] }], 18);
    editor.motion.trigger = 'action';
    assert.equal(editor.playsOnce(), true);
    editor.playhead = 0;
    editor.setPartValue = RRMotionEditor.prototype.setPartValue;
    editor.insertPose(0, 0.5);
    assert.deepEqual(editor.poseTimes(), [0, 1], 'the new pose is the end');
    assert.equal(Math.round(editor.seconds() * 100) / 100, 0.5);
    // The game: the last pose holds at the end, then eases to rest over the settle frames instead of jumping there.
    const rule = { type: 'pose', trigger: 'action', period: 15, cycles: 1, keys: [{ at: 0, rotate: [0, 0, 0] }, { at: 1, rotate: [-85, 0, 0] }] };
    assert.equal(Reactor3D.poseSettles(rule), true);
    assert.equal(Reactor3D.modelRuleDuration(rule), 30 + Reactor3D.POSE_SETTLE_FRAMES);
    assert.equal(Reactor3D.poseSettles(Object.assign({}, rule, { repeat: true })), false, 'a repeating motion goes round instead');
    assert.equal(Reactor3D.poseSettles(Object.assign({}, rule, { keys: [{ at: 0, rotate: [10, 0, 0] }, { at: 0.6, rotate: [-85, 0, 0] }] })), false, 'one that goes back to rest itself');
    const src = read('runtime/reactor_3d_models.js');
    assert.match(src, /else if \(t < duration \+ Reactor3D\.POSE_SETTLE_FRAMES && Reactor3D\.poseSettles\(rule\)\) \{\n\s*\/\/ [^\n]*\n\s*progress = 1;\n\s*weight = this\.poseEase\(1 - \(t - duration\) \/ Reactor3D\.POSE_SETTLE_FRAMES\);/);
});

test('the part being bent has rings (red X, green Y, blue Z) and arrows on the model; a drag sets its pose', () => {
    const editor = editorWith([{ part: 'LeftUpperLeg', keys: [key(0, [0, 0, 0]), key(1, [10, 0, 0])] }]);
    editor.root = null;
    editor.playhead = 1;
    editor.setPartValue('rotate', 2, 30, false);
    editor.setPartValue('move', 1, 0.25, false);
    const stop = editor.motion.tracks[0].keys.find(k => k.at === 1);
    assert.deepEqual(plain(stop.rotate), [10, 0, 30]);
    assert.deepEqual(plain(stop.move), [0, 0.25, 0]);
    const host = read('editor/src/database/Database3DEditor.js');
    for (const name of ['_motionPartFrame(part, rest = false) {', '_mirrorPartValue(from, to, value) {', '_syncMotionGizmo() {', '_pickMotionGizmo(clientX, clientY) {', '_dragMotionGizmo(hold, clientX, clientY) {', "mode = 'motiongizmo';"])
        assert.ok(host.includes(name), name);
    // Nested as Euler XYZ composes, so each ring turns just its own number.
    assert.match(host, /gizmo\.rings\.yaw\.group\.rotation\.set\(pose\.rotate\[0\] \* rad, 0, 0\);/);
    assert.match(host, /gizmo\.rings\.roll\.group\.rotation\.set\(pose\.rotate\[0\] \* rad, pose\.rotate\[1\] \* rad, 0\);/);
    const src = read('editor/src/database/MotionEditor.js');
    assert.match(src, /data-handle="turn"/);
    assert.match(src, /data-handle="move"/);
    assert.match(src, /button\('r3d-motion-part-reset', tt\('Reset'\)/);
});

test('a step between two poses has its own pace: chosen on its card, saved on the keys it arrives at, played by the game', () => {
    const editor = editorWith([
        { part: 'LeftUpperArm', keys: [key(0, [0, 0, 0]), key(0.5, [80, 0, 0]), key(1, [0, 0, 0])] },
        { part: 'Head', keys: [key(0, [0, 0, 0]), key(0.5, [0, 20, 0])] }
    ]);
    assert.equal(editor.stepEase(0), 'smooth');
    assert.equal(editor.setStepEase(0, 'in'), true);
    assert.equal(editor.stepEase(0), 'in');
    assert.ok(editor.motion.tracks.every(t => t.keys.find(k => k.at === 0.5).ease === 'in'), 'every part arrives at pose 2 that way');
    const rules = editor.rulesOf(editor.motion);
    assert.equal(rules[0].keys[1].ease, 'in', 'saved');
    assert.equal(rules[0].keys[2].ease, undefined, 'the next step still flows');
    editor.motion.tracks[1].keys[1].ease = 'snap';
    assert.equal(editor.stepEase(0), 'mixed');
    editor.setStepEase(0, 'smooth');
    assert.ok(editor.motion.tracks.every(t => !t.keys.find(k => k.at === 0.5).ease), 'smooth is no ease at all');
    // The game: halfway through, a slow start has gone an eighth of the way, steady half; overshoot goes past.
    const line = ease => [{ at: 0, rotate: [0, 0, 0], move: [0, 0, 0], resize: [1, 1, 1] }, { at: 1, rotate: [100, 0, 0], move: [0, 0, 0], resize: [1, 1, 1], ease }];
    const at = (ease, p) => Reactor3D.sampleModelKeys({ keys: line(ease), trigger: 'action' }, p).rotate[0];
    assert.equal(Math.round(at('steady', 0.5)), 50);
    assert.equal(Math.round(at('in', 0.5)), 13);
    assert.equal(Math.round(at('out', 0.5)), 88);
    assert.equal(Math.round(at('snap', 0.1)), 88, 'a snap is nearly there a tenth of the way in');
    assert.equal(Math.round(at('snap', 0.5)), 100, 'and holds it');
    assert.ok(at('overshoot', 0.6) > 100);
    const fast = { rotate: [0, 0, 0], move: [0, 0, 0], resize: [1, 1, 1] };
    Reactor3D._sampleModelKeysInto({ keys: line('in'), trigger: 'action' }, 0.5, fast);
    assert.equal(Math.round(fast.rotate[0]), 13, 'the frame loop samples it the same');
    const read = Reactor3D.readModelAnimationRules({ animations: [{ name: 'a', part: 'x', type: 'pose', keys: [{ at: 1, rotate: [1, 0, 0], ease: 'out' }, { at: 0.5, rotate: [1, 0, 0], ease: 'wobble' }] }] });
    assert.deepEqual(plain(read[0].keys.map(k => k.ease || null)), [null, 'out'], 'an ease the runtime does not know is no ease');
    const src = read2('editor/src/database/MotionEditor.js');
    for (const cls of ['r3d-motion-step', 'r3d-motion-timing', 'r3d-motion-ease', 'r3d-motion-sec-less', 'r3d-motion-sec-more']) assert.ok(src.includes(cls), cls);
});

test('the rings and the arrows show together; grabbing one brings its sliders up', () => {
    const host = read2('editor/src/database/Database3DEditor.js');
    assert.match(host, /gizmo\.rings\.root\.visible = true;/);
    assert.match(host, /gizmo\.arrows\.root\.visible = true;/);
    assert.match(host, /const handle = hold\.kind === 'ring' \? 'turn' : 'move';\n\s*if \(this\.motionEditor\.handle !== handle\) \{ this\.motionEditor\.handle = handle; this\.motionEditor\.render\(\); \}/);
    assert.match(host, /return outside \? \(arrowHold\(\) \|\| ringHold\(\)\) : \(ringHold\(\) \|\| arrowHold\(\)\);/);
});

test('with a step picked nothing bends: no handles, no part picked or lit, the panel points back to the poses', () => {
    const editor = editorWith([{ part: 'LeftUpperArm', keys: [key(0, [0, 0, 0]), key(1, [40, 0, 0])] }]);
    editor.step = 0;
    assert.equal(editor.bending(), false);
    editor.playhead = 1;
    editor.setPartValue('rotate', 0, 90, true);
    assert.deepEqual(plain(editor.motion.tracks[0].keys[1].rotate), [40, 0, 0], 'a stray handle drag changes nothing');
    editor.step = null;
    assert.equal(editor.bending(), true);
    const host = read2('editor/src/database/Database3DEditor.js');
    assert.match(host, /if \(found && this\.motionEditor\.bending\(\)\) this\.motionEditor\.pickPart\(found\.name\);/);
    assert.match(host, /const track = editor && editor\.active && editor\.bending\(\) \? editor\.motion\.tracks\[editor\.track\] : null;/);
    assert.match(host, /const found = inside && picking \? this\._partUnderPointer/);
    assert.match(read2('editor/src/database/MotionEditor.js'), /'Click a pose card to bend it\.'/);
});

test('a flip goes through the model\'s own frames: a rig whose right arm is rolled unlike its left still lands mirrored', () => {
    const Database3DEditor = require(path.join(repoRoot, 'editor/src/database/Database3DEditor.js'));
    const T = global.THREE;
    const holder = new T.Group(), root = new T.Group();
    holder.add(root);
    const qL = new T.Quaternion().setFromEuler(new T.Euler(0.3, -0.5, 1.1, 'XYZ'));
    const roll = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI);
    const qR = new T.Quaternion(qL.x, -qL.y, -qL.z, qL.w).multiply(roll);
    const bone = (name, q, x) => { const b = new T.Object3D(); b.quaternion.copy(q); b.position.set(x, 1, 0); root.add(b); return { mesh: b, parts: [{ name, pivot: [0, 0, 0] }], baseQuaternion: q.clone(), clipBase: null }; };
    const host = Object.create(Database3DEditor.prototype);
    host._binding = { root, meshes: [bone('LeftUpperArm', qL, 0.2), bone('RightUpperArm', qR, -0.2)] };
    host._object = root;
    host._scale = 1;
    const value = { rotate: [-50, 30, 45], move: [0, 0, 0] };
    const out = host._mirrorPartValue('LeftUpperArm', 'RightUpperArm', value);
    assert.ok(out && out.rotate.length === 3);
    // A point on the left arm, turned, seen in the mirror, is the same point on the right arm turned by the flip.
    const rad = Math.PI / 180, turn = r => new T.Quaternion().setFromEuler(new T.Euler(r[0] * rad, r[1] * rad, r[2] * rad, 'XYZ'));
    const pL = new T.Vector3(0.2, 1, 0.1);
    const pR = pL.clone().setX(-pL.x).applyQuaternion(roll.clone().invert());
    const left = pL.clone().applyQuaternion(turn(value.rotate)).applyQuaternion(qL);
    const right = pR.clone().applyQuaternion(turn(out.rotate)).applyQuaternion(qR);
    assert.ok(Math.abs(left.x + right.x) < 1e-3 && Math.abs(left.y - right.y) < 1e-3 && Math.abs(left.z - right.z) < 1e-3,
        `mirrored: ${left.toArray()} / ${right.toArray()}`);
    assert.notDeepEqual(out.rotate, [-50, -30, -45], 'not the plain swap, which would be wrong for this rig');
    // Joints in the model's frame (clip-driven) keep the plain swap's numbers.
    host._binding.meshes.forEach(entry => { entry.clipBase = {}; });
    assert.deepEqual(host._mirrorPartValue('LeftUpperArm', 'RightUpperArm', value).rotate, [-50, -30, -45]);
});

test('Flip motion flips every pose; a side new to the motion rests in the poses it was not flipped into', () => {
    const editor = editorWith([{ part: 'LeftUpperArm', keys: [key(0, [0, 0, 0]), key(0.5, [-40, 10, 20]), key(1, [0, 0, 0])] }]);
    editor.mirrorMotion();
    const right = editor.motion.tracks.find(t => t.part === 'RightUpperArm');
    assert.deepEqual(right.keys.map(k => k.at), [0, 0.5, 1]);
    assert.deepEqual(plain(right.keys[1].rotate), [-40, -10, -20]);
    assert.deepEqual(plain(editor.motion.tracks[0].keys[1].rotate), [0, 0, 0], 'the left now rests there');
    const one = editorWith([{ part: 'LeftUpperArm', keys: [key(0, [0, 0, 0]), key(1, [30, 0, 0])] }]);
    one.playhead = 1;
    one.mirrorPose();
    assert.deepEqual(one.motion.tracks.find(t => t.part === 'RightUpperArm').keys.map(k => k.at), [0, 1], 'rests at pose 1 though only pose 2 was flipped');
    const src = read2('editor/src/database/MotionEditor.js');
    assert.match(src, /<div class="lit-section-header r3d-motion-head">\n\s*<button type="button" class="rr-btn-chip r3d-motion-play"/, 'play comes first, before the name');
});
