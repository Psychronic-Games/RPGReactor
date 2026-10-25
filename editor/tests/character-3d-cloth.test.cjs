'use strict';
// Forge › 3D Character Builder, baked cloth (RRCharacterCloth): capes, robes and skirts on cloth bones of their own,
// worked out over every pose and motion. In every frame of every clip, on average and extreme bodies, the cloth stays
// out of the legs and trunk, its held edge rides its anchor, a looping clip's cloth ends where it starts, no key is
// NaN, and the bone and key budgets hold. The game only plays the keys.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'src', 'forge', 'Character3D');
const load = name => require(path.join(dir, name + '.js'));
const Body = load('HumanBody');
for (const name of ['HumanTargets', 'CharacterOutfit', 'CharacterAtlas', 'CharacterWardrobe', 'CharacterProps', 'CharacterSpecies', 'CharacterSkin', 'CharacterHair', 'CreatureBody', 'CharacterGlb', 'CharacterShading', 'CharacterDetail', 'CharacterPoses']) load(name);
const Model = load('CharacterModel');
const Poses = load('CharacterPoses');
const Cloth = load('CharacterCloth');
const Optimizer = require(path.join(root, 'src', 'utils', 'GlbOptimizer.js'));

let pack;
test.before(async () => { pack = await Body.loadPack(); });

const CAPE = { outfit: [{ id: 'tunic' }, { id: 'jeans' }, { id: 'boots' }], props: [{ id: 'cape' }] };
const ROBE = { outfit: [{ id: 'robe' }, { id: 'sash' }] };
const ROBE_CAPE = { outfit: [{ id: 'robe' }], props: [{ id: 'cape', length: 1.2 }] };
const LONG_SKIRT = { outfit: [{ id: 'peasant' }, { id: 'skirt', length: 1, flare: 0.8 }] };
const HEAVY = { gender: 1, weight: 1.6, muscle: 1, height: 1.2 };
const SLIGHT = { gender: 0, weight: 0, height: 0 };

/** The legs' and trunk's colliders. */
const BODY_COLLIDER = /^(Hips|Spine\d?|Neck|(Left|Right)(UpLeg|Leg))$/;
/** A collider is the reach of the flesh and clothes round its bone, so the skin under it can lie a little inside: deeper than this is through the body. */
const THROUGH = 0.03, DEEP = 0.01, SINK = 0.1;

/** Every vertex the cloth bones carry, by part. */
function carried(result) {
    const cloth = new Set(result.bones.map((b, i) => (b.cloth ? i : -1)).filter(i => i >= 0));
    const out = [];
    result.parts.forEach((p, pi) => {
        const ids = [];
        for (let v = 0; v < p.positions.length / 3; v++) {
            let w = 0;
            for (let k = 0; k < 4; k++) if (cloth.has(p.joints[v * 4 + k])) w += p.weights[v * 4 + k];
            if (w > 0.3) ids.push(v);
        }
        if (ids.length) out.push([pi, Int32Array.from(ids)]);
    });
    return out;
}

/**
 * Bakes every clip and checks each frame: no carried vertex deeper than THROUGH inside a leg or trunk collider
 * (where the body itself rests on the floor the cloth under it is pressed flat and is left out), hardly any deeper
 * than DEEP; the floor kept; keys finite; a looping clip's cloth closing; the pins on their anchor.
 */
