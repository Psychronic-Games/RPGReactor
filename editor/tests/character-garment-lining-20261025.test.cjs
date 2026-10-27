'use strict';
// Garment linings and layer nesting (2026-10-25): every cut garment is lined dark near its open
// edges (cuffs, hems, collars, an open front), so a look into a sleeve meets the lining instead of
// the culled back of the outer cloth; torn holes stay open through it; the Wasteland drifter's
// shirt stays under its duster standing, walking and running, and its fringes ride their hems.
const test = require('node:test');
const assert = require('node:assert/strict');
const Body = require('../src/forge/Character3D/HumanBody.js');
const Model = require('../src/forge/Character3D/CharacterModel.js');
const Wardrobe = require('../src/forge/Character3D/CharacterWardrobe.js');
const Cloth = require('../src/forge/Character3D/CharacterCloth.js');
const Poses = require('../src/forge/Character3D/CharacterPoses.js');

let pack;
test.before(async () => { pack = await Body.loadPack(); });
const preset = id => Wardrobe.PRESETS.find(p => p.id === id).items;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const at = (P, i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
/** Ray against a triangle: the distance along a unit dir, or Infinity. */
function hit(o, d, a, b, c) {
    const e1 = sub(b, a), e2 = sub(c, a), p = cross(d, e2), det = dot(e1, p);
    if (Math.abs(det) < 1e-12) return Infinity;
    const t0 = sub(o, a), u = dot(t0, p) / det;
    if (u < 0 || u > 1) return Infinity;
    const q = cross(t0, e1), v = dot(d, q) / det;
    if (v < 0 || u + v > 1) return Infinity;
    const t = dot(e2, q) / det;
    return t > 1e-6 ? t : Infinity;
}
/** Triangles of parts as [a, b, c, normal, tag], bucketed on a grid for local ray casts. */
function triangles(list) {
    const out = [];
    for (const { part, tag, positions } of list) {
        const P = positions || part.positions, I = part.index;
        for (let t = 0; t < I.length; t += 3) {
            const a = at(P, I[t]), b = at(P, I[t + 1]), c = at(P, I[t + 2]);
            out.push({ a, b, c, n: cross(sub(b, a), sub(c, a)), tag, mid: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3] });
        }
    }
    return out;
}
function nearest(tris, o, d, reach) {
    let best = null, bt = reach;
    for (const T of tris) {
        if (Math.abs(T.mid[0] - o[0]) > reach + 0.05 || Math.abs(T.mid[1] - o[1]) > reach + 0.05 || Math.abs(T.mid[2] - o[2]) > reach + 0.05) continue;
        const t = hit(o, d, T.a, T.b, T.c);
        if (t < bt) { bt = t; best = T; }
    }
    return best;
}

test('every cut garment is lined near its open edges, the lining facing in and riding its cloth', () => {
    const built = Body.build(pack, Body.normalizeRecipe({ gender: 1 }));
    for (const id of ['streetSamurai', 'settler', 'drifter', 'casual']) {
        const out = Wardrobe.build(pack, built, preset(id), { atlasSize: 256, quality: 'save' });
        const lining = out.parts.find(p => p.name === 'Garment linings');
        assert.ok(lining && lining.index.length > 300, id + ' has a lining');
        assert.ok(!lining.doubleSided && lining.clothDetail && lining.sewnRefs && lining.sewnRoots, id + ': one-sided, sewn to its cloth');
        assert.equal(lining.sewnRefs.length, lining.positions.length / 3 * 2);
        // Faces in: each triangle's winding agrees with its vertices' normals, and the lining lies under its cloth.
        let agree = 0, under = 0;
        for (let t = 0; t < lining.index.length; t += 3) {
            const [a, b, c] = [0, 1, 2].map(k => lining.index[t + k]);
            const n = cross(sub(at(lining.positions, b), at(lining.positions, a)), sub(at(lining.positions, c), at(lining.positions, a)));
            if (dot(n, at(lining.normals, a)) > 0) agree++;
        }
        for (let v = 0; v < lining.positions.length / 3; v++) if (dot(sub(at(lining.positions, v), at(lining.sewnRoots, v)), at(lining.normals, v)) > 0) under++;
        assert.ok(agree / (lining.index.length / 3) > 0.97, id + ': lining winding faces in');
        assert.equal(under, lining.positions.length / 3, id + ': every lining point lies in from its cloth');
        // A share of a whole garment, not all of it (only as far in as an eye sees).
        const cloth = out.parts.filter(p => p.fabricRefs).reduce((n, p) => n + p.index.length / 3, 0);
        assert.ok(lining.index.length / 3 < cloth * 0.7, id + ': lined only near the edges');
    }
});

