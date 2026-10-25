'use strict';
// Auto-placing the humanoid rig's markers (ModelAutoRig): on a model's own skeleton by its bones' names (Mixamo,
// VRM, VRoid, Unreal, Rigify, Daz, Biped), else from its shape (the limbs as the far ends of the distance through
// the body, a hand's fingers as the far ends of the distance from its wrist, the thumb the one that joins nearest
// the wrist). What is found is said; the rest keeps the guess from the model's size. A saved rig is kept.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const ModelRigger = require(path.join(__dirname, '..', 'src', 'database', 'ModelRigger.js'));
global.ModelRigger = ModelRigger;
const Auto = require(path.join(__dirname, '..', 'src', 'database', 'ModelAutoRig.js'));

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('bone names read the same across exporters', () => {
    const cases = {
        'mixamorig:LeftHandThumb1': { side: 'L', finger: 'thumb', segment: 1 },
        'mixamorig:RightHandIndex4': { side: 'R', finger: 'index', segment: 4 },
        'mixamorig:LeftArm': { side: 'L', part: 'upperArm' },
        'mixamorig:RightForeArm': { side: 'R', part: 'lowerArm' },
        'mixamorig:LeftUpLeg': { side: 'L', part: 'upperLeg' },
        'mixamorig:LeftLeg': { side: 'L', part: 'lowerLeg' },
        'mixamorig:HeadTop_End': { side: '', part: 'headTop' },
        'LeftHand': { side: 'L', part: 'hand' },
        'hand_l': { side: 'L', part: 'hand' },
        'thumb_01_l': { side: 'L', finger: 'thumb', segment: 1 },
        'index_metacarpal_r': { side: 'R', finger: 'index', segment: 0 },
        'Index1_R': { side: 'R', finger: 'index', segment: 1 },
        'upperarm_r': { side: 'R', part: 'upperArm' },
        'calf_l': { side: 'L', part: 'lowerLeg' },
        'leftLittleProximal': { side: 'L', finger: 'pinky', segment: 1 },
        'rightThumbDistal': { side: 'R', finger: 'thumb', segment: 3 },
        'leftUpperArm': { side: 'L', part: 'upperArm' },
        'J_Bip_L_Hand': { side: 'L', part: 'hand' },
        'J_Bip_R_Ring2': { side: 'R', finger: 'ring', segment: 2 },
        'J_Bip_C_Hips': { side: '', part: 'hips' },
        'DEF-upper_arm.L': { side: 'L', part: 'upperArm' },
        'f_middle.02.R': { side: 'R', finger: 'middle', segment: 2 },
        'lThumb1': { side: 'L', finger: 'thumb', segment: 1 },
        'rMid2': { side: 'R', finger: 'middle', segment: 2 },
        'lShldrBend': { side: 'L', part: 'upperArm' },
        'Bip01 L Finger0': { side: 'L', finger: 'thumb', segment: 0 },
        'Bip01 R Finger21': { side: 'R', finger: 'middle', segment: 1 },
        'Bip01 L UpperArm': { side: 'L', part: 'upperArm' },
        'CC_Base_L_Hand': { side: 'L', part: 'hand' }
    };
    for (const [name, want] of Object.entries(cases)) {
        const read = Auto.parseBoneName(name);
        assert.ok(read, name + ' is read');
        for (const key of Object.keys(want)) assert.equal(read[key], want[key], `${name}: ${key}`);
    }
    for (const name of ['Bone_044', 'headfront', 'Armature', 'mixamorig:LeftShoulder']) {
        const read = Auto.parseBoneName(name);
        assert.ok(!read || (!read.finger && ['hips', 'head', 'headTop', 'upperArm', 'lowerArm', 'hand', 'upperLeg', 'lowerLeg', 'foot'].indexOf(read.part) < 0), name + ' names no rig joint');
    }
});

