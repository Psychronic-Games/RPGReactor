'use strict';
// (One of three files, -b and -c beside it: the tests are dealt between them so the three run at once; the helpers are in each.)
// Forge › 3D Character Builder, the whole character (RRCharacterModel): every species, outfit preset and accessory
// builds on any body, extremes included; garments stay outside the skin they are cut from; the outfit's picture is
// kept while the body changes; the GLB carries its pictures, its skin and its tail; random characters differ.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'src', 'forge', 'Character3D');
const load = name => require(path.join(dir, name + '.js'));
const Body = load('HumanBody');
for (const name of ['HumanTargets', 'CharacterOutfit', 'CharacterAtlas', 'CharacterWardrobe', 'CharacterProps', 'CharacterSpecies', 'CharacterSkin', 'CharacterHair', 'CreatureBody', 'CharacterGlb', 'CharacterShading', 'CharacterDetail']) load(name);
const Model = load('CharacterModel');
const Outfit = load('CharacterOutfit');
const Wardrobe = load('CharacterWardrobe');
const Props = load('CharacterProps');
const Species = load('CharacterSpecies');
const Skin = load('CharacterSkin');
const Optimizer = require(path.join(root, 'src', 'utils', 'GlbOptimizer.js'));
const { PNG } = require('pngjs');
// Keep failures bounded: a mesh/texture diff can otherwise print megabytes.
const sameBytes = (a, b) => a.byteLength === b.byteLength && Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));

let pack, eyeSource;

test('static thumbnail settings do not leak into the main character or its reusable picture caches', async () => {
    const bodyPack = await Body.loadPack();
    const recipe = Model.normalize({ hair: { style: 'bald' }, outfit: [{ id: 'boots' }] });
    const before = JSON.stringify(recipe), cache = {};
    const eyes = size => ({ width: size, height: size, data: new Uint8Array(size * size * 4).fill(255) });
    const small = Model.build(bodyPack, recipe, cache, { quality: 'preview', static: true, skinSize: 32, atlasSize: 64, eyeSource: eyes(8), hairBudget: 0.5 });
    assert.equal(small.clips.length, 0);
    assert.equal(small.textures['eyes.png'].width, 8);
    assert.equal(small.textures['shoes.png'].width, 64);
    const main = Model.build(bodyPack, recipe, cache, { quality: 'preview', skinSize: 32, atlasSize: 64, eyeSource: eyes(16) });
    assert.ok(main.clips.length > 0);
    assert.equal(main.textures['eyes.png'].width, 16);
    assert.equal(main.textures['shoes.png'].width, globalThis.RR_DEFAULT_PICTURES?.picture || 1024, 'the main view keeps its own picture size, not the thumbnail\'s');
    assert.ok(sameBytes(main.parts[0].positions, small.parts[0].positions), 'thumbnail detail budgets do not reshape the body');
    assert.equal(JSON.stringify(recipe), before);
});
test.before(async () => {
    pack = await Body.loadPack();
    const png = PNG.sync.read(fs.readFileSync(path.join(dir, 'data', 'eye-brown.png')));
    eyeSource = { width: png.width, height: png.height, data: new Uint8Array(png.data) };
});

const { assertSound } = require('./helpers/character-preset-sweep.cjs');

/** Independent visibility probe: a ray from skin must cross fabric before reaching the viewer. */
function garmentHit(parts, origin, direction, reach = 0.5) {
    for (const part of parts) {
        const P = part.positions, I = part.index;
        for (let i = 0; i < I.length; i += 3) {
            const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
            const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
            const pv = [direction[1] * e2[2] - direction[2] * e2[1], direction[2] * e2[0] - direction[0] * e2[2], direction[0] * e2[1] - direction[1] * e2[0]];
            const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
            if (Math.abs(det) < 1e-12) continue;
            const tv = [origin[0] - P[a], origin[1] - P[a + 1], origin[2] - P[a + 2]], u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det;
            if (u < -1e-6 || u > 1 + 1e-6) continue;
            const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]], v = (direction[0] * qv[0] + direction[1] * qv[1] + direction[2] * qv[2]) / det;
            if (v < -1e-6 || u + v > 1 + 1e-6) continue;
            const t = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det;
            if (t > -0.002 && t < reach) return true;
        }
    }
    return false;
}



