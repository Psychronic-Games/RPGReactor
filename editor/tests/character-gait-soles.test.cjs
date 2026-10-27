'use strict';
// Forge › 3D Character Builder, walking and running: the soles face the floor across, never toward each other, and
// the swinging leg comes through straight under its hip, its knee ahead, as the capture has it.
// The motion capture's feet carry a sideways roll (their "up" leans out 12-15 degrees standing, 25-50 through a
// walk or run); the motion library (levelSoles) levels each sole about its heel-to-toe line (the ankle within its reach, the
// rest from the thigh turning), in runtime/reactor_3d_motions.js, so the builder and the game's own humanoids
// share it. Checked on the bones of several bodies, on the skinned soles of boots and the
// EVA crew suit's mag boots while planted, and on the clips a saved character carries.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'src', 'forge', 'Character3D');
const load = name => require(path.join(dir, name + '.js'));
const Body = load('HumanBody');
const Model = load('CharacterModel');
const Wardrobe = load('CharacterWardrobe');
const Poses = load('CharacterPoses');

let pack;
test.before(async () => { pack = await Body.loadPack(); Poses.load(); });

const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qrot = (q, v) => { const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2]; return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x]; };
const EVA = () => Wardrobe.PRESETS.find(p => p.id === 'evaCrew').items;
const BODIES = {
    male: { gender: 1, age: 30 },
    female: { gender: 0, age: 28 },
    extreme: { gender: 1, age: 35, weight: 1, muscle: 1, height: 0.05, proportions: 1.6 },
    slight: { gender: 0, age: 16, weight: 0, muscle: 0, height: 1 }
};
const MOVES = ['walk', 'run', 'crouchWalk'];
/** The most a sole may face toward the other foot or away (degrees) while the foot points ahead. */
const MOST = 6;
/**
 * ...and while the heel lifts or the foot swings: the ankle alone levels it there, within its reach, so the swinging
 * leg keeps its path (a thigh turned to finish the job kicked the foot out); a run's kicked-up heel, 50 degrees in
 * from the capture, comes to about 19.
 */
const ROLLING = 20;

