'use strict';
// Cloth drape (2026-10-24): soft garments settle as cloth when built (RRCharacterDrape): the same recipe settles
// the same way, nothing ends up in the skin, the turned hem follows the draped edge, skin weights stay whole,
// the outfit stays in budget, and the builder's preview stays quick.
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const dir = path.resolve(__dirname, '../src/forge/Character3D');
const Body = require(path.join(dir, 'HumanBody.js')), Outfit = require(path.join(dir, 'CharacterOutfit.js'));
const Wardrobe = require(path.join(dir, 'CharacterWardrobe.js')), Model = require(path.join(dir, 'CharacterModel.js'));
const Drape = require(path.join(dir, 'CharacterDrape.js'));
let pack;
test.before(async () => { pack = await Body.loadPack(); });

/** Each laid piece of a build, as the wardrobe laid it (kept as it is remembered for the layers over it). */
function layOutfit(recipe, quality = 'save') {
    const r = Model.normalize(recipe), built = Body.build(pack, r), laid = [];
    const remember = Drape.remember;
    Drape.remember = (frame, l, spec) => { laid.push({ garment: spec.cutKey && spec.cutKey[0], laid: l }); remember(frame, l, spec); };
    Drape.trace = [];
    let out;
    try { out = Wardrobe.build(pack, built, r.outfit, { quality, atlasSize: 64 }); } finally { Drape.remember = remember; }
    const trace = Drape.trace; Drape.trace = null;
    return { built, laid, out, trace };
}
const fresh = () => { pack._drapeCache = new Map(); pack._drapeWarm = new Map(); };

test('soft garments are draped; hard, skin-tight and fitted pieces are not', () => {
    const top = Wardrobe.BY_ID.get('tshirt').pieces(Wardrobe.normalizeItem({ id: 'tshirt' }))[0];
    assert.ok(Drape.profile(top), 'a T-shirt drapes');
    const skirt = Wardrobe.BY_ID.get('skirt').pieces(Wardrobe.normalizeItem({ id: 'skirt' }))[0];
    assert.equal(Drape.profile(skirt).role, 'skirt');
    const leggings = Wardrobe.BY_ID.get('leggings').pieces(Wardrobe.normalizeItem({ id: 'leggings' }))[0];
    assert.equal(Drape.profile(leggings), null, 'leggings stay skin-tight');
    assert.equal(Drape.profile({ surface: 'tights', hard: true, folds: { role: 'top', fit: 0.5 } }), null, 'plates never drape');
    // Generic: a garment unknown to the catalog drapes by what its spec says it is.
    const made = Drape.profile({ surface: 'tights', rules: { spine: [0, 4] }, folds: { role: 'top', fit: 0.6, weight: 0.0035 } });
    assert.ok(made && made.smooth > Drape.profile(top).smooth, 'heavier cloth folds more broadly');
});

test('the same recipe drapes the same way every time', () => {
    const recipe = { gender: 0, age: 30, outfit: [{ id: 'dress' }] };
    fresh();
    const a = layOutfit(recipe);
    fresh();
    const b = layOutfit(recipe);
    assert.ok(a.trace.length >= 1 && a.trace.every(s => !s.cached), 'settled from scratch');
    assert.equal(a.laid.length, b.laid.length);
    a.laid.forEach((L, k) => assert.deepEqual(Array.from(L.laid.positions), Array.from(b.laid[k].laid.positions), 'piece ' + k));
    // Built again on the same body: kept, not settled again.
    const c = layOutfit(recipe);
    assert.ok(c.trace.every(s => s.cached));
});

test('draped cloth stays out of the body and over the layers under it', () => {
    fresh();
    for (const recipe of [{ gender: 1, age: 30, outfit: [{ id: 'tshirt' }, { id: 'jeans' }, { id: 'trenchcoat' }] },
        { gender: 0, age: 30, outfit: [{ id: 'ballGown' }] },
        { gender: 0, age: 35, weight: 2, shapes: { belly: 2, hips: 2, butt: 2 }, outfit: [{ id: 'robe' }] }]) {
        const { built, laid, trace } = layOutfit(recipe);
        const body = Drape.bodyCollider(pack, built, {});
        for (const s of trace) {
            assert.ok(s.inBody <= Math.max(3, s.verts * 0.003), `${s.garment} ${s.role}: ${s.inBody} of ${s.verts} vertices in the body`);
            assert.ok(s.inLayer <= Math.max(8, s.verts * 0.01), `${s.garment} ${s.role}: ${s.inLayer} of ${s.verts} vertices under the layer below`);
            // A drape that tore the cloth (an extreme body's deep folds) is not used: the piece keeps its laid shell.
            if (!s.rejected) assert.ok(s.strain < 0.03, `${s.garment}: the cloth is not stretched (${(s.strain * 100).toFixed(2)}%)`);
        }
        // Independently: every draped surface vertex is outside the skin, within a millimetre.
        for (const { garment, laid: L } of laid) {
            // (A skirt sewn to its bodice on a heavy body is re-seated after it is draped: RRCharacterWardrobe joinWaist.)
            if (!L.draped || L.draped.rejected || L.sewnWaist) continue;
            let deepest = 0;
            for (let i = 0; i < L.rimStart; i++) {
                const d = Drape.distance(body, L.positions[i * 3], L.positions[i * 3 + 1], L.positions[i * 3 + 2]);
                if (d !== null && d < deepest) deepest = d;
            }
            assert.ok(deepest > -0.0025, `${garment}: ${(deepest * 1000).toFixed(1)} mm into the body`);
        }
    }
});