/** A Mixamo-style skeleton: [name, parent, x, y, z] in the model's frame. */
function mixamo(fingers) {
    const list = [];
    const add = (name, parent, at) => { list.push({ name: 'mixamorig:' + name, parent: parent == null ? -1 : list.findIndex(j => j.name === 'mixamorig:' + parent), position: at }); };
    add('Hips', null, [0, 0.95, 0]);
    add('Spine', 'Hips', [0, 1.05, 0]);
    add('Neck', 'Spine', [0, 1.45, 0]);
    add('Head', 'Neck', [0, 1.52, 0.01]);
    add('HeadTop_End', 'Head', [0, 1.78, 0.01]);
    for (const [side, s] of [['Left', 1], ['Right', -1]]) {
        add(side + 'Shoulder', 'Spine', [s * 0.06, 1.4, 0]);
        add(side + 'Arm', side + 'Shoulder', [s * 0.18, 1.4, 0]);
        add(side + 'ForeArm', side + 'Arm', [s * 0.45, 1.3, 0]);
        add(side + 'Hand', side + 'ForeArm', [s * 0.7, 1.22, 0]);
        if (fingers) {
            add(side + 'HandThumb1', side + 'Hand', [s * 0.72, 1.21, 0.03]);
            add(side + 'HandThumb2', side + 'HandThumb1', [s * 0.75, 1.2, 0.05]);
            add(side + 'HandThumb3', side + 'HandThumb2', [s * 0.77, 1.2, 0.06]);
            add(side + 'HandThumb4', side + 'HandThumb3', [s * 0.79, 1.2, 0.07]);
            ['Index', 'Middle', 'Ring', 'Pinky'].forEach((finger, i) => {
                const z = 0.03 - i * 0.02;
                add(side + 'Hand' + finger + '1', side + 'Hand', [s * 0.79, 1.2, z]);
                add(side + 'Hand' + finger + '2', side + 'Hand' + finger + '1', [s * 0.82, 1.2, z]);
                add(side + 'Hand' + finger + '3', side + 'Hand' + finger + '2', [s * 0.84, 1.2, z]);
                add(side + 'Hand' + finger + '4', side + 'Hand' + finger + '3', [s * 0.86, 1.2, z]);
            });
        }
        add(side + 'UpLeg', 'Hips', [s * 0.1, 0.9, 0]);
        add(side + 'Leg', side + 'UpLeg', [s * 0.11, 0.5, 0.01]);
        add(side + 'Foot', side + 'Leg', [s * 0.12, 0.1, 0]);
        add(side + 'ToeBase', side + 'Foot', [s * 0.12, 0.02, 0.12]);
    }
    return list;
}

test('a skeleton of its own places each marker on its bone, fingertips on the last joint', () => {
    const joints = mixamo(true);
    const read = Auto.markersFromSkeleton(joints);
    assert.equal(read.humanoid, true);
    assert.equal(read.front, 1, 'toes ahead of the feet: it faces +z');
    const at = name => joints.find(j => j.name === 'mixamorig:' + name).position;
    assert.deepEqual(read.markers.hips, at('Hips'));
    assert.deepEqual(read.markers.chin, at('Head'));
    assert.deepEqual(read.markers.headTop, at('HeadTop_End'));
    assert.deepEqual(read.markers.shoulderL, at('LeftArm'), 'the shoulder is the upper arm joint, not the collarbone');
    assert.deepEqual(read.markers.elbowR, at('RightForeArm'));
    assert.deepEqual(read.markers.wristL, at('LeftHand'));
    assert.deepEqual(read.markers.kneeR, at('RightLeg'));
    assert.deepEqual(read.markers.ankleL, at('LeftFoot'));
    assert.deepEqual(read.markers.thumbBaseL, at('LeftHandThumb1'));
    assert.deepEqual(read.markers.thumbTipL, at('LeftHandThumb4'));
    assert.deepEqual(read.markers.indexBaseR, at('RightHandIndex1'));
    assert.deepEqual(read.markers.pinkyTipR, at('RightHandPinky4'));
});

test('a finger chain without an end joint reaches one segment past its last, and a metacarpal is not its base', () => {
    const joints = [
        { name: 'hand_l', parent: -1, position: [0.7, 1.2, 0] },
        { name: 'index_metacarpal_l', parent: 0, position: [0.72, 1.2, 0.02] },
        { name: 'index_01_l', parent: 1, position: [0.78, 1.2, 0.02] },
        { name: 'index_02_l', parent: 2, position: [0.81, 1.2, 0.02] },
        { name: 'index_03_l', parent: 3, position: [0.83, 1.2, 0.02] }
    ];
    const read = Auto.markersFromSkeleton(joints);
    assert.deepEqual(read.markers.indexBaseL, [0.78, 1.2, 0.02]);
    assert.ok(dist(read.markers.indexTipL, [0.847, 1.2, 0.02]) < 1e-6, 'tip extrapolated along the last segment');
    assert.equal(read.humanoid, false, 'a hand alone is no humanoid');
});