function checkClips(label, recipe, quality) {
    const result = Model.build(pack, recipe, {}, { quality: 'preview' });
    assert.ok(result.cloth, label + ' hangs cloth');
    const body = result.parts.find(p => p.name === 'Body');
    const cols = result.cloth.colliders.filter(c => BODY_COLLIDER.test(c.name));
    const sets = carried(result);
    const clothBones = result.bones.map((b, i) => [b, i]).filter(([b]) => b.cloth);
    let checked = 0, deep = 0, sunk = 0, points = 0, maxSink = 0;
    for (const { id } of Poses.POSES) {
        const raw = Poses.clip(result.bones, id, body);
        if (!raw) continue;
        const clip = Cloth.bake(result, raw, { quality });
        const name = `${label} ${id}`;
        const tracks = clip.tracks.filter(t => result.bones[t.bone].cloth);
        assert.equal(tracks.length, clothBones.length, name + ': a track for every cloth bone');
        for (const t of tracks) for (const v of t.values) assert.ok(Number.isFinite(v), name + ': finite keys');
        // A loop's cloth ends where it starts.
        if (!raw.once && Cloth.loops(raw, 0.02)) for (const t of tracks) {
            const v = t.values, n = v.length / 4 - 1, d = Math.abs(v[0] * v[n * 4] + v[1] * v[n * 4 + 1] + v[2] * v[n * 4 + 2] + v[3] * v[n * 4 + 3]);
            assert.ok(d > 1 - 1e-5, `${name}: ${result.bones[t.bone].name} loops closed`);
        }
        const poses = Array.from(raw.times, t => Cloth.pose(result.bones, clip, t));
        const floor = Cloth.floors(result, raw, raw.times, poses);
        poses.forEach((ps, f) => {
            // The held edge: each chain's first bone hangs from its anchor at its rest place there.
            for (const [b, i] of clothBones) {
                if (result.bones[b.parent].cloth) continue;
                const a = b.parent, h = result.bones[a].head, off = [b.head[0] - h[0], b.head[1] - h[1], b.head[2] - h[2]];
                const q = ps.R[a], x = q[0], y = q[1], z = q[2], w = q[3];
                const ix = w * off[0] + y * off[2] - z * off[1], iy = w * off[1] + z * off[0] - x * off[2], iz = w * off[2] + x * off[1] - y * off[0], iw = -x * off[0] - y * off[1] - z * off[2];
                const want = [ps.P[a][0] + ix * w + iw * -x + iy * -z - iz * -y, ps.P[a][1] + iy * w + iw * -y + iz * -x - ix * -z, ps.P[a][2] + iz * w + iw * -z + ix * -y - iy * -x];
                assert.ok(Math.hypot(ps.P[i][0] - want[0], ps.P[i][1] - want[1], ps.P[i][2] - want[2]) < 1e-4, `${name}: ${b.name} held at frame ${f}`);
            }
            const at = Cloth.collidersAt(cols, ps), atAll = Cloth.collidersAt(result.cloth.colliders, ps);
            for (const [pi, ids] of sets) {
                const s = Cloth.skin(result.parts[pi], result.bones, ps, ids);
                for (let k = 0; k < ids.length; k++) {
                    const p = [s[k * 3], s[k * 3 + 1], s[k * 3 + 2]];
                    for (const c of p) assert.ok(Number.isFinite(c), name + ': finite cloth');
                    points++;
                    // Above the floor: a hem pooling on it may press in a little (hidden by the floor), never far, unless pressed flat
                    // under a part of the body resting on it.
                    if (p[1] < floor[f] - 0.012 && !atAll([p[0], floor[f] + 0.02, p[2]], -0.03)) {
                        sunk++; maxSink = Math.max(maxSink, floor[f] - p[1]);
                        assert.ok(p[1] > floor[f] - SINK, `${name}: cloth above the floor at frame ${f} (${p[1].toFixed(3)} under ${floor[f].toFixed(3)})`);
                    }
                    if (p[1] < floor[f] + 0.035) continue;
                    checked++;
                    const through = at(p, THROUGH);
                    assert.equal(through, null, `${name}: ${result.parts[pi].name} vertex ${ids[k]} through ${through} at frame ${f}`);
                    if (at(p, DEEP)) deep++;
                }
            }
        });
    }
    assert.ok(checked > 10000, label + ' checked ' + checked);
    assert.ok(deep / checked < 0.0005, `${label}: ${deep} of ${checked} cloth points more than ${DEEP * 100} cm into a collider`);
    assert.ok(sunk / points < 0.0005, `${label}: ${sunk} of ${points} cloth points more than 1.2 cm into the floor`);
    return result;
}

test('a cape on an average man stays out of his legs and back in every clip', () => { checkClips('man cape', Object.assign({ gender: 1 }, CAPE), 'save'); });
test('a robe on an average woman stays out of her legs in every clip', () => { checkClips('woman robe', Object.assign({ gender: 0 }, ROBE), 'save'); });
test('a long cape over a robe on a very heavy, tall, strong body', () => { checkClips('heavy robe and cape', Object.assign({}, HEAVY, ROBE_CAPE), 'save'); });
test('a long full skirt on a slight, short body', () => { checkClips('slight long skirt', Object.assign({}, SLIGHT, LONG_SKIRT), 'save'); });

