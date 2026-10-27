/**
 * Firearm detail uplift (2026-10-24): the shared chamfered hard-surface
 * plate (HardSurface.js), the rebuilt receivers per style, their budgets,
 * the grip's tangent frame (it rendered black under its normal map), the
 * hand-rig markers staying where they were, and the upright preview pose.
 */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
global.THREE = require(path.join(root, 'node_modules', 'three'));
const props = path.join(root, 'src', 'forge', 'Props');
const HS = require(path.join(props, 'HardSurface.js'));
const Model = require(path.join(props, 'PropModel.js'));
const Gun = require(path.join(props, 'GunProp.js'));

const tris = m => m.index.length / 3;
/** Edges by exact position: every edge of a closed solid is shared by an even number of faces (degenerate faces left out). */
function oddEdges(meshes) {
    const P = [], I = [];
    for (const m of meshes) { const o = P.length / 3; P.push(...m.positions); for (const i of m.index) I.push(i + o); }
    const key = i => [0, 1, 2].map(k => P[i * 3 + k].toFixed(7)).join(','), E = new Map();
    for (let t = 0; t < I.length; t += 3) {
        const ks = [0, 1, 2].map(e => key(I[t + e]));
        if (new Set(ks).size < 3) continue;
        for (let e = 0; e < 3; e++) { const a = ks[e], b = ks[(e + 1) % 3], k = a < b ? a + '|' + b : b + '|' + a; E.set(k, (E.get(k) || 0) + 1); }
    }
    return [...E.values()].filter(v => v % 2).length;
}
function volume(m) {
    let v = 0; const P = m.positions;
    for (let t = 0; t < m.index.length; t += 3) {
        const [a, b, c] = [0, 1, 2].map(k => m.index[t + k] * 3);
        v += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
    }
    return v;
}
/** Faces whose winding disagrees with their vertex normals. */
function againstNormals(m) {
    let bad = 0; const P = m.positions, N = m.normals;
    for (let t = 0; t < m.index.length; t += 3) {
        const [a, b, c] = [0, 1, 2].map(k => m.index[t + k] * 3);
        const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
        const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        if (Math.hypot(...f) < 1e-14) continue;
        if (f[0] * (N[a] + N[b] + N[c]) + f[1] * (N[a + 1] + N[b + 1] + N[c + 1]) + f[2] * (N[a + 2] + N[b + 2] + N[c + 2]) < 0) bad++;
    }
    return bad;
}
/** three's own tangents for a part: every one on a visible face finite and non-zero, or the normal map turns the part black. */
function badTangents(part) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(part.positions), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(part.normals), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(part.uvs), 2));
    g.setIndex(new THREE.BufferAttribute(Uint32Array.from(part.index), 1));
    g.computeTangents();
    // Corners of faces with area (a zero-radius ring or a folded chamfer corner draws nothing).
    const T = g.getAttribute('tangent').array, P = part.positions, I = part.index, used = new Set();
    for (let t = 0; t < I.length; t += 3) {
        const [a, b, c] = [I[t], I[t + 1], I[t + 2]], e1 = [0, 1, 2].map(k => P[b * 3 + k] - P[a * 3 + k]), e2 = [0, 1, 2].map(k => P[c * 3 + k] - P[a * 3 + k]);
        if (Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) > 1e-12) used.add(a).add(b).add(c);
    }
    let bad = 0;
    for (const v of used) { const t = [T[v * 4], T[v * 4 + 1], T[v * 4 + 2]]; if (!t.every(Number.isFinite) || Math.hypot(...t) < 1e-6) bad++; }
    return bad;
}