// ----------------------------------------------------------------------------
// Shapes: boxes along segments.

function boxBetween(out, a, b, halfW, halfD) {
    const axis = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(...axis);
    const u = axis.map(v => v / len);
    let side = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let w = [u[1] * side[2] - u[2] * side[1], u[2] * side[0] - u[0] * side[2], u[0] * side[1] - u[1] * side[0]];
    const wl = Math.hypot(...w); w = w.map(v => v / wl);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const corner = (p, sw, sn) => [0, 1, 2].map(i => p[i] + w[i] * sw * halfW + n[i] * sn * (halfD == null ? halfW : halfD));
    const c = [corner(a, -1, -1), corner(a, 1, -1), corner(a, 1, 1), corner(a, -1, 1), corner(b, -1, -1), corner(b, 1, -1), corner(b, 1, 1), corner(b, -1, 1)];
    const quads = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
    for (const [p, q, r, s] of quads) out.push(...c[p], ...c[q], ...c[r], ...c[p], ...c[r], ...c[s]);
}
function cuboid(out, min, max) {
    // (Upright, a box's width runs along z and its depth along x.)
    boxBetween(out, [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2], [(min[0] + max[0]) / 2, max[1], (min[2] + max[2]) / 2], (max[2] - min[2]) / 2, (max[0] - min[0]) / 2);
}

/** A 1.8 tall figure facing +z, arms out and a little down, five fingers a hand, the thumb forward and nearer the wrist. */
function figure() {
    const t = [];
    cuboid(t, [-0.16, 0.86, -0.09], [0.16, 1.46, 0.09]);           // torso
    boxBetween(t, [0, 1.44, 0], [0, 1.56, 0], 0.045);                // neck
    cuboid(t, [-0.1, 1.55, -0.11], [0.1, 1.8, 0.11]);               // head
    const joints = {};
    for (const s of [1, -1]) {
        boxBetween(t, [s * 0.1, 0.9, 0], [s * 0.11, 0.5, 0], 0.065);          // thigh
        boxBetween(t, [s * 0.11, 0.5, 0], [s * 0.12, 0.08, 0], 0.05);         // shin
        cuboid(t, [s * 0.12 - 0.05, 0, -0.05], [s * 0.12 + 0.05, 0.09, 0.17]); // foot, toes forward
        const shoulder = [s * 0.12, 1.4, 0], elbow = [s * 0.45, 1.3, 0], wrist = [s * 0.7, 1.22, 0];
        boxBetween(t, shoulder, elbow, 0.05);
        boxBetween(t, elbow, wrist, 0.042);
        const dir = [s * 0.95, -0.31, 0].map(v => v / Math.hypot(0.95, 0.31));
        const along = (from, d) => from.map((v, i) => v + dir[i] * d);
        const knuckles = along(wrist, 0.095);
        boxBetween(t, along(wrist, -0.01), knuckles, 0.045, 0.016);  // palm: wide across z
        joints[s] = { shoulder, elbow, wrist, tips: {} };
        [['index', 0.036], ['middle', 0.012], ['ring', -0.012], ['pinky', -0.036]].forEach(([finger, z]) => {
            const base = [knuckles[0], knuckles[1], z], tip = along(base, finger === 'middle' ? 0.09 : finger === 'pinky' ? 0.065 : 0.08);
            boxBetween(t, along(base, -0.01), tip, 0.008);
            joints[s].tips[finger] = tip;
        });
        const thumbBase = [...along(wrist, 0.03)]; thumbBase[2] = 0.04;
        const thumbTip = [thumbBase[0] + s * 0.035, thumbBase[1] - 0.025, 0.1];
        boxBetween(t, [along(wrist, 0.02)[0], along(wrist, 0.02)[1], 0.02], thumbTip, 0.01);
        joints[s].tips.thumb = thumbTip;
    }
    return { triangles: Float32Array.from(t), joints };
}

