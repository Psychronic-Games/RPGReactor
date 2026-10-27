'use strict';
// Cyberpunk clothing and cyber armor (2026-10-24): techwear with bonded panels and recessed light
// channels, layered cyber armor in the four shared cyber styles, and one-click presets.
const test = require('node:test');
const assert = require('node:assert/strict');
const Body = require('../src/forge/Character3D/HumanBody.js');
const Wardrobe = require('../src/forge/Character3D/CharacterWardrobe.js');
const Cyber = require('../src/forge/Character3D/CharacterCyberwear.js');
const Model = require('../src/forge/Character3D/CharacterModel.js');
let pack;
test.before(async () => { pack = await Body.loadPack(); });

const CYBER = Wardrobe.GARMENTS.filter(g => g.group === 'Cyberpunk');
const PRESETS = Wardrobe.PRESETS.filter(p => p.group === 'Cyberpunk');
const preset = id => Wardrobe.PRESETS.find(p => p.id === id).items;
const LABELS = CYBER.map(g => g.label);
/** Parts this module adds (bonded hardware and armor), by their garment's label. */
const added = parts => parts.filter(p => LABELS.some(l => p.name.startsWith(l + ' ')));
const tris = parts => parts.reduce((n, p) => n + p.index.length / 3, 0);
const wear = (outfit, gender = 1) => {
    const body = Body.build(pack, Body.normalizeRecipe({ gender }));
    return { body, wear: Wardrobe.build(pack, body, outfit, { atlasSize: 64 }) };
};

test('the catalog: soft techwear and hard armor in their own group, each with a Style, colors and a light', () => {
    const ids = CYBER.map(g => g.id);
    for (const id of ['techJacket', 'cyberTrench', 'cyberBomber', 'techSmock', 'cyberJoggers', 'compressionSuit', 'smartShirt', 'utilityRig', 'techGloves', 'magSoles', 'cyberChest', 'cyberPauldrons', 'cyberBracers', 'cyberLegs'])
        assert.ok(ids.includes(id), id + ' is in the wardrobe');
    for (const g of CYBER) {
        assert.ok(Array.isArray(g.styles) && g.styles.length >= 2, g.id + ' has a Style choice');
        assert.ok(g.defaults.lightStyle != null, g.id + ' shows the light controls');
        assert.ok(g.styles.some(s => s[0] === g.defaults.style), g.id + ' defaults to one of its styles');
    }
    // Armor offers the four cyber styles the body mods share.
    for (const id of ['cyberChest', 'cyberPauldrons', 'cyberBracers', 'cyberLegs'])
        assert.deepEqual(Wardrobe.BY_ID.get(id).styles.map(s => s[0]), ['sleek', 'military', 'salvaged', 'neon']);
    assert.ok(PRESETS.length >= 7, 'at least seven one-click outfits');
    for (const p of PRESETS) for (const it of p.items) assert.ok(Wardrobe.BY_ID.get(it.id), p.id + ' uses a known garment ' + it.id);
});

test('styles and lights round-trip through a saved recipe; an unknown style falls back', () => {
    for (const g of CYBER) for (const [style] of g.styles) {
        const item = Wardrobe.normalizeItem({ id: g.id, style, lightColor: '#12AB34', lightIntensity: 0.4, lightStyle: 'circuits' });
        const again = Wardrobe.normalizeItem(JSON.parse(JSON.stringify(item)));
        assert.equal(again.style, style);
        assert.equal(again.lightColor, '#12ab34');
        assert.equal(again.lightStyle, 'circuits');
    }
    assert.equal(Wardrobe.normalizeItem({ id: 'cyberChest', style: 'nope' }).style, 'military');
    const r = Model.normalize({ gender: 1, outfit: preset('cyberEnforcer') });
    assert.deepEqual(Model.normalize(JSON.parse(JSON.stringify(r))).outfit, r.outfit);
});

test('every preset builds; its glowing parts are emissive, its bonded parts are sewn to their cloth', () => {
    for (const p of PRESETS) {
        const { wear: w } = wear(p.items, p.id === 'neonPunk' ? 0 : 1);
        const mine = added(w.parts);
        assert.ok(mine.length > 0, p.id + ' has cyber parts');
        for (const part of w.parts) for (const x of part.positions) assert.ok(Number.isFinite(x), p.id + ': ' + part.name + ' has finite points');
        const lights = mine.filter(q => q.emissive && q.index.length);
        assert.ok(lights.length > 0 && lights.every(q => q.emissiveIntensity > 0), p.id + ' has lit channels');
        for (const q of mine.filter(q => q.sewnRefs)) {
            assert.equal(q.sewnRefs.length, q.positions.length / 3 * 2, q.name + ': one fabric vertex per point');
            assert.equal(q.sewnRoots.length, q.positions.length, q.name + ': a root per point');
            assert.ok(q.clothDetail, q.name + ' rides its cloth');
        }
    }
});

test('soft techwear: recessed light channels between raised lips; laminated panels stand off the cloth', () => {
    const { wear: w } = wear([{ id: 'techJacket', style: 'diagonal' }, { id: 'cyberJoggers', style: 'seams' }]);
    const lights = w.parts.find(p => p.name === 'Techwear jacket lights'), lips = w.parts.find(p => p.name === 'Techwear jacket tapes');
    assert.ok(lights && lights.index.length / 3 > 40, 'the jacket has light channels');
    assert.ok(lips && lips.index.length / 3 > lights.index.length / 3, 'each channel has its lips');
    assert.ok(w.parts.find(p => p.name === 'Techwear jacket panels'), 'laminated yokes and panels');
    assert.ok(w.parts.find(p => p.name === 'Tech joggers lights'), 'the joggers have their seams lit');
    // Lights off: no lit channel at all.
    const off = wear([{ id: 'techJacket', lightStyle: 'none' }]).wear;
    assert.ok(!off.parts.some(p => p.name === 'Techwear jacket lights' && p.emissiveIntensity > 0), 'light layout None switches the channels off');
});

