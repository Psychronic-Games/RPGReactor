'use strict';
// Cloth construction (2026-10-24): turned hems instead of rolled piping, a fold field with refinement
// only where the cloth folds, hanging ease, and hair kept under a soft cap.
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const dir = path.resolve(__dirname, '../src/forge/Character3D');
const Body = require(path.join(dir, 'HumanBody.js')), Outfit = require(path.join(dir, 'CharacterOutfit.js'));
const Wardrobe = require(path.join(dir, 'CharacterWardrobe.js')), Model = require(path.join(dir, 'CharacterModel.js'));
const Drape = require(path.join(dir, 'CharacterDrape.js'));
let pack;
test.before(async () => { pack = await Body.loadPack(); });

const outfitTris = parts => parts.reduce((s, p) => s + p.index.length / 3, 0);
/** A garment's soft pieces as the wardrobe lays them (its hem and folds included). */
function pieces(id, extra = {}) {
    const item = Wardrobe.normalizeItem(Object.assign({ id }, extra)), g = Wardrobe.BY_ID.get(id);
    return g.pieces(item).filter(raw => raw.surface).map((raw, pi) => {
        const spec = Object.assign({}, raw, { cutKey: ['construction-test', id, pi, JSON.stringify(extra)] });
        spec.hem = Wardrobe.hemFor(g, item, spec);
        if (spec.folds) spec.folds = Object.assign({}, spec.folds, { weight: spec.hem.thickness });
        return { spec, piece: Outfit.cutFor(pack, spec) };
    });
}

test('ordinary hems are the garment turned under, with no rolled piping tube', () => {
    const built = Body.build(pack, { gender: 1, age: 30 });
    const plain = Wardrobe.build(pack, built, [{ id: 'tshirt' }, { id: 'jeans' }], { atlasSize: 64 });
    assert.ok(!plain.parts.some(p => p.name === 'Sewn garment edges'), 'no binding without a chosen contrast trim');
    // A contrast trim is a flat band two quads across (three points per edge point), not a six-sided tube.
    const robe = Wardrobe.build(pack, built, [{ id: 'robe' }], { atlasSize: 64 }), band = robe.parts.find(p => p.name === 'Sewn garment edges');
    assert.ok(band, 'the robe keeps its gold trim as a band');
    const ratio = (band.index.length / 3) / (band.positions.length / 3);
    assert.ok(ratio < 1.5, 'flat band, not piping (tube parts have two triangles per vertex): ' + ratio.toFixed(2));
    assert.ok(band.sewnRefs && band.sewnRefs.length === band.positions.length / 3 * 2, 'every band point rides on a fabric vertex');
    // The hem's rows: a roll round the edge, then a facing inside.
    const [{ spec, piece }] = pieces('tshirt');
    const laid = Outfit.lay(pack, built, piece, spec, {});
    assert.ok(laid.hem.rows.size > 20, 'every border vertex has a turned hem');
    for (const ids of laid.hem.rows.values()) assert.equal(ids.length, 5, 'border vertex, three roll points, the facing');
});

test('hem thickness follows the fabric and its material', () => {
    const hem = (id, material) => { const item = Wardrobe.normalizeItem(Object.assign({ id }, material ? { material } : {})); return Wardrobe.hemFor(Wardrobe.BY_ID.get(id), item, {}).thickness; };
    assert.equal(hem('tshirt'), 0.0012, 'jersey');
    assert.equal(hem('shirt'), 0.001, 'shirting');
    assert.equal(hem('suitjacket'), 0.0025, 'wool');
    assert.equal(hem('trenchcoat', 'cloth'), 0.0035, 'coat cloth');
    assert.equal(hem('gambeson'), 0.006, 'quilted');
    assert.equal(hem('vest'), 0.002, 'leather');
    assert.ok(hem('gown') <= 0.0008, 'silk is thin');
    // The roll is as deep as the fabric is thick: the row under the edge lies that far behind it.
    const built = Body.build(pack, { gender: 0, age: 30 }), scale = built.height / 1.7;
    for (const [id, expected] of [['tshirt', 0.0012], ['gambeson', 0.006]]) {
        const [{ spec, piece }] = pieces(id), laid = Outfit.lay(pack, built, piece, spec, {});
        const depths = [];
        for (const [i, ids] of laid.hem.rows) depths.push(Math.hypot(...[0, 1, 2].map(k => laid.positions[ids[laid.hem.turn + 1] * 3 + k] - laid.positions[i * 3 + k])));
        depths.sort((a, b) => a - b);
        const median = depths[depths.length >> 1];
        assert.ok(Math.abs(median - expected * scale) < expected * scale * 0.35 + 0.0004, id + ' hem depth ' + median);
    }
});

