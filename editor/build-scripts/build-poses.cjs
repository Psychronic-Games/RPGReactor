#!/usr/bin/env node
/**
 * Builds the 3D Character Builder's motions from the CMU Graphics Lab Motion
 * Capture Database (mocap.cs.cmu.edu, free for all uses).
 *
 *   node editor/build-scripts/build-poses.cjs <folder of CMU .asf/.amc files>
 *
 * Writes runtime/reactor_3d_motions.bin (the shared motion library's data,
 * read by runtime/reactor_3d_motions.js in the game and the editor). The folder holds the
 * subjects' skeletons (`35.asf`) and the trials named in TAKES (`35_01.amc`),
 * as served at http://mocap.cs.cmu.edu/subjects/<subject>/.
 *
 * Each take is cut to a loop, turned to face +z (left toward +x), mirrored
 * when its hands are the wrong way round, and sampled at 30 frames a second.
 * Every mapped bone is kept as a frame in the world: the direction from its
 * joint to the next one, and a second direction across it (where the elbow
 * bends, the front of a thigh, the thumb side of a hand) that carries its
 * twist. reactor_3d_motions.js turns these into each body's own joint turns, so
 * the motions hold for any height, limb length or build. The loop's last
 * frame repeats the first.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const FPS = 30;
const INCH = 0.0254;

// ── vectors, matrices (row-major 3x3) and quaternions ──────────────────────
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const orth = (s, d) => norm(sub(s, scale(d, dot(s, d))));
const mm = (A, B) => { const R = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) R[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]; return R; };
const mv = (A, v) => [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
const tr = A => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
const rx = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const ry = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rz = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const DEG = Math.PI / 180;
/** An Acclaim rotation: x first, then y, then z, about the fixed axes. */
const euler = (x, y, z) => mm(rz(z * DEG), mm(ry(y * DEG), rx(x * DEG)));
/** The frame whose columns are d, s made square to d, and d x s. */
const frame = (d, s) => { const a = norm(d), b = orth(s, a), c = cross(a, b); return [a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]]; };
function matQuat(m) {
    const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m, t = m00 + m11 + m22;
    let q;
    if (t > 0) { const s = 0.5 / Math.sqrt(t + 1); q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s]; }
    else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
    else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
    else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]; }
    const l = Math.hypot(...q);
    return q.map(v => v / l);
}
const qmul = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
const qinv = q => [-q[0], -q[1], -q[2], q[3]];
function qpow(q, k) {
    const w = Math.max(-1, Math.min(1, q[3])), a = Math.acos(w), s = Math.sin(a);
    if (s < 1e-9) return [0, 0, 0, 1];
    const b = a * k, f = Math.sin(b) / s;
    return [q[0] * f, q[1] * f, q[2] * f, Math.cos(b)];
}

// ── Acclaim skeleton (.asf) and motion (.amc) ──────────────────────────────
function parseAsf(text) {
    const lines = text.split(/\r?\n/);
    const bones = { root: { name: 'root', dir: [0, 0, 0], length: 0, C: euler(0, 0, 0), dof: ['tx', 'ty', 'tz', 'rx', 'ry', 'rz'], children: [] } };
    let unit = 1, i = 0, current = null, section = '';
    for (; i < lines.length; i++) {
        const t = lines[i].trim();
        if (t.startsWith(':')) { section = t.split(/\s+/)[0]; continue; }
        const p = t.split(/\s+/);
        if (section === ':units' && p[0] === 'length') unit = +p[1];
        if (section === ':bonedata') {
            if (p[0] === 'begin') current = { dof: [], children: [] };
            else if (p[0] === 'end' && current) { bones[current.name] = current; current = null; }
            else if (current && p[0] === 'name') current.name = p[1];
            else if (current && p[0] === 'direction') current.dir = norm([+p[1], +p[2], +p[3]]);
            else if (current && p[0] === 'length') current.length = +p[1];
            else if (current && p[0] === 'axis') current.C = euler(+p[1], +p[2], +p[3]);
            else if (current && p[0] === 'dof') current.dof = p.slice(1).map(s => s.toLowerCase());
        }
        if (section === ':hierarchy' && p[0] !== 'begin' && p[0] !== 'end' && p.length > 1) {
            for (const c of p.slice(1)) { bones[c].parent = p[0]; bones[p[0]].children.push(c); }
        }
    }
    for (const b of Object.values(bones)) b.Ci = tr(b.C);
    // Lengths in meters: an Acclaim unit is 1/length inches.
    return { bones, meters: INCH / unit };
}

function parseAmc(text) {
    const frames = [];
    let cur = null;
    for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#') || t.startsWith(':')) continue;
        if (/^\d+$/.test(t)) { cur = {}; frames.push(cur); continue; }
        if (!cur) continue;
        const p = t.split(/\s+/);
        cur[p[0]] = p.slice(1).map(Number);
    }
    return frames;
}