test('HardSurface.plate: a closed chamfered solid, its chamfer strips flat at 45 degrees, cheap', () => {
    const plate = HS.plate(HS.rect(0, 0, 0.1, 0.05), 0.02, 0.003);
    assert.equal(tris(plate), 28, 'a rectangle plate is 28 triangles');
    assert.equal(oddEdges([plate]), 0, 'closed');
    assert.equal(againstNormals(plate), 0, 'wound with its normals');
    const v = volume(plate);
    assert.ok(v > 0.1 * 0.05 * 0.02 * 0.95 && v < 0.1 * 0.05 * 0.02, 'a little under the box: ' + v);
    // Flat shading: the chamfer strips carry their own normals, tilted 45 degrees out of the face.
    let chamfer = 0, face = 0, side = 0;
    for (let i = 0; i < plate.normals.length; i += 3) { const nz = Math.abs(plate.normals[i + 2]); if (Math.abs(nz - Math.SQRT1_2) < 1e-3) chamfer++; else if (nz > 0.999) face++; else if (nz < 1e-3) side++; }
    assert.ok(chamfer >= 32 && face >= 8 && side >= 16, `chamfer ${chamfer}, face ${face}, side ${side} vertices`);
    const box = HS.chamferedBox([0, 0, 0], [0.1, 0.05, 0.02], 0.003);
    assert.equal(tris(box), 44, 'a chamfered box is 44 triangles');
    assert.equal(oddEdges([box]), 0);
    assert.equal(againstNormals(box), 0);
});

test('HardSurface.plate: holes, recessed panels apart, concave outlines and frames stay closed and outward', () => {
    const holed = HS.plate(HS.rect(0, 0, 0.1, 0.05), 0.02, 0.003, { holes: [HS.rect(0.02, 0.01, 0.08, 0.04)] });
    assert.equal(oddEdges([holed]), 0);
    assert.ok(Math.abs(volume(holed) - (0.1 * 0.05 - 0.06 * 0.03) * 0.02) < 6e-6, 'the hole goes through');
    const recessed = HS.plate(HS.rect(0, 0, 0.1, 0.05), 0.02, 0.003, { inset: [{ outline: HS.slot(0.05, 0.025, 0.06, 0.01), depth: 0.004, apart: true }, { margin: 0.006, depth: 0.002, side: 'back' }] });
    assert.ok(recessed.floor && tris(recessed.floor) > 0, 'an apart recess floor comes back for its own material');
    assert.equal(oddEdges([recessed, recessed.floor]), 0, 'body and floor close together');
    assert.equal(againstNormals(recessed) + againstNormals(recessed.floor), 0);
    assert.ok(volume(recessed) + volume(recessed.floor) < 0.1 * 0.05 * 0.02, 'the recesses take material out');
    // A row of identical cuts shares lines; the face still triangulates without slivers.
    const ribs = [];
    for (let k = 0; k < 9; k++) ribs.push({ outline: HS.rect(0.01 + k * 0.009, 0.01, 0.015 + k * 0.009, 0.04), depth: 0.001, side: 'both' });
    assert.equal(oddEdges([HS.plate(HS.rect(0, 0, 0.1, 0.05), 0.02, 0.002, { inset: ribs })]), 0, 'a row of cuts');
    // Corners cut smaller than the chamfer fold instead of turning inside out.
    assert.equal(oddEdges([HS.plate(HS.cut(HS.rect(0, 0, 0.2, 0.02), [0.0015, 0.004, 0.005, 0.0025]), 0.022, 0.003)]), 0, 'small corner cuts');
    const concave = HS.plate(HS.round(HS.cut([[0, 0], [0.1, 0], [0.1, 0.03], [0.05, 0.03], [0.05, 0.06], [0, 0.06]], 0.01, [1]), 0.008, 3, [3]), 0.02, 0.002);
    assert.equal(oddEdges([concave]), 0); assert.equal(againstNormals(concave), 0); assert.ok(volume(concave) > 0);
    for (const frame of [{ o: [1, 2, 3], u: [0, 0, 1], v: [0, 1, 0], n: [-1, 0, 0] }, { o: [0, 0, 0], u: [0, 0, 1], v: [0, 1, 0], n: [1, 0, 0] }]) {
        const placed = HS.plate(HS.rect(0, 0, 0.1, 0.05), 0.02, 0.003, { frame });
        assert.equal(againstNormals(placed), 0, 'placed on a plane, mirrored or not');
        assert.ok(Math.abs(volume(placed) - volume(HS.plate(HS.rect(0, 0, 0.1, 0.05), 0.02, 0.003))) < 1e-9);
    }
    assert.equal(badTangents(recessed), 0, 'uvs give every corner a tangent frame');
});

