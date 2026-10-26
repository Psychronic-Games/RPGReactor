'use strict';
// The whole-character sweep: every outfit preset and every accessory built on an average and two extreme bodies,
// each checked sound. Alone it took 18 minutes of one core (most of an hour on a CI runner), and a file's tests run
// one after another, so it is dealt across character-3d-model-presets-1..N.test.cjs, which run side by side.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const dir = path.join(__dirname, '..', '..', 'src', 'forge', 'Character3D');
const load = name => require(path.join(dir, name + '.js'));

/** Every part well formed: finite numbers, skin indices in range, weights summing to one. */
function assertSound(result, label) {
    assert.ok(result.parts.length > 0, label + ' has parts');
    for (const p of result.parts) {
        const n = p.positions.length / 3;
        assert.ok(n > 0 && p.index.length > 0, `${label}: ${p.name} has geometry`);
        for (let i = 0; i < p.positions.length; i++) assert.ok(Number.isFinite(p.positions[i]), `${label}: ${p.name} position ${i}`);
        for (let i = 0; i < p.index.length; i++) assert.ok(p.index[i] < n, `${label}: ${p.name} index ${i}`);
        assert.equal(p.joints.length, n * 4, `${label}: ${p.name} joints`);
        for (let v = 0; v < n; v++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) { assert.ok(p.joints[v * 4 + k] < result.bones.length, `${label}: ${p.name} joint`); sum += p.weights[v * 4 + k]; }
            assert.ok(Math.abs(sum - 1) < 0.02, `${label}: ${p.name} weights at ${v} sum to ${sum}`);
        }
        // Tiled finish maps (repeat) take physical coordinates past 0..1; a part with a picture of its own stays inside it.
        const maps = [p.texture, p.normalTexture, p.metallicRoughnessTexture, p.emissiveTexture, p.iridescenceThicknessTexture].filter(Boolean);
        const tiled = maps.length > 0 && maps.every(name => result.textures && result.textures[name] && result.textures[name].repeat);
        if (p.uvs && !tiled) for (let i = 0; i < p.uvs.length; i++) assert.ok(p.uvs[i] >= -1e-6 && p.uvs[i] <= 1 + 1e-6, `${label}: ${p.name} uv in the picture`);
    }
}

/**
 * Part `part` of `parts` (1-based): every parts-th preset from the part-th, on each body; the last part also builds
 * every accessory at once. Each body keeps one cache through its presets, as a session in the builder does.
 */
function presetSweep(part, parts) {
    const Body = load('HumanBody');
    for (const name of ['HumanTargets', 'CharacterOutfit', 'CharacterAtlas', 'CharacterWardrobe', 'CharacterProps', 'CharacterSpecies', 'CharacterSkin', 'CharacterHair', 'CreatureBody', 'CharacterGlb', 'CharacterShading', 'CharacterDetail']) load(name);
    const Model = load('CharacterModel');
    const Wardrobe = load('CharacterWardrobe');
    const Props = load('CharacterProps');
    let pack;
    test.before(async () => { pack = await Body.loadPack(); });
    test(`every outfit preset${part === parts ? ' and every accessory' : ''} builds on an average and an extreme body (part ${part} of ${parts})`, () => {
        const presets = Wardrobe.PRESETS.filter((preset, i) => i % parts === part - 1);
        assert.ok(presets.length > 0, 'this part has presets');
        const bodies = [{}, { gender: 1, weight: 3, muscle: 2.2, headSize: 1.6 }, { gender: 0, weight: -0.3, height: -0.5, cup: 4 }];
        for (const body of bodies) {
            const cache = {};
            for (const preset of presets) assertSound(Model.build(pack, Object.assign({}, body, { outfit: preset.items }), cache, { quality: 'preview' }), preset.id + ' on ' + JSON.stringify(body));
            if (part === parts) assertSound(Model.build(pack, Object.assign({}, body, { props: Props.PROPS.map(p => ({ id: p.id })) }), cache, { quality: 'preview' }), 'accessories on ' + JSON.stringify(body));
        }
    });
}

module.exports = { assertSound, presetSweep };
