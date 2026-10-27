/**
 * Firearm bores, optics and the railgun (2026-10-25): every muzzle opens
 * into a bore with depth (a ray down it travels before it hits anything,
 * on the axis and off it), every scope has a recessed lens at both ends
 * with a dark tube behind, and the railgun rifle builds whole: two rails
 * with an open channel between them, insulating cheeks, capacitors, heat
 * sinks, a power cell and charge lights on the model's glow rule.
 */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
global.THREE = require(path.join(root, 'node_modules', 'three'));
const props = path.join(root, 'src', 'forge', 'Props');
const Model = require(path.join(props, 'PropModel.js'));
const Gun = require(path.join(props, 'GunProp.js'));
const Catalog = require(path.join(props, 'PropCatalog.js'));
const fs = require('node:fs');

const tris = r => r.parts.reduce((n, p) => n + p.index.length / 3, 0);
/** The nearest hit along a ray, either facing (Möller–Trumbore): { t, part } or null. */
function cast(parts, o, d, skip) {
    let best = null;
    for (const p of parts) {
        if (skip && skip(p)) continue;
        const P = p.positions, I = p.index;
        for (let k = 0; k < I.length; k += 3) {
            const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
            const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
            const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
            if (Math.abs(det) < 1e-12) continue;
            const f = 1 / det, s = [o[0] - P[a], o[1] - P[a + 1], o[2] - P[a + 2]], u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]);
            if (u < 0 || u > 1) continue;
            const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = f * (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]);
            if (v < 0 || u + v > 1) continue;
            const t = f * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]);
            if (t > 1e-6 && (!best || t < best.t)) best = { t, part: p.name };
        }
    }
    return best;
}
/** How deep the bore is: rays from just in front of the muzzle marker back along -x, on the axis and a little off it in four ways. */
function boreDepths(result, r) {
    const m = result.markers.muzzle, rb = r.barrel.thickness / 2, off = (r.barrelBuild === 'rails' ? rb * 0.5 : rb * 0.58 * 0.45);
    // The saved model lies on its side: gun y is world -z, gun z is world y; the bore runs along world x.
    return [[0, 0], [off, 0], [-off, 0], [0, off], [0, -off]].map(([dy, dz]) => {
        const o = [m[0] + 0.03, m[1] + dz, m[2] - dy], hit = cast(result.parts, o, [-1, 0, 0]);
        return hit ? hit.t - 0.03 : Infinity;
    });
}

test('every muzzle opens into a bore: a ray down it travels before it hits anything', () => {
    const cases = Gun.PRESETS.map(([id]) => ({ preset: id }));
    for (const muzzle of Gun.MUZZLES.map(m => m[0])) for (const preset of ['rifle', 'plasma', 'sniper', 'revolver']) cases.push({ preset, muzzle });
    for (const c of cases) {
        const result = Gun.build(c), r = result.recipe, depths = boreDepths(result, r), min = Math.min(...depths), what = JSON.stringify(c) + ' ' + depths.map(d => d.toFixed(3)).join(' ');
        // A pistol's barrel stands 8 mm out of its slide: its bore is open down to the slide's face.
        assert.ok(min >= (r.slide ? 0.007 : 0.015), what + ': the bore is capped');
        if (r.muzzle === 'emitter' && r.barrelBuild !== 'rails') assert.ok(depths[0] >= 0.06, what + ': an emitter shows a deep throat');
    }
    const plasma = Gun.build({ preset: 'plasma' });
    assert.ok(boreDepths(plasma, plasma.recipe)[0] >= 0.09, 'the plasma cannon is open well down its throat');
    assert.ok(plasma.parts.some(p => p.name === 'Bore glow' && p.emissive && p.emissiveIntensity < 1), 'its focusing rings and core glow faintly');
});

