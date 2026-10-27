'use strict';
// Forge › 3D Character Builder, the poses (RRCharacterPoses): no bone spins or flips from one frame to the next in
// any clip, on any body; every finger joint stays within its range and curls in its own plane; fingertips stop at
// the palm; hands hang in line with the forearms.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'src', 'forge', 'Character3D');
const load = name => require(path.join(dir, name + '.js'));
const Body = load('HumanBody');
for (const name of ['HumanTargets', 'CharacterOutfit', 'CharacterAtlas', 'CharacterWardrobe', 'CharacterProps', 'CharacterSpecies', 'CharacterSkin', 'CharacterHair', 'CreatureBody', 'CharacterGlb', 'CharacterShading', 'CharacterDetail']) load(name);
const Model = load('CharacterModel');
const Poses = load('CharacterPoses');

const DEG = 180 / Math.PI;
const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const rot = (q, v) => { const c = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], u = [q[0], q[1], q[2]], t = c(u, v).map(x => 2 * x), t2 = c(u, t); return [v[0] + q[3] * t[0] + t2[0], v[1] + q[3] * t[1] + t2[1], v[2] + q[3] * t[2] + t2[2]]; };
const key = (t, f) => Array.from(t.values.slice(f * 4, f * 4 + 4));
/** The angle a turn makes about a unit axis (signed, degrees), and what is left of it off that axis (degrees). */
function about(q, axis) {
    const a = dot(q, axis), w = q[3], l = Math.hypot(a, w) || 1;
    const swing = mul(q, [-axis[0] * a / l, -axis[1] * a / l, -axis[2] * a / l, w / l]);
    return { angle: 2 * Math.atan2(a, w) * DEG, off: 2 * Math.acos(Math.min(1, Math.abs(swing[3]))) * DEG };
}

const BODIES = [
    ['man', { gender: 1 }], ['woman', { gender: 0 }], ['heavy man', { gender: 1, extreme: true, weight: 4 }],
    ['tiny woman', { gender: 0, extreme: true, height: -3 }], ['long-limbed man', { gender: 1, extreme: true, height: 3, muscle: 1 }]
];
let pack;
const built = new Map();
const bodyOf = name => {
    if (!built.has(name)) { const b = Model.build(pack, BODIES.find(x => x[0] === name)[1], {}, { quality: 'preview' }); built.set(name, { bones: b.bones, body: b.parts.find(p => p.name === 'Body') }); }
    return built.get(name);
};
test.before(async () => { pack = await Body.loadPack(); });

test('thrust and bow have distinct one-shot arm motions and dedicated sprite/game clips', () => {
    const Cloth = load('CharacterCloth');
    const { bones, body } = bodyOf('man');
    const index = new Map(bones.map((b, i) => [b.name, i]));
    for (const id of ['swordThrust', 'bow']) {
        const clip = Poses.clip(bones, id, body);
        assert.ok(clip?.once, id + ' plays once');
        assert.ok(Poses.GAME_CLIPS.some(c => c.id === id && c.useful));
        const at = u => Cloth.pose(bones, clip, clip.times.at(-1) * u).P[index.get('RightHand')];
        const a = at(0), b = at(0.5);
        assert.ok(Math.hypot(...sub(b, a)) > 0.15, id + ' has a real draw or forward thrust');
        const borrowed = Poses.clip(bones, id === 'bow' ? 'throw' : 'sword', body);
        assert.notDeepEqual(clip.tracks.find(t => t.bone === index.get('RightArm')).values, borrowed.tracks.find(t => t.bone === index.get('RightArm')).values);
    }
    assert.ok(Poses.SLOTS.some(([id, , clip]) => id === 'thrust' && clip === 'Thrust'));
    assert.ok(Poses.SLOTS.some(([id, , clip]) => id === 'missile' && clip === 'Bow'));
});

test('a bow draw keeps the bow hand steady and anchors the draw beside the head before release', () => {
    const Cloth = load('CharacterCloth');
    for (const name of ['man', 'woman', 'long-limbed man']) {
        const { bones, body } = bodyOf(name), c = Poses.clip(bones, 'bow', body), end = c.times.at(-1);
        const at = (u, n) => Cloth.pose(bones, c, end * u).P[bones.findIndex(b => b.name === n)];
        const hand = at(0.1, 'LeftHand');
        for (const u of [0.25, 0.45, 0.6, 0.7]) assert.ok(Math.hypot(...sub(hand, at(u, 'LeftHand'))) < 0.002, name + ' steady bow arm');
        const draw = at(0.5, 'RightHand'), head = at(0.5, 'Head');
        assert.ok(Math.hypot(...sub(draw, head)) < Math.hypot(...sub(hand, head)) * 0.2, name + ' draw reaches the cheek');
        assert.ok(Math.hypot(...sub(draw, at(0.6, 'RightHand'))) < 0.002, name + ' holds the draw');
    }
});