test('furred features wear fur like the body\'s; a reptile\'s tail is scaled; both follow the tail\'s bones', () => {
    const furry = Object.assign(Model.withSpecies({ gender: 1 }, 'human'), { bodyHair: { amount: 1, pattern: 'werewolf', fur: 0.9, length: 1.1, color: '#6a6460' }, features: { ears: { type: 'wolf' }, tail: { type: 'fox' } } });
    const wolf = Model.build(pack, furry, {}, { quality: 'preview' });
    const fur = wolf.parts.filter(p => p.name === 'Feature fur');
    assert.equal(fur.length, 2, 'fur on the ears and on the tail');
    for (const p of fur) {
        assert.equal(p.texture, 'bodyhair.png');
        assert.ok(wolf.textures['bodyhair.png'], 'the body fur picture is there for them');
        assert.equal(p.source.length, p.positions.length / 3, 'each tuft rides a body vertex on the drag path');
    }
    const tail = wolf.bones.findIndex(b => b.name === 'Tail');
    assert.ok(fur.some(p => p.joints.some(j => j >= tail)), 'the tail\'s fur moves with the tail');
    const weak = Model.build(pack, furry, {}, { quality: 'preview', hairBudget: 0.4 });
    const tris = r => r.parts.filter(p => p.name === 'Feature fur').reduce((n, p) => n + p.index.length / 3, 0);
    assert.ok(tris(weak) < tris(wolf) * 0.6, 'a weak budget grows less');
    assert.ok(tris(wolf) < 30000, 'feature fur ' + tris(wolf) + ' triangles');
    const lizard = Model.build(pack, Model.withSpecies({}, 'lizardfolk'), {}, { quality: 'preview' });
    const scaled = lizard.parts.find(p => p.texture === 'scales.png');
    assert.ok(scaled && scaled.uvs && lizard.textures['scales.png'], 'the tail carries the scale picture');
    assert.ok(scaled.joints.some(j => j >= lizard.bones.findIndex(b => b.name === 'Tail')));
});


// Every outfit preset and every accessory on an average and two extreme bodies: dealt across
// character-3d-model-presets-*.test.cjs, which run side by side (helpers/character-preset-sweep.cjs).


test('a kept cache lays the outfit on the body built now, not on the one before', () => {
    const outfit = Wardrobe.PRESETS.find(p => p.id === 'winter').items;
    const kept = {};
    Model.build(pack, { outfit }, kept, { quality: 'preview' });
    for (const body of [{ age: 11 }, { cup: 4, gender: 0 }, { weight: 3, gender: 1 }]) {
        const reused = Model.build(pack, Object.assign({ outfit }, body), kept, { quality: 'preview' });
        const fresh = Model.build(pack, Object.assign({ outfit }, body), {}, { quality: 'preview' });
        // The kept picture keeps its planar charts, drawn on the first body (Preview 61, 2026-10-30), and charts split
        // vertices differently per body: so compare the points and triangles the cloth is laid on, not their numbering.
        const places = p => new Set(Array.from({ length: p.positions.length / 3 }, (_, v) => Array.from(p.positions.subarray(v * 3, v * 3 + 3)).join()));
        assert.equal(reused.parts.length, fresh.parts.length);
        for (let k = 0; k < fresh.parts.length; k++) {
            const a = places(reused.parts[k]), b = places(fresh.parts[k]), label = fresh.parts[k].name + ' on ' + JSON.stringify(body);
            assert.equal(reused.parts[k].index.length, fresh.parts[k].index.length, label);
            assert.ok(a.size === b.size && [...a].every(q => b.has(q)), label);
        }
    }
});