/** Every bone's world turn from the skeleton's rest, and every joint's place (each bone's far end), in meters. */
function pose(asf, values) {
    const { bones, meters } = asf, rot = {}, pos = {};
    const visit = name => {
        const b = bones[name], v = values[name] || [];
        const a = { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0 };
        b.dof.forEach((d, k) => { a[d] = v[k] || 0; });
        const local = mm(b.C, mm(euler(a.rx, a.ry, a.rz), b.Ci));
        if (name === 'root') { rot.root = local; pos.root = scale([a.tx, a.ty, a.tz], meters); }
        else {
            rot[name] = mm(rot[b.parent], local);
            pos[name] = add(pos[b.parent], mv(rot[name], scale(b.dir, b.length * meters)));
        }
        for (const c of b.children) visit(c);
    };
    visit('root');
    return { rot, pos };
}

// ── which joints make each of the builder's bones ──────────────────────────
// `from`/`to` name the joints (a bone's far end; 'root' the pelvis), `twist`
// the source bone whose turn carries the second direction, `side` that
// direction at the source's rest, or a rule to work it out. The trunk, neck,
// head and collarbones place their joints differently from the builder's
// skeleton, so they keep their own rest and take the capture's turns from
// its rest (`rest`: the direction both skeletons share along the bone);
// limbs follow the captured directions themselves.
const Z = [0, 0, 1], Y = [0, 1, 0];
const MAP = {
    Hips: { twist: 'root', rest: Y, side: Z },
    Spine: { twist: 'lowerback', rest: Y, side: Z },
    Spine1: { twist: 'upperback', rest: Y, side: Z },
    Spine2: { twist: 'thorax', rest: Y, side: Z },
    Neck: { twist: 'lowerneck', also: 'upperneck', rest: Y, side: Z },
    Head: { twist: 'head', rest: Y, side: Z }
};
for (const [S, s] of [['Left', 'l'], ['Right', 'r']]) Object.assign(MAP, {
    [S + 'Shoulder']: { twist: s + 'clavicle', rest: [S === 'Left' ? 1 : -1, 0, 0], side: Z },
    [S + 'Arm']: { from: s + 'clavicle', to: s + 'humerus', twist: s + 'humerus', side: 'elbow' },
    [S + 'ForeArm']: { from: s + 'humerus', to: s + 'radius', twist: s + 'radius', also: s + 'wrist', side: 'elbow' },
    [S + 'Hand']: { from: s + 'wrist', to: s + 'hand', twist: s + 'hand', side: Z },
    [S + 'UpLeg']: { from: s + 'hipjoint', to: s + 'femur', twist: s + 'femur', side: Z },
    [S + 'Leg']: { from: s + 'femur', to: s + 'tibia', twist: s + 'tibia', side: Z },
    [S + 'Foot']: { from: s + 'tibia', to: s + 'foot', twist: s + 'foot', side: Y },
    [S + 'ToeBase']: { from: s + 'foot', to: s + 'toes', twist: s + 'toes', side: Y }
});
const BONES = Object.keys(MAP);

/** At the skeleton's rest, the second direction of each mapped bone (in the world, rest being unturned). */
function restSides(asf) {
    const out = {};
    for (const [name, m] of Object.entries(MAP)) {
        if (m.side !== 'elbow') { out[name] = m.side; continue; }
        // Where the elbow bends: the forearm's tip swings about its hinge (the radius's x axis), flexing forward.
        const r = asf.bones[m.twist.replace('humerus', 'radius')];
        const hinge = mv(r.C, [1, 0, 0]);
        out[name] = orth(cross(hinge, r.dir), r.dir);
    }
    return out;
}

/** Most a wrist twists from the elbow either way (radians). */
const TWIST = 100 * DEG;
/** v turned about the unit axis a by angle t. */
const turnAbout = (v, a, t) => { const c = Math.cos(t), s = Math.sin(t), k = dot(a, v) * (1 - c), x = cross(a, v); return [v[0] * c + x[0] * s + a[0] * k, v[1] * c + x[1] * s + a[1] * k, v[2] * c + x[2] * s + a[2] * k]; };

/** One frame of the take as the mapped bones' world frames, plus where the joints are. */
function frames(asf, values, sides) {
    const { rot, pos } = pose(asf, values), out = {};
    for (const [name, m] of Object.entries(MAP)) {
        let d = m.rest ? mv(rot[m.twist], m.rest) : sub(pos[m.to], pos[m.from]);
        let s = mv(rot[m.twist], sides[name]);
        // A bone made of two takes half of each (the neck); the forearm turns half way to the wrist's
        // twist, so the twist spreads along it. The half is taken as an angle about the bone, kept
        // within a forearm's reach (no wrist twists further than this from the elbow).
        if (m.also) {
            if (m.rest) d = add(d, mv(rot[m.also], m.rest));
            const a = norm(d), s1 = orth(s, a), s2 = orth(mv(rot[m.also], sides[name]), a);
            const twist = Math.max(-TWIST, Math.min(TWIST, Math.atan2(dot(cross(s1, s2), a), dot(s1, s2))));
            s = turnAbout(s1, a, twist / 2);
        }
        out[name] = { d: norm(d), s: orth(s, norm(d)) };
    }
    return { bones: out, pos };
}

