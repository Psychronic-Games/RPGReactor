'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Body = require('../src/forge/Character3D/HumanBody.js');
const Outfit = require('../src/forge/Character3D/CharacterOutfit.js');
const Wardrobe = require('../src/forge/Character3D/CharacterWardrobe.js');
const { FRESH_PROFILES, inspect } = require('./quality/character-outfit-accessory-quality.cjs');
let pack;
test.before(async () => { pack = await Body.loadPack(); });
const items = () => Wardrobe.PRESETS.find(p => p.id === 'bikini').items;

// Orthographic skin intersection, independent of the production strap attachment/ray code.
function frontSurface(part, x, y) {
    let top = -Infinity;
    const P = part.positions;
    for (let i = 0; i < part.index.length; i += 3) {
        const [a, b, c] = [0, 1, 2].map(k => part.index[i + k] * 3);
        const det = (P[b + 1] - P[c + 1]) * (P[a] - P[c]) + (P[c] - P[b]) * (P[a + 1] - P[c + 1]);
        if (Math.abs(det) < 1e-12) continue;
        const u = ((P[b + 1] - P[c + 1]) * (x - P[c]) + (P[c] - P[b]) * (y - P[c + 1])) / det;
        const v = ((P[c + 1] - P[a + 1]) * (x - P[c]) + (P[a] - P[c]) * (y - P[c + 1])) / det;
        if (u < 0 || v < 0 || u + v > 1) continue;
        top = Math.max(top, u * P[a + 2] + v * P[b + 2] + (1 - u - v) * P[c + 2]);
    }
    return top;
}

test('triangle swimwear leaves the center chest, back and upper belly open while covering its detail anchors', () => {
    const body = Body.build(pack, Body.normalizeRecipe({ gender: 0 }));
    const wear = Wardrobe.build(pack, body, items(), { atlasSize: 64 });
    const an = Outfit.anatomy(pack), fields = Body.anatomyFields(pack), counts = { chest: 0, back: 0, belly: 0 };
    for (const v of new Set(pack.body.source)) {
        const [x, y, z] = an.rest.subarray(v * 3, v * 3 + 3);
        let region;
        if (Math.abs(x) < .016 && y > 1.19 && y < 1.28 && z > .07) region = 'chest';
        if (Math.abs(x) < .12 && y > 1.21 && y < 1.33 && z < -.025) region = 'back';
        if (Math.abs(x) < .08 && y > .95 && y < .97 && z > .05) region = 'belly';
        if (!region) continue;
        counts[region]++;
        assert.ok(!wear.hidden.has(v), region + ' remains open instead of using the bandeau/high-rise cut');
    }
    for (const [name, count] of Object.entries(counts)) assert.ok(count > 5, name + ' actually sampled');
    assert.ok(wear.hidden.has(fields.low));
    for (const nipple of fields.nipples) assert.ok(wear.hidden.has(nipple.v));
    assert.equal(wear.parts.filter(p => /ties$/.test(p.name)).length, 2, 'both separates have actual cord geometry');
});

test('triangle cups have actual fabric over their detail anchors and adjacent skin on extreme bodies', () => {
    const fields = Body.anatomyFields(pack);
    for (const patch of [
        { gender: 0 },
        { gender: 0, extreme: true, weight: 4, cup: 2 },
        { gender: 0, extreme: true, weight: -1, height: -.6, cup: 6 },
        { gender: 1, extreme: true, weight: 4, muscle: 2 }
    ]) {
        const body = Body.build(pack, Body.normalizeRecipe(patch));
        const wear = Wardrobe.build(pack, body, [{ id: 'bikiniTop' }], { atlasSize: 64 });
        const cups = wear.parts.filter(part => !/ties$/.test(part.name));
        const control = Wardrobe.build(pack, body, [{ id: 'bikiniBottom' }], { atlasSize: 64 });
        assert.ok(cups.length && control.parts.length, 'the cup and bottom-only control both contain real fabric');
        let checked = 0;
        for (const anchor of fields.nipples) {
            const [ax, ay] = body.shaped.subarray(anchor.v * 3, anchor.v * 3 + 3);
            for (const [dx, dy] of [[0, 0], [-.003, 0], [.003, 0], [0, -.003], [0, .003]]) {
                const x = ax + dx, y = ay + dy, skin = frontSurface(body.parts[0], x, y);
                assert.ok(Number.isFinite(skin), 'the probe samples actual adjacent skin');
                const fabric = Math.max(...cups.map(part => frontSurface(part, x, y)));
                assert.ok(fabric >= skin - .004 && fabric < skin + .1,
                    'cup fabric covers its intended interior on ' + JSON.stringify(patch));
                assert.equal(Math.max(...control.parts.map(part => frontSurface(part, x, y))), -Infinity,
                    'the same probe detects missing cups on the bottom-only control');
                checked++;
            }
        }
        assert.equal(checked, 10, 'both cup interiors are checked independently of the hidden-skin mask');
    }
});