test('the GLB holds the pictures, the skinned parts, the tail and the Idle', async () => {
    const result = Model.build(pack, Object.assign(Model.withSpecies({}, 'dragonborn'), { outfit: Wardrobe.PRESETS.find(p => p.id === 'knight').items, props: [{ id: 'cape' }] }), {}, { eyeSource });
    const glb = await Model.toGlb(result, 'Test', tex => { const png = new PNG({ width: tex.width, height: tex.height }); png.data = Buffer.from(tex.data); return new Uint8Array(PNG.sync.write(png)); });
    const { json } = Optimizer.parseGlb(glb);
    // The skin, outfit and shoe pictures, the scales of the dragon's tail and its animal head's own coat.
    const images = json.images.map(i => i.name);
    for (const name of ['outfit.png', 'skin.png', 'scales.png', 'creaturecoat.png']) assert.ok(images.includes(name), name + ' in ' + images.join(', '));
    const boots = result.parts.find(p => p.name === 'Armored boots');
    assert.ok(boots && /^shoes\d*\.png$/.test(boots.texture), 'the footwear has its own generated picture');
    assert.ok(images.includes(boots.texture), 'the actual footwear picture is embedded, regardless of preceding armor parts');
    assert.equal(json.meshes.length, result.parts.length);
    for (const node of json.nodes.filter(n => n.mesh != null)) assert.equal(node.skin, 0);
    const names = json.skins[0].joints.map(j => json.nodes[j].name);
    assert.ok(names.includes('Tail') && names.includes('Tail5') && names.includes('LeftHandThumb1'));
    assert.equal(json.animations[0].name, 'Idle');
    // Vertex colors only on the parts without a picture, or tinting a gray one (the tail's scales).
    for (const [i, part] of result.parts.entries()) {
        const prim = json.meshes[i].primitives[0];
        assert.equal(prim.attributes.COLOR_0 != null, !!part.colors && (!part.texture || !!part.keepColors), part.name);
    }
});



test('the arms hang clear of a wide body', () => {
    const thin = Model.build(pack, {}, {}, { quality: 'preview' }), wide = Model.build(pack, { weight: 3, muscle: 2 }, {}, { quality: 'preview' });
    assert.ok(Model.armAngle(wide.recipe, wide.built, pack) > Model.armAngle(thin.recipe, thin.built, pack) + 0.4);
});



test('body hair grows where its pattern says, and never on the palms', () => {
    const K = Skin;
    const at = (fam, s, ang, n, x = 0.05) => ({ fam, s, ang, n, rest: [x, 1, 0], lips: 0, lids: 0, nose: 0 });
    const chest = at(0, 3.0, 0, [0, 0, 1]), back = at(0, 2.0, Math.PI, [0, 0, -1]), face = at(0, 5.0, 1.2, [0.9, 0, 0.4], 0.06);
    const palm = at(1, 3.4, 0, [0, -1, 0]), handBack = at(1, 3.4, 0, [0, 1, 0]), knee = at(3, 1.0, 0, [0, 0, 1]);
    const natural = K.normalizeBodyHair({ pattern: 'natural' }).regions, wolf = K.normalizeBodyHair({ pattern: 'werewolf' }).regions;
    assert.ok(K.hairDensity(natural, chest) > 0.5, 'a natural chest');
    assert.ok(K.hairDensity(natural, back) < 0.1, 'a natural back is bare');
    assert.equal(K.hairDensity(natural, face), 0);
    assert.ok(K.hairDensity(wolf, face) > 0.9, 'a werewolf cheek');
    assert.ok(K.hairDensity(wolf, knee) > 0.9, 'no gap at the knee where thigh and shin meet');
    assert.ok(K.hairDensity(wolf, handBack) > 0.5);
    assert.equal(K.hairDensity(wolf, palm), 0);
    // A region moved by hand keeps its value under the pattern's others.
    assert.equal(K.normalizeBodyHair({ pattern: 'custom', regions: { back: 0.4 } }).regions.back, 0.4);
});



