'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { Body, BODY_STRATA } = require('./helpers/character-quality-matrix.cjs');
const Props = require('../src/forge/Character3D/CharacterProps.js');
const Wardrobe = require('../src/forge/Character3D/CharacterWardrobe.js');
const Outfit = require('../src/forge/Character3D/CharacterOutfit.js');
const Clothes = require('../src/forge/Character3D/CharacterClothes.js');
const Cloth = require('../src/forge/Character3D/CharacterCloth.js');
const Poses = require('../src/forge/Character3D/CharacterPoses.js');
const { surfaceHit } = require('./quality/character-outfit-accessory-quality.cjs');
let pack;
test.before(async () => { pack = await Body.loadPack(); });

test('accessories remain finite and nonempty on narrow and compressed broad heads', () => {
    for (const fixture of BODY_STRATA.filter(s => ['narrow-head', 'broad-head'].includes(s.id))) {
        const built = Body.build(pack, Body.normalizeRecipe(fixture.patch));
        for (const def of Props.PROPS) {
            const result = Props.build(pack, built, [{ id: def.id }]);
            assert.ok(result.parts.length, fixture.id + ': ' + def.id + ' has visible geometry');
            for (const part of result.parts) {
                assert.ok(part.index.length > 0, def.id + ' has faces');
                for (const value of part.positions) assert.ok(Number.isFinite(value), fixture.id + ': ' + def.id + ' position');
                for (const value of part.normals) assert.ok(Number.isFinite(value), fixture.id + ': ' + def.id + ' normal');
            }
        }
    }
});

test('head rings interpolate the actual surface between sparse vertex layers', () => {
    const built = Body.build(pack, Body.normalizeRecipe(BODY_STRATA.find(s => s.id === 'broad-head').patch));
    const L = Props.landmarks(pack, built), heights = [...new Set(L.headIds.map(v => built.shaped[v * 3 + 1]))].sort((a, b) => a - b);
    let a, b, largest = 0;
    for (let i = 1; i < heights.length; i++) if (heights[i] < L.crown - 0.03 && heights[i - 1] > L.eyeY - 0.02 && heights[i] - heights[i - 1] > largest) {
        a = heights[i - 1]; b = heights[i]; largest = b - a;
    }
    assert.ok(largest > 1e-5, 'the fixture has an empty horizontal vertex slice');
    const y = (a + b) / 2, ring = L.ring(y, largest * 0.1);
    assert.ok(ring && ring.rx > 0 && ring.rz > 0, 'a surface exists between the vertex rows');
    assert.equal(ring.center[1], y);
    const x = L.headIds.map(v => built.shaped[v * 3]), z = L.headIds.map(v => built.shaped[v * 3 + 2]);
    assert.ok(ring.rx <= (Math.max(...x) - Math.min(...x)) / 2 + 1e-6);
    assert.ok(ring.front <= Math.max(...z) + 1e-6 && ring.back >= Math.min(...z) - 1e-6);
    const crownRing = L.ring(L.crown + 0.1, 0.02);
    assert.ok(crownRing && crownRing.rx > 0 && crownRing.rz > 0, 'an outlying hat anchor uses the nearest real crown band');
});

// Orthographic front-view visibility, independent of the production hidden-skin filter.
function fabricInFront(parts, point) {
    for (const part of parts) for (let i = 0; i < part.index.length; i += 3) {
        const P = part.positions, a = part.index[i] * 3, b = part.index[i + 1] * 3, c = part.index[i + 2] * 3;
        const det = (P[b + 1] - P[c + 1]) * (P[a] - P[c]) + (P[c] - P[b]) * (P[a + 1] - P[c + 1]);
        if (Math.abs(det) < 1e-12) continue;
        const u = ((P[b + 1] - P[c + 1]) * (point[0] - P[c]) + (P[c] - P[b]) * (point[1] - P[c + 1])) / det;
        const v = ((P[c + 1] - P[a + 1]) * (point[0] - P[c]) + (P[a] - P[c]) * (point[1] - P[c + 1])) / det;
        if (Math.min(u, v, 1 - u - v) < -1e-6) continue;
        const dz = u * P[a + 2] + v * P[b + 2] + (1 - u - v) * P[c + 2] - point[2];
        if (dz > -0.004 && dz < 0.5) return true;
    }
    return false;
}

