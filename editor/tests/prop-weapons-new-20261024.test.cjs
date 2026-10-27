'use strict';
// Forge › Prop Builder's newer weapon kinds (2026-10-24): bows and crossbows, staffs and wands, axes,
// hammers, maces and polearms, shields. Every preset builds whole (finite, outward, closed, on the floor,
// within 25k triangles); its hand rig is where a hand holds it; a seed always rolls the same weapon; a
// recipe survives normalize, JSON and the saved GLB; the page offers styles, Shuffle and a few settings;
// and the runtime's own hold (Reactor3D.MapHeld / Held) takes each in the fist the way it takes a sword.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..'), repo = path.join(root, '..');
global.self = global; global.window = global;
require(path.join(repo, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
global.rrEscapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const props = path.join(root, 'src', 'forge', 'Props');
const Model = require(path.join(props, 'PropModel.js'));
const Catalog = require(path.join(props, 'PropCatalog.js'));
const Accessory = require(path.join(props, 'AccessoryProp.js'));
const K = require(path.join(props, 'WeaponKit.js'));
const KINDS = { hafted: require(path.join(props, 'HaftedProp.js')), staff: require(path.join(props, 'StaffProp.js')), bow: require(path.join(props, 'RangedProp.js')), shield: require(path.join(props, 'ShieldProp.js')) };
const Optimizer = require(path.join(root, 'src', 'utils', 'GlbOptimizer.js'));
const { PNG } = require(path.join(root, 'node_modules', 'pngjs'));
const encode = t => { const p = new PNG({ width: t.width, height: t.height }); p.data = Buffer.from(t.data); return PNG.sync.write(p); };

const BUDGET = 25000;
const tris = b => b.parts.reduce((n, p) => n + p.index.length / 3, 0);
const finite = b => b.parts.every(p => p.positions.every(Number.isFinite) && p.normals.every(Number.isFinite) && (!p.uvs || p.uvs.every(Number.isFinite)));
const lowest = b => { let l = Infinity; for (const p of b.parts) for (let i = 1; i < p.positions.length; i += 3) l = Math.min(l, p.positions[i]); return l; };

/**
 * What faces the wrong way: every part welded and split into connected shells; a closed shell (under 8% open
 * edges) must have positive volume and no edge walked the same way twice; an open sheet must be two-sided.
 * (The rule prop-catalog.test.cjs holds every kind to.)
 */
function winding(parts) {
    const key = new Map(), tri = [];
    parts.forEach((p, pi) => {
        const P = p.positions, ids = new Int32Array(P.length / 3);
        for (let i = 0; i < ids.length; i++) { const k = Math.round(P[i * 3] / 1e-4) + ',' + Math.round(P[i * 3 + 1] / 1e-4) + ',' + Math.round(P[i * 3 + 2] / 1e-4); let v = key.get(k); if (v === undefined) { v = key.size; key.set(k, v); } ids[i] = v; }
        for (let k = 0; k < p.index.length; k += 3) { const v = [ids[p.index[k]], ids[p.index[k + 1]], ids[p.index[k + 2]]]; if (v[0] !== v[1] && v[1] !== v[2] && v[0] !== v[2]) tri.push({ v, p: [0, 1, 2].map(j => { const i = p.index[k + j]; return [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]; }), part: pi }); }
    });
    const seen = new Set(tri.map(t => { const r = t.v.indexOf(Math.min(...t.v)); return [0, 1, 2].map(i => t.v[(r + i) % 3]).join(); }));
    const list = tri.filter(t => { const v = [t.v[0], t.v[2], t.v[1]], r = v.indexOf(Math.min(...v)); return !seen.has([0, 1, 2].map(i => v[(r + i) % 3]).join()); });
    const par = [...Array(key.size).keys()], find = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
    for (const t of list) { par[find(t.v[0])] = find(t.v[1]); par[find(t.v[1])] = find(t.v[2]); }
    const shells = new Map();
    for (const t of list) {
        const r = find(t.v[0]); if (!shells.has(r)) shells.set(r, { n: 0, vol: 0, edges: new Map(), names: new Set() });
        const s = shells.get(r), [a, b, c] = t.p; s.n++; s.names.add(parts[t.part].name);
        s.vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
        for (let e = 0; e < 3; e++) { const x = t.v[e], y = t.v[(e + 1) % 3], k = Math.min(x, y) + ':' + Math.max(x, y), u = s.edges.get(k) || [0, 0]; u[x < y ? 0 : 1]++; s.edges.set(k, u); }
    }
    const problems = [];
    for (const s of shells.values()) {
        let open = 0, flipped = 0;
        for (const [f, b] of s.edges.values()) { if (f + b === 1) open++; else if (f !== b) flipped++; }
        const names = [...s.names].join('+');
        if (open / s.edges.size < 0.08) { if (s.vol < 0) problems.push(names + ': inside out'); if (flipped) problems.push(names + `: ${flipped} edges wound against their neighbors`); }
        else if (![...s.names].every(n => parts.find(p => p.name === n).doubleSided)) problems.push(names + `: an open sheet (${open} open edges)`);
    }
    return problems;
}
const presets = () => Object.entries(KINDS).flatMap(([kind, M]) => M.PRESETS.map(p => ({ kind, M, id: p[0], label: p[1], category: p[2] })));
const RIG = { blade: ['gripBottom', 'gripTop', 'tip', 'edge'], gun: ['gripTop', 'gripBottom', 'trigger', 'muzzle', 'rear', 'stock', 'foreGrip'] };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** The distance from a point to the build's surface (the nearest point of any triangle). */
function nearest(b, q) {
    const P = new THREE.Vector3(...q), tri = new THREE.Triangle(), out = new THREE.Vector3();
    let best = Infinity;
    for (const p of b.parts) {
        const X = p.positions, I = p.index, at = i => new THREE.Vector3(X[i * 3], X[i * 3 + 1], X[i * 3 + 2]);
        for (let k = 0; k < I.length; k += 3) { tri.set(at(I[k]), at(I[k + 1]), at(I[k + 2])); tri.closestPointToPoint(P, out); const d = out.distanceTo(P); if (d < best) best = d; }
    }
    return best;
}

test('the catalog lists the new weapons in their groups, once each, and hides the old equipment versions', () => {
    const tree = Catalog.grouped(''), weapons = tree.find(g => g.category.id === 'weapons');
    const groups = weapons.groups.map(g => g.category.id);
    for (const id of ['axes', 'polearms', 'bows', 'staffs', 'shields', 'scifi']) assert.ok(groups.includes(id), id);
    assert.deepEqual(groups.slice(0, 3), ['swords', 'firearms', 'scifi'], 'swords, firearms and sci-fi still lead');
    for (const { kind, id, category } of presets()) {
        const t = Catalog.TYPES.find(x => x.id === kind + '-' + id);
        assert.ok(t && !t.hidden && t.category === category, kind + '-' + id + ' listed');
        assert.equal(Catalog.typeOf(Model.normalize(t.start())), t, kind + '-' + id + ' is what it starts as');
        assert.ok(Catalog.ICONS[t.icon], t.id + ' has its icon');
    }
    const labels = tree.flatMap(g => g.types).map(t => t.label.toLowerCase());
    assert.deepEqual(labels.filter((x, i) => labels.indexOf(x) !== i), [], 'no label twice');
    for (const id of ['axe', 'spear', 'staff', 'bow', 'shield']) {
        const t = Catalog.TYPES.find(x => x.id === 'accessory-' + id);
        assert.ok(t.hidden, id + ' equipment unlisted');
        assert.equal(Catalog.typeOf(Accessory.normalize({ accessory: { id } })), t, 'its saved recipes still open');
    }
    assert.ok(Catalog.grouped('bow').some(g => g.types.some(t => t.id === 'bow-longbow')), 'a search finds them');
});

test('every preset builds whole: finite, closed and outward, on the floor, within 25k triangles', () => {
    for (const { kind, M, id } of presets()) {
        const b = Model.build(M.normalize({ preset: id }));
        const what = kind + '-' + id;
        assert.equal(b.kind, kind);
        assert.ok(b.parts.length && b.parts.every(p => p.index.length), what);
        assert.ok(finite(b), what + ' finite');
        assert.ok(tris(b) <= BUDGET && tris(b) > 800, `${what}: ${tris(b)} triangles`);
        assert.ok(Math.abs(lowest(b)) < 1e-6, what + ' rests on the floor');
        assert.deepEqual(winding(b.parts), [], what);
        assert.ok(Math.abs(Model.sidecar(b).transform.offset[1] - lowest(b)) < 1e-3, what + ' model.json keeps its height');
    }
});

test('across their settings: the ends of every slider, every choice, still whole and in budget', () => {
    for (const { kind, M, id } of presets()) {
        const fam = M.FAMILY[id], recipes = [];
        for (const L of fam.range) for (const shape of [0, 1]) for (const size of [0.6, 1.6]) recipes.push(kind === 'shield' ? { preset: id, size: L, shape } : { preset: id, length: L, size, shape });
        if (kind === 'hafted') for (const [wrap] of M.WRAPS) for (const [runes] of M.RUNES) recipes.push({ preset: id, wrap, runes, metal: 'gold', trim: 'silver', wood: 'ebony' });
        if (kind === 'staff') recipes.push({ preset: id, glow: true, light: true }, { preset: id, glow: false });
        if (kind === 'bow') recipes.push({ preset: id, arrow: true }, { preset: id, arrow: false, wood: 'pale', metal: 'gold' });
        if (kind === 'shield') for (const [face] of M.FACES) for (const [pattern] of M.PATTERNS) recipes.push({ preset: id, face, pattern, emblem: pattern === 'cross' ? 'skull' : 'star', wear: 1 });
        if (kind === 'shield') recipes.push({ preset: id, face: 'bare', design: { field: { layout: 'canton' }, layers: [{ shape: 'eagle', place: 'br', repeat: 'ring', count: 7 }, { source: 'picture', image: 'missing.png' }] } });
        for (const r of recipes) {
            const b = Model.build(M.normalize(r)), what = JSON.stringify(r);
            assert.ok(finite(b) && tris(b) <= BUDGET, what + ' ' + tris(b));
            assert.ok(Math.abs(lowest(b)) < 1e-6, what + ' on the floor');
            assert.deepEqual(winding(b.parts), [], what);
        }
    }
});

test('the hand rig: a blade rig on the grip with its tip beyond and its edge off the line; a crossbow a gun rig; a quiver none', () => {
    for (const { kind, M, id } of presets()) {
        const b = Model.build(M.normalize({ preset: id })), what = kind + '-' + id, side = Model.sidecar(b);
        if (id === 'quiver') { assert.equal(side.rig, undefined, 'a quiver is worn, not held'); assert.equal(b.holdable, undefined); continue; }
        const template = id === 'crossbow' ? 'gun' : 'blade';
        assert.equal(side.rig.template, template, what);
        assert.equal(b.holdable, template);
        for (const k of RIG[template]) { assert.ok(side.rig.markers[k] && side.rig.markers[k].every(Number.isFinite), what + ' ' + k); }
        const m = side.rig.markers;
        // The grip is on the thing itself (a marker sits on the surface or on the handle's line inside it).
        // (A gun's grip markers lie on its middle plane, inside the stock, as GunProp's do.)
        for (const k of ['gripTop', 'gripBottom']) assert.ok(nearest(b, m[k]) < (template === 'gun' ? 0.05 : 0.035), `${what} ${k} on the handle (${nearest(b, m[k]).toFixed(3)})`);
        assert.ok(dist(m.gripTop, m.gripBottom) > 0.05 && dist(m.gripTop, m.gripBottom) < 0.2, what + ' a hand-wide handle');
        if (template === 'gun') { assert.ok(m.muzzle[0] > m.rear[0], 'the bolt points forward'); assert.ok(m.gripBottom[1] < m.gripTop[1], 'the grip hangs down (it stands upright)'); continue; }
        const axis = m.gripTop.map((v, i) => v - m.gripBottom[i]), len = Math.hypot(...axis), u = axis.map(v => v / len);
        const reach = m.tip.reduce((s, v, i) => s + (v - m.gripBottom[i]) * u[i], 0);
        assert.ok(reach > len * 1.5, `${what}: the tip lies out beyond the handle (${reach.toFixed(2)} m)`);
        const off = m.edge.map((v, i) => v - m.gripTop[i]), along = off.reduce((s, v, i) => s + v * u[i], 0), away = Math.hypot(...off.map((v, i) => v - along * u[i]));
        assert.ok(away > 0.005, what + ' the edge stands off the handle\'s line');
    }
    // Two-handed weapons are held low on the haft, one-handed near the butt; staffs above their middle, wands by the handle.
    const H = KINDS.hafted, at = (M, id) => { const b = Model.build(M.normalize({ preset: id })), m = b.markers, lo = Math.min(...b.parts.flatMap(p => Array.from({ length: p.positions.length / 3 }, (_, i) => p.positions[i * 3]))); return (m.gripTop[0] - lo) / b.length; };
    assert.ok(at(H, 'handaxe') < 0.3 && at(H, 'spear') > 0.25 && at(H, 'spear') < 0.45, 'axe near the butt, spear a third up');
    assert.ok(at(KINDS.staff, 'wizard') > 0.5 && at(KINDS.staff, 'wandwood') < 0.4, 'staff above its middle, wand by its handle');
    assert.ok(Math.abs(at(KINDS.bow, 'longbow') - 0.53) < 0.06, 'a bow by its middle, the arrow shelf just over the hand');
});

test('sizes are real: a longbow about as tall as a person, a wand a forearm, a buckler a hand span', () => {
    const size = (kind, id) => Model.build(KINDS[kind].normalize({ preset: id })).length;
    assert.ok(size('bow', 'longbow') > 1.6 && size('bow', 'longbow') < 1.95);
    assert.ok(size('staff', 'wizard') > 1.6 && size('staff', 'wizard') < 2);
    assert.ok(size('staff', 'wandwood') > 0.25 && size('staff', 'wandwood') < 0.45);
    assert.ok(size('hafted', 'handaxe') > 0.5 && size('hafted', 'handaxe') < 0.75);
    assert.ok(size('hafted', 'halberd') > 2 && size('hafted', 'halberd') < 2.5);
    assert.ok(size('shield', 'buckler') < 0.4 && size('shield', 'tower') > 1.2);
});

test('a seed always rolls the same weapon; scopes keep what they do not cover; Shuffle keeps the style', () => {
    for (const [kind, M] of Object.entries(KINDS)) {
        const from = M.normalize({ preset: M.PRESETS[1][0] });
        for (const scope of ['all', 'shape', 'details', 'colors']) {
            const a = M.random(424242, from, scope), b = M.random(424242, from, scope);
            assert.deepEqual(a, b, kind + ' ' + scope + ' deterministic');
            assert.deepEqual(M.normalize(a), a, kind + ' normalized');
            const ba = Model.build(a), bb = Model.build(b);
            assert.deepEqual(ba.parts.map(p => Array.from(p.positions.slice(0, 30))), bb.parts.map(p => Array.from(p.positions.slice(0, 30))), kind + ' builds the same');
        }
        const tinted = M.random(7, from, 'colors');
        assert.equal(tinted.preset, from.preset);
        for (const k of ['length', 'size', 'shape']) if (from[k] !== undefined) assert.equal(tinted[k], from[k], kind + ' colors keep ' + k);
        let kept = 0;
        for (let s = 1; s <= 20; s++) if (M.random(s * 31, from, 'all', true).preset === from.preset) kept++;
        assert.equal(kept, 20, kind + ' Shuffle keeps the style');
        let styles = new Set();
        for (let s = 1; s <= 40; s++) styles.add(M.random(s * 977, from, 'all').preset);
        assert.ok(styles.size >= Math.min(4, M.PRESETS.length), kind + ' Randomize everything visits other styles');
    }
});

test('a recipe survives normalize, JSON (prop.json) and the GLB the Save writes; glows and lights where asked', async () => {
    for (const { kind, M, id } of presets()) {
        const r = M.normalize({ preset: id });
        assert.deepEqual(M.normalize(JSON.parse(JSON.stringify(r))), r, kind + '-' + id + ' round trip');
        assert.deepEqual(Model.normalize(JSON.parse(JSON.stringify({ builder: 'prop', version: 1, recipe: r })).recipe), r);
    }
    // Junk is held in range.
    const junk = KINDS.bow.normalize({ preset: 'nope', length: 99, size: -3, shape: 'x', wood: 'plastic', string: 'red', arrow: 'yes' });
    assert.equal(junk.preset, 'longbow'); assert.ok(junk.length <= 2.1 && junk.size >= 0.6 && junk.shape >= 0 && junk.shape <= 1); assert.equal(junk.wood, 'yew'); assert.equal(junk.string, '#e8dcc0');
    for (const [kind, recipe] of [['staff', { preset: 'wizard', glow: true, light: true }], ['bow', { preset: 'recurve', arrow: true }], ['hafted', { preset: 'halberd', runes: 'glowing' }], ['shield', { preset: 'round' }], ['bow', { preset: 'crossbow' }]]) {
        const b = Model.build(KINDS[kind].normalize(recipe));
        const { json } = Optimizer.parseGlb(await Model.toGlb(b, kind, encode));
        const count = json.meshes.reduce((n, m) => n + m.primitives.reduce((k, p) => k + json.accessors[p.indices].count / 3, 0), 0);
        assert.equal(count, tris(b), kind + ' every triangle in the GLB');
        assert.ok(json.images && json.images.length, kind + ' its pictures inside');
        const glows = (json.materials || []).some(m => m.emissiveFactor && m.emissiveFactor.some(v => v > 0));
        assert.equal(glows, kind === 'staff' || kind === 'hafted', kind + ' glows only where asked');
        const side = Model.sidecar(b);
        if (kind === 'staff') { assert.equal(side.effects[0].type, 'light'); assert.equal(side.effects[0].light.color, '#58c8ff'); }
        else assert.equal(side.effects, undefined, 'no light unless asked');
    }
    const plain = Model.sidecar(Model.build(KINDS.staff.normalize({ preset: 'wizard', glow: true, light: false })));
    assert.equal(plain.effects, undefined, 'a glowing staff casts no light until asked');
});

test('the page: styles as one-click tiles, Shuffle, a few sliders, materials; picking a style keeps the look', () => {
    for (const [kind, M] of Object.entries(KINDS)) {
        const ui = Catalog.UI[kind], seen = [];
        const fake = {
            recipe: M.normalize({ preset: M.PRESETS[0][0] }), _t: s => s,
            _section: l => `<div class="rr-c3d-section" data-title="${l}">`, _slider: s => (seen.push(s.path), `<input type="range" data-path="${s.path}">`),
            _select: (p, l, c) => (seen.push(p), `<select data-path="${p}">${c.map(x => x[0]).join(',')}</select>`), _color: p => (seen.push(p), `<button data-act="color" data-path="${p}">`),
            _check: p => (seen.push(p), `<input type="checkbox" data-path="${p}">`), _tiles: (act, items) => items.map(it => `<button data-act="${act}" data-id="${it.id}">`).join(''),
            // The flags' Design page (PropBuilder._designPanel), as a shield shows it: on its own face, the field only where it is painted.
            _designPanel: (p, o) => (seen.push(p), `<div data-design="${p}" data-field="${o && o.field !== false}" data-faces="${!!(o && o.key)}">`), _designAct: () => false,
            _replace(r) { this.recipe = Model.normalize(r); }
        };
        let html = '';
        for (const [tab] of ui.tabs) html += ui.panel.call(fake, tab);
        for (const [id] of M.PRESETS) assert.ok(html.includes(`data-act="weapon-style" data-id="${id}"`), kind + ' style tile ' + id);
        assert.ok(html.includes('data-act="weapon-shuffle"'), kind + ' Shuffle');
        const sliders = (html.match(/type="range"/g) || []).length;
        assert.ok(sliders >= 2 && sliders <= 4, kind + ' a few sliders: ' + sliders);
        assert.ok(/data-path="[^"]*(length|size)"/.test(html), kind + ' a size');
        if (kind === 'shield') {
            assert.ok(html.includes('data-design="design" data-field="true" data-faces="true"'), 'a painted shield: the whole Design page, its tiles on its own face');
            assert.ok(!/data-path="(pattern|emblem|emblemColor|colors\.\d)"/.test(html), 'no plain pattern or emblem selects left');
            fake.recipe = M.normalize({ preset: 'energy' });
            assert.ok(ui.panel.call(fake, 'design').includes('data-field="false"'), 'an energy shield: its emblems only');
            assert.ok(ui.panel.call(fake, 'look').includes('data-path="glow"'), 'an energy shield keeps its glow color');
        }
        // A style picked from the tiles takes its own shape and keeps the colors chosen.
        const look = kind === 'shield' ? 'metal' : kind === 'staff' || kind === 'bow' ? 'metal' : 'trim';
        fake.recipe = M.normalize(Object.assign({ preset: M.PRESETS[0][0] }, { [look]: 'gold' }));
        ui.act.call(fake, 'weapon-style', { dataset: { id: M.PRESETS[2][0] } });
        assert.equal(fake.recipe.preset, M.PRESETS[2][0]);
        assert.equal(fake.recipe[look], 'gold', kind + ' keeps its look');
        ui.act.call(fake, 'weapon-shuffle', { dataset: {} });
        assert.equal(fake.recipe.preset, M.PRESETS[2][0], kind + ' Shuffle keeps the style');
        assert.deepEqual(ui.reset(fake.recipe), M.normalize({ preset: fake.recipe.preset }));
    }
});

test('the kit: a forged plate is a closed solid with its honed edge apart; a ridge closes on its point', () => {
    const outline = K.path(K.quad([0, 0.03], [0.06, 0.05], [0.12, 0.09], 8), { tag: 'edge', pts: K.arc(0.12, -0.02, 0.11, 1.4, -1.4, 16) }, K.quad([0.125, -0.13], [0.05, -0.05], [0, -0.03], 8));
    const p = K.plate(outline, { t: (x, y) => 0.008 - 0.03 * x, bevel: 0.012, holes: [{ pts: K.circle(0.07, 0, 0.012, 12) }] });
    assert.ok(p.edge && p.edge.index.length > 0, 'the cutting bevel is its own mesh');
    assert.deepEqual(winding([Object.assign(p.body, { name: 'body' }), Object.assign(p.edge, { name: 'edge' })]), []);
    const r = K.ridge({ length: 0.2, top: s => 0.02 * (1 - s / 0.2), bot: s => -0.02 * (1 - s / 0.2), h: s => 0.005 * (1 - s / 0.2) });
    assert.deepEqual(winding([Object.assign(r.body, { name: 'body' }), Object.assign(r.edge, { name: 'edge' })]), []);
    assert.ok(Math.abs(r.tip[0] - 0.2) < 1e-9);
    const refined = K.refine([[0, 0], [1, 0], [0, 1]], [[0, 1, 2]], 0.2);
    assert.ok(refined.faces.length > 20 && refined.faces.every(f => { const [a, b, c] = f.map(i => refined.pts[i]); return (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]) > 0; }), 'refined triangles keep their turn');
});

// ── held by a character, through the runtime's own hold ─────────────────────
const Reactor3D = require(path.join(repo, 'runtime', 'reactor_3d.js'));
global.Reactor3D = Reactor3D;
global.ReactorBattleData = require(path.join(root, 'src', 'battle', 'BattleData.js'));
global.ReactorBattleRoomView = require(path.join(repo, 'runtime', 'reactor_battle_room.js'));
/** A body facing +z, both arms hanging, each hand with five marked fingers (as map-held.test.cjs builds it). */
function body() {
    const joint = (name, parent, x, y, z) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); parent.add(b); return b; };
    const rootNode = new THREE.Group(), chest = joint('Chest', rootNode, 0, 1.2, 0), hands = {};
    joint('Head', chest, 0, 0.35, 0);
    for (const [side, sign] of [['Right', -1], ['Left', 1]]) {
        const upper = joint(side + 'UpperArm', chest, sign * 0.2, 0.2, 0), fore = joint(side + 'LowerArm', upper, 0, -0.3, 0), hand = joint(side + 'Hand', fore, 0, -0.3, 0), points = {};
        for (const [name, base, tip] of [['thumb', [0.02, -0.06, 0.05], [0.02, -0.1, 0.07]], ['index', [0, -0.1, 0.03], [0, -0.16, 0.03]], ['middle', [0, -0.1, 0.01], [0, -0.17, 0.01]], ['ring', [0, -0.1, -0.01], [0, -0.16, -0.01]], ['pinky', [0, -0.1, -0.03], [0, -0.15, -0.03]]])
            points[name] = { base: [-sign * base[0], base[1], base[2]], tip: [-sign * tip[0], tip[1], tip[2]] };
        Reactor3D.attachRigFingers(rootNode, hand, side, points, null);
        hands[side] = hand;
    }
    rootNode.userData.glbSize = { x: 0.6, y: 1.8, z: 0.3 };
    rootNode.updateMatrixWorld(true);
    return { root: rootNode, hands };
}
/** The saved GLB as the game has it: its meshes in its own frame. */
async function glbObject(b) {
    const { json, bin } = Optimizer.parseGlb(await Model.toGlb(b, 'held', encode));
    const data = i => { const a = json.accessors[i], v = json.bufferViews[a.bufferView], n = { SCALAR: 1, VEC3: 3 }[a.type], T = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array }[a.componentType], off = bin.byteOffset + v.byteOffset + (a.byteOffset || 0); return new T(bin.buffer.slice(off, off + a.count * n * T.BYTES_PER_ELEMENT)); };
    const g = new THREE.Group(), box = new THREE.Box3();
    for (const m of json.meshes) for (const p of m.primitives) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(data(p.attributes.POSITION), 3)); geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(data(p.indices)), 1)); geo.computeBoundingBox(); box.union(geo.boundingBox); g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial())); }
    const size = box.getSize(new THREE.Vector3());
    g.userData.glbSize = { x: size.x, y: size.y, z: size.z };
    return g;
}