// ── the takes ──────────────────────────────────────────────────────────────
/**
 * Per pose: the trial, the stretch of it to use (seconds), whether to mirror
 * it, and which way the body faces (`face`: the pelvis's front to +z, or for
 * a body lying down the line from its hips toward its head given). A loop
 * looks within the stretch for a cycle of `cycle` seconds whose ends meet; a
 * `swing` plays a held pose's stretch forward and back over `period`
 * seconds; otherwise the whole stretch plays, at `speed` times the captured
 * pace when given (a wave slowed to a friendly one). `air` keeps the take's
 * own height off the floor (a jump, a run's flight), `hover` holds the body
 * that many leg lengths up (a fall), `hang` holds the hips that many leg
 * lengths up whatever the feet do (a ladder, the water; `bob` [amount,
 * cycles] moves them), and `skin` rests the body itself on the floor.
 * `borrow` takes some bones from another take instead. `once` plays the
 * stretch once, its ends kept as they are (a fall, a flip); `reverse` plays
 * it backward; `fps` samples it finer than 30 frames a second (fast
 * motion), `smooth` eases its jitter by that many passes; `rate` is the
 * take's own capture rate when not 120; `pitch`
 * tilts the whole body forward that many degrees; `face.first` takes the
 * heading from the first frames only (a body that turns over). `layer`
 * lays authored bone frames and turns over the take (see `overlay`); `gaitForward`
 * calibrates each leg's neutral stance heading in degrees outward.
 */