test('most draped pieces are used; a torn drape falls back to the laid shell', () => {
    fresh();
    let used = 0, all = 0;
    for (const outfit of [['tshirt', 'jeans'], ['hoodie', 'cargoTrousers'], ['dress'], ['robe'], ['shirt', 'jeans', 'trenchcoat'], ['coveralls'], ['skirt', 'sweater']]) {
        const { trace } = layOutfit({ gender: outfit.includes('dress') || outfit.includes('skirt') ? 0 : 1, age: 30, outfit: outfit.map(id => ({ id })) });
        for (const s of trace) { all++; if (!s.rejected) used++; }
    }
    assert.ok(all >= 10 && used === all, `${used} of ${all} drapes used on average bodies`);
});

test('the turned hem is rolled from the draped edge', () => {
    fresh();
    const { laid } = layOutfit({ gender: 1, age: 30, outfit: [{ id: 'hoodie' }] });
    const L = laid.find(x => x.laid.draped).laid;
    assert.ok(L.hem.rows.size > 20);
    for (const [v, ids] of L.hem.rows) {
        assert.equal(ids[0], v);
        for (const id of ids.slice(1)) {
            assert.equal(L.origin[id], v, 'each hem row point belongs to its border vertex');
            const d = Math.hypot(L.positions[id * 3] - L.positions[v * 3], L.positions[id * 3 + 1] - L.positions[v * 3 + 1], L.positions[id * 3 + 2] - L.positions[v * 3 + 2]);
            assert.ok(d < L.hem.thickness + L.hem.facing + 0.006, 'the hem stays on its edge: ' + d.toFixed(4));
        }
    }
});

test('skin weights stay whole and the builds stay in budget', () => {
    fresh();
    for (const recipe of [{ gender: 1, age: 30, outfit: [{ id: 'tshirt' }, { id: 'jeans' }, { id: 'sneakers' }] },
        { gender: 1, age: 30, outfit: [{ id: 'shirt' }, { id: 'jeans' }, { id: 'suitjacket' }, { id: 'shoes' }] },
        { gender: 0, age: 30, outfit: [{ id: 'dress' }, { id: 'sandals' }] }]) {
        const { laid, out } = layOutfit(recipe);
        for (const { laid: L } of laid) for (let i = 0; i < L.weights.length; i += 4) {
            const w = L.weights[i] + L.weights[i + 1] + L.weights[i + 2] + L.weights[i + 3];
            assert.ok(Math.abs(w - 1) < 1e-3, 'weights sum to one');
        }
        const tris = out.parts.reduce((s, p) => s + p.index.length / 3, 0);
        // The drape's own faces: the cut refined where cloth folds (a few thousand at most per outfit).
        assert.ok(tris < 34000, recipe.outfit.map(i => i.id).join('+') + ': ' + tris + ' outfit triangles');
    }
});

test('the builder\'s preview drapes quickly, and again quicker while sliders move', () => {
    fresh();
    const cache = {}, times = [];
    for (let k = 0; k < 3; k++) {
        Drape.trace = [];
        Model.build(pack, { gender: 1, age: 30, weight: 1 + k * 0.15, outfit: [{ id: 'tshirt' }, { id: 'jeans' }] }, cache, { quality: 'preview', skinSize: 64, atlasSize: 64 });
        times.push(Drape.trace.reduce((s, t) => s + t.ms, 0));
        if (k) assert.ok(Drape.trace.every(t => t.warm || t.cached), 'later previews start from the last drape');
        Drape.trace = null;
    }
    // Generous for slow test machines: a garment's preview drape is ~40-120 ms on a desktop.
    assert.ok(times[0] < 1500 && times[2] < 900, 'preview drape time ' + times.map(Math.round).join(', ') + ' ms');
});
