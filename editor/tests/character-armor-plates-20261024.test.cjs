'use strict';
// Armor uplift (2026-10-24): rolled plate edges, rebuilt tassets, gauntlets and
// sabatons, real leather armor, and plates that stay rigid without cutting
// further into each other in bend poses than the measured ceiling.
const test = require('node:test');
const assert = require('node:assert/strict');
const Body = require('../src/forge/Character3D/HumanBody.js');
const Wardrobe = require('../src/forge/Character3D/CharacterWardrobe.js');
const Armor = require('../src/forge/Character3D/CharacterPowerArmor.js');
const Cloth = require('../src/forge/Character3D/CharacterCloth.js');
const { inspect } = require('./quality/character-outfit-accessory-quality.cjs');
const Plates = require('./helpers/plate-intersections.cjs');
let pack;
test.before(async () => { pack = await Body.loadPack(); });

const preset = id => Wardrobe.PRESETS.find(p => p.id === id).items;
const wear = (outfit, gender = 1) => {
    const body = Body.build(pack, Body.normalizeRecipe({ gender }));
    return { body, wear: Wardrobe.build(pack, body, outfit, { atlasSize: 64 }) };
};
const tris = (parts, re) => parts.filter(p => re.test(p.name)).reduce((n, p) => n + p.index.length / 3, 0);
// The median vertex: rivets and buckles in the trim color are a small share of an edges part.
const luminance = part => { const l = []; for (let i = 0; i < part.colors.length; i += 3) l.push(.2126 * part.colors[i] + .7152 * part.colors[i + 1] + .0722 * part.colors[i + 2]); l.sort((a, b) => a - b); return l[Math.floor(l.length / 2)]; };

test('every medieval plate piece has rolled edges: tubes standing proud on both faces, not a flat painted rim', () => {
    const { wear: w } = wear(preset('knight'));
    for (const kind of ['breastplate', 'pauldrons', 'vambraces', 'greaves', 'tassets', 'gauntlets', 'sabatons']) {
        const edges = w.parts.find(p => p.name === 'Medieval ' + kind + ' edges');
        assert.ok(edges && edges.index.length / 3 >= 200, kind + ' has rolled edges');
        if (kind === 'breastplate') {
            // The horizontal rims are tubes: their normals turn right round, up as well as down.
            let up = 0, down = 0;
            for (let i = 1; i < edges.normals.length; i += 3) { if (edges.normals[i] > .7) up++; if (edges.normals[i] < -.7) down++; }
            assert.ok(up > 50 && down > 50, 'rolled rims face both ways: ' + up + '/' + down);
        }
    }
});

test('worn edges are lighter than (or as light as) the faces they bound, for bright, dark and gilt plate', () => {
    for (const id of ['knight', 'darkknight', 'paladin']) {
        const { wear: w } = wear(preset(id));
        for (const kind of ['breastplate', 'pauldrons', 'greaves']) {
            const face = w.parts.find(p => p.name === 'Medieval ' + kind), edge = w.parts.find(p => p.name === 'Medieval ' + kind + ' edges');
            assert.ok(luminance(edge) >= luminance(face), `${id} ${kind}: edge ${luminance(edge).toFixed(4)} vs face ${luminance(face).toFixed(4)}`);
            assert.ok(edge.roughness <= face.roughness, id + ' ' + kind + ' edges are smoother');
        }
    }
});

