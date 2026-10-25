'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const Body = require('../src/forge/Character3D/HumanBody.js');
let pack;
test.before(async () => { pack = await Body.loadPack(); });
test('fresh quality fixtures preserve species-specific heads and morphs while varying body sliders', () => {
    const Q = require('./helpers/character-quality-matrix.cjs'), fresh = require('./quality/character-fresh-quality.cjs');
    const cases = fresh.inventory();
    assert.equal(cases.length, Q.Species.SPECIES.filter(s => !s.plan).length * 16 + Q.Species.heads().length * 4 + Q.Creature.KINDS.length * 4 + 16 + 8);
    for (const species of Q.Species.SPECIES.filter(s => !s.plan)) {
        const base = Q.Model.withSpecies({}, species.id), rows = cases.filter(c => c.group === 'species' && c.entity === species.id);
        assert.equal(rows.length, 16);
        for (const row of rows) {
            assert.deepEqual(row.recipe.head, base.head, species.id + ' head');
            assert.deepEqual(row.recipe.morph, base.morph, species.id + ' morph');
            assert.deepEqual(row.recipe.features, base.features, species.id + ' features');
        }
    }
    assert.equal(new Set(cases.filter(c => c.group === 'merfolk').map(c => c.recipe.merfolk.fin)).size, Q.Merfolk.FINS.length);
    assert.equal(cases.filter(c => c.group === 'slime').length, 8);
});

test('fresh Slimefolk color, feeler, hat and material extremes retain valid geometry', async () => {
    const Q = require('./helpers/character-quality-matrix.cjs'), fresh = require('./quality/character-fresh-quality.cjs');
    for (const fixture of fresh.inventory().filter(c => c.group === 'slime')) {
        const result = Q.Model.build(pack, fixture.recipe, {}, { quality: 'preview', skinSize: 64, atlasSize: 64 });
        assert.deepEqual(Q.inspect(result, fixture, pack).issues, [], fixture.id);
    }
});
function cross(P, vertices) {
    const [a, b, c] = vertices.map(v => v * 3);
    const x = P[b] - P[a], y = P[b + 1] - P[a + 1], z = P[b + 2] - P[a + 2];
    const X = P[c] - P[a], Y = P[c + 1] - P[a + 1], Z = P[c + 2] - P[a + 2];
    return [y * Z - z * Y, z * X - x * Z, x * Y - y * X];
}
function trunkVertex(v) {
    let weight = 0;
    for (let k = 0; k < 4; k++) if (/^(Hips|Spine[12]?)$/.test(pack.bones[pack.skinJoints[v * 4 + k]].name)) weight += pack.skinWeights[v * 4 + k];
    return weight > 0.85;
}
test('narrow hips and short torso/neck preserve the trunk surface on compact lean bodies of both sexes and ages', () => {
    for (const gender of [0, 1]) for (const age of [11, 25, 90]) {
        const recipe = { gender, age, height: -0.6, weight: -1, muscle: -0.3, proportions: 1.6 };
        const before = Body.build(pack, recipe), after = Body.build(pack, { ...recipe, shapes: { hips: -3, torsoLength: -2.5, neckLength: -2.5 } });
        let checked = 0;
        for (let t = 0; t < pack.body.index.length; t += 3) {
            const ids = Array.from(pack.body.index.subarray(t, t + 3), i => pack.body.source[i]);
            if (!ids.every(trunkVertex)) continue;
            const a = cross(before.shaped, ids), b = cross(after.shaped, ids);
            if (a.reduce((sum, x) => sum + x * x, 0) < 1e-22) continue;
            checked++;
            assert.ok(a.reduce((sum, x, i) => sum + x * b[i], 0) > 0, `trunk face ${t / 3}, gender ${gender}, age ${age}`);
        }
        assert.ok(checked > 1900, 'the test covers the complete trunk');
        const span = (built, a, b) => built.bones.find(n => n.name === b).head[1] - built.bones.find(n => n.name === a).head[1];
        for (const [a, b] of [['Hips', 'Neck'], ['Neck', 'Head']]) assert.ok(span(after, a, b) > 0 && span(after, a, b) < span(before, a, b), `${a}-${b} remains positive and gets shorter`);
    }
});
test('narrow shoulders and hips retain their effect without moving skin across the spine', () => {
    for (const gender of [0, 1]) for (const height of [-0.6, 0.5, 1.8]) {
        const recipe = { gender, height, weight: -1, muscle: -0.3 };
        const before = Body.build(pack, recipe), after = Body.build(pack, { ...recipe, shapes: { shoulders: -2.5, hips: -3 } });
        let a = 0, b = 0;
        for (const v of new Set(pack.body.source)) {
            if (!trunkVertex(v) || Math.abs(before.shaped[v * 3]) < 0.005) continue;
            assert.ok(before.shaped[v * 3] * after.shaped[v * 3] > 0, 'skin retains its side of the spine');
            a += Math.abs(before.shaped[v * 3]); b += Math.abs(after.shaped[v * 3]);
        }
        assert.ok(b < a * 0.9, 'narrowing is visible rather than discarded');
    }
});
test('short torso and neck carry the skull whole and preserve unrelated long arm reach', () => {
    const recipe = { gender: 0, age: 11, height: -0.6, weight: 0, shapes: { torsoLength: -0.5, neckLength: -0.5, armLength: 2.5 } };
    const before = Body.build(pack, recipe), after = Body.build(pack, { ...recipe, shapes: { ...recipe.shapes, torsoLength: -2.5, neckLength: -2.5 } });
    const point = (built, name) => built.bones.find(b => b.name === name).head;
    const distance = (built, a, b) => Math.hypot(...point(built, a).map((x, k) => x - point(built, b)[k]));
    assert.ok(Math.abs(distance(after, 'LeftHand', 'RightHand') - distance(before, 'LeftHand', 'RightHand')) < 1e-6, 'length changes retain horizontal arm reach');
    const head = pack.bones.findIndex(b => b.name === 'Head');
    const vertices = [...new Set(pack.body.source)].filter(v => { let w = 0; for (let k = 0; k < 4; k++) if (pack.skinJoints[v * 4 + k] === head) w += pack.skinWeights[v * 4 + k]; return w > 0.999 && before.shaped[v * 3 + 1] > point(before, 'Head')[1] + 0.03; });
    const shift = before.shaped[vertices[0] * 3 + 1] - after.shaped[vertices[0] * 3 + 1];
    assert.ok(vertices.length > 500 && shift > 0.005);
    for (const v of vertices) assert.ok(Math.abs(before.shaped[v * 3 + 1] - after.shaped[v * 3 + 1] - shift) < 1e-6, 'the skull translates without flattening');
});