test('every scope has a lens at both ends, facing out, sunk in its housing with a dark tube behind', () => {
    const cases = Gun.PRESETS.filter(p => p[3].sight === 'scope').map(([id]) => ({ preset: id })).concat([{ preset: 'rifle', sight: 'scope' }, { preset: 'smg', sight: 'scope' }]);
    assert.ok(cases.length >= 5);
    for (const c of cases) {
        const result = Gun.build(c), lens = result.parts.find(p => p.name === 'Lens'), what = JSON.stringify(c);
        assert.ok(lens, what + ': a lens part');
        assert.ok(lens.opacity < 1 && lens.roughness < 0.1 && lens.metalness > 0.3, what + ': glass, coated and glossy');
        let front = 0, rear = 0, lo = Infinity, hi = -Infinity;
        for (let i = 0; i < lens.normals.length; i += 3) { if (lens.normals[i] > 0.7) front++; if (lens.normals[i] < -0.7) rear++; lo = Math.min(lo, lens.positions[i]); hi = Math.max(hi, lens.positions[i]); }
        assert.ok(front > 10 && rear > 10, what + ': an objective facing forward and an ocular facing back');
        assert.ok(hi - lo > 0.1, what + ': at the two ends of the tube');
        // Down the scope's axis from in front: the objective is met first (not a cap), the tube behind it is dark.
        const ys = [], zs = [];
        for (let i = 0; i < lens.positions.length; i += 3) if (lens.positions[i] > hi - 0.005) { ys.push(lens.positions[i + 1]); zs.push(lens.positions[i + 2]); }
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
        const first = cast(result.parts, [hi + 0.05, cy, cz], [-1, 0, 0]);
        assert.equal(first.part, 'Lens', what + ': the front is glass');
        let rim = -Infinity;
        for (const p of result.parts.filter(q => q.name === 'Metal')) for (let i = 0; i < p.positions.length; i += 3) if (Math.hypot(p.positions[i + 1] - cy, p.positions[i + 2] - cz) < (Math.max(...ys) - Math.min(...ys)) * 0.9) rim = Math.max(rim, p.positions[i]);
        assert.ok(rim > hi + 0.004, what + ': the objective is recessed in its bell');
        const behind = cast(result.parts, [hi + 0.05, cy, cz], [-1, 0, 0], p => p.name === 'Lens');
        assert.equal(behind.part, 'Details', what + ': a dark tube behind the objective');
        const back = cast(result.parts, [lo - 0.05, cy, cz], [1, 0, 0]);
        assert.equal(back.part, 'Lens', what + ': the eyepiece is glass');
    }
});