test('soft garments carry a fold field, bounded by the gap between layers', () => {
    for (const id of ['tshirt', 'jeans', 'sweater', 'cargoTrousers', 'officerJacket', 'coveralls', 'robe', 'skirt', 'ballGown']) {
        let deepest = 0;
        for (const { spec, piece } of pieces(id)) {
            if (!spec.folds) continue;
            assert.ok(piece.fold && piece.fold.length === piece.verts.length, id + ' has a fold per vertex');
            const most = Math.max(...Array.from(piece.fold, Math.abs));
            deepest = Math.max(deepest, most);
            if (spec.folds.role === 'skirt') assert.ok(most <= 0.03 + 1e-6, id + ' flutes stay bounded: ' + most);
            else assert.ok(most <= Outfit.FOLD_GAP * (spec.folds.cap ?? 1) * 1.6 + 1e-6, id + ' folds fit between layers: ' + most);
            // Draped cloth (RRCharacterDrape, 2026-10-24) makes its own folds when it is laid: the drawn field keeps only a
            // bent joint's compression (elbow, knee), which a rest pose never bends.
            if (piece.drapeProfile) piece.fold.forEach((d, i) => { const f = piece.field[i]; if (Math.abs(d) > 1e-5) assert.ok(f.fam !== 0 && Math.abs(f.s - (f.fam < 3 ? 2 : 1)) < 0.7, id + ' draws folds only at a joint'); });
        }
        // (A draped garment with no sleeve past the elbow and no leg past the knee draws none at all.)
        if (!['tshirt', 'skirt', 'ballGown'].includes(id)) assert.ok(deepest > 0.0005, id + ' folds stand out: ' + deepest);
    }
    // Skin-tight cloth does not fold.
    for (const id of ['leggings', 'briefs', 'bra']) for (const { spec } of pieces(id)) assert.ok(!spec.folds, id + ' stays smooth');
    // A laid valley never sinks the cloth onto the skin; nothing folds under an outer layer's sleeves.
    const built = Body.build(pack, { gender: 1, age: 30 });
    const under = Wardrobe.build(pack, built, [{ id: 'shirt' }, { id: 'suitjacket' }], { atlasSize: 64 });
    const alone = Wardrobe.build(pack, built, [{ id: 'shirt' }], { atlasSize: 64 });
    // The shirt's own fabric (the first garment laid) in the merged parts.
    const shirtTris = out => out.parts.reduce((s, p) => { if (!p.fabricRefs) return s; let n = 0; for (let t = 0; t < p.index.length; t += 3) if (p.fabricRefs[p.index[t] * 2] === 0) n++; return s + n; }, 0);
    assert.ok(shirtTris(under) < shirtTris(alone), 'a covered shirt is not refined for folds no one sees: ' + shirtTris(under) + ' vs ' + shirtTris(alone));
});

test('cloth is refined only where it folds', () => {
    const an = Outfit.anatomy(pack);
    const rest = vert => { const o = [0, 0, 0]; for (const [v, w] of Outfit.weightsOf(vert)) for (let k = 0; k < 3; k++) o[k] += an.rest[v * 3 + k] * w; return o; };
    for (const id of ['jeans', 'sweater']) {
        const [{ spec, piece }] = pieces(id), plain = Outfit.cutFor(pack, Object.assign({}, spec, { folds: null, cutKey: ['construction-plain', id] }));
        assert.ok(piece.index.length > plain.index.length, id + ' gains faces in its fold zones');
        assert.ok(piece.index.length < plain.index.length * 2.6, id + ' does not refine everywhere');
        // Every added vertex lies in (or beside) a fold zone: for draped cloth, where it hangs free to fold (RRCharacterDrape.zone).
        const zone = piece.verts.map((v, i) => piece.drapeProfile ? Drape.zone(piece.drapeProfile, piece.field[i]) : Outfit.foldAt(piece.field[i], piece.edgeDist[i], spec.folds)[0]);
        const nearZone = i => zone[i] > 0.05 || piece.neighbors[i].some(j => zone[j] > 0.1 || piece.neighbors[j].some(k => zone[k] > 0.2));
        piece.verts.forEach((v, i) => { if (v.w) assert.ok(nearZone(i), id + ' refined outside a fold zone'); });
        // Away from the folds the faces keep the helper's own size.
        let far = 0, sum = 0;
        for (let t = 0; t < piece.index.length; t += 3) {
            const c = [piece.index[t], piece.index[t + 1], piece.index[t + 2]];
            if (c.some(i => zone[i] > 0.01)) continue;
            const p = c.map(i => rest(piece.verts[i]));
            sum += Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1], p[0][2] - p[1][2]); far++;
        }
        assert.ok(far > 50 && sum / far > 0.02, id + ' unfolded faces stay coarse: ' + (sum / far).toFixed(4));
    }
});