test('a figure without a skeleton: its limbs, hands and every finger from its shape, the thumb told apart', () => {
    const { triangles, joints } = figure();
    const started = Date.now();
    const result = Auto.autoMarkers({ triangles, joints: [], size: { x: 1.8, y: 1.8, z: 0.34 } });
    const took = Date.now() - started;
    assert.equal(result.humanoid, true);
    assert.equal(result.fromSkeleton, false);
    assert.ok(took < 1500, `fast enough (${took} ms)`);
    const m = result.markers, H = 1.8;
    for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
        const want = joints[s];
        assert.ok(dist(m['shoulder' + side], want.shoulder) < 0.08 * H, `${side} shoulder ${m['shoulder' + side]}`);
        assert.ok(dist(m['elbow' + side], want.elbow) < 0.06 * H, `${side} elbow ${m['elbow' + side]}`);
        assert.ok(dist(m['wrist' + side], want.wrist) < 0.04 * H, `${side} wrist ${m['wrist' + side]}`);
        assert.ok(m['knee' + side][1] > 0.35 && m['knee' + side][1] < 0.75, `${side} knee height ${m['knee' + side]}`);
        assert.ok(Math.sign(m['knee' + side][0]) === s && Math.sign(m['ankle' + side][0]) === s, 'the figure\'s left is +x');
        for (const finger of ModelRigger.FINGERS) {
            const key = ModelRigger.fingerKey(finger, 'tip', side);
            assert.equal(result.found[key], 'shape', `${key} found`);
            assert.ok(dist(m[key], want.tips[finger]) < 0.025, `${key} ${m[key]} near ${want.tips[finger]}`);
        }
        // The index lies on the thumb's side of the hand (the front), the pinky farthest from it.
        const z = finger => m[ModelRigger.fingerKey(finger, 'tip', side)][2];
        assert.ok(z('index') > z('middle') && z('middle') > z('ring') && z('ring') > z('pinky'), 'fingers in order across the hand');
        assert.ok(result.found['palm' + side], 'the palm follows from the wrist and the knuckles');
    }
    assert.ok(Math.abs(m.headTop[1] - 1.8) < 0.03, 'the head top');
    assert.ok(m.chin[1] > 1.45 && m.chin[1] < 1.65, `the chin ${m.chin}`);
});

test('a skeleton with no finger bones gets its fingers from the hand\'s own shape', () => {
    const { triangles, joints } = figure();
    const skeleton = mixamo(false).map(j => {
        const s = /Left/.test(j.name) ? 1 : -1;
        if (/Hand$/.test(j.name)) return Object.assign({}, j, { position: joints[s].wrist });
        if (/ForeArm$/.test(j.name)) return Object.assign({}, j, { position: joints[s].elbow });
        return j;
    });
    const result = Auto.autoMarkers({ triangles, joints: skeleton, size: { x: 1.8, y: 1.8, z: 0.34 } });
    assert.equal(result.fromSkeleton, true);
    assert.equal(result.found.wristL, 'skeleton');
    assert.equal(result.found.indexTipL, 'shape');
    assert.equal(result.found.thumbTipR, 'shape');
    assert.ok(dist(result.markers.middleTipL, joints[1].tips.middle) < 0.025);
});

test('not humanoid: every marker keeps the guess from the model\'s size, and says so', () => {
    const t = [];
    // A four-legged thing: a long body on four legs, a head in front.
    cuboid(t, [-0.2, 0.5, -0.6], [0.2, 0.8, 0.6]);
    for (const x of [-0.15, 0.15]) for (const z of [-0.5, 0.5]) boxBetween(t, [x, 0.55, z], [x, 0, z], 0.05);
    cuboid(t, [-0.1, 0.7, 0.6], [0.1, 0.95, 0.85]);
    const size = { x: 0.4, y: 0.95, z: 1.45 };
    const result = Auto.autoMarkers({ triangles: Float32Array.from(t), joints: [], size });
    assert.equal(result.humanoid, false);
    assert.equal(Object.keys(result.found).length, 0);
    const guess = ModelRigger.defaultMarkers(size, 'humanoid');
    for (const key of Object.keys(guess)) assert.deepEqual(result.markers[key], guess[key].map(v => Math.round(v * 1e5) / 1e5), key);
    assert.deepEqual(Auto.summarize(result.guessed).found, []);
    // A plain block is no humanoid either.
    const block = [];
    cuboid(block, [-0.5, 0, -0.5], [0.5, 1, 0.5]);
    assert.equal(Auto.autoMarkers({ triangles: Float32Array.from(block), joints: [], size: { x: 1, y: 1, z: 1 } }).humanoid, false);
});