test('cyber armor: each style builds plates, frames and lights of its own', () => {
    const counts = {};
    for (const style of ['sleek', 'military', 'salvaged', 'neon']) {
        const { wear: w } = wear([{ id: 'compressionSuit', style: 'plain' }, ...['cyberChest', 'cyberPauldrons', 'cyberBracers', 'cyberLegs'].map(id => ({ id, style }))]);
        const plates = w.parts.filter(p => / plates$/.test(p.name) && /^Cyber/.test(p.name));
        assert.equal(plates.length, 4, style + ': chest, pauldrons, bracers and legs');
        assert.ok(plates.every(p => p.finish && (p.armorUvs || p.uvs)), style + ': plates take the tiled armor finish');
        counts[style] = { frames: tris(w.parts.filter(p => / frames$/.test(p.name))), glass: tris(w.parts.filter(p => / glass$/.test(p.name))), lights: tris(w.parts.filter(p => /^Cyber.* lights$/.test(p.name))) };
    }
    assert.ok(counts.military.frames > counts.sleek.frames, 'military plate is bolted, sleek is not');
    assert.ok(counts.neon.lights > counts.military.lights, 'the glowing style has the most light');
    assert.ok(counts.neon.glass > 0, 'the glowing style has translucent inlays');
});

test('the light painted into cloth: a smart shirt glows in its pattern, none when switched off', () => {
    const p = { val: 1, fam: 0, s: 2.5, ang: 0, rest: [0.04, 1.25, 0.1] };
    let lit = 0;
    for (const style of ['hex', 'pulse', 'rain']) for (let k = 0; k < 400; k++) {
        const q = Object.assign({}, p, { rest: [-0.12 + (k % 20) * 0.012, 1.0 + Math.floor(k / 20) * 0.02, 0.1] });
        lit += Cyber.glowMask({ id: 'smartShirt', style, lightStyle: 'strips', lightIntensity: 0.8 }, q) > 0.3 ? 1 : 0;
        assert.equal(Cyber.glowMask({ id: 'smartShirt', style, lightStyle: 'none', lightIntensity: 0.8 }, q), 0);
    }
    assert.ok(lit > 60, 'patterns light part of the cloth: ' + lit);
});

test('coverage: a compression suit hides the skin under it; armor over clothes does not cut into a sleeve', () => {
    const { wear: w } = wear([{ id: 'compressionSuit' }]);
    assert.ok(w.hidden.size > 3000, 'the suit covers the body: ' + w.hidden.size);
    // Bracers over a jacket's sleeve sit outside it (fitted over every cloth layer).
    const { wear: v, body } = wear([{ id: 'techJacket' }, { id: 'cyberBracers', style: 'military' }]);
    const plates = v.parts.find(p => p.name === 'Cyber bracers plates'), sleeve = v.parts.filter(p => /Techwear jacket/.test(p.name) && !/lights|tapes|panels|hardware/.test(p.name));
    const A = body.bones.find(b => b.name === 'LeftForeArm').head, B = body.bones.find(b => b.name === 'LeftHand').head, d = [0, 1, 2].map(k => B[k] - A[k]), L = Math.hypot(...d);
    // Distance from the forearm's axis, for points along its middle (t 0.45..0.75).
    const radial = (P, i) => { const q = [P[i] - A[0], P[i + 1] - A[1], P[i + 2] - A[2]], t = (q[0] * d[0] + q[1] * d[1] + q[2] * d[2]) / (L * L); if (t < 0.45 || t > 0.75) return null; return Math.hypot(q[0] - d[0] * t, q[1] - d[1] * t, q[2] - d[2] * t); };
    let sleeveR = 0; for (const p of sleeve) for (let i = 0; i < p.positions.length; i += 3) { const r = radial(p.positions, i); if (r != null && r < 0.08) sleeveR = Math.max(sleeveR, r); }
    let inside = 0, n = 0;
    for (let i = 0; i < plates.positions.length; i += 3) { const r = radial(plates.positions, i); if (r == null || r > 0.1) continue; n++; if (r < sleeveR * 0.9) inside++; }
    assert.ok(n > 0 && inside / n < 0.1, 'bracer plates stand over the sleeve (' + inside + '/' + n + ' inside, sleeve ' + sleeveR.toFixed(3) + ')');
});

test('budgets at saved quality: what this module adds, and the whole outfit, stay bounded', async () => {
    const eyeSource = { width: 4, height: 4, data: new Uint8Array(64).fill(128) };
    for (const id of ['techCourier', 'cyberEnforcer', 'glowRunner']) {
        const built = Model.build(pack, Model.normalize({ gender: 1, age: 30, outfit: preset(id) }), {}, { quality: 'save', eyeSource });
        const outfit = built.parts.filter(p => !/^(Body|Eyes|Hair|Brows|Lashes|Head|Teeth|Tongue|Fur|Body hair)/i.test(p.name));
        const mine = tris(added(built.parts)), all = tris(outfit);
        assert.ok(mine <= 24000, id + ': cyber hardware and armor ' + mine + ' triangles');
        assert.ok(all <= 42000, id + ': whole outfit ' + all + ' triangles');
    }
});