test('full-coverage soft garments cover a full or pendulous bust and the front crotch', () => {
    const an = Outfit.anatomy(pack), ids = [...new Set(pack.body.source)];
    const cases = [
        { gender: 0, extreme: true, weight: 4, cup: 2 },
        { gender: 0, extreme: true, weight: -1, height: -0.6, cup: 6 },
        { gender: 1, extreme: true, weight: 4, muscle: 2 }
    ];
    for (const recipe of cases) {
        const body = Body.build(pack, Body.normalizeRecipe(recipe)), N = Body.vertexNormals(pack, body.shaped);
        const hip = body.bones.find(b => b.name === 'Hips').head;
        // Triangle swim cups intentionally expose the center chest; their
        // actual cup coverage is checked separately in character-bikini-quality.
        for (const [region, garments] of [['bust', ['bra', 'sportsBra', 'cropTop', 'tshirt']], ['crotch', ['jeans', 'shorts', 'briefs']]]) {
            const candidates = ids.filter(v => an.member[v * 5] > 0.7 && N[v * 3 + 2] > 0.2 && body.shaped[v * 3 + 2] > hip[2] &&
                (region === 'bust' ? an.s[v * 5] > 2.35 && an.s[v * 5] < 2.65 : an.s[v * 5] > -0.4 && an.s[v * 5] < 0.4));
            assert.ok(candidates.length >= 8, region + ' samples actual front-facing skin');
            const count = Math.min(32, candidates.length);
            const samples = Array.from({ length: count }, (_, i) => candidates[Math.floor(i * candidates.length / count)]);
            for (const id of garments) {
                const out = Wardrobe.build(pack, body, [{ id }], { atlasSize: 64 });
                for (const v of samples) assert.ok(fabricInFront(out.parts, body.shaped.subarray(v * 3, v * 3 + 3)), `${id}: ${region} skin ${v} is exposed on ${JSON.stringify(recipe)}`);
            }
        }
    }
});

test('changing between helper and detailed body cuts cannot reuse the other surface topology', () => {
    const cache = { atlasSize: 64 }, average = Body.build(pack, Body.normalizeRecipe({ gender: 0 }));
    const heavy = Body.build(pack, Body.normalizeRecipe({ gender: 0, extreme: true, weight: 4, cup: 2 }));
    const first = Wardrobe.build(pack, average, [{ id: 'tshirt' }], cache);
    const second = Wardrobe.build(pack, heavy, [{ id: 'tshirt' }], cache);
    const again = Wardrobe.build(pack, average, [{ id: 'tshirt' }], cache);
    assert.notEqual(second.parts[0].positions.length, first.parts[0].positions.length, 'an extreme bulge gets enough surface detail');
    assert.deepEqual(again.parts[0].positions, first.parts[0].positions, 'returning to the average build restores its exact cut');
});

