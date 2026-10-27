'use strict';
// Power armor round (2026-10-25): the plates carried by different bones keep clear of each other standing and
// through walk and run (the elbow's and the knee's crease ends cut back, the arms' panels moved off the crease,
// the pauldrons and upper arms drawn in under the arm, the chest's and lames' flanks drawn in, rib housings on the
// chest they sit in, domed pauldrons over armholes cut into the chest), and the space marine's helmet is an
// assault faceplate: a glazed visor band under a heavy brow, a jaw drawn forward, swept cheek guards.
// Lengths are mm of intersection curve between plates on different bones (tests/helpers/plate-intersections.cjs),
// worst frame of six per clip ('heavy' is the space marine's power armor build before it became the sleek armored
// suit). Measured before this round on that build (male): rest 1640, walk 5265, run 9450; elbows
// 1080-1160 each in run; each shoulder 375 into the chest standing.
const test = require('node:test');
const assert = require('node:assert/strict');
const Body = require('../src/forge/Character3D/HumanBody.js');
const Wardrobe = require('../src/forge/Character3D/CharacterWardrobe.js');
const Cloth = require('../src/forge/Character3D/CharacterCloth.js');
const Poses = require('../src/forge/Character3D/CharacterPoses.js');
const Plates = require('./helpers/plate-intersections.cjs');
let pack;
test.before(async () => { pack = await Body.loadPack(); });

/** Intersection length (mm) between plates on bones a and b, or all cross-bone pairs when no pair is given. */
function pairLength(parts, positions, bones, pair) {
    if (!pair) return Plates.crossBoneLength(parts, positions);
    const [a, b] = pair.map(n => bones.findIndex(x => x.name === n));
    const pick = j => parts.map((p, i) => {
        const keep = [];
        for (let t = 0; t < p.index.length; t += 3) if (p.joints[p.index[t] * 4] === j) keep.push(p.index[t], p.index[t + 1], p.index[t + 2]);
        return { part: Object.assign({}, p, { index: Uint32Array.from(keep) }), at: positions[i] };
    });
    const both = [...pick(a), ...pick(b)];
    return Plates.crossBoneLength(both.map(x => x.part), both.map(x => x.at));
}
// The heavy power armor build (the space marine's before it took the sleek armored suit).
const HEAVY = [{ id: 'powerarmor', color: '#344e70', color2: '#ccd7dd', bulk: 1.1, trim: '#202a34' }, { id: 'powerhelm', style: 'assault' }];
const outfitOf = id => id === 'heavy' ? HEAVY : Wardrobe.PRESETS.find(p => p.id === id).items;
function measure(id, gender, pairs, parts = /^Power armor (plating|hardware)$/, byPart = false) {
    const body = Body.build(pack, Body.normalizeRecipe({ gender }));
    const wear = Wardrobe.build(pack, body, outfitOf(id), { atlasSize: 64 });
    const plates = wear.parts.filter(p => parts.test(p.name));
    // By part: each part tagged as its own 'bone' for the length (it is skinned with its real joints first).
    const tagged = byPart ? plates.map((p, i) => Object.assign({}, p, { joints: new Uint8Array(p.joints.length).fill(i) })) : plates;
    const at = { rest: plates.map(p => p.positions) }, out = {};
    const frames = { rest: [at.rest] };
    for (const name of ['walk', 'run']) {
        const clip = Poses.clip(body.bones, name, body.parts[0]);
        frames[name] = [0.15, 0.3, 0.5, 0.65, 0.8, 1].map(f => { const ps = Cloth.pose(body.bones, clip, clip.times.at(-1) * f); return plates.map(p => Cloth.skin(p, body.bones, ps)); });
    }
    for (const [key, pair, pose] of pairs) out[key] = Math.round(Math.max(...frames[pose].map(P => pairLength(tagged, P, body.bones, pair))));
    return { out, wear };
}

test('power armor plates stay clear of each other standing, walking and running', () => {
    const ceilings = {
        heavy: [[1, { rest: 260, walk: 2700, run: 2800 }], [0, { rest: 230, walk: 3250, run: 3200 }]],
        trooper: [[1, { rest: 320, walk: 3200, run: 3600 }], [0, { rest: 250, walk: 3950, run: 4300 }]]
    };
    for (const [id, rows] of Object.entries(ceilings)) for (const [gender, ceiling] of rows) {
        const { out } = measure(id, gender, Object.keys(ceiling).map(pose => [pose, null, pose]));
        for (const pose of Object.keys(ceiling)) assert.ok(out[pose] <= ceiling[pose], `${id}/${gender} ${pose}: ${out[pose]} mm > ${ceiling[pose]} mm`);
    }
});