test('front and back flips keep the whole inverted body airborne through one smooth flight', () => {
    const Cloth = load('CharacterCloth');
    for (const name of ['man', 'woman', 'heavy man']) for (const id of ['frontFlip', 'backFlip']) {
        const { bones, body } = bodyOf(name), c = Poses.clip(bones, id, body);
        let inverted = 0;
        for (let f = 1; f < c.times.length - 1; f++) {
            const ps = Cloth.pose(bones, c, c.times[f]), hips = bones.findIndex(b => b.parent < 0);
            if (rot(ps.R[hips], [0, 1, 0])[1] > -0.4) continue;
            const skin = Cloth.skin(body, bones, ps);
            let low = Infinity;
            for (let v = 1; v < skin.length; v += 3) low = Math.min(low, skin[v] + c.heights[f]);
            assert.ok(low > 0.025, name + '/' + id + ' clears the floor while inverted');
            assert.ok(Math.abs(c.heights[f + 1] - 2 * c.heights[f] + c.heights[f - 1]) < 0.025, name + '/' + id + ' no mid-flight bounce');
            inverted++;
        }
        assert.ok(inverted > 3);
    }
});

test('no bone turns faster than a joint can, every track keeps one hemisphere, and no loop winds a bone round', () => {
    // 65 degrees from one key to the next is past any joint's own turn (keys come 30 or 60 a second; a pitcher's
    // arm, the fastest turn a body makes, comes to about 50 at 60 a second): a flip or a capture glitch.
    for (const [name] of BODIES) {
        const { bones, body } = bodyOf(name);
        for (const pose of Poses.POSES) {
            const clip = Poses.clip(bones, pose.id, body);
            assert.ok(clip, `${pose.id} on ${name}`);
            for (const t of clip.tracks) {
                if (t.path) continue;
                for (let f = 1; f < clip.times.length; f++) {
                    const a = key(t, f - 1), b = key(t, f), d = dot4(a, b);
                    assert.ok(d >= 0, `${pose.id} on ${name}: ${bones[t.bone].name} changes hemisphere at frame ${f}`);
                    const step = 2 * Math.acos(Math.min(1, d)) * DEG;
                    assert.ok(step <= 65, `${pose.id} on ${name}: ${bones[t.bone].name} turns ${step.toFixed(0)} degrees at frame ${f}`);
                }
                // Keys a short step apart keep one sign, so a loop's last key lands back on its first with the same
                // sign; landing on the opposite sign means the bone wound a whole turn round over the loop (a
                // propeller), however slowly.
                if (clip.once) continue;
                const last = clip.times.length - 1;
                assert.ok(dot4(key(t, 0), key(t, last)) > 0.99, `${pose.id} on ${name}: ${bones[t.bone].name} winds a whole turn over the loop`);
            }
        }
    }
});

test('the sitting right hand holds still: no spin through the loop', () => {
    for (const [name] of BODIES) {
        const { bones, body } = bodyOf(name);
        const clip = Poses.clip(bones, 'sit', body), hand = bones.findIndex(b => b.name === 'RightHand');
        const t = clip.tracks.find(x => x.bone === hand);
        let total = 0;
        for (let f = 1; f < clip.times.length; f++) total += 2 * Math.acos(Math.min(1, Math.abs(dot4(key(t, f - 1), key(t, f))))) * DEG;
        assert.ok(total < 60, `sit on ${name}: the right hand turns ${total.toFixed(0)} degrees over the loop`);
    }
});

test('every finger joint stays within its range in every clip: it curls in its own plane, spreads a little, the thumb within its reach', () => {
    const R = Poses.FINGER_RANGE, slack = 1;
    for (const [name] of BODIES) {
        const { bones, body } = bodyOf(name), frames = Poses.handFrames(bones);
        const joints = new Map();
        for (const S of ['Left', 'Right']) for (const j of frames[S].joints) joints.set(j.bone, j);
        assert.equal(joints.size, 30, `${name}: fifteen finger joints a hand`);
        for (const pose of Poses.POSES) {
            const clip = Poses.clip(bones, pose.id, body);
            const seen = new Set();
            for (const t of clip.tracks) {
                const j = joints.get(t.bone);
                if (!j) continue;
                seen.add(t.bone);
                const label = `${pose.id} on ${name}: ${bones[t.bone].name}`;
                for (let f = 0; f < clip.times.length; f++) {
                    const q = key(t, f), { angle, off } = about(q, j.axis);
                    if (j.finger === 'Thumb') {
                        if (j.k === 1) assert.ok(angle >= R.thumbBase[0] - slack && angle <= R.thumbBase[1] + slack && off <= R.thumbRoll[1] + slack, `${label} base ${angle.toFixed(0)}, roll ${off.toFixed(0)}`);
                        else assert.ok(angle >= R.thumbJoint[0] - slack && angle <= R.thumbJoint[1] + slack && off < 1, `${label} ${angle.toFixed(0)} (${off.toFixed(1)} off its plane)`);
                        continue;
                    }
                    const range = j.k === 1 ? R.knuckle : j.k === 2 ? R.middle : R.end;
                    assert.ok(angle >= range[0] - slack && angle <= range[1] + slack, `${label} closes ${angle.toFixed(0)} degrees`);
                    if (j.k === 1) assert.ok(off <= Math.max(-R.spread[0], R.spread[1]) + slack, `${label} spreads ${off.toFixed(0)} degrees`);
                    else assert.ok(off < 1, `${label} bends ${off.toFixed(1)} degrees out of its plane`);
                }
            }
            assert.equal(seen.size, 30, `${pose.id} on ${name} shapes every finger`);
        }
    }
});