test('the railgun rifle builds whole within budget: rails, open channel, cheeks, capacitors, heat sinks, cell, lit charge on the glow rule', () => {
    const type = Catalog.TYPES.find(t => t.id === 'gun-railgun');
    assert.ok(type && type.category === 'scifi' && !type.hidden, 'listed under Sci-fi');
    const result = Model.build(type.start(), {}, {}), r = result.recipe, n = Model.stats(result).triangles;
    assert.equal(r.barrelBuild, 'rails');
    assert.ok(n >= 8000 && n <= 25000, n + ' triangles');
    for (const name of ['Frame', 'Metal', 'Details', 'Conductors', 'Insulators', 'Charge lights', 'Lens', 'Furniture']) assert.ok(result.parts.some(p => p.name === name), name);
    for (const p of result.parts) { assert.ok(p.positions.every(Number.isFinite), p.name); assert.ok(p.normals.every(Number.isFinite), p.name + ' normals'); }
    assert.ok(r.magazine === 'cell' && r.sight === 'scope' && r.stock === 'full' && r.capacitors > 0 && r.vents, 'a power cell, an optic, a stock, capacitors and vents');
    const lights = result.parts.find(p => p.name === 'Charge lights');
    assert.ok(lights.emissive, 'the charge lights glow');
    const rule = result.sidecarExtra.animations.find(a => a.type === 'glow');
    assert.ok(rule && rule.part === 'Charge lights' && rule.trigger === 'always' && rule.min < rule.max, 'they breathe on the glow rule');
    assert.ok(result.sidecarExtra.rig && result.sidecarExtra.rig.template === 'gun', 'still held as a gun');
    for (const k of ['gripTop', 'gripBottom', 'muzzle', 'trigger', 'foreGrip', 'stock']) assert.ok(result.markers[k], 'marker ' + k);
    // Down the channel: clear for most of the rails' length.
    assert.ok(boreDepths(result, r)[0] >= r.barrel.length * 0.8, 'the projectile channel runs open down the rails');
    // Across it: the gap between the rails shows from the side between the cheeks.
    const m = result.markers.muzzle, w = result.parts.find(p => p.name === 'Conductors');
    let x0 = Infinity; for (let i = 0; i < w.positions.length; i += 3) x0 = Math.min(x0, w.positions[i]);
    let clear = 0, probes = 0;
    for (let x = x0 + 0.02; x < m[0] - 0.03; x += 0.01) { probes++; if (!cast(result.parts, [x, m[1] + 0.3, m[2]], [0, -1, 0])) clear++; }
    assert.ok(probes > 20 && clear / probes > 0.5, `the gap shows from the side (${clear}/${probes} clear)`);
    // The rails have a channel between them: hits above and below the gap, from the side.
    // Gun up is the saved model's -z: a rail over the channel and one under it, seen from the side.
    const rb = r.barrel.thickness / 2;
    for (const s of [-1, 1]) assert.ok(cast(result.parts, [m[0] - 0.05, m[1] + 0.3, m[2] - s * rb * 1.6], [0, -1, 0]), 'a rail ' + (s > 0 ? 'over' : 'under') + ' the channel');
});

test('Randomize keeps the railgun a railgun, rolls it among the guns, and every roll builds', () => {
    for (let s = 1; s <= 30; s++) {
        for (const scope of ['shape', 'details', 'colors']) {
            const out = Gun.random(s, { preset: 'railgun' }, scope);
            assert.equal(out.preset, 'railgun'); assert.equal(out.barrelBuild, 'rails', scope);
            const n = tris(Gun.build(out));
            assert.ok(n > 4000 && n <= 30000, scope + ' ' + n);
        }
    }
    let rolled = 0;
    for (let s = 1; s <= 200; s++) { const out = Gun.random(s, { preset: 'pistol' }, 'all'); if (out.preset === 'railgun') { rolled++; assert.equal(out.barrelBuild, 'rails'); } else assert.equal(out.barrelBuild, 'round', out.preset); }
    assert.ok(rolled > 0, 'Randomize all can land on the railgun');
});

test('the new labels are translated in every locale and do not reuse an existing word', () => {
    const text = fs.readFileSync(path.join(root, 'src', 'I18nManager.js'), 'utf8');
    // This block's 17 lines, whatever other blocks come after it.
    const block = text.slice(text.indexOf('// 3D Prop Builder › Firearms (2026-10-25)')).split('\n').slice(1, 18).join('\n');
    const tables = [...block.matchAll(/Object\.assign\(RR_TEXT_TRANSLATIONS\["([^"]+)"\], (\{.*?\})\);/g)].map(m => [m[1], JSON.parse(m[2])]);
    assert.equal(tables.length, 17);
    const src = fs.readFileSync(path.join(props, 'GunProp.js'), 'utf8');
    for (const word of ['Railgun rifle', 'Barrel build', 'Round barrel', 'Twin conductor rails', 'Capacitor banks', 'Conductors', 'Insulators', 'Bore glow', 'Charge lights']) {
        assert.ok(src.includes(`'${word}'`), word + ' is used');
        assert.equal(text.split(`"${word}":`).length - 1, 17, word + ': only this block names it');
        for (const [locale, table] of tables) assert.ok(table[word] && table[word] !== word, locale + ' ' + word);
    }
});