test('hidden ears leave ear holes, not nubs', () => {
    const out = recipe => { const P = Body.build(pack, recipe).shaped, F = Body.headFields(pack); let m = 0; for (let v = 0; v < F.ear.length; v++) if (F.ear[v] > 0.6 && P[v * 3] > 0) m = Math.max(m, P[v * 3]); return m; };
    const ears = out({}), hidden = out({ morph: { earsAway: 1 } });
    assert.ok(ears - hidden > 0.015, 'the ear lies flat against the head');
});



test('every pose to try a character in plays on the built skeleton, its turns whole quaternions', () => {
    const Poses = require(path.join(root, 'src', 'forge', 'Character3D', 'CharacterPoses.js'));
    const built = Model.build(pack, { gender: 0 }, {}, { quality: 'preview' });
    for (const pose of Poses.POSES) {
        const clip = Poses.clip(built.bones, pose.id);
        assert.ok(clip && clip.tracks.length >= 4, pose.id);
        for (const t of clip.tracks) {
            assert.ok(t.bone >= 0 && t.bone < built.bones.length, `${pose.id} bone`);
            // A floor pose moves its hips, and baked soft tissue moves its joints on times of its own (2026-11-01).
            if (t.path) {
                assert.ok(t.path === 'translation' && (built.bones[t.bone].parent < 0 || built.bones[t.bone].softTissue), `${pose.id}: only the hips and soft tissue move`);
                assert.equal(t.values.length, (t.times || clip.times).length * 3, `${pose.id} move length`);
                assert.ok(t.values.every(Number.isFinite), `${pose.id} finite move`);
                continue;
            }
            assert.equal(t.values.length, clip.times.length * 4, `${pose.id} track length`);
            for (let i = 0; i < t.values.length; i += 4) assert.ok(Math.abs(Math.hypot(t.values[i], t.values[i + 1], t.values[i + 2], t.values[i + 3]) - 1) < 1e-5, `${pose.id} unit quaternion`);
        }
        assert.ok(Number.isFinite(clip.lift(0.3)), `${pose.id} lift`);
    }
    assert.equal(Poses.clip(built.bones, 'nonsense'), null);
});



test('a heavy body stays inside its dress around the hips and upper thighs', () => {
    const built = Body.build(pack, Body.normalizeRecipe({ gender: 0, extreme: true, weight: 4 }));
    const out = Wardrobe.build(pack, built, [{ id: 'dress' }], { atlasSize: 64 }), an = Outfit.anatomy(pack);
    const hips = built.bones.find(b => b.name === 'Hips').head;
    for (const v of new Set(pack.body.source)) {
        const p = Array.from(built.shaped.slice(v * 3, v * 3 + 3));
        if (p[1] < hips[1] * 0.65 || p[1] > hips[1] * 1.05 || an.member[v * 5 + 1] > 0.4 || an.member[v * 5 + 2] > 0.4) continue;
        const dx = p[0] - hips[0], dz = p[2] - hips[2], r = Math.hypot(dx, dz);
        if (r < 0.04) continue;
        assert.ok(garmentHit(out.parts, p, [dx / r, 0, dz / r]), 'hip or upper thigh vertex ' + v + ' stays inside the dress');
    }
});

const Clothes = load('CharacterClothes');
const MODELED = Wardrobe.GARMENTS.filter(g => g.modeled);