let TAKES = {
    // The ankle→ball marker lies six degrees outside the visible heel→ball sole axis on our neutral
    // human feet. Eleven degrees at that marker leaves the actual sole about five degrees outward.
    walk: { trial: '35_01', from: 0.1, to: 2.9, cycle: [0.9, 1.4], gaitForward: 11 },
    run: { trial: '09_01', from: 0.05, to: 1.2, cycle: [0.55, 0.85], air: true, gaitForward: 11 },
    crouch: { trial: '136_09', from: 1.5, to: 2.3, swing: true, period: 2.4 },
    jump: { trial: '13_39', from: 0, to: 2.9, air: true },
    fall: { trial: '82_04', from: 1.9, to: 2.22, swing: true, period: 1.4, hover: 0.35 },
    fight: { trial: '14_01', from: 8.8, to: 11.3, cycle: [1.0, 1.4], },
    wave: { trial: '143_25', from: 2.2, to: 3.12, speed: 0.6, cycle: [0.75, 1.4], mirror: true },
    armsUp: { trial: '13_10', from: 8.1, to: 9.0, swing: true, period: 2.6 },
    kneel: { trial: '23_03', from: 2.0, to: 3.8, swing: true, period: 3.6, skin: true, borrow: { trial: '111_28', from: 1.0, to: 2.8, bones: ['RightArm', 'RightForeArm', 'RightHand'] } },
    sit: { trial: '82_05', from: 2.0, to: 6.5, cycle: [2.0, 4.4], skin: true },
    lieBack: { trial: '113_08', from: 5.5, to: 9.0, cycle: [2.0, 3.4], skin: true, face: { bone: 'Hips', to: [0, 0, -1] } },
    lieSide: { trial: '140_04', from: 0, to: 1.3, swing: true, period: 3.2, skin: true, mirror: true, face: { bone: 'Hips', to: [-1, 0, 0] } },
    // Aims: a standing body (its arms set on each body by RRCharacterPoses).
    pistol: { trial: '79_96', rate: 60, from: 4.2, to: 5.8, swing: true, period: 3.2, face: { bone: 'Spine2', side: true, to: [0.26, 0, 0.97] }, borrow: { trial: '79_96', rate: 60, from: 0.4, to: 1.8, bones: ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand'], face: { bone: 'Spine2', side: true, to: [0.26, 0, 0.97] } } },
    pistolTwo: { trial: '79_96', rate: 60, from: 4.2, to: 5.8, swing: true, period: 3.2, face: { bone: 'Spine2', side: true, to: [0, 0, 1] } },
    rifle: { trial: '79_96', rate: 60, from: 4.2, to: 5.8, swing: true, period: 3.2, face: { bone: 'Spine2', side: true, to: [-0.45, 0, 0.89] } },
    kneelAim: { trial: '23_03', from: 2.0, to: 3.8, swing: true, period: 3.6, skin: true, face: { bone: 'Spine2', side: true, to: [-0.45, 0, 0.89] } },
    // Lying face down, the head toward +z.
    prone: { trial: '77_16', rate: 60, from: 0.1, to: 1.0, swing: true, period: 3.6, skin: true, face: { bone: 'Hips', to: [0, 0, 1] } },
    proneAim: { trial: '77_16', rate: 60, from: 0.1, to: 1.0, swing: true, period: 3.6, skin: true, face: { bone: 'Hips', to: [0, 0, 1] }, layer: { turn: { Spine1: [[0, [-12, 0, 0]]], Spine2: [[0, [-15, 0, 0]]], Neck: [[0, [-20, 0, 0]]], Head: [[0, [-10, 0, 0]]] } } },
    crouchWalk: { trial: '136_09', from: 0.3, to: 8.5, cycle: [0.9, 1.7] },
    // A full two-handed swing: up overhead, down through the strike to the follow-through, and up again.
    sword: { trial: '02_07', from: 1.5, to: 6.0, cycle: [1.8, 2.4] },
    // Guarding: the boxer's stance with both forearms raised before the face.
    defend: { trial: '14_01', from: 8.8, to: 11.3, cycle: [1.0, 1.4], layer: { set: {
        LeftArm: [[0, [0.3, -0.42, 0.86], [0, 1, 0]]], LeftForeArm: [[0, [-0.2, 0.93, 0.3], [-0.3, 0.42, -0.86]]],
        RightArm: [[0, [-0.3, -0.42, 0.86], [0, 1, 0]]], RightForeArm: [[0, [0.2, 0.93, 0.3], [0.3, 0.42, -0.86]]]
    } } },
    // Struck: the chest and head snap back, the arms fly out a little, then the guard comes back.
    hit: { trial: '14_01', from: 8.8, to: 11.3, cycle: [1.0, 1.4], layer: { turn: {
        Spine: [[0, [0, 0, 0]], [0.07, [-10, 3, 3]], [0.25, [-5, 1, 1]], [0.55, [0, 0, 0]], [1, [0, 0, 0]]],
        Spine1: [[0, [0, 0, 0]], [0.08, [-20, 6, 5]], [0.22, [-11, 3, 2]], [0.55, [0, 0, 0]], [1, [0, 0, 0]]],
        Spine2: [[0, [0, 0, 0]], [0.09, [-15, 9, 0]], [0.25, [-6, 3, 0]], [0.6, [0, 0, 0]], [1, [0, 0, 0]]],
        Neck: [[0, [0, 0, 0]], [0.1, [-32, 16, -9]], [0.3, [-10, 5, -2]], [0.65, [0, 0, 0]], [1, [0, 0, 0]]],
        LeftArm: [[0, [0, 0, 0]], [0.12, [8, 0, 14]], [0.4, [0, 0, 2]], [0.7, [0, 0, 0]], [1, [0, 0, 0]]],
        RightArm: [[0, [0, 0, 0]], [0.12, [8, 0, -14]], [0.4, [0, 0, -2]], [0.7, [0, 0, 0]], [1, [0, 0, 0]]]
    } } },
    // Falling dead: the legs go from under the body and it lands on its back, then lies still.
    death: { trial: '90_18', from: 0.5, to: 2.4, once: true, skin: true, face: { bone: 'Hips', side: true, to: [0, 0, 1], first: 6 } },
    // Casting a spell: standing, the body leaning back to gather and in to thrust (the hands set by RRCharacterPoses).
    cast: { trial: '79_96', rate: 60, from: 0.4, to: 1.8, swing: true, period: 3.0, layer: { turn: {
        Spine: [[0, [0, 0, 0]], [0.4, [-4, 0, 0]], [0.5, [6, 0, 0]], [0.72, [5, 0, 0]], [1, [0, 0, 0]]],
        Spine1: [[0, [0, 0, 0]], [0.2, [-5, 0, 0]], [0.4, [-9, 0, 0]], [0.5, [10, 0, 0]], [0.72, [8, 0, 0]], [1, [0, 0, 0]]],
        Neck: [[0, [0, 0, 0]], [0.4, [7, 0, 0]], [0.5, [-12, 0, 0]], [0.72, [-10, 0, 0]], [1, [0, 0, 0]]]
    } } },
    // An overhand throw: the wind-up, the front leg's lift, the release over the shoulder and the follow-through.
    throw: { trial: '124_01', from: 1.6, to: 5.0, once: true, fps: 60, face: { bone: 'Hips', side: true, to: [0, 0, 1], first: 6 } },
    // Ducking under a swing.
    dodge: { trial: '76_03', from: 6.4, to: 8.2, once: true, face: { bone: 'Hips', side: true, to: [0, 0, 1], first: 6 } },
    roll: { trial: '127_23', from: 0.0, to: 2.4, once: true, skin: true, face: { bone: 'Hips', side: true, to: [0, 0, 1], first: 4 } },
    backFlip: { trial: '87_04', rate: 60, from: 1.3, to: 3.5, once: true, air: true, fps: 60, smooth: 2, face: { bone: 'Hips', side: true, to: [0, 0, 1], first: 8 } },
    // A front tuck: a back flip played backward turns the other way through the same flight.
    frontFlip: { trial: '88_01', from: 0.0, to: 2.6, rate: 60, fps: 60, smooth: 2, once: true, air: true, reverse: true, face: { bone: 'Hips', side: true, to: [0, 0, 1], first: 8 } },
    // Climbing: a body standing still, its hands and feet set on the rungs or holds by RRCharacterPoses.
    climbLadder: { trial: '79_96', rate: 60, from: 0.4, to: 1.8, swing: true, period: 2.4, hang: 0, layer: { turn: { Spine: [[0, [4, 0, 0]]], Neck: [[0, [-12, 0, 0]]] } } },
    climbWall: { trial: '79_96', rate: 60, from: 0.4, to: 1.8, swing: true, period: 2.6, hang: 0, layer: { turn: { Spine: [[0, [8, 0, 0]]], Neck: [[0, [-18, 0, 0]]] } } },
    // Breaststroke, the body laid along the water, face down.
    swim: { trial: '125_01', from: 10.0, to: 20.0, cycle: [1.3, 1.8], hang: 0.3, face: { bone: 'Hips', to: [0, 0, 1] } },
    // Treading water: upright and leaning a little ahead, head up (the hands and feet set by RRCharacterPoses).
    tread: { trial: '79_96', rate: 60, from: 0.4, to: 1.8, swing: true, period: 2.4, hang: 0, bob: [0.02, 2], layer: { turn: { Spine: [[0, [10, 0, 0]]], Neck: [[0, [-12, 0, 0]]] } } }
};

// ── authored layers over a take ─────────────────────────────────────────
/** Each mapped bone's children, down the builder's skeleton. */
const CHILDREN = { Hips: ['Spine', 'LeftUpLeg', 'RightUpLeg'], Spine: ['Spine1'], Spine1: ['Spine2'], Spine2: ['Neck', 'LeftShoulder', 'RightShoulder'], Neck: ['Head'] };
for (const S of ['Left', 'Right']) Object.assign(CHILDREN, {
    [S + 'Shoulder']: [S + 'Arm'], [S + 'Arm']: [S + 'ForeArm'], [S + 'ForeArm']: [S + 'Hand'],
    [S + 'UpLeg']: [S + 'Leg'], [S + 'Leg']: [S + 'Foot'], [S + 'Foot']: [S + 'ToeBase']
});
const below = n => [n].concat(...(CHILDREN[n] || []).map(below));
/**
 * A value along keys [[u, value], ...] (u from 0 to 1 over the take; a
 * value a number or a list of them), on a smooth curve through every key
 * (Catmull-Rom), level before the first key and after the last.
 */
function curve(keys, u) {
    const val = k => keys[Math.max(0, Math.min(keys.length - 1, k))];
    if (u <= keys[0][0]) return keys[0][1];
    if (u >= keys[keys.length - 1][0]) return keys[keys.length - 1][1];
    let i = 0;
    while (keys[i + 1][0] < u) i++;
    const [t1, p1] = val(i), [t2, p2] = val(i + 1), [t0, p0] = i > 0 ? val(i - 1) : [t1, p1], [t3, p3] = i + 2 < keys.length ? val(i + 2) : [t2, p2];
    const h = t2 - t1, x = (u - t1) / (h || 1), x2 = x * x, x3 = x2 * x;
    const one = (a0, a1, a2, a3) => {
        // Tangents scaled to the span (keys need not be evenly spaced); level at the ends.
        const m1 = i > 0 ? (a2 - a0) / (t2 - t0) * h : 0, m2 = i + 2 < keys.length ? (a3 - a1) / (t3 - t1) * h : 0;
        return (2 * x3 - 3 * x2 + 1) * a1 + (x3 - 2 * x2 + x) * m1 + (-2 * x3 + 3 * x2) * a2 + (x3 - x2) * m2;
    };
    return Array.isArray(p1) ? p1.map((_, k) => one(p0[k], p1[k], p2[k], p3[k])) : one(p0, p1, p2, p3);
}
/** A world turn from degrees about x, then y, then z (the facing frame: x the body's left, y up, z its front). */
const turnOf = ([x, y, z]) => mm(rz(z * DEG), mm(ry(y * DEG), rx(x * DEG)));
/**
 * An authored layer laid over a take's frames:
 *   set:  { Bone: [[u, d, s], ...] }   the bone's world frame (along it, across it) at each key
 *   turn: { Bone: [[u, [x, y, z]], ...] } degrees turning the bone and every bone below it
 *   mix:  [[u, weight], ...]          how much of `set` shows (1 when not given)
 * Turns are laid on after the set frames, in the order given.
 */
function overlay(list, layer) {
    const N = list.length - 1;
    return list.map((f, i) => {
        const u = N ? i / N : 0, bones = Object.assign({}, f.bones);
        const w = layer.mix ? Math.max(0, Math.min(1, curve(layer.mix, u))) : 1;
        for (const [name, keys] of Object.entries(layer.set || {})) {
            const q = keys.map(([t, d, s]) => [t, matQuat(frame(d, s))]);
            for (let k = 1; k < q.length; k++) if (dot4(q[k][1], q[k - 1][1]) < 0) q[k][1] = q[k][1].map(v => -v);
            let at = norm4(curve(q, u));
            const was = matQuat(frame(bones[name].d, bones[name].s));
            if (w < 1) at = slerp(was, at, w);
            const M = quatMat(at);
            bones[name] = { d: [M[0], M[3], M[6]], s: [M[1], M[4], M[7]] };
        }
        for (const [name, keys] of Object.entries(layer.turn || {})) {
            const R = turnOf(curve(keys, u));
            for (const n of below(name)) if (bones[n]) bones[n] = { d: mv(R, bones[n].d), s: mv(R, bones[n].s) };
        }
        return { pos: f.pos, bones };
    });
}
/** A captured gait's neutral foot heading, with the knee and ankle turning together about the thigh. */
function alignGait(list, outward) {
    for (const [S, side] of [['Left', 1], ['Right', -1]]) {
        const angles = [];
        for (const f of list) {
            const thigh = f.bones[S + 'UpLeg'].d, foot = f.bones[S + 'Foot'].d, front = f.bones.Hips.s;
            if (thigh[1] > -0.7 || Math.abs(foot[1]) > 0.6) continue;
            const a = Math.atan2(foot[0], foot[2]) - Math.atan2(front[0], front[2]);
            angles.push(Math.atan2(Math.sin(a), Math.cos(a)) * side);
        }
        if (!angles.length) continue;
        angles.sort((a, b) => a - b);
        const correction = outward * DEG - angles[angles.length >> 1];
        for (const f of list) {
            const axis = f.bones[S + 'UpLeg'].d;
            const angle = correction * side / Math.min(-0.4, axis[1]);
            for (const name of below(S + 'UpLeg')) {
                const b = f.bones[name];
                f.bones[name] = { d: turnAbout(b.d, axis, angle), s: turnAbout(b.s, axis, angle) };
            }
        }
    }
    return list;
}
/** The whole take pitched forward by deg about the body's left-right line (a swimmer laid flat). */
function tilt(list, deg) {
    const R = rx(deg * DEG);
    return list.map(f => ({
        bones: Object.fromEntries(Object.entries(f.bones).map(([n, b]) => [n, { d: mv(R, b.d), s: mv(R, b.s) }])),
        pos: Object.fromEntries(Object.entries(f.pos).map(([n, p]) => [n, mv(R, p)]))
    }));
}
/** The rotation matrix of a unit quaternion. */
function quatMat([x, y, z, w]) {
    return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
}

/** A world turn about y by a. */
const yaw = a => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];

function load(dir, trial) {
    const subject = trial.split('_')[0];
    const asf = parseAsf(fs.readFileSync(path.join(dir, subject + '.asf'), 'utf8'));
    const amc = steady(asf, parseAmc(fs.readFileSync(path.join(dir, trial + '.amc'), 'utf8')));
    return { asf, amc };
}

/**
 * Angles kept continuous from sample to sample. A whole turn (360 degrees) is
 * the same rotation and comes off every angle. A joint turning on fewer than
 * three axes (a hand, a wrist) also comes back by half turns: the capture's
 * solver sometimes jumps such an angle by 180 degrees between two samples,
 * which flips the hand over, and no hand turns that far in a 120th of a
 * second. A joint on three axes keeps its half turns, as there the other two
 * angles change with it and the rotation is the same.
 */
function steady(asf, frames) {
    const last = {};
    for (const frame of frames) for (const [name, values] of Object.entries(frame)) {
        const bone = asf.bones[name];
        if (!bone || name === 'root') continue;
        const turns = bone.dof.filter(d => d[0] === 'r').length, step = turns < 3 ? 180 : 360;
        const before = last[name];
        if (before) for (let k = 0; k < values.length; k++) {
            if (bone.dof[k] && bone.dof[k][0] !== 'r') continue;
            const jump = values[k] - before[k];
            if (Math.abs(jump) > step / 2) values[k] -= step * Math.round(jump / step);
        }
        last[name] = values;
    }
    return frames;
}

/** The frames of a stretch of the take at FPS, turned and mirrored as asked. */
function sample(src, take, from, to) {
    const { asf, amc } = src, sides = restSides(asf), step = take.rate || 120;
    // A swing plays the stretch forward and back again, easing at each end, over `period` seconds;
    // otherwise it plays at `speed` (1 as captured).
    const n = Math.round((take.swing ? take.period : (to - from) / (take.speed || 1)) * (take.fps || FPS)) + 1, out = [];
    for (let i = 0; i < n; i++) {
        let u = take.swing ? (1 - Math.cos(2 * Math.PI * i / (n - 1))) / 2 : i / (n - 1);
        // A take played backward (a back flip run backward is a front flip: the same flight, turned the other way).
        if (take.reverse) u = 1 - u;
        const t = from + (to - from) * u, k = Math.min(amc.length - 1, Math.max(0, Math.round(t * step)));
        out.push(frames(asf, amc[k], sides));
    }
    return out;
}

const MIRROR = n => n.startsWith('Left') ? 'Right' + n.slice(4) : n.startsWith('Right') ? 'Left' + n.slice(5) : n;
const JOINT_MIRROR = n => /^l[a-z]/.test(n) && n !== 'lowerback' && n !== 'lowerneck' ? 'r' + n.slice(1) : /^r[a-z]/.test(n) && n !== 'root' ? 'l' + n.slice(1) : n;
const flip = v => [-v[0], v[1], v[2]];

function orient(list, take) {
    // Mirrored: every direction reflected left for right, and the sides swapped.
    if (take.mirror) list = list.map(f => {
        const bones = {}, pos = {};
        for (const [n, b] of Object.entries(f.bones)) bones[MIRROR(n)] = { d: flip(b.d), s: flip(b.s) };
        for (const [n, p] of Object.entries(f.pos)) pos[JOINT_MIRROR(n)] = flip(p);
        return { bones, pos };
    });
    // Facing: the heading that brings the chosen line round to its direction, averaged over the stretch.
    let sx = 0, sz = 0;
    const face = take.face || { bone: 'Hips', side: true, to: [0, 0, 1] };
    // A body that turns over (a flip, a roll) takes its heading from its first frames only.
    for (const f of face.first ? list.slice(0, face.first) : list) {
        const b = f.bones[face.bone], v = face.side ? b.s : b.d;
        sx += v[0]; sz += v[2];
    }
    const R = yaw(Math.atan2(face.to[0], face.to[2]) - Math.atan2(sx, sz));
    return list.map(f => {
        const bones = {}, pos = {};
        for (const [n, b] of Object.entries(f.bones)) bones[n] = { d: mv(R, b.d), s: mv(R, b.s) };
        for (const [n, p] of Object.entries(f.pos)) pos[n] = mv(R, p);
        return { bones, pos };
    });
}

/** How far off its pose one frame is from another (summed over bones, about radians squared). */
function distance(a, b) {
    let e = 0;
    for (const n of BONES) e += 2 - dot(a.bones[n].d, b.bones[n].d) - dot(a.bones[n].s, b.bones[n].s);
    return e;
}

/** For a loop of steps: the start and length in the stretch whose ends meet best, in pose and in motion. */
function bestCycle(list, take) {
    const lo = Math.round(take.cycle[0] * FPS), hi = Math.round(take.cycle[1] * FPS);
    let best = null;
    for (let a = 1; a + lo + 1 < list.length; a++) for (let T = lo; T <= hi && a + T + 1 < list.length; T++) {
        const e = distance(list[a], list[a + T]) + 0.5 * (distance(list[a - 1], list[a + T - 1]) + distance(list[a + 1], list[a + T + 1]));
        if (!best || e < best.e) best = { a, T, e };
    }
    return best;
}

/** Bone frames as quaternions; a loop's mismatch at its seam spread evenly over it, so the last frame is the first (a motion played once keeps both ends). */
function seal(list, once, smooth) {
    const qs = list.map(f => Object.fromEntries(BONES.map(n => [n, matQuat(frame(f.bones[n].d, f.bones[n].s))])));
    const N = qs.length - 1;
    for (const n of BONES) {
        for (let i = 1; i <= N; i++) if (dot4(qs[i][n], qs[i - 1][n]) < 0) qs[i][n] = qs[i][n].map(v => -v);
        despike(qs, n);
        // A fast take eased a little ([1 2 1] passes over its frames, the ends kept): the markers' jitter
        // through a flip's spin goes, the motion stays.
        for (let pass = 0; pass < (smooth || 0); pass++) {
            const was = qs.map(q => q[n]);
            for (let i = 1; i < N; i++) qs[i][n] = norm4([0, 1, 2, 3].map(k => was[i - 1][k] + 2 * was[i][k] + was[i + 1][k]));
        }
        // The seam's mismatch the short way round: its far sign is the same turn plus a whole one, which
        // spread over the loop spins the bone once round.
        if (once) continue;
        let miss = qmul(qs[0][n], qinv(qs[N][n]));
        if (miss[3] < 0) miss = miss.map(v => -v);
        for (let i = 0; i <= N; i++) qs[i][n] = norm4(qmul(qpow(miss, i / N), qs[i][n]));
    }
    return qs;
}
const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
/** The angle between two turns (radians). */
const apart = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(dot4(a, b))));
/** A turn part way from a to b, the short way. */
function slerp(a, b, k) {
    const c = dot4(a, b) < 0 ? b.map(v => -v) : b;
    return norm4(qmul(qpow(qmul(c, qinv(a)), k), a));
}
/** Most a bone turns in one frame (radians): faster than any joint moves, so a frame past it is the capture losing its markers. */
const SPIKE = 1.0;
/**
 * A bone's frames that jump further from the last sound frame than it
 * could turn in that time, filled in between the sound frames on either
 * side. A run of jumps longer than a few frames is the capture's own
 * motion and stays.
 */