test('elbows and knees fold past each other in a run; shoulders sit clear of the chest standing', () => {
    for (const gender of [1, 0]) {
        const { out } = measure('heavy', gender, [
            ['elbowL', ['LeftArm', 'LeftForeArm'], 'run'], ['elbowR', ['RightArm', 'RightForeArm'], 'run'],
            ['kneeL', ['LeftUpLeg', 'LeftLeg'], 'run'], ['kneeR', ['RightUpLeg', 'RightLeg'], 'run'],
            ['shoulderL', ['LeftArm', 'Spine2'], 'rest'], ['shoulderR', ['RightArm', 'Spine2'], 'rest'],
            ['thighs', ['LeftUpLeg', 'RightUpLeg'], 'rest'], ['ribs', ['Spine1', 'Spine2'], 'rest']
        ]);
        for (const k of ['elbowL', 'elbowR']) assert.ok(out[k] <= 320, `${gender} ${k} ${out[k]} mm`);
        for (const k of ['kneeL', 'kneeR']) assert.ok(out[k] <= 280, `${gender} ${k} ${out[k]} mm`);
        for (const k of ['shoulderL', 'shoulderR']) assert.ok(out[k] <= 260, `${gender} ${k} ${out[k]} mm`);
        assert.ok(out.thighs <= 40, `${gender} thighs ${out.thighs} mm`);
        assert.ok(out.ribs <= 40, `${gender} rib housings ${out.ribs} mm`);
    }
});

test('the space marine\'s shin plates sit clear of its boots, standing, walking and running', () => {
    for (const gender of [1, 0]) {
        const { out } = measure('marine', gender, [['rest', null, 'rest'], ['walk', null, 'walk'], ['run', null, 'run']], /^(Cyber leg armor plates|Mag-sole shoes)$/, true);
        for (const pose of ['rest', 'walk', 'run']) assert.ok(out[pose] <= 15, `${gender} ${pose}: shin plates cut ${out[pose]} mm into the boots`);
    }
});

test('the space marine wears an assault faceplate: a wraparound glazed visor under a brow, a shape of its own', () => {
    const item = Wardrobe.PRESETS.find(p => p.id === 'marine').items.find(i => i.id === 'powerhelm');
    assert.equal(item.style, 'assault');
    const { wear } = measure('marine', 1, []), trooper = measure('trooper', 1, []).wear;
    const glass = wear.parts.find(p => p.name === 'Power helmet lenses');
    assert.ok(glass && glass.index.length / 3 >= 200, 'a lofted visor band, not two small lenses');
    assert.ok(glass.emissive && glass.emissiveIntensity > 0 && glass.emissiveIntensity < 0.3, 'a faint glow behind the glass');
    assert.ok(glass.roughness <= 0.08, 'glossy glass');
    const box = part => { const b = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }; for (let i = 0; i < part.positions.length; i += 3) for (let k = 0; k < 3; k++) { b.lo[k] = Math.min(b.lo[k], part.positions[i + k]); b.hi[k] = Math.max(b.hi[k], part.positions[i + k]); } return b; };
    const g = box(glass);
    assert.ok(g.hi[0] - g.lo[0] > 0.12 && g.hi[1] - g.lo[1] > 0.008 && g.hi[1] - g.lo[1] < 0.05, `visor ${(g.hi[0] - g.lo[0]).toFixed(3)} x ${(g.hi[1] - g.lo[1]).toFixed(3)} m`);
    // The marine's visor wraps further round than the trooper's, and the two shells differ in shape.
    const tg = box(trooper.parts.find(p => p.name === 'Power helmet lenses'));
    assert.ok(g.hi[0] - g.lo[0] > tg.hi[0] - tg.lo[0] + 0.008, `marine visor ${(g.hi[0] - g.lo[0]).toFixed(3)} vs trooper ${(tg.hi[0] - tg.lo[0]).toFixed(3)} m wide`);
    const m = wear.parts.find(p => p.name === 'Power helmet plating'), t = trooper.parts.find(p => p.name === 'Power helmet plating');
    assert.notEqual(m.index.length, t.index.length);
});
