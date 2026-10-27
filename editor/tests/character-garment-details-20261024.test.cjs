'use strict';
// Forge › 3D Character Builder, garment construction details (2026-10-24): lapels and collars,
// plackets, waistbands, pockets, belts, rib bands, seams and stitching built on the finished cloth
// (RRCharacterGarmentDetails.construct) from each garment's `details` choices and `construction`
// data (RRCharacterWardrobe), bound to the cloth's triangles.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C3 = path.join(__dirname, '../src/forge/Character3D');
const Body = require(path.join(C3, 'HumanBody.js'));
const W = require(path.join(C3, 'CharacterWardrobe.js'));
const D = require(path.join(C3, 'CharacterGarmentDetails.js'));

let pack;
const ready = Body.loadPack().then(p => { pack = p; });
const DETAIL = /^(Garment construction|Garment buttons|Garment hardware|Garment seams|Top-stitching|Rib knit bands|Garment lining|Garment construction shadows|Garment creases|Drawstrings|Belts)$/;
/** An outfit on a body, its construction parts and the entries they were built on. */
function dress(outfit, gender = 1) {
    const built = Body.build(pack, Object.assign({}, Body.DEFAULT_RECIPE, { gender }));
    let entries = null;
    const original = D.build;
    D.build = (p, b, e) => { entries = e; return original(p, b, e); };
    try {
        const out = W.build(pack, built, outfit, { quality: 'preview' });
        return { built, entries, parts: out.parts, details: out.parts.filter(p => DETAIL.test(p.name)), textures: out.textures };
    } finally { D.build = original; }
}
const tris = parts => parts.reduce((s, p) => s + p.index.length / 3, 0);

test('a garment\'s detail choices resolve with their defaults and only its own values are kept', () => {
    assert.deepStrictEqual(W.detailsOf({ id: 'suitjacket' }), { lapel: 'notch', pockets: 'flap', vent: true });
    assert.deepStrictEqual(W.detailsOf({ id: 'suitjacket', lapel: 'peak', vent: false }), { lapel: 'peak', pockets: 'flap', vent: false });
    assert.strictEqual(W.detailsOf({ id: 'suitjacket', lapel: 'bogus' }).lapel, 'notch');
    const item = W.normalizeItem({ id: 'jeans', trouserStyle: 'cargo-ish', loops: 0 });
    assert.ok(!('trouserStyle' in item), 'an unknown style is dropped');
    assert.strictEqual(item.loops, false, 'a toggle is a boolean');
    assert.strictEqual(W.normalizeItem({ id: 'jeans', trouserStyle: 'chinos' }).trouserStyle, 'chinos');
    // Every garment that declares details offers a few, each with a valid default.
    for (const g of W.GARMENTS) {
        if (!g.details) continue;
        assert.ok(g.details.length <= 3, g.id + ' shows at most three detail controls');
        for (const d of g.details) {
            assert.ok(d.id && d.label, g.id + ' detail has an id and a label');
            if (d.toggle) assert.strictEqual(typeof d.default, 'boolean');
            else assert.ok(d.choices.some(c => c[0] === d.default), g.id + '.' + d.id + ' default is a choice');
        }
    }
});

test('a suit jacket opens in a V with lapels, a collar, pockets and buttons on its own cloth', async () => {
    await ready;
    const { details, entries, built } = dress([{ id: 'shirt' }, { id: 'jeans', trouserStyle: 'tailored' }, { id: 'suitjacket' }]);
    const jacket = entries.find(e => e.garment === 'suitjacket' && !e.skirt);
    assert.ok(entries.some(e => e.garment === 'suitjacket' && e.skirt), 'the jacket hangs over the seat');
    // The V: the jacket's cut edge runs up from the waist to the neck in front.
    const F = jacket.laid.field, front = [...new Set(jacket.laid.piece.border.flat())].filter(v => F[v].fam === 0 && Math.cos(F[v].spineAng) > 0.85);
    assert.ok(front.some(v => F[v].s < 1.4) && front.some(v => F[v].s > 3), 'the front edge reaches from the button up the V');
    const names = new Set(details.map(p => p.name));
    for (const n of ['Garment construction', 'Garment buttons', 'Top-stitching']) assert.ok(names.has(n), n);
    // Each construction vertex is bound to its garment's cloth and skinned like it.
    const bones = built.bones.length;
    for (const p of details) {
        const n = p.positions.length / 3;
        assert.strictEqual(p.detailAnchors.length, n * 10, p.name + ' anchors');
        assert.strictEqual(p.sewnRefs.length, n * 2, p.name + ' sewn refs');
        for (let v = 0; v < n; v++) {
            const e = p.detailAnchors[v * 10], entry = entries[e];
            assert.ok(entry && !entry.lining, 'bound to a garment');
            for (let k = 1; k <= 3; k++) assert.ok(p.detailAnchors[v * 10 + k] < entry.laid.rimStart, 'on its outer faces');
            let w = 0; for (let k = 0; k < 4; k++) { w += p.weights[v * 4 + k]; assert.ok(p.joints[v * 4 + k] < bones); }
            assert.ok(Math.abs(w - 1) < 1e-4, 'skin weights sum to one');
        }
        for (const x of p.positions) assert.ok(Number.isFinite(x));
    }
});