function despike(qs, n) {
    const N = qs.length - 1, bad = new Array(N + 1).fill(false);
    let good = 0;
    for (let i = 1; i <= N; i++) {
        if (apart(qs[good][n], qs[i][n]) <= SPIKE * (i - good)) { good = i; continue; }
        if (i - good > 6) { good = i; continue; }
        bad[i] = true;
    }
    for (let i = 1; i <= N; i++) {
        if (!bad[i]) continue;
        let j = i;
        while (j <= N && bad[j]) j++;
        const a = qs[i - 1][n], b = j <= N ? qs[j][n] : a;
        for (let k = i; k < j; k++) qs[k][n] = slerp(a, b, (k - i + 1) / (j - i + 1));
        i = j;
    }
    for (let i = 1; i <= N; i++) if (dot4(qs[i][n], qs[i - 1][n]) < 0) qs[i][n] = qs[i][n].map(v => -v);
}
const norm4 = q => { const l = Math.hypot(...q); return q.map(v => v / l); };

/** The body's height above its standing height (the lowest foot's lift off the floor), per frame, in leg lengths. */
function clearance(list, legLength, floor) {
    return list.map(f => {
        let low = Infinity;
        for (const j of ['lfoot', 'rfoot', 'ltoes', 'rtoes', 'ltibia', 'rtibia']) if (f.pos[j]) low = Math.min(low, f.pos[j][1] - (floor[j] || 0));
        return low / legLength;
    });
}