test('a closed hand stops at the palm: no fingertip passes into it, on any body, in any shape', () => {
    for (const [name] of BODIES) {
        const { bones } = bodyOf(name), frames = Poses.handFrames(bones), at = n => bones.findIndex(b => b.name === n);
        for (const shape of Object.keys(Poses.HAND_SHAPES)) {
            const tracks = Poses.handShape(bones, shape), local = bones.map(() => [0, 0, 0, 1]), W = [], pos = [];
            for (const t of tracks) local[t.bone] = key(t, 0);
            bones.forEach((b, i) => {
                if (b.parent < 0) { W[i] = local[i]; pos[i] = b.head.slice(); return; }
                W[i] = mul(W[b.parent], local[i]);
                const o = rot(W[b.parent], sub(b.head, bones[b.parent].head));
                pos[i] = pos[b.parent].map((v, k) => v + o[k]);
            });
            for (const S of ['Left', 'Right']) {
                const F = frames[S], hand = pos[at(S + 'Hand')];
                for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) {
                    const i = at(S + 'Hand' + f + '3'), b = bones[i], tip = sub(pos[i].map((v, k) => v + rot(W[i], sub(b.tail, b.head))[k]), hand);
                    const over = dot(tip, F.along) / F.length;
                    if (over < 0.1 || over > 1.05) continue;
                    assert.ok(dot(tip, F.palm) >= 0.2 * F.length, `${shape} on ${name}: the ${S.toLowerCase()} ${f.toLowerCase()} tip is ${(dot(tip, F.palm) * 100).toFixed(1)} cm off the palm`);
                }
            }
        }
    }
});

test('walking hands hang in line with the forearms, not cocked out at the wrist', () => {
    for (const [name] of BODIES) {
        const { bones, body } = bodyOf(name), frames = Poses.handFrames(bones), at = n => bones.findIndex(b => b.name === n);
        for (const id of ['walk', 'run']) {
            const clip = Poses.clip(bones, id, body);
            for (const S of ['Left', 'Right']) {
                const t = clip.tracks.find(x => x.bone === at(S + 'Hand')), F = frames[S];
                for (let f = 0; f < clip.times.length; f++) {
                    // The hand's length after its turn, against the forearm's line (the hand at rest).
                    const a = rot(key(t, f), F.along), bend = Math.acos(Math.min(1, dot(a, F.along))) * DEG;
                    assert.ok(bend < 16, `${id} on ${name}: the ${S.toLowerCase()} wrist bends ${bend.toFixed(0)} degrees at frame ${f}`);
                }
            }
        }
    }
});

/** Every joint's turn and place at frame f of a clip, the body lifted as the clip says. */
function posed(bones, clip, f) {
    const local = bones.map(() => [0, 0, 0, 1]), W = [], pos = [];
    for (const t of clip.tracks) if (!t.path) local[t.bone] = key(t, f);
    bones.forEach((b, i) => {
        if (b.parent < 0) { W[i] = local[i]; pos[i] = [b.head[0], b.head[1] + clip.heights[f], b.head[2]]; return; }
        W[i] = mul(W[b.parent], local[i]);
        const o = rot(W[b.parent], sub(b.head, bones[b.parent].head));
        pos[i] = pos[b.parent].map((v, k) => v + o[k]);
    });
    return { W, pos };
}

test('a gun hand holds its grip on the line ahead of the eye, and a second hand meets the first, on every body', () => {
    for (const [name] of BODIES) {
        const { bones, body } = bodyOf(name), F = Poses.handFrames(bones), at = n => bones.findIndex(b => b.name === n);
        const s = Math.max(...bones.map(b => b.head[1])) / 1.7;
        const grip = (W, pos, S) => { const i = at(S + 'Hand'), w = W[i], f = F[S]; return pos[i].map((v, k) => v + rot(w, f.along)[k] * f.length * 0.62 + rot(w, f.palm)[k] * f.length * 0.27); };
        for (const id of ['pistol', 'pistolTwo']) {
            const clip = Poses.clip(bones, id, body);
            for (let f = 0; f < clip.times.length; f += 8) {
                const { W, pos } = posed(bones, clip, f), head = at('Head');
                const eye = pos[head].map((v, k) => v + rot(W[head], [-0.031 * s, 0.062 * s, 0.078 * s])[k]), g = grip(W, pos, 'Right');
                // Level with the eye a hand's height under it, straight ahead of it.
                assert.ok(Math.abs(g[0] - eye[0]) < 0.05 * s, `${id} on ${name}: the gun hand is ${((g[0] - eye[0]) * 100).toFixed(1)} cm off the eye's line`);
                assert.ok(Math.abs(eye[1] - g[1] - 0.07 * s) < 0.05 * s && g[2] - eye[2] > 0.3 * s, `${id} on ${name}: the gun hand at ${g.map(v => v.toFixed(2))}, the eye at ${eye.map(v => v.toFixed(2))}`);
                if (id === 'pistolTwo') {
                    const l = grip(W, pos, 'Left'), d = Math.hypot(...sub(l, g));
                    assert.ok(d < 0.09 * s, `pistolTwo on ${name}: the hands ${(d * 100).toFixed(1)} cm apart`);
                }
            }
        }
        const sword = Poses.clip(bones, 'sword', body);
        for (let f = 0; f < sword.times.length; f += 6) {
            const { W, pos } = posed(bones, sword, f), d = Math.hypot(...sub(grip(W, pos, 'Left'), grip(W, pos, 'Right')));
            assert.ok(d > 0.05 * s && d < 0.13 * s, `sword on ${name}: the hands ${(d * 100).toFixed(1)} cm apart on the hilt at frame ${f}`);
        }
    }
});