test('loose sleeves and trouser legs hang instead of following the limb in', () => {
    const built = Body.build(pack, { gender: 0, age: 30 });
    const ankleWidth = id => {
        const [{ spec, piece }] = pieces(id), laid = Outfit.lay(pack, built, piece, spec, {}), knee = built.bones.find(b => b.name === 'LeftLeg').head, foot = built.bones.find(b => b.name === 'LeftFoot').head;
        let r = 0;
        for (let i = 0; i < laid.rimStart; i++) { const f = laid.field[i]; if (f.fam !== 3 || f.s < 1.7 || f.s > 1.85) continue; r = Math.max(r, Math.hypot(laid.positions[i * 3] - (knee[0] + foot[0]) / 2, laid.positions[i * 3 + 2] - (knee[2] + foot[2]) / 2)); }
        return r;
    };
    assert.ok(ankleWidth('jeans') > ankleWidth('leggings') + 0.008, 'trousers fall straight past the calf; leggings follow it');
});

test('typical outfits stay within the triangle budget', () => {
    const built = Body.build(pack, { gender: 1, age: 30 });
    // (Draped cloth is refined where it folds, 2026-10-24: casual 15000 -> 18500, office 25000 -> 28000, winter
    // 25000 -> 31500, medic 16000 -> 16500; measured with the drape on, +1.0-3.5k a preset.)
    // (Dark linings inside open edges, 2026-10-25: a look into a cuff or up a hem meets cloth, not the world behind
    // the model; +2.1-4.2k a preset: casual 20500, office 30500, winter 34000, medic 17500, detective 32000.)
    for (const [preset, most] of [['casual', 20500], ['office', 30500], ['winter', 34000], ['mage', 19000], ['generatedMedic', 17500], ['detective', 32000]]) {
        const out = Wardrobe.build(pack, built, Wardrobe.PRESETS.find(p => p.id === preset).items, { atlasSize: 64 });
        const tris = outfitTris(out.parts);
        assert.ok(tris <= most, preset + ' outfit ' + tris + ' > ' + most);
    }
});

test('a beanie keeps the hair under it, never through it', () => {
    for (const style of ['bunLow', 'long', 'messy']) {
        const result = Model.build(pack, Model.normalize({ gender: style === 'messy' ? 1 : 0, age: 28, hair: { style, color: '#3b2a1e' }, outfit: [{ id: 'beanie' }] }), {}, { static: true, atlasSize: 64, skinSize: 64 });
        const cap = result.parts.filter(p => p.name === 'Beanie'), hair = result.parts.filter(p => /^Hair\b/.test(p.name));
        assert.ok(cap.length && hair.length, style + ': a cap and hair to test');
        const head = result.bones.find(b => b.name === 'Head');
        let cx = 0, cz = 0, n = 0;
        for (const p of cap) for (let i = 0; i < p.positions.length; i += 3) { cx += p.positions[i]; cz += p.positions[i + 2]; n++; }
        const c = [cx / n, head.head[1] + (head.tail[1] - head.head[1]) * 0.45, cz / n];
        const tris = [];
        for (const p of cap) for (let t = 0; t < p.index.length; t += 3) tris.push([0, 1, 2].map(k => Array.from(p.positions.subarray(p.index[t + k] * 3, p.index[t + k] * 3 + 3))));
        // A ray from the skull's middle through each hair point: the cap, where it crosses, must lie beyond the hair.
        let through = 0, checked = 0;
        for (const p of hair) for (let i = 0; i < p.positions.length; i += 3 * 5) {
            const q = [p.positions[i] - c[0], p.positions[i + 1] - c[1], p.positions[i + 2] - c[2]], r = Math.hypot(...q), d = q.map(x => x / r);
            let near = Infinity;
            for (const [a, b, e] of tris) {
                const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [e[0] - a[0], e[1] - a[1], e[2] - a[2]];
                const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
                if (Math.abs(det) < 1e-12) continue;
                const s = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], u = (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]) / det;
                if (u < 0 || u > 1) continue;
                const qq = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = (d[0] * qq[0] + d[1] * qq[1] + d[2] * qq[2]) / det;
                if (v < 0 || u + v > 1) continue;
                const dist = (e2[0] * qq[0] + e2[1] * qq[1] + e2[2] * qq[2]) / det;
                if (dist > 0) near = Math.min(near, dist);
            }
            if (!Number.isFinite(near)) continue;
            checked++;
            if (r > near + 0.001) through++;
        }
        assert.ok(checked > 200, style + ': hair under the cap was sampled (' + checked + ')');
        assert.ok(through <= checked * 0.002, style + ': ' + through + ' of ' + checked + ' hair points poke through the cap');
        // Below the brim the hair is still drawn.
        assert.ok(hair.some(p => p.index.length > 0), style + ': hair below the brim remains');
    }
});