function encode(values) {
    const a = new Int16Array(values.length);
    values.forEach((v, i) => { a[i] = Math.max(-32767, Math.min(32767, Math.round(v * 32767))); });
    return Buffer.from(a.buffer).toString('base64');
}

function build(dir) {
    const out = {};
    for (const [id, take] of Object.entries(TAKES)) {
        const src = load(dir, take.trial);
        let list = orient(sample(src, take, take.from, take.to), take);
        if (take.cycle) {
            const c = bestCycle(list, take);
            console.log(`${id}: cycle ${(c.T / FPS).toFixed(2)} s from ${(take.from + c.a / FPS * (take.speed || 1)).toFixed(2)} s, seam ${c.e.toFixed(3)}`);
            list = list.slice(c.a, c.a + c.T + 1);
        } else console.log(`${id}: ${(take.to - take.from).toFixed(2)} s, seam ${distance(list[0], list[list.length - 1]).toFixed(3)}`);
        // Bones borrowed from another take, played over the same frames (an arm at rest by the side).
        if (take.borrow) {
            const o = take.borrow, other = load(dir, o.trial);
            const from = orient(sample(other, Object.assign({}, take, o, { period: take.swing ? take.period : (list.length - 1) / FPS }), o.from, o.to), o);
            list = list.map((f, i) => ({ pos: f.pos, bones: Object.assign({}, f.bones, Object.fromEntries(o.bones.map(n => [n, from[Math.min(from.length - 1, i)].bones[n]]))) }));
        }
        if (take.pitch) list = tilt(list, take.pitch);
        if (take.layer) list = overlay(list, take.layer);
        if (take.gaitForward !== undefined) list = alignGait(list, take.gaitForward);
        const qs = seal(list, take.once, take.smooth);
        // Leg length, and the standing heights of the ankles, balls and toe tips, from the skeleton at rest.
        const b = src.asf.bones, m = src.asf.meters;
        const leg = (b.lfemur.length + b.ltibia.length) * m;
        const rest = pose(src.asf, {}).pos, ground = Math.min(rest.ltoes[1], rest.rtoes[1]);
        const floor = {}; for (const j of ['lfoot', 'rfoot', 'ltoes', 'rtoes', 'ltibia', 'rtibia']) floor[j] = rest[j][1] - ground;
        // The take's floor: where its lowest foot stands through most of the stance (a quarter of the
        // frames lower still), so the feet's small rolls on the floor read as standing, not as flight.
        const lows = clearance(list, leg, floor), base = lows.slice().sort((a, b) => a - b)[Math.floor(lows.length / 4)];
        // A body held off the floor (a fall) stands `hover` leg lengths above it throughout; one hung in
        // place (on a ladder, in the water) keeps its hips `hang` leg lengths up, bobbing by `bob` [amount, cycles].
        const bob = (i, n) => take.bob ? take.bob[0] * Math.sin(2 * Math.PI * take.bob[1] * i / Math.max(1, n - 1)) : 0;
        const air = take.hang !== undefined ? list.map((_, i) => take.hang + bob(i, list.length)) : take.hover ? list.map(() => take.hover) : lows.map(v => Math.max(0, v - base));
        // Seam the height too, so the loop never steps.
        const N = air.length - 1, gap = take.once ? 0 : air[N] - air[0];
        const rise = air.map((v, i) => v - gap * i / N);
        out[id] = {
            frames: qs.length, air: !!(take.air || take.hover), skin: !!take.skin, once: !!take.once, hang: take.hang !== undefined, fps: take.fps || FPS,
            rise: encode(rise.map(v => Math.max(-1, Math.min(1, v)))),
            bones: Object.fromEntries(BONES.map(n => [n, encode(qs.flatMap(q => q[n]))]))
        };
    }
    return out;
}