test('standing motions keep the soles on the floor, never under it; a jump and the flips leave it and come back', () => {
    for (const [name] of BODIES) {
        const { bones, body } = bodyOf(name), at = n => bones.findIndex(b => b.name === n), s = Math.max(...bones.map(b => b.head[1])) / 1.7;
        const low = (clip, f) => {
            const { W, pos } = posed(bones, clip, f);
            let least = Infinity;
            for (const S of ['Left', 'Right']) for (const [n, o] of [['Foot', [0, -0.065, -0.055]], ['ToeBase', [0, 0, 0]], ['ToeBase', [0, -0.012, 0.06]]]) {
                const i = at(S + n);
                least = Math.min(least, pos[i][1] + rot(W[i], o.map(v => v * s))[1] - (bones[i].head[1] + o[1] * s));
            }
            return least;
        };
        for (const p of Poses.POSES) {
            const clip = Poses.clip(bones, p.id, body);
            if (clip.skin) continue;
            let most = 0;
            for (let f = 0; f < clip.times.length; f++) {
                const l = low(clip, f);
                assert.ok(l > -0.012, `${p.id} on ${name}: a foot ${(l * 100).toFixed(1)} cm under the floor at frame ${f}`);
                most = Math.max(most, l);
            }
            if (['jump', 'frontFlip', 'backFlip'].includes(p.id)) {
                assert.ok(most > 0.3 * s, `${p.id} on ${name} leaves the floor (${most.toFixed(2)} m)`);
                assert.ok(low(clip, clip.times.length - 1) < 0.03 * s, `${p.id} on ${name} lands`);
            }
        }
    }
});

test('a saved character carries its motions as clips the game plays by name, keyed lean', () => {
    const runtime = path.join(root, '..', 'runtime');
    const R = require(path.join(runtime, 'reactor_3d.js'));
    const { bones, body } = bodyOf('man');
    const clips = Poses.gameClips(bones, body);
    const names = clips.map(c => c.name);
    // The movement states the game plays a model's own clips for, without anyone setting them up.
    const states = Object.fromEntries(R.ownClipAnimations([], names.map(name => ({ name })), null).map(rule => [rule.trigger, rule.clip]));
    assert.deepEqual(states, { walking: 'Walk', dashing: 'Run', jumping: 'Jump', swimming: 'Swim', treading: 'Tread Water', climbing: 'Climb' });
    for (const n of ['Sword Swing', 'Guard', 'Hit', 'Death', 'Cast Spell', 'Throw', 'Dodge', 'Pistol Aim', 'Rifle Aim', 'Fight Stance']) assert.ok(names.includes(n), n);
    assert.deepEqual(Poses.gameClips(bones, body, 'none'), []);
    assert.ok(Poses.gameClips(bones, body, 'all').length === Poses.GAME_CLIPS.length, 'all the motions');
    let bytes = 0;
    const hips = bones.findIndex(b => b.parent < 0);
    for (const c of clips) {
        const end = c.times[c.times.length - 1];
        assert.ok(c.tracks.some(t => t.bone === hips && t.path === 'translation'), `${c.name} carries the hips' height`);
        for (const t of c.tracks) {
            const d = t.path ? 3 : 4;
            assert.equal(t.values.length, t.times.length * d, `${c.name}: ${bones[t.bone].name} keys`);
            assert.ok(t.times[0] === 0 && Math.abs(t.times[t.times.length - 1] - end) < 1e-6, `${c.name}: ${bones[t.bone].name} spans the clip`);
            for (let i = 1; i < t.times.length; i++) assert.ok(t.times[i] > t.times[i - 1], `${c.name}: keys in order`);
            bytes += t.values.length * 4 + t.times.length * 4;
        }
    }
    assert.ok(bytes < 400 * 1024, `the motions' keys come to ${(bytes / 1024).toFixed(0)} KB`);
    // A body lying down lies on the floor: its lowest skin at the floor when the fall has ended.
    const death = clips.find(c => c.name === 'Death'), t = death.tracks.find(x => x.path === 'translation');
    assert.ok(t.values[t.values.length - 2] < bones[hips].head[1] * 0.45, 'the fallen body lies low');
});