test('thin halter cords stay in front of collarbone skin instead of jumping to the back surface', () => {
    const body = Body.build(pack, Body.normalizeRecipe({ gender: 0 }));
    const cords = Outfit.swimStraps(pack, body, 'top');
    const parent = Array.from({ length: cords.positions.length / 3 }, (_, i) => i);
    const root = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    for (let i = 0; i < cords.index.length; i += 3) for (let k = 1; k < 3; k++) parent[root(cords.index[i + k])] = root(cords.index[i]);
    const components = new Map();
    for (let v = 0; v < parent.length; v++) { const id = root(v); if (!components.has(id)) components.set(id, []); components.get(id).push(v); }
    const halters = [...components.values()].filter(ids => {
        const ys = ids.map(v => cords.positions[v * 3 + 1]), xs = ids.map(v => cords.positions[v * 3]);
        return Math.max(...ys) - Math.min(...ys) > .08 && Math.max(...xs) - Math.min(...xs) < .10;
    });
    assert.equal(halters.length, 2, 'two continuous, narrow cup-to-neck halters');
    let checked = 0;
    for (const v of halters.flat()) {
        const [x, y, z] = cords.positions.subarray(v * 3, v * 3 + 3);
        if (cords.normals[v * 3 + 2] < .3) continue;
        const skin = frontSurface(body.parts[0], x, y);
        assert.ok(z >= skin - .0005, 'the halter cannot be buried under the clavicle: ' + [x, y, z, skin]);
        checked++;
    }
    assert.ok(checked > 30, 'both halters have samples across the collarbone transition');
});

test('bikini pieces and real ties remain finite and weighted through contrasting body builds', () => {
    for (const patch of [{ gender: 0 }, { gender: 1 }, ...FRESH_PROFILES.map(p => p.patch)]) {
        const body = Body.build(pack, Body.normalizeRecipe(patch));
        const wear = Wardrobe.build(pack, body, items(), { atlasSize: 64 });
        const textures = Object.fromEntries([wear.texture, ...wear.textures].filter(Boolean).map(t => [t.name, t]));
        assert.deepEqual(inspect(wear.parts, body, textures).issues, [], JSON.stringify(patch));
        for (const part of wear.parts.filter(p => /ties$/.test(p.name))) for (let n = 0; n < part.normals.length; n += 3) {
            assert.ok(Math.hypot(...part.normals.subarray(n, n + 3)) > .9, 'a cord retains a noncollapsed radial normal');
        }
    }
});

test('strap attachment caches retain bindings, rebuild on the current body and remain bounded', () => {
    const first = Body.build(pack, Body.normalizeRecipe({ gender: 0 }));
    const expected = Outfit.swimStraps(pack, first, 'top').positions;
    const count = pack._swimStrapBindings.size;
    for (const patch of FRESH_PROFILES.map(p => p.patch)) Outfit.swimStraps(pack, Body.build(pack, Body.normalizeRecipe(patch)), 'top');
    assert.equal(pack._swimStrapBindings.size, count, 'recipes do not add entries to the static attachment cache');
    assert.deepEqual(Outfit.swimStraps(pack, first, 'top').positions, expected, 'another body cannot contaminate the fitted strap');
    assert.notDeepEqual(Outfit.swimStraps(pack, Body.build(pack, Body.normalizeRecipe({ gender: 0, weight: 2 })), 'top').positions, expected);
});