/**
 * The motions as one binary file: "RRMO", a version, the length of a JSON
 * index, the index (per pose its frames, rate and flags, and where its
 * height and each bone's quaternions sit in the samples, counted in
 * samples), then every sample as a little-endian Int16 (value * 32767).
 */
function pack(data) {
    const chunks = [], index = { fps: FPS, bones: BONES, poses: {} };
    let at = 0;
    const put = text => { const bytes = Buffer.from(text, 'base64'); chunks.push(bytes); const span = [at, bytes.length / 2]; at += bytes.length / 2; return span; };
    for (const [id, p] of Object.entries(data)) {
        const entry = { frames: p.frames, fps: p.fps, air: p.air, skin: p.skin, once: p.once, hang: p.hang, rise: put(p.rise), bones: {} };
        for (const [name, text] of Object.entries(p.bones)) entry.bones[name] = put(text);
        index.poses[id] = entry;
    }
    let json = Buffer.from(JSON.stringify(index), 'utf8');
    if (json.length % 2) json = Buffer.concat([json, Buffer.from(' ')]);
    const head = Buffer.alloc(12);
    head.writeUInt32LE(0x4f4d5252, 0); head.writeUInt32LE(1, 4); head.writeUInt32LE(json.length, 8);
    return Buffer.concat([head, json, ...chunks]);
}

if (require.main === module) {
    const dir = process.argv[2];
    if (!dir || !fs.existsSync(dir)) { console.error('usage: build-poses.cjs <folder of CMU .asf/.amc files>'); process.exit(1); }
    const file = path.join(__dirname, '..', '..', 'runtime', 'reactor_3d_motions.bin');
    fs.writeFileSync(file, pack(build(dir)));
    console.log(`wrote ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
}

module.exports = { TAKES, setTakes: t => { TAKES = t; }, build, pack, load, pose, restSides, BONES, mv, curve };