test('a character holds them as it holds a sword: in the fist by the grip, the edge (a bow\'s back, a shield\'s face) toward the knuckles', async () => {
    const M = Reactor3D.MapHeld, kept = {};
    for (const name of ['characterModelSpec', 'databaseModelSpec', 'loadModel', 'loadModelSidecar', 'characterGround']) kept[name] = Reactor3D[name];
    global.$gameMap = { mapId: () => 5 }; global.Graphics = { frameCount: 0 };
    try {
        for (const [kind, recipe, attachment, hands] of [['bow', { preset: 'recurve' }, 'leftHand', 'one'], ['staff', { preset: 'wizard' }, 'rightHand', 'one'], ['hafted', { preset: 'handaxe' }, 'rightHand', 'one'], ['hafted', { preset: 'halberd' }, 'rightHand', 'both'], ['shield', { preset: 'heater' }, 'leftHand', 'one'], ['bow', { preset: 'crossbow' }, 'rightHand', 'both']]) {
            const b = Model.build(KINDS[kind].normalize(recipe)), sidecar = JSON.parse(JSON.stringify(Model.sidecar(b))), object = await glbObject(b), what = kind + ' ' + recipe.preset;
            const rig = Reactor3D.readHeldRig(sidecar);
            assert.ok(rig, what + ': the runtime reads its rig');
            Reactor3D.characterModelSpec = () => ({ name: 'Actors/Unit', size: 1.8, scale: 1 });
            Reactor3D.databaseModelSpec = () => ({ name: 'Weapons/' + what, ext: '.glb', file: '', size: Math.max(object.userData.glbSize.x, object.userData.glbSize.z), scale: 1 });
            Reactor3D.loadModel = async () => object; Reactor3D.loadModelSidecar = async () => sidecar; Reactor3D.characterGround = () => 0;
            const unit = { _realX: 4, _realY: 4, _x: 4, _y: 4, eventId: () => 1, direction: () => 2, isMoving: () => false };
            const who = body(); who.root.position.set(4.5, 0, 4.5); who.root.updateMatrixWorld(true);
            assert.equal(M.show(unit, { battler: { weapons: () => [{ id: 1 }] }, hold: 'fist', attachment, hands, gripY: 0, duration: 0 }), true, what);
            await new Promise(r => setImmediate(r));
            Graphics.frameCount++; M.update({ object: who.root, character: unit }, unit, null, false);
            const held = M.states.get('e1').record.object, hand = who.hands[attachment === 'leftHand' ? 'Left' : 'Right'];
            assert.equal(held.parent, hand, what + ' rides the hand');
            held.updateWorldMatrix(true, true);
            const w = k => held.localToWorld(new THREE.Vector3(...rig.markers[k])), wrist = hand.getWorldPosition(new THREE.Vector3());
            const grip = w('gripTop').add(w('gripBottom')).multiplyScalar(0.5);
            assert.ok(grip.distanceTo(wrist) < 0.2, `${what}: the grip is in the hand (${grip.distanceTo(wrist).toFixed(3)} m from the wrist)`);
            const tip = w(rig.template === 'gun' ? 'muzzle' : 'tip');
            assert.ok(tip.distanceTo(wrist) > grip.distanceTo(wrist) + 0.1, what + ': its business end out beyond the hand');
            if (rig.template === 'blade') {
                const L = Reactor3D._handGrips.get(hand).layout, q = hand.getWorldQuaternion(new THREE.Quaternion());
                const axis = w('gripTop').sub(w('gripBottom')).normalize(), off = w('edge').sub(w('gripTop'));
                off.addScaledVector(axis, -off.dot(axis)).normalize();
                assert.ok(off.dot(new THREE.Vector3(...L.along).applyQuaternion(q)) > 0.8, what + ': its edge faces the way the knuckles do');
                assert.ok(Math.abs(axis.dot(new THREE.Vector3(...L.across).applyQuaternion(q))) > 0.8, what + ': its handle lies across the palm');
            }
            M.clear();
        }
    } finally {
        M.clear();
        Object.assign(Reactor3D, kept);
        delete global.$gameMap; delete global.Graphics;
    }
});