test('every firearm type builds within the detail budget, every style on every family', () => {
    const counts = {};
    for (const [id] of Gun.PRESETS) {
        const r = Model.build({ kind: 'gun', preset: id }, {}, {}), n = Model.stats(r).triangles;
        counts[id] = n;
        assert.ok(n >= 2000 && n <= 25000, `${id}: ${n} triangles (2k to 25k)`);
        assert.ok(r.parts.some(p => p.name === 'Frame') && r.parts.some(p => p.name === 'Metal'), id + ' frame and metal');
        assert.ok(r.parts.some(p => p.name === 'Details'), id + ' dark ports and recesses');
        if (r.recipe.coils || r.recipe.muzzle === 'emitter') assert.ok(r.parts.some(p => p.name === 'Glow' && p.emissive), id + ' glows');
    }
    assert.ok(counts.rifle > 6000 && counts.plasma > 12000, 'the long guns spend their budget');
    for (const [style] of Gun.STYLES) for (const preset of ['pistol', 'revolver', 'rifle', 'plasma']) for (const extra of [{}, { magazine: 'drum', stock: 'full', rails: true, forend: true, sight: 'iron', coils: 8, vents: true, muzzle: 'flash' }]) {
        const r = Model.build(Object.assign({ kind: 'gun', preset, style }, extra), {}, {}), what = JSON.stringify({ preset, style, extra });
        assert.equal(r.recipe.style, style, what);
        assert.ok(Model.stats(r).triangles <= 45000, what + ' ' + Model.stats(r).triangles);
        for (const p of r.parts) { assert.ok(p.positions.every(Number.isFinite), what + ' ' + p.name); assert.ok(p.normals.every(Number.isFinite), what + ' normals'); }
    }
});

test('saved recipes from before the styles still load: each preset brings its own receiver style', () => {
    const expected = { pistol: 'slide', revolver: 'classic', rifle: 'carbine', shotgun: 'classic', smg: 'stamped', sniper: 'bolt', blasterPistol: 'monocoque', blasterRifle: 'truss', plasma: 'heavy', laser: 'monocoque', railgun: 'monocoque' };
    for (const [id] of Gun.PRESETS) {
        const old = Gun.normalize({ preset: id });
        delete old.style;
        assert.equal(Gun.normalize(old).style, expected[id], id);
        assert.ok(Model.build(Object.assign({ kind: 'gun' }, old), {}, {}).parts.length > 3, id + ' builds');
    }
    assert.equal(Gun.normalize({ preset: 'rifle', style: 'nope' }).style, 'carbine', 'an unknown style falls back');
    assert.equal(Gun.normalize({ preset: 'rifle', muzzle: 'flash' }).muzzle, 'flash', 'the flash hider is a muzzle');
});

test('the grip and every normal-mapped part has a tangent frame (the rifle grip rendered black)', () => {
    for (const [id] of Gun.PRESETS) for (const stock of ['none', 'full']) {
        const r = Model.build({ kind: 'gun', preset: id, stock }, {}, {});
        for (const p of r.parts.filter(q => q.normalTexture)) assert.equal(badTangents(p), 0, `${id} ${p.name}`);
    }
    // The rounded (lofted) grip of the classic styles in particular.
    for (const style of ['classic', 'bolt']) {
        const r = Model.build({ kind: 'gun', preset: 'rifle', style }, {}, {}), grip = r.parts.find(p => p.name === 'Furniture');
        let spanU = 0, spanV = 0;
        for (let i = 0; i < grip.uvs.length; i += 2) { spanU = Math.max(spanU, Math.abs(grip.uvs[i])); spanV = Math.max(spanV, Math.abs(grip.uvs[i + 1])); }
        assert.ok(spanU > 0.02 && spanV > 0.02, style + ' grip uvs spread in meters');
    }
});