test('every modeled garment has compact body-weighted fabric confined to its authored coverage', () => {
    const catalog = Clothes.load(pack), models = Wardrobe.GARMENTS.filter(g => g.modeled), neighbors = Body.neighbors(pack);
    assert.equal(models.length, 17);
    for (const fixture of BODY_STRATA.filter(s => ['preset-female', 'heavy-female'].includes(s.id))) {
        const body = Body.build(pack, Body.normalizeRecipe(fixture.patch));
        const poses = ['walk', 'sit', 'kneel'].map(id => {
            const clip = Poses.clip(body.bones, id, body.parts[0]), pose = Cloth.pose(body.bones, clip, clip.times.at(-1) * (id === 'walk' ? 0.25 : 0));
            return { id, pose, skin: Cloth.skin({ positions: body.shaped, joints: pack.skinJoints, weights: pack.skinWeights }, body.bones, pose) };
        });
        for (const def of models) {
            const data = catalog.garments.get(def.id), authored = new Set(data.hidden), before = data.hidden.slice();
            const interior = new Set([...authored].filter(v => neighbors.flat.subarray(neighbors.offsets[v], neighbors.offsets[v + 1]).every(n => authored.has(n))));
            const made = Wardrobe.build(pack, body, [{ id: def.id }], { atlasSize: 64 }), fabric = made.parts.find(p => p.rrLining);
            assert.ok(fabric, def.id + ' has real inner fabric');
            assert.deepEqual(data.hidden, before, 'the authored mask is unchanged');
            assert.equal(new Set(fabric.index).size, fabric.positions.length / 3, 'only referenced vertices are stored');
            for (const v of made.hidden) assert.ok(authored.has(v), 'hiding cannot expand beyond the original garment');
            // The Viking tunic's lining adds a fitted underarm gusset between sleeve and body
            // (CharacterClothes innerFabric); its neckline, cuffs and hem stay open.
            const an = Outfit.anatomy(pack), arm = v => an.member[v * 5 + 1] + an.member[v * 5 + 2];
            const gusset = v => def.id === 'mh_viking_tunic' && arm(v) > 0.04 && arm(v) < 0.97 && an.s[v * 5] > 2.6 && an.s[v * 5] < 3.6;
            for (let v = 0; v < fabric.source.length; v++) {
                const source = fabric.source[v];
                assert.ok(authored.has(source) || gusset(source), def.id + ' leaves un-authored neckline, cuff and hem skin alone');
                assert.ok(Math.hypot(...fabric.positions.subarray(v * 3, v * 3 + 3).map((x, k) => x - body.shaped[source * 3 + k])) < 0.0005);
                for (let k = 0; k < 4; k++) {
                    assert.equal(fabric.joints[v * 4 + k], pack.skinJoints[source * 4 + k]);
                    assert.equal(fabric.weights[v * 4 + k], pack.skinWeights[source * 4 + k]);
                }
            }
            for (const uv of fabric.uvs) assert.ok(Number.isFinite(uv) && uv >= -1e-6 && uv <= 1.000001);
            const template = data._innerFabric;
            for (let i = 0; i < template.index.length; i += 3) assert.ok([1, 2].every(k => template.regions[template.index[i + k]] === template.regions[template.index[i]]), 'fabric faces do not blend unrelated color regions');
            // Face centers avoid classifying an exposed cut boundary as an interior fabric hole.
            const faces = [];
            for (let i = 0; i < fabric.index.length; i += 3) if ([0, 1, 2].every(k => interior.has(fabric.source[fabric.index[i + k]]))) faces.push(i);
            assert.ok(faces.length, def.id + ' has interior fabric away from its authored cut edges');
            for (const posed of poses) {
                const parts = made.parts.map(part => ({ index: part.index, positions: Cloth.skin(part, body.bones, posed.pose) }));
                const count = Math.min(24, faces.length);
                for (let sample = 0; sample < count; sample++) {
                    const face = faces[Math.floor(sample * faces.length / count)];
                    const ids = [0, 1, 2].map(k => fabric.source[fabric.index[face + k]]), P = posed.skin;
                    const points = ids.map(v => P.subarray(v * 3, v * 3 + 3));
                    const center = [0, 1, 2].map(k => points.reduce((s, p) => s + p[k], 0) / 3);
                    const u = points[1].map((x, k) => x - points[0][k]), v = points[2].map((x, k) => x - points[0][k]);
                    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], length = Math.hypot(...n);
                    if (length < 1e-9) continue;
                    assert.ok(surfaceHit(parts, center, n.map(x => x / length)), `${def.id} on ${fixture.id}/${posed.id}: interior fabric is missing at face ${face / 3}, source ${ids}, area ${length / 2}`);
                }
            }
        }
    }
});