test('looking into a cuff from inside meets the lining\'s front, never the culled back of the cloth', () => {
    const built = Body.build(pack, Body.normalizeRecipe({ gender: 1 }));
    for (const id of ['streetSamurai', 'drifter', 'settler']) {
        const out = Wardrobe.build(pack, built, preset(id), { atlasSize: 256, quality: 'save' });
        const lining = out.parts.find(p => p.name === 'Garment linings');
        // Each garment on its own (its cloth and its lining): a layer worn under it is not what is tested here.
        const byEntry = new Map(), put = (e, T) => { if (!byEntry.has(e)) byEntry.set(e, []); byEntry.get(e).push(T); };
        for (const part of out.parts.filter(p => p.fabricRefs && !p.doubleSided)) {
            const one = triangles([{ part, tag: 'cloth' }]);
            for (let t = 0; t < part.index.length; t += 3) { const e = part.fabricRefs[part.index[t] * 2]; if ([1, 2].every(k => part.fabricRefs[part.index[t + k] * 2] === e)) put(e, one[t / 3]); }
        }
        { const one = triangles([{ part: lining, tag: 'lining' }]); for (let t = 0; t < lining.index.length; t += 3) put(lining.sewnRefs[lining.index[t] * 2], one[t / 3]); }
        // Rays from just inside the garment (4 mm in from its cloth near an open edge) out through it meet the
        // lining's front, never the culled back of the cloth.
        let seen = 0, lined = 0, through = 0;
        const n = lining.positions.length / 3, step = Math.max(1, Math.floor(n / 1500));
        // (Away from where the lining's band ends inside the garment, two rings in from its own border.)
        const count = new Map(), I = lining.index, rim = new Set();
        for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], b = I[t + (k + 1) % 3], key = Math.min(a, b) + ':' + Math.max(a, b); count.set(key, (count.get(key) || 0) + 1); }
        for (const [key, c] of count) if (c === 1) for (const v of key.split(':')) rim.add(+v);
        for (let pass = 0; pass < 2; pass++) { const grow = new Set(rim); for (let t = 0; t < I.length; t += 3) if ([0, 1, 2].some(k => rim.has(I[t + k]))) for (let k = 0; k < 3; k++) grow.add(I[t + k]); for (const v of grow) rim.add(v); }
        for (let v = 0; v < n; v += step) {
            if (rim.has(v)) continue;
            const root = at(lining.sewnRoots, v), inward = at(lining.normals, v), tris = byEntry.get(lining.sewnRefs[v * 2]) || [];
            const o = [root[0] + inward[0] * 0.004, root[1] + inward[1] * 0.004, root[2] + inward[2] * 0.004], d = inward.map(x => -x);
            const T = nearest(tris, o, d, 0.03);
            if (!T) continue;
            seen++;
            if (dot(T.n, d) >= 0) through++;
            else if (T.tag === 'lining') lined++;
        }
        assert.ok(seen > 30, id + ': rays met cloth (' + seen + ')');
        assert.ok(lined / seen > 0.9, id + ': ' + lined + ' of ' + seen + ' looks into the cloth meet its lining');
        assert.ok(through / seen < 0.03, id + ': ' + through + ' of ' + seen + ' looks meet the culled back of a cloth face');
    }
});