test('the hand rig markers stay where the runtime holds the gun', () => {
    const toWorld = ([x, y, z]) => [x, z, -y];
    for (const [id] of Gun.PRESETS) for (const extra of [{}, { stock: 'full', forend: true }, { stock: 'folding', muzzle: 'suppressor' }, { muzzle: 'brake' }, { muzzle: 'flash' }, { muzzle: 'emitter' }]) {
        const r = Model.build(Object.assign({ kind: 'gun', preset: id }, extra), {}, {}), g = r.recipe, m = r.markers, what = id + ' ' + JSON.stringify(extra);
        // Gun space, as the builder lays them: the grip under the receiver's rear, raked back by its angle.
        const Lr = g.receiver.length, Lb = g.barrel.length, Hr = g.receiver.height, xr0 = -Lr * 0.45, xr1 = Lr * 0.55;
        // A revolver's bore sits over its top chamber: raised so the cylinder's axis clears the trigger guard.
        const yb = g.magazine === 'cylinder' ? Math.max(Hr * 0.62, Math.max(Hr * 0.55, 0.018) * g.magSize * 1.55 + 0.009) : Hr * 0.62;
        const gx = xr0 + Lr * (g.stock === 'full' ? 0.18 : 0.12), back = Math.tan(g.grip.angle * Math.PI / 180) * g.grip.length, gd = 0.03, tx = gx + gd + 0.018;
        const front = g.slide ? xr1 + Lb * 0.85 : xr1, bx1 = g.slide ? front + 0.008 : xr1 + Lb, rb = g.barrel.thickness / 2;
        // A railgun's mouth is its yoke, past the rails' ends, whatever the muzzle says.
        const railed = g.barrelBuild === 'rails', mx = bx1 + (railed ? 0.008 : ({ brake: 0.05, suppressor: Lb * 0.6 + 0.09, emitter: 0.045, flash: Math.max(0.04, rb * 6) }[g.muzzle] || 0));
        const local = { gripTop: [gx + gd / 2, 0, 0], gripBottom: [gx + gd / 2 - back, -g.grip.length, 0], trigger: [tx, -0.012, 0], muzzle: [mx, yb, 0] };
        // Its fore grip hangs under the lower rail.
        if (g.forend) local.foreGrip = [(xr1 + 0.004 + xr1 + Math.min(Lb * 0.6, 0.36)) / 2, railed ? yb - Math.max(0.004, rb) - Math.max(0.008, rb * 1.1) - 0.001 - 0.018 : yb - rb - 0.018, 0];
        if (g.stock === 'full') local.stock = [xr0 - 0.26 - Lr * 0.15 - 0.012, (Hr * 0.8 - 0.06) / 2, 0];
        if (g.stock === 'folding') local.stock = [xr0 - 0.22 - 0.01, Hr * 0.3 - 0.03, 0];
        local.rear = local.stock || [xr0, Hr * 0.5, 0];
        assert.deepEqual(Object.keys(m).sort(), Object.keys(local).sort(), what + ' marker names');
        const at = toWorld(local.gripTop);
        for (const [k, v] of Object.entries(local)) {
            const want = toWorld(v).map((c, i) => c - at[i]), got = m[k].map((c, i) => c - m.gripTop[i]);
            for (let i = 0; i < 3; i++) assert.ok(Math.abs(want[i] - got[i]) < 3e-4, `${what} ${k}[${i}]: ${got[i]} vs ${want[i]}`);
        }
        assert.deepEqual(Model.sidecar(r).rig, { template: 'gun', markers: m }, what + ' saved rig');
    }
});

test('the preview stands the gun up clear of the floor; the saved model still lies on its side', () => {
    for (const [id] of Gun.PRESETS) {
        const r = Model.build({ kind: 'gun', preset: id }, {}, {});
        let low = Infinity; for (const p of r.parts) for (let i = 1; i < p.positions.length; i += 3) low = Math.min(low, p.positions[i]);
        assert.ok(Math.abs(low) < 1e-6, id + ' saved lying on the floor');
        assert.ok(r.markers.gripBottom[2] > r.markers.gripTop[2], id + ' saved on its side, the grip toward +z');
        const g = new THREE.Group(); g.rotation.set(...r.preview.turn); g.position.y = r.preview.lift; g.updateMatrixWorld(true);
        const shown = k => new THREE.Vector3(...r.markers[k]).applyMatrix4(g.matrixWorld);
        assert.ok(shown('gripBottom').y < shown('gripTop').y - 0.05, id + ' the grip hangs down in the preview');
        assert.ok(Math.abs(shown('muzzle').y - shown('rear').y) < 0.08, id + ' the bore runs level');
        let shownLow = Infinity; const v = new THREE.Vector3();
        for (const p of r.parts) for (let i = 0; i < p.positions.length; i += 3) shownLow = Math.min(shownLow, v.set(p.positions[i], p.positions[i + 1], p.positions[i + 2]).applyMatrix4(g.matrixWorld).y);
        assert.ok(shownLow > 0.02, id + ' clear of the floor: ' + shownLow);
    }
});
