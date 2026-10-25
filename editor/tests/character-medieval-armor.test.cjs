'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Body = require('../src/forge/Character3D/HumanBody.js');
const Wardrobe = require('../src/forge/Character3D/CharacterWardrobe.js');
const Armor = require('../src/forge/Character3D/CharacterPowerArmor.js');
const Cloth = require('../src/forge/Character3D/CharacterCloth.js');
const Poses = require('../src/forge/Character3D/CharacterPoses.js');
const { inspect, surfaceHit, FRESH_PROFILES } = require('./quality/character-outfit-accessory-quality.cjs');
let pack;
test.before(async () => { pack = await Body.loadPack(); });

for (const preset of ['knight', 'darkknight', 'paladin', 'gladiator']) {
    test(preset + ' uses formed plate with valid geometry across contrasting body shapes', () => {
        for (const patch of [{ gender: 0 }, { gender: 1 }, ...FRESH_PROFILES.map(p => p.patch)]) {
            const body = Body.build(pack, Body.normalizeRecipe(patch));
            const wear = Wardrobe.build(pack, body, Wardrobe.PRESETS.find(p => p.id === preset).items, { atlasSize: 64 });
            const textures = Object.fromEntries([wear.texture, ...wear.textures].filter(Boolean).map(t => [t.name, t]));
            const checked = inspect(wear.parts, body, textures);
            assert.deepEqual(checked.issues, [], preset + ': ' + JSON.stringify(patch));
            const plates = wear.parts.filter(p => /^Medieval /.test(p.name));
            assert.ok(plates.length >= 2, 'the preset contains formed plates');
            for (const p of plates) for (let v = 0; v < p.positions.length / 3; v++) {
                assert.equal(p.weights[v * 4], 1, 'a metal sheet follows one articulation');
                assert.equal(p.weights[v * 4 + 1] + p.weights[v * 4 + 2] + p.weights[v * 4 + 3], 0);
            }
        }
    });
}

test('the breastplate covers the underlying mail at the chest instead of exposing it through the plate', () => {
    for (const gender of [0, 1]) {
        const body = Body.build(pack, Body.normalizeRecipe({ gender }));
        const mail = Wardrobe.build(pack, body, [{ id: 'chainmail', length: .26 }], { atlasSize: 64 });
        const plate = Armor.medieval(pack, body, Wardrobe.normalizeItem({ id: 'breastplate' }), 'breastplate');
        const worn = Wardrobe.build(pack, body, [{ id: 'chainmail', length: .26 }, { id: 'breastplate' }], { atlasSize: 64 });
        const metal = worn.parts.filter(p => /^Medieval breastplate/.test(p.name));
        const low = body.bones.find(b => b.name === 'Spine1').head[1] + .11 * body.height / 1.7;
        const high = body.bones.find(b => b.name === 'Neck').head[1] - .13 * body.height / 1.7;
        let checked = 0;
        for (const p of mail.parts) for (let v = 0; v < p.positions.length; v += 3) {
            const point = Array.from(p.positions.subarray(v, v + 3));
            if (point[1] <= low || point[1] >= high || Math.abs(point[0]) > .08 * body.height / 1.7) continue;
            const direction = [0, 0, p.normals[v + 2] >= 0 ? 1 : -1];
            assert.ok(surfaceHit(metal, point, direction), 'mail must stay inside the formed cuirass: ' + point);
            checked++;
        }
        assert.ok(checked >= 30, 'checks actual front/back mail samples');
        assert.ok(plate.parts.length, 'the same breastplate also works as a standalone garment');
    }
});

test('thigh and shin sheets retain their dimensions through walking and kneeling', () => {
    const body = Body.build(pack, Body.normalizeRecipe({ gender: 1 }));
    const plate = Armor.medieval(pack, body, Wardrobe.normalizeItem({ id: 'greaves' }), 'greaves').parts[0];
    const samples = [];
    for (let i = 0; i < plate.index.length; i += 45) {
        const a = plate.index[i], b = plate.index[i + 1];
        const distance = P => Math.hypot(...[0, 1, 2].map(k => P[a * 3 + k] - P[b * 3 + k]));
        samples.push({ distance, expected: distance(plate.positions) });
    }
    for (const pose of ['walk', 'kneel']) {
        const clip = Poses.clip(body.bones, pose, body.parts[0]);
        assert.ok(clip);
        for (const t of [0, clip.times.at(-1) * .25, clip.times.at(-1) * .6]) {
            const skinned = Cloth.skin(plate, body.bones, Cloth.pose(body.bones, clip, t));
            for (const sample of samples) assert.ok(Math.abs(sample.distance(skinned) - sample.expected) < 1e-5, 'plate edges cannot stretch like clothing');
        }
    }
});

test('the shin ends at the ankle without fitting its lower rim over the toes', () => {
    const body = Body.build(pack, Body.normalizeRecipe({ gender: 1 }));
    const plate = Armor.medieval(pack, body, Wardrobe.normalizeItem({ id: 'greaves' }), 'greaves').parts[0];
    const leg = body.bones.findIndex(b => b.name === 'LeftLeg'), ankle = body.bones.find(b => b.name === 'LeftFoot').head;
    const depths = [];
    for (let v = 0; v < plate.positions.length / 3; v++) {
        if (plate.joints[v * 4] === leg && plate.positions[v * 3 + 1] < ankle[1] + .035) depths.push(plate.positions[v * 3 + 2] - ankle[2]);
    }
    assert.ok(depths.length >= 20, 'checks the complete lower shin ring');
    assert.ok(Math.max(...depths) < .105, 'the greave must not flare over the forefoot');
});