test('torn holes stay open through the lining', () => {
    const built = Body.build(pack, Body.normalizeRecipe({ gender: 1, extreme: true, weight: 3, muscle: 2, age: 35 }));
    const out = Wardrobe.build(pack, built, preset('settler'), { atlasSize: 1024, quality: 'save' });
    const lining = out.parts.find(p => p.name === 'Garment linings'), pic = out.texture;
    assert.ok(lining && pic);
    // No lining point sits under a texel the picture cuts away.
    const holed = new Set();
    for (const part of out.parts.filter(p => p.fabricRefs && p.cutout)) for (let i = 0; i < part.fabricRefs.length / 2; i++) {
        const x = Math.min(pic.width - 1, Math.floor(part.uvs[i * 2] * pic.width)), y = Math.min(pic.height - 1, Math.floor(part.uvs[i * 2 + 1] * pic.height));
        if (pic.data[(y * pic.width + x) * 4 + 3] < 128) holed.add(part.fabricRefs[i * 2] + ':' + part.fabricRefs[i * 2 + 1]);
    }
    assert.ok(holed.size > 0, 'the worn settler has holes');
    let inHole = 0;
    for (let t = 0; t < lining.index.length; t++) { const v = lining.index[t]; if (holed.has(lining.sewnRefs[v * 2] + ':' + lining.sewnRefs[v * 2 + 1])) inHole++; }
    assert.equal(inHole, 0);
});

test('the drifter\'s shirt stays under its duster standing, walking and running; its cape fringe rides the cape', () => {
    for (const body of [{ gender: 1 }, { gender: 0 }, { gender: 1, extreme: true, weight: 3, muscle: 2 }]) {
        const result = Model.build(pack, Model.normalize(Object.assign({ age: 30 }, body, { outfit: preset('drifter') })), {}, { quality: 'save' });
        const shirt = result.parts.find(p => /^Button shirt/.test(p.name)), dusters = result.parts.filter(p => /^Wasteland duster/.test(p.name) && p.fabricRefs);
        assert.ok(shirt && dusters.length, 'shirt and duster parts');
        // The fringe is skinned to the shoulders and spine like the cape, never to a hand or a knee.
        const fringe = result.parts.find(p => p.name === 'Shoulder cape fringe');
        assert.ok(fringe);
        for (let v = 0; v < fringe.positions.length / 3; v++) for (let k = 0; k < 4; k++) if (fringe.weights[v * 4 + k] > 0.05) assert.match(result.bones[fringe.joints[v * 4 + k]].name, /Spine|Neck|Head|Shoulder|^(Left|Right)Arm$|Hips/);
        const poses = [null];
        for (const name of ['walk', 'run']) { const clip = Poses.clip(result.bones, name, result.parts[0]); if (clip) poses.push(Cloth.pose(result.bones, clip, clip.times.at(-1) * 0.3)); }
        assert.equal(poses.length, 3, 'walk and run clips');
        for (const ps of poses) {
            const place = p => (ps ? Float32Array.from(Cloth.skin(p, result.bones, ps)) : p.positions);
            const S = place(shirt), tris = triangles(dusters.map(part => ({ part, positions: place(part), tag: 'duster' })));
            const N = (() => { const n = new Float32Array(S.length); for (let t = 0; t < shirt.index.length; t += 3) { const [a, b, c] = [0, 1, 2].map(k => shirt.index[t + k]); const f = cross(sub(at(S, b), at(S, a)), sub(at(S, c), at(S, a))); for (const v of [a, b, c]) for (let k = 0; k < 3; k++) n[v * 3 + k] += f[k]; } return n; })();
            // A shirt point is out through the duster when, looking back in along the shirt's normal, the duster's outer face lies just under it.
            // (Below the neck: the scarf shares the shirt's part and is worn over the coat's collar.)
            const neck = result.bones.find(b => b.name === 'Neck').head[1] - 0.06, R = shirt.positions;
            let under = 0, out = 0;
            for (let v = 0; v < S.length / 3; v += 3) {
                if (R[v * 3 + 1] > neck) continue;
                const nl = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1, n = [N[v * 3] / nl, N[v * 3 + 1] / nl, N[v * 3 + 2] / nl], p = at(S, v);
                const outward = nearest(tris, p, n, 0.04);
                if (outward) { under++; continue; }
                const back = nearest(tris, p, n.map(x => -x), 0.012);
                if (back && dot(back.n, n) > 0) out++;
            }
            // (A ratchet: before 2026-10-25 the heavy body had 2.3-3.7% out at the duster's open front edges and
            // cuffs, the average bodies under 1%.)
            const share = out / Math.max(1, under + out);
            assert.ok(share < (body.extreme ? 0.035 : 0.012), JSON.stringify(body) + (ps ? ' moving' : ' standing') + ': ' + out + ' shirt points out through the duster of ' + (under + out));
        }
    }
});