test('tassets, gauntlets and sabatons are built pieces within their triangle floors and ceilings', () => {
    for (const gender of [0, 1]) {
        const { body, wear: w } = wear(preset('knight'), gender);
        const tassets = tris(w.parts, /^Medieval tassets/), gauntlets = tris(w.parts, /^Medieval gauntlets/), sabatons = tris(w.parts, /^Medieval sabatons/);
        assert.ok(tassets >= 1500 && tassets <= 4000, 'tassets ' + tassets);
        assert.ok(gauntlets >= 2000 && gauntlets <= 4500, 'gauntlet plates ' + gauntlets);
        assert.ok(sabatons >= 1000 && sabatons <= 3000, 'sabaton plates ' + sabatons);
        assert.ok(w.parts.some(p => p.name === 'Gauntlet gloves' && p.index.length), 'a leather glove under the lames');
        assert.ok(w.parts.some(p => p.armorLiner && p.index.length), 'a leather liner under the sabatons');
        // Tassets hang as separate lames over each thigh: several rows per side, clear of the middle.
        const t = w.parts.find(p => p.name === 'Medieval tassets');
        for (const side of ['Left', 'Right']) {
            const j = body.bones.findIndex(b => b.name === side + 'UpLeg'), sx = side === 'Left' ? 1 : -1, ys = new Set();
            for (let v = 0; v < t.positions.length / 3; v++) if (t.joints[v * 4] === j) { assert.ok(sx * t.positions[v * 3] > 0, side + ' tasset stays on its own side'); ys.add(Math.round(t.positions[v * 3 + 1] * 200)); }
            assert.ok(ys.size >= 6, side + ' tasset is several overlapping lames');
        }
        const checked = inspect(w.parts, body, Object.fromEntries([w.texture, ...w.textures].filter(Boolean).map(x => [x.name, x])));
        assert.deepEqual(checked.issues, [], 'valid geometry, gender ' + gender);
    }
});

test('finger lames ride their own finger bones, on the back of the hand, and stay with them as the fingers curl', () => {
    const { body, wear: w } = wear([{ id: 'gauntlets' }]);
    const lames = w.parts.find(p => p.name === 'Medieval gauntlets'), s = body.height / 1.7;
    const sub = (a, b) => a.map((x, i) => x - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const toSegment = (p, a, b) => { const d = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), d) / dot(d, d))); return Math.hypot(...sub(p, a.map((x, i) => x + d[i] * t))); };
    const tracks = [];
    for (const side of ['Left', 'Right']) {
        const hand = body.bones.find(b => b.name === side + 'Hand');
        for (const f of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) for (let k = 1; k <= 3; k++) {
            const name = side + 'Hand' + f + k, j = body.bones.findIndex(b => b.name === name), bone = body.bones[j];
            const ids = [];
            for (let v = 0; v < lames.positions.length / 3; v++) if (lames.joints[v * 4] === j) ids.push(v);
            assert.ok(ids.length >= 20, name + ' carries its own lame');
            for (const v of ids) assert.ok(toSegment(Array.from(lames.positions.subarray(v * 3, v * 3 + 3)), bone.head, bone.tail) < .022 * s, name + ' lame hugs its bone');
            // Curl every finger bone 70 degrees about the hand's width.
            const across = sub(body.bones.find(b => b.name === side + 'HandIndex1').head, body.bones.find(b => b.name === side + 'HandPinky1').head), l = Math.hypot(...across), half = 70 / 2 * Math.PI / 180;
            if (f !== 'Thumb') tracks.push({ bone: j, path: 'rotation', values: [...across.map(x => x / l * Math.sin(half)), Math.cos(half)] });
            tracks.push({ name, j, ids, hand });
        }
    }
    const clip = { times: [0], tracks: tracks.filter(t => t.path) };
    const pose = Cloth.pose(body.bones, clip, 0), posed = Cloth.skin(lames, body.bones, pose);
    for (const t of tracks.filter(t => t.ids)) {
        const bone = body.bones[t.j], R = pose.R[t.j], P = pose.P[t.j];
        const rotate = (q, v) => { const [x, y, z, w] = q, uv = [y * v[2] - z * v[1], z * v[0] - x * v[2], x * v[1] - y * v[0]], uuv = [y * uv[2] - z * uv[1], z * uv[0] - x * uv[2], x * uv[1] - y * uv[0]]; return v.map((c, i) => c + 2 * (w * uv[i] + uuv[i])); };
        const tail = P.map((c, i) => c + rotate(R, sub(bone.tail, bone.head))[i]);
        for (const v of t.ids) {
            const rest = toSegment(Array.from(lames.positions.subarray(v * 3, v * 3 + 3)), bone.head, bone.tail), now = toSegment(Array.from(posed.subarray(v * 3, v * 3 + 3)), P, tail);
            assert.ok(Math.abs(rest - now) < 1e-4, t.name + ' lame moves rigidly with its bone');
        }
    }
});