test('construction follows its cloth when the cloth moves (bound by triangle and offset)', async () => {
    await ready;
    const { details, entries } = dress([{ id: 'jeans' }]);
    const before = details.map(p => Float32Array.from(p.positions));
    D.follow(details, entries);
    details.forEach((p, i) => p.positions.forEach((x, k) => assert.ok(Math.abs(x - before[i][k]) < 2e-5, 'unchanged cloth, unchanged details')));
    const L = entries[0].laid;
    for (let k = 0; k < L.positions.length; k += 3) { L.positions[k] += 0.05; L.positions[k + 1] -= 0.02; }
    D.follow(details, entries);
    details.forEach((p, i) => { for (let v = 0; v < p.positions.length / 3; v++) { assert.ok(Math.abs(p.positions[v * 3] - before[i][v * 3] - 0.05) < 1e-4); assert.ok(Math.abs(p.positions[v * 3 + 1] - before[i][v * 3 + 1] + 0.02) < 1e-4); } });
});

test('choices change the construction: plain trousers, no lapels, no belt', async () => {
    await ready;
    const jeans = tris(dress([{ id: 'jeans' }]).details), plain = tris(dress([{ id: 'jeans', trouserStyle: 'plain' }]).details);
    assert.ok(jeans > plain * 2 && plain > 0, 'five-pocket jeans have far more than a plain waistband');
    const notch = tris(dress([{ id: 'suitjacket' }]).details), none = tris(dress([{ id: 'suitjacket', lapel: 'none' }]).details);
    assert.ok(notch > none + 600, 'lapels and collar are real geometry');
    const belted = dress([{ id: 'trenchcoat' }]), unbelted = dress([{ id: 'trenchcoat', belt: false, straps: false }]);
    assert.ok(belted.details.some(p => p.name === 'Garment hardware') && tris(belted.details) > tris(unbelted.details) + 800, 'belt, buckle and straps');
});

test('garments declare generic details as data (a uniform\'s belt, pockets and straps)', async () => {
    await ready;
    const g = W.BY_ID.get('uniform');
    assert.ok(g.construction.parts.some(p => p.kind === 'belt' && p.when === 'belt'));
    const all = tris(dress([{ id: 'uniform' }]).details), bare = tris(dress([{ id: 'uniform', belt: false, pockets: false, straps: false }]).details);
    assert.ok(all > bare + 1000, 'each declared part is built only when its choice is on');
    assert.match(fs.readFileSync(path.join(C3, 'CharacterGarmentDetails.js'), 'utf8'), /kinds:\s+patchPocket/, 'the declared kinds are documented');
});

test('detail budget: each garment adds at most about four thousand triangles, hidden ones are left out', async () => {
    await ready;
    for (const id of ['suitjacket', 'trenchcoat', 'shirt', 'jeans', 'hoodie', 'sweater', 'uniform', 'coveralls', 'tshirt', 'robe']) {
        const t = tris(dress([{ id }]).details);
        assert.ok(t > 100 && t < 4600, id + ' construction ' + t);
    }
    // A shirt under a jacket: its back yoke and much of its placket are not built.
    const alone = tris(dress([{ id: 'shirt' }]).details.filter(p => p.detailAnchors && p.detailAnchors[0] === 0));
    const under = dress([{ id: 'shirt' }, { id: 'suitjacket' }]);
    const shirtUnder = tris(under.details.map(p => {
        const keep = []; for (let t = 0; t < p.index.length; t += 3) if (p.detailAnchors[p.index[t] * 10] === 0) keep.push(t);
        return { index: { length: keep.length * 3 } };
    }));
    assert.ok(shirtUnder < alone * 0.8, 'covered shirt details are left out (' + shirtUnder + ' of ' + alone + ')');
});

test('seams and stitching are sunk lines and thread on their own cut-out tiles, not tubes', async () => {
    await ready;
    const { details, textures } = dress([{ id: 'jeans' }]);
    const seams = details.find(p => p.name === 'Garment seams'), stitch = details.find(p => p.name === 'Top-stitching');
    for (const p of [seams, stitch]) {
        assert.ok(p && p.cutout && p.keepColors && p.texture && p.normalTexture && p.uvs, p && p.name);
        assert.ok(textures.some(t => t.name === p.texture) && textures.some(t => t.name === p.normalTexture), 'its pictures go with the outfit');
    }
    // Jeans thread is gold against the indigo.
    assert.ok(stitch.colors[0] > stitch.colors[2] * 1.5);
});

test('the Outfit card shows each garment\'s detail choices', () => {
    const src = fs.readFileSync(path.join(C3, 'Character3DBuilder.js'), 'utf8');
    assert.match(src, /W\.detailsOf\(item\)/);
    assert.match(src, /for \(const d of g\.details \|\| \[\]\)/);
});