test('the Rig bar names the parts it guessed', () => {
    const keys = ModelRigger.markersFor('humanoid').map(m => m.key);
    assert.deepEqual(Auto.summarize([]).guessed, []);
    const some = Auto.summarize(['ringTipL', 'pinkyBaseL', 'kneeR']);
    assert.deepEqual(some.guessed, ['Left fingers', 'Right leg']);
    assert.equal(Auto.summarize(keys).found.length, 0);
});

// ----------------------------------------------------------------------------
// The editor: a saved rig is kept; Auto-place asks before replacing markers of the person's own.

const Editor = require(path.join(__dirname, '..', 'src', 'database', 'Database3DEditor.js'));
function editor(saved) {
    const e = new Editor({}, {});
    e._detail = { querySelector: () => null, querySelectorAll: () => [] };
    e._t = (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, k) => params[k]) : key);
    e._template = { userData: { glbSize: { x: 0.6, y: 1.8, z: 0.3 } } };
    e._rigTemplate = 'humanoid';
    e.customRig = saved || null;
    e._buildRigVisuals = () => {};
    e.renderRigBar = () => {};
    e._rigDefaultMarkers = () => ModelRigger.defaultMarkers(e._template.userData.glbSize, 'humanoid');
    return e;
}
const autoResult = () => {
    const markers = ModelRigger.defaultMarkers({ x: 0.6, y: 1.8, z: 0.3 }, 'humanoid');
    markers.wristL = [0.3, 1.0, 0.05];
    return { markers, found: { wristL: 'skeleton' }, guessed: Object.keys(markers).filter(k => k !== 'wristL'), humanoid: true, fromSkeleton: true, fromShape: false };
};

test('a model with no saved rig opens on the auto-placed markers; a saved rig opens as saved', () => {
    const fresh = editor(null);
    fresh._autoRigResult = autoResult;
    const markers = fresh._rigStartMarkers();
    assert.deepEqual(markers.wristL, [0.3, 1.0, 0.05]);
    assert.ok(fresh._rigGuessed.has('wristR') && !fresh._rigGuessed.has('wristL'));
    assert.match(fresh._rigAutoNoteText(), /^Placed from the skeleton\. Guessed: Head, /);

    const savedMarkers = ModelRigger.defaultMarkers({ x: 0.6, y: 1.8, z: 0.3 }, 'humanoid');
    savedMarkers.wristL = [0.25, 0.9, 0.0];
    const kept = editor({ template: 'humanoid', markers: savedMarkers });
    let read = 0;
    kept._autoRigResult = () => { read++; return autoResult(); };
    assert.deepEqual(kept._rigStartMarkers().wristL, [0.25, 0.9, 0.0]);
    assert.equal(read, 0, 'the model is not even read');
    assert.equal(kept._rigAutoNoteText(), '');
});

test('Auto-place asks before replacing the person\'s markers, and leaves them when told no', async () => {
    const savedMarkers = ModelRigger.defaultMarkers({ x: 0.6, y: 1.8, z: 0.3 }, 'humanoid');
    savedMarkers.wristL = [0.25, 0.9, 0.0];
    const e = editor({ template: 'humanoid', markers: savedMarkers });
    e._autoRigResult = autoResult;
    e._rigMode = true;
    e._rigMarkers = JSON.parse(JSON.stringify(savedMarkers));
    const asked = [];
    global.window = { reactor: { uiManager: { showConfirm: async (title, message) => { asked.push(message); return asked.length > 1; } } } };
    try {
        await e.autoPlaceRigMarkers();
        assert.equal(asked.length, 1);
        assert.deepEqual(e._rigMarkers.wristL, [0.25, 0.9, 0.0], 'declined: the markers stay');
        await e.autoPlaceRigMarkers();
        assert.deepEqual(e._rigMarkers.wristL, [0.3, 1.0, 0.05], 'confirmed: replaced');
        // Already the auto-placed set: nothing of the person's own to lose, nothing asked.
        await e.autoPlaceRigMarkers();
        assert.equal(asked.length, 2);
        assert.equal(e.customRig.markers.wristL[0], 0.25, 'the saved rig itself changes only on Save');
    } finally {
        delete global.window;
    }
});