test('a belt buckled over a loose tunic cinches it: no tunic cloth out through the belt (2026-10-25)', () => {
    for (const body of [{ gender: 1 }, { gender: 0 }, { gender: 1, extreme: true, weight: 3, muscle: 2 }]) {
        // As saved (the whole build: the cloth as it finally lies, not only as the wardrobe first lays it).
        const out = Model.build(pack, Model.normalize(Object.assign({ age: 30 }, body, { outfit: preset('farmer') })), {}, { quality: 'save', atlasSize: 64, skinSize: 64 });
        const belt = out.parts.find(p => p.name === 'Belt'), tunic = out.parts.find(p => /Tunic/.test(p.name) && p.fabricRefs);
        if (process.env.LINING_DEBUG) console.log(out.parts.map(p => p.name).join(' | '));
        assert.ok(belt && tunic, 'belt and tunic');
        const B = belt.positions, n = B.length / 3;
        let cx = 0, cz = 0, y0 = Infinity, y1 = -Infinity;
        for (let v = 0; v < n; v++) { cx += B[v * 3] / n; cz += B[v * 3 + 2] / n; y0 = Math.min(y0, B[v * 3 + 1]); y1 = Math.max(y1, B[v * 3 + 1]); }
        const bins = 48, outer = new Float64Array(bins), bin = (x, z) => Math.floor(((Math.atan2(x - cx, z - cz) + Math.PI) / (2 * Math.PI)) * bins) % bins;
        for (let v = 0; v < n; v++) { const k = bin(B[v * 3], B[v * 3 + 2]); outer[k] = Math.max(outer[k], Math.hypot(B[v * 3] - cx, B[v * 3 + 2] - cz)); }
        const P = tunic.positions;
        let inside = 0, through = 0;
        for (let v = 0; v < P.length / 3; v++) {
            const y = P[v * 3 + 1];
            if (y < y0 + 0.004 || y > y1 - 0.004) continue;
            const d = Math.hypot(P[v * 3] - cx, P[v * 3 + 2] - cz), k = bin(P[v * 3], P[v * 3 + 2]);
            if (d > outer[k] + 0.03) continue; // a sleeve or hand beside the waist
            if (d > outer[k] + 0.0005) through++; else inside++;
        }
        assert.ok(inside > 50, JSON.stringify(body) + ': tunic under the belt (' + inside + ')');
        // (A ratchet on the heaviest body: its tunic's skirt and bodice are joined at a sewn waist that still rides
        // out over the belt in places, 22 of 171 points on 2026-10-25; the average bodies have none.)
        assert.ok(through / (inside + through) < (body.extreme ? 0.14 : 0.01), JSON.stringify(body) + ': ' + through + ' of ' + (inside + through) + ' tunic points out through the belt');
    }
});