test('cloth bones hang from their anchors and stay within budget; plain clothes add none', () => {
    const plain = Model.build(pack, { gender: 1, outfit: [{ id: 'tshirt' }, { id: 'jeans' }] }, {}, { quality: 'preview' });
    assert.equal(plain.cloth, null);
    assert.ok(!plain.bones.some(b => b.cloth), 'no cloth bones without loose cloth');
    const result = Model.build(pack, Object.assign({}, HEAVY, ROBE_CAPE), {}, { quality: 'preview' });
    const cloth = result.bones.filter(b => b.cloth);
    assert.ok(cloth.length > 0 && cloth.length <= Cloth.LIMITS.bones, cloth.length + ' cloth bones');
    assert.ok(result.bones.length < 256, 'joint indices fit a byte');
    const kinds = new Set(result.cloth.regions.map(g => g.kind));
    assert.ok(kinds.has('cape') && kinds.has('skirt'), 'a cape and a skirt');
    for (const b of cloth) {
        const parent = result.bones[b.parent];
        assert.ok(parent.cloth || ['Spine2', 'Hips'].includes(parent.name), b.name + ' hangs from ' + parent.name);
    }
    // Keys: at most one per cloth bone per frame at 30 a second, a still bone two.
    const raw = Poses.clip(result.bones, 'walk', result.parts.find(p => p.name === 'Body'));
    const clip = Cloth.bake(result, raw, { quality: 'preview' });
    let floats = 0;
    for (const t of clip.tracks) if (result.bones[t.bone].cloth) floats += t.values.length;
    const seconds = raw.times[raw.times.length - 1];
    assert.ok(floats <= cloth.length * 4 * (Math.ceil(seconds * Cloth.LIMITS.fps) + 1), floats + ' key values');
    // Baked once per clip, body and garment: a second ask is the same keys.
    assert.equal(Cloth.bake(result, raw, { quality: 'preview' }).tracks.find(t => t.cloth).values, clip.tracks.find(t => t.cloth).values);
});

test('a looping clip that ends in its first pose ends with its first cloth', () => {
    const result = Model.build(pack, Object.assign({ gender: 1 }, CAPE), {}, { quality: 'preview' });
    // A made-up loop: a sway that comes back to where it began.
    const steps = 31, times = Float32Array.from({ length: steps }, (_, i) => i / 30);
    const hips = new Float32Array(steps * 4);
    for (let i = 0; i < steps; i++) { const a = 0.25 * Math.sin((2 * Math.PI * i) / (steps - 1)); hips.set([0, Math.sin(a / 2), 0, Math.cos(a / 2)], i * 4); }
    const clip = Cloth.bake(result, { name: 'Sway', times, tracks: [{ bone: 0, values: hips }] }, { quality: 'save' });
    for (const t of clip.tracks) if (t.cloth) {
        const v = t.values, n = v.length / 4 - 1;
        assert.ok(Math.abs(v[0] * v[n * 4] + v[1] * v[n * 4 + 1] + v[2] * v[n * 4 + 2] + v[3] * v[n * 4 + 3]) > 1 - 1e-5, result.bones[t.bone].name);
    }
});

test('the saved GLB carries the cloth bones and their keys in every clip', async () => {
    const result = Model.build(pack, Object.assign({ gender: 0 }, ROBE_CAPE), {}, { quality: 'preview' });
    const body = result.parts.find(p => p.name === 'Body');
    result.clips = result.clips.concat(['walk', 'sit'].map(id => Object.assign(Poses.clip(result.bones, id, body), { name: id })));
    const glb = await Model.toGlb(result, 'Cloth', () => new Uint8Array(0));
    const { json } = Optimizer.parseGlb(glb);
    const clothNodes = new Set(json.nodes.map((n, i) => (/^Cloth(Cape|Skirt)\d+_\d+$/.test(n.name) ? i : -1)).filter(i => i >= 0));
    assert.equal(clothNodes.size, result.bones.filter(b => b.cloth).length);
    assert.ok(json.skins[0].joints.some(j => clothNodes.has(j)), 'cloth bones are joints');
    for (const anim of json.animations) {
        const moved = new Set(anim.channels.map(c => c.target.node));
        for (const n of clothNodes) assert.ok(moved.has(n), `${anim.name} keys ${json.nodes[n].name}`);
    }
    assert.deepEqual(json.animations.map(a => a.name), ['Idle', 'walk', 'sit']);
});

test('the builder page loads the cloth before the model', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const at = name => html.indexOf('src/forge/Character3D/' + name + '.js');
    assert.ok(at('CharacterCloth') > 0 && at('CharacterCloth') < at('CharacterModel'));
});