test('styles are editable choices that change the plate, and saved items keep a valid style', () => {
    for (const id of ['breastplate', 'pauldrons', 'vambraces', 'gauntlets', 'tassets', 'greaves', 'sabatons', 'leatherarmor']) {
        const g = Wardrobe.BY_ID.get(id);
        assert.ok(Array.isArray(g.styles) && g.styles.length >= 3, id + ' offers styles');
        assert.equal(Wardrobe.normalizeItem({ id, style: 'nonsense' }).style, g.defaults.style, id + ' falls back to its default style');
    }
    assert.equal(Wardrobe.normalizeItem({ id: 'tshirt', style: 'fluted' }).style, undefined, 'only armor keeps a style');
    const body = Body.build(pack, Body.normalizeRecipe({ gender: 1 })), counts = {};
    for (const style of ['smooth', 'fluted', 'riveted', 'anatomical']) {
        const made = Armor.medieval(pack, body, Wardrobe.normalizeItem({ id: 'breastplate', style }), 'breastplate');
        counts[style] = made.parts.reduce((n, p) => n + p.index.length / 3, 0);
        for (const p of made.parts) for (let v = 0; v < p.positions.length / 3; v++) assert.equal(p.weights[v * 4], 1, style + ' plate is rigid');
    }
    assert.equal(new Set(Object.values(counts)).size, 4, 'each style builds its own form: ' + JSON.stringify(counts));
});

test('leather armor is moulded plates with stitched rolled edges, straps and buckles over its jerkin', () => {
    for (const style of ['moulded', 'studded', 'lamellar']) {
        const { body, wear: w } = wear([{ id: 'shirt' }, { id: 'leatherarmor', style }]);
        assert.ok(tris(w.parts, /^Leather armor plates$/) > 500, style + ' plates');
        assert.ok(tris(w.parts, /^Leather armor edges$/) > 200, style + ' rolled edges and buckles');
        assert.ok(tris(w.parts, /^Leather armor straps$/) > 40, style + ' straps');
        if (style !== 'lamellar') assert.ok(w.parts.some(p => p.name === 'Leather armor tooling' && p.cutout), 'stitched band');
        const checked = inspect(w.parts, body, Object.fromEntries([w.texture, ...w.textures].filter(Boolean).map(x => [x.name, x])));
        assert.deepEqual(checked.issues, [], style);
    }
});

// Cross-bone intersection length (mm) through Walk, Kneel and Sit, frames at
// half and the end of each clip (helpers/plate-intersections.cjs). Measured
// on the pre-uplift sources (commit eb27dad9): knight female rest 1020, walk
// 2648, kneel 3656, sit 3279; paladin male 553, 2004, 3263, 3354. Real
// tassets, cuffs and couters add contact where limbs swing past or fold into
// them; the ceilings hold the uplift to its measured level (rest at or under
// the old level, bends about 1.3-2.2x).
test('rigid plates do not cut into each other in bend poses beyond the measured ceiling', async () => {
    const cache = { pack };
    const ceilings = { knight: [0, { rest: 1000, walk: 6200, kneel: 8000, sit: 7700 }], paladin: [1, { rest: 600, walk: 3300, kneel: 6500, sit: 4800 }] };
    for (const [id, [gender, ceiling]] of Object.entries(ceilings)) {
        const measured = await Plates.measure(null, id, gender, [0.5, 1], cache);
        for (const pose of Object.keys(ceiling)) assert.ok(measured[pose] <= ceiling[pose], `${id} ${pose}: ${measured[pose]} mm > ${ceiling[pose]} mm`);
    }
});