test('every pose sits in one of the list\'s groups, and the builder\'s pose picker shows them under those groups', () => {
    const vm = require('node:vm'), fs = require('node:fs');
    const ids = new Set(Poses.GROUPS.map(g => g.id));
    for (const p of Poses.POSES) assert.ok(ids.has(p.group), `${p.id} has a group`);
    const picker = { dataset: {}, innerHTML: '', value: '' };
    const ctx = { window: {}, rrEscapeHtml: s => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'), RRCharacterPoses: Poses };
    vm.runInNewContext(fs.readFileSync(path.join(dir, 'Character3DBuilder.js'), 'utf8'), ctx);
    const b = Object.create(ctx.window.Character3DBuilder.prototype);
    Object.assign(b, { pose: 'rifle', root: { querySelector: () => picker }, _t: s => s });
    b._syncPose();
    assert.equal(picker.value, 'rifle');
    const groups = [...picker.innerHTML.matchAll(/<optgroup label="([^"]*)">(.*?)<\/optgroup>/g)];
    assert.deepEqual(groups.map(m => m[1]), Poses.GROUPS.map(g => g.label));
    for (const [, label, body] of groups) {
        const names = [...body.matchAll(/<option[^>]*>(.*?)<\/option>/g)].map(m => m[1]);
        const want = Poses.POSES.filter(p => Poses.GROUPS.find(g => g.label === label).id === p.group).map(p => p.label);
        assert.deepEqual(names.slice().sort(), want.slice().sort(), `${label} holds its poses`);
        assert.deepEqual(names, names.slice().sort((x, y) => x.localeCompare(y)), `${label} in order`);
    }
});

test('every leg joint stays within its reach in every clip: hip, knee a hinge never past straight, ankle, toes; a standing foot points near where its knee does', () => {
    const R = Poses.LEG_RANGE, slack = 1.5;
    const logOf = q => { const w = q[3] < 0 ? -1 : 1, c = Math.min(1, q[3] * w), a = 2 * Math.acos(c), k = a > 1e-6 ? a / Math.sin(a / 2) : 2; return [q[0] * w * k * DEG, q[1] * w * k * DEG, q[2] * w * k * DEG]; };
    const conj = q => [-q[0], -q[1], -q[2], q[3]];
    for (const [name] of BODIES) {
        const { bones, body } = bodyOf(name), at = n => bones.findIndex(b => b.name === n);
        for (const pose of Poses.POSES) {
            const clip = Poses.clip(bones, pose.id, body);
            for (let f = 0; f < clip.times.length; f++) {
                const { W } = posed(bones, clip, f);
                for (const S of ['Left', 'Right']) {
                    const parentOf = { UpLeg: 'Hips', Leg: S + 'UpLeg', Foot: S + 'Leg', ToeBase: S + 'Foot' };
                    for (const n of ['UpLeg', 'Leg', 'Foot', 'ToeBase']) {
                        const v = logOf(mul(conj(W[at(parentOf[n])]), W[at(S + n)])), r = R[n], label = `${pose.id} on ${name}: ${S}${n} at frame ${f}`;
                        assert.ok(v[0] >= r.x[0] - slack && v[0] <= r.x[1] + slack, `${label} bends ${v[0].toFixed(0)}`);
                        // An ankle rolling its sole level brings the foot's turn with it (eversion with abduction, inversion
                        // with adduction): up to the library's SOLE_TURN (18) there; LEG_RANGE's 12 bounds the capture's own.
                        const turn = n === 'Foot' ? Math.max(r.y, Poses.SOLE_TURN) : r.y;
                        assert.ok(Math.abs(v[1]) <= turn + slack && Math.abs(v[2]) <= r.z + slack, `${label} turns ${v[1].toFixed(0)}, tilts ${v[2].toFixed(0)}`);
                    }
                    // The foot against the knee: both read square to the shin, on a level foot.
                    const leg = at(S + 'Leg'), foot = at(S + 'Foot'), shin = rot(W[leg], sub(bones[foot].head, bones[leg].head)).map(v => v / Math.hypot(...sub(bones[foot].head, bones[leg].head)));
                    const off = (v, d) => { const k = dot(v, d); const o = v.map((x, i) => x - d[i] * k), l = Math.hypot(...o) || 1; return o.map(x => x / l); };
                    const fr = sub(bones[at(S + 'ToeBase')].head, bones[foot].head), fw = rot(W[foot], fr.map(v => v / Math.hypot(...fr)));
                    // (A leg standing: its shin near upright, its foot near level.)
                    if (Math.abs(fw[1]) > 0.5 || shin[1] > -0.75) continue;
                    const knee = off(rot(W[leg], [0, 0, 1]), shin), toe = off(fw, shin);
                    const angle = Math.acos(Math.max(-1, Math.min(1, dot(knee, toe)))) * DEG;
                    assert.ok(angle < 40, `${pose.id} on ${name}: the ${S.toLowerCase()} foot points ${angle.toFixed(0)} degrees off its knee at frame ${f}`);
                }
            }
        }
    }
});

test('Save to Project builds a humanoid rig sidecar and maps the saved mocap clips to game slots', async () => {
    const Glb = load('CharacterGlb');
    const Optimizer = require(path.join(root, 'src/utils/GlbOptimizer.js'));
    const R = require(path.join(root, '..', 'runtime/reactor_3d.js'));
    require(path.join(root, '..', 'runtime/reactor_3d_models.js'));
    const { bones, body } = bodyOf('man'), result = { bones, parts: [body], clips: [{ name: 'Idle', ...Glb.idleClip(bones, {}) }] };
    const ready = Poses.savedModel(result, 'useful');
    assert.equal(ready.sidecar.rig.template, 'humanoid');
    assert.ok(ready.rigBinary.byteLength > 0);
    const sidecar = structuredClone(ready.sidecar);
    sidecar.rig.weightsBin = R.decodeRigWeightsBinary(ready.rigBinary);
    const rig = R.readModelRig(sidecar);
    assert.ok(rig && rig.bones.length >= 17, 'the game reads the saved rig without rigging it again');
    const bytes = Glb.toGlb(result, { name: 'Saved mocap', clips: result.clips.concat(ready.clips) });
    const { json } = Optimizer.parseGlb(bytes);
    const animations = json.animations.map(a => ({ name: a.name }));
    const rules = R.readModelAnimationRules(sidecar, animations);
    for (const [state, clip] of Object.entries({ walking: 'Walk', dashing: 'Run', jumping: 'Jump', swimming: 'Swim', treading: 'Tread Water', climbing: 'Climb' })) {
        const rule = rules.find(r => r.trigger === state);
        assert.equal(rule?.type, 'clip', state + ' uses the saved mocap');
        assert.equal(rule.clip, clip);
        assert.ok(json.animations.some(a => a.name === clip && a.channels.length > 20), clip + ' carries skeletal keys');
    }
    const none = Poses.savedModel(result, 'none');
    assert.equal(none.clips.length, 0);
    assert.equal(none.sidecar.rig.template, 'humanoid', 'rigging remains automatic with motion export disabled');
});

/**
 * A foot's sole centerline at rest, along the floor: from the middle of its heel to the middle of its ball, each the
 * midpoint of the sole's outermost and innermost skin across it (as the visible-sole test below samples them).
 */
function soleLine(body, foot, toe, side) {
    const length = toe.head[2] - foot.head[2];
    const middle = fraction => {
        const z = foot.head[2] + length * fraction, xs = [];
        for (let v = 0; v < body.positions.length / 3; v++) {
            if (body.positions[v * 3 + 1] < foot.head[1] * .7 && Math.sign(body.positions[v * 3]) === side && Math.abs(body.positions[v * 3 + 2] - z) < length * .08) xs.push(body.positions[v * 3]);
        }
        xs.sort((a, b) => a - b);
        const n = Math.max(1, Math.floor(xs.length * .1)), edge = list => list.reduce((s, x) => s + x, 0) / list.length;
        return [(edge(xs.slice(0, n)) + edge(xs.slice(-n))) / 2, z];
    };
    const heel = middle(.18), ball = middle(.88);
    return [ball[0] - heel[0], 0, ball[1] - heel[1]];
}

test('walking and running feet face forward through the stride on every body', () => {
    for (const [name] of BODIES) {
        const { bones, body } = bodyOf(name), at = n => bones.findIndex(b => b.name === n);
        for (const id of ['walk', 'run']) {
            const clip = Poses.clip(bones, id, body);
            for (const [S, side] of [['Left', 1], ['Right', -1]]) {
                // The foot's true heel-to-toe line: its sole's centerline at rest, from the middle of the heel to the
                // middle of the ball (as the skin test below finds them), carried by the foot bone. The pitched
                // ankle-to-ball line read here before runs 6 to 9 degrees outside it, read several degrees less
                // while the capture rolled the soles in, and swings sideways once a pitched foot levels its sole.
                const foot = at(S + 'Foot'), toe = at(S + 'ToeBase'), along = soleLine(body, bones[foot], bones[toe], side), headings = [];
                for (let f = 0; f < clip.times.length; f++) {
                    const { W } = posed(bones, clip, f), direction = rot(W[foot], along), front = rot(W[at('Hips')], [0, 0, 1]);
                    // A pitched foot pushing off or swinging vertically has no meaningful horizontal heading.
                    if (Math.abs(direction[1]) / Math.hypot(...direction) >= 0.6) continue;
                    const a = Math.atan2(direction[0], direction[2]) - Math.atan2(front[0], front[2]);
                    const outward = Math.atan2(Math.sin(a), Math.cos(a)) * DEG * side;
                    headings.push(outward);
                    // Along the sole's centerline: a walk's foot never turns in past 1.5; a run's swinging foot may pass
                    // 4.5 in on its way through, the bound the visible-sole test below holds this same line to (this was
                    // 3.5 on the ankle-to-ball line, which reads 6 to 9 further out); none out past 24.5.
                    assert.ok(outward > (id === 'walk' ? -1.5 : -4.5) && outward < 24.5, `${id} on ${name}: ${S} points ${outward.toFixed(1)} degrees outward at frame ${f}`);
                }
                assert.ok(headings.length > clip.times.length / 4, `${id}: enough level-foot frames`);
                headings.sort((a, b) => a - b);
                const neutral = headings[headings.length >> 1];
                // A stride's soles land 5 to 12 degrees out, a natural toe-out. This was 2 to 14 when it read the
                // ankle-to-ball line of a sole rolled in (a reading 6 to 9 off the sole's own line either way).
                assert.ok(neutral >= 5 && neutral <= 12, `${id} on ${name}: ${S}'s neutral heading is ${neutral.toFixed(1)} degrees outward`);
            }
        }
    }
});

test('walking visible heel-to-ball soles face forward without curling inward', () => {
    const Cloth = load('CharacterCloth');
    for (const [name] of BODIES) {
        const { bones, body } = bodyOf(name), clip = Poses.clip(bones, 'walk', body);
        for (const [S, side] of [['Left', 1], ['Right', -1]]) {
            const foot = bones.find(b => b.name === S + 'Foot'), toe = bones.find(b => b.name === S + 'ToeBase');
            const length = toe.head[2] - foot.head[2];
            // Sample opposite edges at the heel, instep and ball, before the toe tips. A tip centroid
            // is biased toward the long big toe and cannot measure a foot's anatomical forward axis.
            const groups = [.18, .55, .88].map(fraction => {
                const z = foot.head[2] + length * fraction, ids = [];
                for (let v = 0; v < body.positions.length / 3; v++) {
                    if (body.positions[v * 3 + 1] < foot.head[1] * .7 && Math.sign(body.positions[v * 3]) === side && Math.abs(body.positions[v * 3 + 2] - z) < length * .08) ids.push(v);
                }
                ids.sort((a, b) => body.positions[a * 3] - body.positions[b * 3]);
                const n = Math.max(1, Math.floor(ids.length * .1));
                assert.ok(ids.length >= 4, `${name} ${S}: sole cross section exists`);
                return ids.slice(0, n).concat(ids.slice(-n));
            });
            const ids = groups.flat(), offsets = [0, groups[0].length, groups[0].length + groups[1].length];
            const points = X => groups.map((g, i) => [0, 1, 2].map(k => g.reduce((sum, _, j) => sum + X[(offsets[i] + j) * 3 + k], 0) / g.length));
            const yaw = (a, b) => Math.atan2(b[0] - a[0], b[2] - a[2]) * DEG * side;
            const rest = points(new Float32Array(ids.flatMap(v => Array.from(body.positions.slice(v * 3, v * 3 + 3)))));
            const restCurve = yaw(rest[1], rest[2]) - yaw(rest[0], rest[1]), headings = [];
            for (const time of clip.times) {
                const ps = Cloth.pose(bones, clip, time), p = points(Cloth.skin(body, bones, ps, ids));
                const d = sub(p[2], p[0]);
                if (Math.abs(d[1]) / Math.hypot(...d) >= .6) continue;
                const heading = yaw(p[0], p[2]);
                headings.push(heading);
                assert.ok(heading > -4.5 && heading < 19, `${name} ${S}: visible sole heading ${heading.toFixed(1)} at ${time.toFixed(2)}`);
                const curve = yaw(p[1], p[2]) - yaw(p[0], p[1]);
                assert.ok(Math.abs(curve - restCurve) < 10, `${name} ${S}: foot gains an unnatural ${Math.abs(curve - restCurve).toFixed(1)} degree bend`);
            }
            headings.sort((a, b) => a - b);
            assert.ok(headings.length > clip.times.length / 4, `${name} ${S}: level sole samples`);
            const median = headings[headings.length >> 1];
            // The same natural toe-out as the bones' test above, 5 to 12 out (was 2 to 10 while the soles rolled in:
            // a rolled foot carries its sole's line several degrees further in than a level one).
            assert.ok(median >= 5 && median <= 12, `${name} ${S}: visible sole neutral heading ${median.toFixed(1)}`);
        }
    }
});

test('a saved merfolk maps treading to its native tail motion', () => {
    const { bones, body } = bodyOf('man');
    const result = { bones, parts: [body], recipe: { species: 'merfolk' }, clips: ['Idle', 'Walk', 'Swim', 'Tread'].map(name => ({ name })) };
    const ready = Poses.savedModel(result, 'useful');
    const slots = Object.fromEntries(ready.sidecar.animations.map(a => [a.trigger, a.clip]));
    assert.equal(slots.treading, 'Tread');
    assert.equal(slots.walking, 'Walk'); assert.equal(slots.swimming, 'Swim'); assert.equal(slots.idle, 'Idle');
    const none = Poses.savedModel(result, 'none');
    assert.equal(none.sidecar.animations.find(a => a.trigger === 'treading').clip, 'Tread', 'native motions remain available without shared motion export');
});


test('flip landings recover forward-facing feet instead of following lost inverted foot markers', () => {
    const Cloth = load('CharacterCloth');
    for (const name of ['man', 'woman', 'heavy man', 'long-limbed man']) for (const id of ['frontFlip', 'backFlip']) {
        const { bones, body } = bodyOf(name), c = Poses.clip(bones, id, body), end = c.times.at(-1);
        const hips = bones.findIndex(b => b.name === 'Hips');
        for (const u of [0.8, 0.85, 0.9, 0.95, 1]) {
            const ps = Cloth.pose(bones, c, end * u), front = rot(ps.R[hips], [0, 0, 1]);
            for (const side of ['Left', 'Right']) {
                const foot = bones.findIndex(b => b.name === side + 'Foot'), toe = bones.findIndex(b => b.name === side + 'ToeBase');
                const direction = sub(ps.P[toe], ps.P[foot]), length = Math.hypot(...direction), horizontal = Math.hypot(direction[0], direction[2]);
                assert.ok(Math.abs(direction[1]) / length < 0.55, name + '/' + id + ' does not land on vertical toes');
                const forward = (direction[0] * front[0] + direction[2] * front[2]) / (horizontal * Math.hypot(front[0], front[2]));
                assert.ok(forward > 0.8, name + '/' + id + ' feet face the landing direction');
            }
        }
    }
});

test('walk and run keep both knees and feet on their own side of the hips',()=>{
    const Cloth=load('CharacterCloth');
    for(const name of ['man','woman','tiny woman','long-limbed man']){
        const {bones,body}=bodyOf(name),idx=n=>bones.findIndex(b=>b.name===n);
        for(const id of ['walk','run']){
            const c=Poses.clip(bones,id,body);
            for(const time of c.times){const p=Cloth.pose(bones,c,time),hip=p.P[idx('Hips')],axis=rot(p.R[idx('Hips')],[1,0,0]);
                for(const [side,sign] of [['Left',1],['Right',-1]])for(const joint of ['Leg','Foot'])
                    assert.ok(sign*dot(sub(p.P[idx(side+joint)],hip),axis)>.005,name+'/'+id+'/'+side+joint+' crosses the stride center');
            }
        }
    }
});

test('aiming, kneeling, falling and sword grips keep wrists within a natural bend and twist',()=>{
    const Cloth=load('CharacterCloth');
    for(const name of ['man','woman','long-limbed man']){
        const {bones,body}=bodyOf(name),F=Poses.handFrames(bones),idx=n=>bones.findIndex(b=>b.name===n);
        for(const id of ['fall','kneel','sword','swordThrust','bow','defend','pistolTwo','proneAim']){
            const c=Poses.clip(bones,id,body);
            for(const time of c.times){const p=Cloth.pose(bones,c,time);
                for(const side of ['Left','Right']){
                    const fore=p.R[idx(side+'ForeArm')],hand=p.R[idx(side+'Hand')],relative=mul([-fore[0],-fore[1],-fore[2],fore[3]],hand),wrist=about(relative,F[side].along);
                    assert.ok(Math.abs(wrist.angle)<=41,name+'/'+id+'/'+side+' wrist twist '+wrist.angle.toFixed(2));
                    assert.ok(wrist.off<=32.01,name+'/'+id+'/'+side+' wrist bend '+wrist.off.toFixed(2));
                }
            }
        }
    }
});

test('guarding has a quiet knee and waving faces the viewer with feet resting flat',()=>{
    const Cloth=load('CharacterCloth'),{bones,body}=bodyOf('man'),idx=n=>bones.findIndex(b=>b.name===n),F=Poses.handFrames(bones);
    const guard=Poses.clip(bones,'defend',body),first=Cloth.pose(bones,guard,0);
    for(const time of guard.times){const p=Cloth.pose(bones,guard,time);assert.ok(Math.abs(dot4(p.R[idx('LeftLeg')],first.R[idx('LeftLeg')]))>.99999);}
    const wave=Poses.clip(bones,'wave',body);let lo=Infinity,hi=-Infinity;
    for(const time of wave.times){const p=Cloth.pose(bones,wave,time),q=p.R[idx('RightHand')],palm=rot(q,F.Right.palm),along=rot(q,F.Right.along);
        assert.ok(palm[2]>.5,'palm faces the camera');lo=Math.min(lo,along[0]);hi=Math.max(hi,along[0]);
        for(const side of ['Left','Right'])assert.ok(rot(p.R[idx(side+'Foot')],[0,1,0])[1]>.999,'whole foot stays flat');
    }
    assert.ok(hi-lo>.30,'hand sweeps from side to side');
});

test('the pistol support arm and falling arms move smoothly, and kneeling forearms clear the thighs',()=>{
    const Cloth=load('CharacterCloth'),{bones,body}=bodyOf('man'),idx=n=>bones.findIndex(b=>b.name===n),s=Math.max(...bones.map(b=>b.head[1]))/1.7;
    for(const id of ['pistolTwo','fall']){
        const c=Poses.clip(bones,id,body);let previous;
        for(const time of c.times){const p=Cloth.pose(bones,c,time);
            if(previous)for(const side of (id==='pistolTwo'?['Left']:['Left','Right'])){
                const i=idx(side+'ForeArm'),angle=2*Math.acos(Math.min(1,Math.abs(dot4(previous.R[i],p.R[i]))))*DEG;
                assert.ok(angle<3,id+'/'+side+' forearm step '+angle.toFixed(2)+' degrees');
            }
            previous=p;
        }
    }
    const c=Poses.clip(bones,'kneel',body);
    for(const time of c.times){const p=Cloth.pose(bones,c,time);
        for(const side of ['Left','Right']){
            const hip=p.P[idx(side+'UpLeg')],knee=p.P[idx(side+'Leg')],axis=sub(knee,hip),elbow=p.P[idx(side+'ForeArm')],wrist=p.P[idx(side+'Hand')];
            for(const u of [0,.25,.5,.75]){
                const at=elbow.map((v,k)=>v*(1-u)+wrist[k]*u),t=Math.max(0,Math.min(1,dot(sub(at,hip),axis)/dot(axis,axis))),near=hip.map((v,k)=>v+axis[k]*t);
                assert.ok(Math.hypot(...sub(at,near))>.085*s,side+' forearm passes through the thigh');
            }
        }
    }
});