test('only skin a garment really covers is hidden: every preset and random outfit, on average and extreme bodies', () => {
    // An independent look: from each hidden skin vertex, straight out along its normal, some garment triangle within 10 cm.
    const uncoveredShare = (built, out) => {
        const P = built.shaped, N = Body.vertexNormals(pack, P), cell = 0.04, grid = new Map(), key = (x, y, z) => x + ',' + y + ',' + z, tris = [];
        for (const part of out.parts) for (let k = 0; k < part.index.length; k += 3) {
            const t = [0, 1, 2].map(q => { const i = part.index[k + q] * 3; return [part.positions[i], part.positions[i + 1], part.positions[i + 2]]; });
            const id = tris.push(t) - 1, lo = [0, 1, 2].map(a => Math.floor(Math.min(t[0][a], t[1][a], t[2][a]) / cell)), hi = [0, 1, 2].map(a => Math.floor(Math.max(t[0][a], t[1][a], t[2][a]) / cell));
            if ((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > 4096) continue;
            for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) { const kk = key(x, y, z); (grid.get(kk) || grid.set(kk, []).get(kk)).push(id); }
        }
        const hit = (o, d) => {
            for (let step = -0.006; step <= 0.1; step += 0.01) {
                for (const id of grid.get(key(...[0, 1, 2].map(a => Math.floor((o[a] + d[a] * step) / cell)))) || []) {
                    const [a, b, c] = tris[id], e1 = [0, 1, 2].map(q => b[q] - a[q]), e2 = [0, 1, 2].map(q => c[q] - a[q]);
                    const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
                    if (Math.abs(det) < 1e-12) continue;
                    const tv = [0, 1, 2].map(q => o[q] - a[q]), u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det;
                    if (u < 0 || u > 1) continue;
                    const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]], v = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) / det;
                    if (v < 0 || u + v > 1) continue;
                    const t = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det;
                    if (t > -0.004 && t < 0.1) return true;
                }
            }
            return false;
        };
        let n = 0, bare = 0, k = 0;
        for (const v of out.hidden) {
            if (k++ % 20) continue;
            n++;
            if (!hit([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]])) bare++;
        }
        return n ? bare / n : 0;
    };
    const outfits = Wardrobe.PRESETS.filter(p => p.items.length).map(p => [p.id, p.items]);
    for (let seed = 1; seed <= 24; seed++) outfits.push(['seed ' + seed, Model.random(seed).outfit]);
    for (const body of [{}, { gender: 0, extreme: true, weight: 3 }, { gender: 1, extreme: true, muscle: 2, height: 1.2 }]) {
        const built = Body.build(pack, Body.normalizeRecipe(body)), cache = {};
        for (const [name, items] of body.weight || body.muscle ? outfits.filter((_, i) => i % 5 === 0) : outfits) {
            const share = uncoveredShare(built, Wardrobe.build(pack, built, items, cache));
            // The two looks walk the ray's grid cells differently; at a fingertip or a hem's very edge a few vertices disagree.
            assert.ok(share < 0.01, `${name} on ${JSON.stringify(body)}: ${(share * 100).toFixed(2)}% of the hidden skin has no garment over it`);
        }
    }
});



test('boots go over trouser legs, shoes under trouser hems', () => {
    const built = Body.build(pack, Body.normalizeRecipe({}));
    const count = list => Wardrobe.build(pack, built, list, {}).parts.map(p => [p.name, p.index.length / 3]);
    const alone = Object.fromEntries(count([{ id: 'mh_jacket_jeans' }]).concat(count([{ id: 'mh_viking_boots' }]), count([{ id: 'mh_sneakers' }])));
    const booted = Object.fromEntries(count([{ id: 'mh_jacket_jeans' }, { id: 'mh_viking_boots' }]));
    assert.ok(booted['Jacket and jeans'] < alone['Jacket and jeans'], 'the trouser legs inside the boots are not drawn');
    assert.equal(booted['Viking boots'], alone['Viking boots'], 'the boots whole');
    const shod = Object.fromEntries(count([{ id: 'mh_jacket_jeans' }, { id: 'mh_sneakers' }]));
    assert.equal(shod['Jacket and jeans'], alone['Jacket and jeans'], 'the trousers whole');
    assert.ok(shod['Running shoes'] < alone['Running shoes'] && shod['Running shoes'] > alone['Running shoes'] * 0.7, 'the socks under the hems are not drawn, the shoes are');
});