/** The slope across (degrees) of points' heights fitted as a plane over the floor, `s` the hips' left-right line. */
function acrossSlope(pts, s) {
    const u = pts.map(p => p[0] * s[0] + p[2] * s[2]), v = pts.map(p => p[2] * s[0] - p[0] * s[2]), n = pts.length;
    const mu = u.reduce((a, b) => a + b, 0) / n, mv = v.reduce((a, b) => a + b, 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
    let uu = 0, vv = 0, uv = 0, uy = 0, vy = 0;
    pts.forEach((p, i) => { const a = u[i] - mu, b = v[i] - mv, y = p[1] - my; uu += a * a; vv += b * b; uv += a * b; uy += a * y; vy += b * y; });
    const det = uu * vv - uv * uv;
    return Math.atan((uy * vv - vy * uv) / det) * 180 / Math.PI;
}

/** Each frame's bone world turns and joint places, hips at rest. */
function posed(bones, clip) {
    const local = new Map(clip.tracks.filter(t => !t.path).map(t => [t.bone, t.values]));
    return Array.from(clip.times, (_, f) => {
        const W = [];
        bones.forEach((b, i) => { const v = local.get(i), q = v ? Array.from(v.slice(f * 4, f * 4 + 4)) : [0, 0, 0, 1]; W[i] = b.parent >= 0 ? qmul(W[b.parent], q) : q; });
        const pos = [];
        bones.forEach((b, i) => {
            if (b.parent < 0) pos[i] = b.head.slice();
            else { const p = b.parent, r = qrot(W[p], [0, 1, 2].map(k => b.head[k] - bones[p].head[k])); pos[i] = [0, 1, 2].map(k => pos[p][k] + r[k]); }
        });
        return { W, pos };
    });
}

test('walk, run and crouched walk keep both soles level across on every body', () => {
    for (const [label, recipe] of Object.entries(BODIES)) {
        const r = Model.build(pack, recipe, {}, { quality: 'preview' }), skin = r.parts.find(p => p.name === 'Body');
        for (const id of MOVES) {
            const clip = Poses.clip(r.bones, id, skin);
            assert.ok(clip, `${label} ${id} plays`);
            const rolls = Poses.soleRolls(r.bones, clip);
            for (const S of ['Left', 'Right']) rolls[S].forEach((x, f) => {
                // Flat or nearly (pitch under 0.3: planted, striking or settling), within MOST; rolling off the toes or
                // swinging, the ankle may run out of reach before the sole is quite level (a heel lifting: up to 15).
                if (x.across < 0.6) assert.ok(Math.abs(x.roll) <= (x.pitch < 0.3 ? MOST : ROLLING), `${label} ${id} frame ${f}: the ${S} sole faces ${x.roll.toFixed(1)} degrees ${x.roll > 0 ? 'toward the other foot' : 'out'}`);
            });
        }
    }
});

test('the capture itself turns the soles in, so the check above has something to catch', () => {
    const r = Model.build(pack, BODIES.male, {}, { quality: 'preview' }), skin = r.parts.find(p => p.name === 'Body');
    const raw = Poses.clip(r.bones, 'walk', skin, { rawFeet: true });
    const rolls = Poses.soleRolls(r.bones, raw);
    const mean = rolls.Left.concat(rolls.Right).reduce((s, x) => s + x.roll, 0) / (rolls.Left.length + rolls.Right.length);
    assert.ok(mean > 12, `the raw walk's soles face in ${mean.toFixed(1)} degrees on average`);
});

test('the ankle stays within its reach and the thigh within its roll while the soles level', () => {
    const r = Model.build(pack, BODIES.female, {}, { quality: 'preview' }), skin = r.parts.find(p => p.name === 'Body');
    const logZ = q => { const w = q[3] < 0 ? -1 : 1, c = Math.min(1, q[3] * w), a = 2 * Math.acos(c), k = a > 1e-6 ? a / Math.sin(a / 2) : 2; return q[2] * w * k * 180 / Math.PI; };
    for (const id of ['walk', 'run']) {
        const clip = Poses.clip(r.bones, id, skin);
        for (const S of ['Left', 'Right']) {
            const foot = r.bones.findIndex(b => b.name === S + 'Foot'), t = clip.tracks.find(x => !x.path && x.bone === foot);
            for (let f = 0; f < clip.times.length; f++) assert.ok(Math.abs(logZ(Array.from(t.values.slice(f * 4, f * 4 + 4)))) <= 25, `${id} frame ${f}: the ${S} ankle tilts past its reach`);
        }
    }
});

test('planted, the skinned soles of boots and the EVA crew suit lie flat across', () => {
    const outfits = { boots: [{ id: 'boots', color: '#4a3020', length: 0.35 }], eva: EVA() };
    for (const [label, outfit] of Object.entries(outfits)) for (const gender of [1, 0]) {
        const r = Model.build(pack, { gender, age: 30, outfit }, {}, { quality: 'preview' }), skin = r.parts.find(p => p.name === 'Body');
        const shoe = r.parts.find(p => /boots/i.test(p.name) && p.joints && p.weights);
        assert.ok(shoe, `${label} has boots`);
        let lowest = Infinity;
        for (let v = 1; v < shoe.positions.length; v += 3) lowest = Math.min(lowest, shoe.positions[v]);
        for (const id of ['walk', 'run']) {
            const clip = Poses.clip(r.bones, id, skin), frames = posed(r.bones, clip), rolls = Poses.soleRolls(r.bones, clip);
            let checked = 0;
            for (const [S, side] of [['Left', 1], ['Right', -1]]) {
                // The tread: the boot's vertices within 8 mm of its lowest, on this foot's side.
                const tread = [];
                for (let v = 0; v < shoe.positions.length / 3; v++) if (shoe.positions[v * 3 + 1] < lowest + 0.008 && shoe.positions[v * 3] * side > 0.02) tread.push(v);
                assert.ok(tread.length > 12, `${label} ${S} tread found`);
                frames.forEach(({ W, pos }, f) => {
                    const x = rolls[S][f];
                    if (x.pitch > 0.12 || x.across > 0.5) return; // planted flat, toes ahead
                    const pts = tread.map(v => {
                        const out = [0, 0, 0];
                        for (let k = 0; k < 4; k++) {
                            const j = shoe.joints[v * 4 + k], w = shoe.weights[v * 4 + k];
                            if (!w) continue;
                            const b = r.bones[j], p = qrot(W[j], [0, 1, 2].map(c => shoe.positions[v * 3 + c] - b.head[c]));
                            for (let c = 0; c < 3; c++) out[c] += w * (pos[j][c] + p[c]);
                        }
                        return out;
                    });
                    // The tread's height against its place across and along the hips (least squares): its slope across.
                    const s = qrot(W[r.bones.findIndex(b => b.parent < 0)], [1, 0, 0]), slope = acrossSlope(pts, s);
                    assert.ok(Math.abs(slope) <= 8, `${label} ${gender ? 'male' : 'female'} ${id} frame ${f}: the ${S} tread tilts ${slope.toFixed(1)} degrees across`);
                    checked++;
                });
            }
            assert.ok(checked >= 2, `${label} ${id}: planted frames found (${checked})`);
        }
    }
});

test('a saved character carries the levelled feet in its walk and run', () => {
    const r = Model.build(pack, { gender: 1, age: 30, outfit: EVA() }, {}, { quality: 'preview' }), skin = r.parts.find(p => p.name === 'Body');
    const clips = Poses.gameClips(r.bones, skin, 'useful');
    for (const name of ['Walk', 'Run']) {
        const game = clips.find(c => c.name === name);
        assert.ok(game, name + ' saved');
        // Sampled on the clip's frames: every turn track keyed every frame or held, read at its own keys.
        const times = game.times, sample = t => {
            const at = t.times || times, d = t.path ? 3 : 4, out = new Float32Array(times.length * d);
            times.forEach((time, f) => {
                let i = 0;
                while (i + 1 < at.length && at[i + 1] <= time + 1e-6) i++;
                const j = Math.min(at.length - 1, i + 1), u = at[j] > at[i] ? Math.max(0, Math.min(1, (time - at[i]) / (at[j] - at[i]))) : 0;
                const a = t.values.subarray(i * d, i * d + d), b = t.values.subarray(j * d, j * d + d), s = d === 4 && a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
                const v = Array.from(a, (x, k) => x + (b[k] * s - x) * u), l = d === 4 ? Math.hypot(...v) : 1;
                out.set(v.map(x => x / l), f * d);
            });
            return { bone: t.bone, path: t.path, values: out };
        };
        const tracks = game.tracks.filter(t => !t.path).map(sample);
        const rolls = Poses.soleRolls(r.bones, { times, tracks });
        for (const S of ['Left', 'Right']) rolls[S].forEach((x, f) => { if (x.across < 0.6) assert.ok(Math.abs(x.roll) <= (x.pitch < 0.3 ? MOST : ROLLING) + 2, `saved ${name} frame ${f}: the ${S} sole faces ${x.roll.toFixed(1)} degrees`); });
        const hips = game.tracks.find(t => t.path === 'translation');
        assert.ok(hips && hips.values.every(Number.isFinite), `saved ${name} keeps the hips' height`);
    }
});

test('resting, a foot standing on the floor faces it: sitting and the kneel\'s front foot; a foot in the air is left', () => {
    const r = Model.build(pack, BODIES.male, {}, { quality: 'preview' }), skin = r.parts.find(p => p.name === 'Body');
    for (const id of ['sit', 'kneel']) {
        const clip = Poses.clip(r.bones, id, skin), raw = Poses.clip(r.bones, id, skin, { rawFeet: true });
        const level = Poses.soleRolls(r.bones, clip), was = Poses.soleRolls(r.bones, raw);
        for (const S of ['Left', 'Right']) level[S].forEach((x, f) => {
            // A sole facing the floor (within 35 degrees of straight down) is flat across it; one on its toes keeps the capture's.
            if (x.down < 35) assert.ok(Math.abs(x.roll) <= MOST, `${id} frame ${f}: the ${S} sole on the floor faces ${x.roll.toFixed(1)} degrees`);
            else if (was[S][f].down > 60) assert.ok(Math.abs(x.roll - was[S][f].roll) < 0.5, `${id} frame ${f}: the ${S} foot off the floor is turned`);
        });
    }
    // Sitting, both soles were turned about 40 degrees in.
    const sit = Poses.soleRolls(r.bones, Poses.clip(r.bones, 'sit', skin, { rawFeet: true }));
    assert.ok(Math.abs(sit.Left[0].roll) > 30, 'the raw sit turns the soles in');
});

test('a game humanoid without clips of its own walks and runs on level soles (stateClip)', () => {
    const r = Model.build(pack, BODIES.female, {}, { quality: 'preview' });
    for (const id of ['walk', 'run']) {
        const clip = Poses.stateClip(r.bones, id);
        assert.ok(clip, id + ' plays');
        const rolls = Poses.soleRolls(r.bones, clip);
        for (const S of ['Left', 'Right']) rolls[S].forEach((x, f) => { if (x.across < 0.6) assert.ok(Math.abs(x.roll) <= (x.pitch < 0.3 ? MOST : ROLLING), `game ${id} frame ${f}: the ${S} sole faces ${x.roll.toFixed(1)} degrees`); });
    }
});

test('levelling keeps the stride: the same thigh turns, the swinging foot under its hip, the knee ahead', () => {
    const DEG = 180 / Math.PI;
    for (const [label, recipe] of Object.entries({ male: BODIES.male, female: BODIES.female, extreme: BODIES.extreme })) {
        const r = Model.build(pack, recipe, {}, { quality: 'preview' }), skin = r.parts.find(p => p.name === 'Body'), bones = r.bones, at = n => bones.findIndex(b => b.name === n);
        for (const id of ['walk', 'run']) {
            const clip = Poses.clip(bones, id, skin), raw = Poses.clip(bones, id, skin, { rawFeet: true }), frames = posed(bones, clip), hips = at('Hips');
            for (const [S, side] of [['Left', 1], ['Right', -1]]) {
                const thigh = at(S + 'UpLeg'), foot = at(S + 'Foot');
                // The thighs and knees turn exactly as without levelling: the sole is the ankle's work alone.
                for (const bone of [thigh, at(S + 'Leg')]) {
                    const a = clip.tracks.find(t => !t.path && t.bone === bone).values, b = raw.tracks.find(t => !t.path && t.bone === bone).values;
                    for (let f = 0; f < clip.times.length; f++) {
                        const d = Math.abs(a[f * 4] * b[f * 4] + a[f * 4 + 1] * b[f * 4 + 1] + a[f * 4 + 2] * b[f * 4 + 2] + a[f * 4 + 3] * b[f * 4 + 3]);
                        assert.ok(2 * Math.acos(Math.min(1, d)) * DEG < 0.5, `${label} ${id} frame ${f}: levelling turns the ${bones[bone].name}`);
                    }
                }
                const lowest = Math.min(...frames.map(p => p.pos[foot][1]));
                frames.forEach(({ W, pos }, f) => {
                    if (pos[foot][1] - lowest < 0.05) return; // planted
                    // Swinging: the ankle travels forward close under its hip, never kicked out past 10 cm or
                    // across the body's middle (the capture walks 3 to 12 cm inside the hip, a run's heel 8 cm out at most).
                    const x = qrot(W[hips], [1, 0, 0]), s = [x[0], 0, x[2]].map(v => v / Math.hypot(x[0], x[2]));
                    const out = ((pos[foot][0] - pos[thigh][0]) * s[0] + (pos[foot][2] - pos[thigh][2]) * s[2]) * side;
                    assert.ok(out < 0.1 && out > -0.16, `${label} ${id} frame ${f}: the swinging ${S} foot is ${(out * 100).toFixed(0)} cm out from its hip`);
                    // The knee points ahead: the thigh's front within 40 degrees of the hips' facing, turned out at most that
                    // (the capture's run carries its knee 35 out at the top of the kick), in at most 12.
                    const k = qrot(W[thigh], [0, 0, 1]), fr = qrot(W[hips], [0, 0, 1]), h = Math.atan2(k[0], k[2]) - Math.atan2(fr[0], fr[2]);
                    const knee = Math.atan2(Math.sin(h), Math.cos(h)) * DEG * side;
                    assert.ok(knee < 40 && knee > -12, `${label} ${id} frame ${f}: the swinging ${S} knee points ${knee.toFixed(0)} degrees out`);
                });
            }
        }
    }
});
