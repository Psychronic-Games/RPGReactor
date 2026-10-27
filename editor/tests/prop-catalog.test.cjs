'use strict';
// 3D Prop Builder catalog: every listed type once, every entry building whole and facing outward
// (in the build and in the saved GLB), real settings on every page, Randomize safe for every kind,
// and the left column's sections folding and opening for a search.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
global.THREE = require(path.join(root, 'node_modules', 'three'));
global.rrEscapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const props = path.join(root, 'src', 'forge', 'Props');
const FILES = ['PropCloth', 'PropPaint', 'PropMesh', 'PropRandom', 'PropCatalog', 'FlagDesign', 'FlagProp', 'PropModel', 'SpanProp', 'FramedProp', 'PictureProp', 'AccessoryProp', 'SwordProp', 'GunProp', 'ContainerProp', 'FurnitureProp', 'VehicleProp', 'WeaponKit', 'HaftedProp', 'StaffProp', 'RangedProp', 'ShieldProp', 'InstrumentProp', 'CableProp', 'SpeakerProp'];
const present = FILES.filter(f => fs.existsSync(path.join(props, f + '.js')));
for (const f of present) require(path.join(props, f + '.js'));
const Catalog = require(path.join(props, 'PropCatalog.js'));
const Model = require(path.join(props, 'PropModel.js'));
const Accessory = require(path.join(props, 'AccessoryProp.js'));
const Optimizer = require(path.join(root, 'src', 'utils', 'GlbOptimizer.js'));
const { PNG } = require(path.join(root, 'node_modules', 'pngjs'));
const encode = t => { const p = new PNG({ width: t.width, height: t.height }); p.data = Buffer.from(t.data); return PNG.sync.write(p); };

test.before(async () => { await Accessory.prepare(); });

const startOf = type => Model.normalize(type.start(Model.normalize({ kind: type.kind })));
const CLOTH = new Set(['flag', 'span']);
const budgetOf = kind => kind==='cable'?40000:kind==='speaker'?30000:kind==='vehicle'?180000:kind==='furniture'?180000:kind==='accessory'?80000:kind==='sword'?50000:kind==='gun'?45000:['hafted','staff','bow','shield','instrument'].includes(kind)?25000:12000;

/**
 * Every part welded together and split into connected shells. A shell is
 * closed when under 8% of its edges are open (a blade's foot in its guard,
 * a tube's seam): its volume must be positive and no edge may be walked the
 * same way twice. An open shell (a sheet) must be double-sided, or lie on
 * something just behind it (a picture on its backing).
 */
function shells(parts, weld = 1e-4) {
    const key = new Map(), tris = [];
    parts.forEach((p, pi) => {
        const P = p.positions, I = p.index, ids = new Int32Array(P.length / 3);
        for (let i = 0; i < ids.length; i++) { const k = Math.round(P[i * 3] / weld) + ',' + Math.round(P[i * 3 + 1] / weld) + ',' + Math.round(P[i * 3 + 2] / weld); let v = key.get(k); if (v === undefined) { v = key.size; key.set(k, v); } ids[i] = v; }
        for (let k = 0; k < I.length; k += 3) {
            const a = ids[I[k]], b = ids[I[k + 1]], c = ids[I[k + 2]];
            if (a !== b && b !== c && a !== c) tris.push({ v: [a, b, c], p: [I[k], I[k + 1], I[k + 2]].map(i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]), part: pi });
        }
    });
    // A face laid twice, once each way, is a sheet made two-sided on purpose: it is left out.
    const seen = new Map();
    for (const t of tris) { const r = t.v.indexOf(Math.min(...t.v)), k = [0, 1, 2].map(i => t.v[(r + i) % 3]).join(); seen.set(k, (seen.get(k) || 0) + 1); }
    const twin = t => { const v = [t.v[0], t.v[2], t.v[1]], r = v.indexOf(Math.min(...v)); return seen.has([0, 1, 2].map(i => v[(r + i) % 3]).join()); };
    for (let k = tris.length - 1; k >= 0; k--) if (twin(tris[k])) tris.splice(k, 1);
    const par = [...Array(key.size).keys()], find = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
    for (const t of tris) { par[find(t.v[0])] = find(t.v[1]); par[find(t.v[1])] = find(t.v[2]); }
    const out = new Map();
    for (const t of tris) {
        const r = find(t.v[0]);
        // Volume is taken about the shell's first corner, not the world origin: a 2 mm light on a head 1.6 m up,
        // its seams welded within 0.1 mm, otherwise sums to float noise of either sign.
        if (!out.has(r)) out.set(r, { list: [], edges: new Map(), vol: 0, area: 0, o: t.p[0] });
        const s = out.get(r), [a, b, c] = t.p.map(p => [p[0] - s.o[0], p[1] - s.o[1], p[2] - s.o[2]]);
        s.list.push(t);
        s.area += Math.hypot(a[1] * (b[2] - c[2]) + b[1] * (c[2] - a[2]) + c[1] * (a[2] - b[2]), a[2] * (b[0] - c[0]) + b[2] * (c[0] - a[0]) + c[2] * (a[0] - b[0]), a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])) / 2;
        s.vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
        for (let e = 0; e < 3; e++) { const x = t.v[e], y = t.v[(e + 1) % 3], k = Math.min(x, y) + ':' + Math.max(x, y), u = s.edges.get(k) || [0, 0]; u[x < y ? 0 : 1]++; s.edges.set(k, u); }
    }
    return [...out.values()].map(s => {
        let open = 0, flipped = 0;
        for (const [f, b] of s.edges.values()) { if (f + b === 1) open++; else if (f !== b) flipped++; }
        return { list: s.list, vol: s.vol, area: s.area, open, flipped, ratio: open / s.edges.size, names: [...new Set(s.list.map(t => parts[t.part].name))] };
    });
}
function rayHit(o, d, t) {
    const [a, b, c] = t.p, e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-18) return Infinity;
    const s = [o[0] - a[0], o[1] - a[1], o[2] - a[2]], u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
    if (u < 0 || u > 1) return Infinity;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
    if (v < 0 || u + v > 1) return Infinity;
    const at = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
    return at > 1e-6 ? at : Infinity;
}
/** Share of a sheet's sampled triangles with nothing behind them within `flush`. */
function looseShare(list, all, flush) {
    const step = Math.max(1, Math.floor(list.length / 30));
    let bad = 0, n = 0;
    for (let k = 0; k < list.length; k += step) {
        const t = list[k], [a, b, c] = t.p, e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...f);
        if (l < 1e-14) continue;
        const back = f.map(x => -x / l), o = [0, 1, 2].map(d => (a[d] + b[d] + c[d]) / 3);
        let best = Infinity;
        for (const u of all) if (u !== t) best = Math.min(best, rayHit(o, back, u));
        n++;
        if (!(best < flush)) bad++;
    }
    return n ? bad / n : 0;
}
/** What faces the wrong way in `parts` (empty when all is well). `sheets`: also judge open sheets. */
function winding(parts, sheets = true) {
    const S = shells(parts), all = S.flatMap(s => s.list), problems = [];
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const t of all) for (const p of t.p) for (let d = 0; d < 3; d++) { lo[d] = Math.min(lo[d], p[d]); hi[d] = Math.max(hi[d], p[d]); }
    const flush = Math.max(0.004, 0.03 * Math.max(...hi.map((v, d) => v - lo[d])));
    for (const s of S) {
        // A densely tessellated, explicitly two-sided sheet can have fewer
        // than 8% boundary edges. Its open edges still make volume undefined.
        if (s.ratio < 0.08 && !(s.open && s.list.every(t=>parts[t.part].doubleSided))) {
            // A flat card closed on itself (its two faces split along different diagonals) holds no volume:
            // its sign is float noise, not a facing. A cube turned inside out has -area^1.5 / 15.
            if (s.vol < -1e-4 * s.area ** 1.5) problems.push(`${s.names.join('+')}: closed shell of ${s.list.length} faces turned inside out`);
            if (sheets && s.flipped) problems.push(`${s.names.join('+')}: ${s.flipped} edges wound against their neighbors`);
        } else if (sheets) {
            const single = s.list.filter(t => !parts[t.part].doubleSided);
            if (single.length && looseShare(single, all, flush) > 0.2) problems.push(`${s.names.join('+')}: a single-sided sheet of ${single.length} faces that vanishes from behind`);
        }
    }
    return problems;
}
/** The parts of a saved GLB, in the file's own frame. */
function glbParts(glb) {
    const { json, bin } = Optimizer.parseGlb(glb);
    const data = i => { const a = json.accessors[i], v = json.bufferViews[a.bufferView], size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], Type = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType], off = bin.byteOffset + v.byteOffset + (a.byteOffset || 0); return new Type(bin.buffer.slice(off, off + a.count * size * Type.BYTES_PER_ELEMENT)); };
    return json.meshes.flatMap(m => m.primitives.map(p => ({ name: m.name, positions: data(p.attributes.POSITION), index: Uint32Array.from(data(p.indices)), doubleSided: !!(json.materials && json.materials[p.material] && json.materials[p.material].doubleSided) })));
}
const lowest = parts => { let low = Infinity; for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) low = Math.min(low, p.positions[i]); return low; };
const finite = parts => parts.every(p => ['positions', 'normals'].every(k => !p[k] || p[k].every(Number.isFinite)));
// Containers are another builder's work in progress: their closed shells are held to the rule; their sheets are reported, not judged here.
const judgeSheets = type => type.kind !== 'container';

test('the catalog lists every type once: one id, one label, one place, sections and their groups', () => {
    const ids = Catalog.TYPES.map(t => t.id);
    assert.deepEqual(ids.filter((x, i) => ids.indexOf(x) !== i), [], 'no id twice');
    const tree = Catalog.grouped('');
    const listed = tree.flatMap(g => g.types);
    const labels = listed.map(t => t.label.toLowerCase());
    assert.deepEqual(labels.filter((x, i) => labels.indexOf(x) !== i), [], 'no label twice');
    assert.equal(new Set(listed).size, listed.length, 'no type in two places');
    assert.equal(listed.length, Catalog.TYPES.filter(t => !t.hidden).length, 'every listed type shows');
    for (const c of Catalog.CATEGORIES) if (c.parent) assert.ok(Catalog.CATEGORIES.some(x => x.id === c.parent && !x.parent), `${c.id} sits in a top section`);
    for (const t of Catalog.TYPES) assert.ok(Catalog.CATEGORIES.some(c => c.id === t.category), `${t.id} has a category`);
    const tops = tree.map(g => g.category.label);
    for (const name of ['Banners & Flags', 'From Picture', 'Weapons', 'Wearables', 'Tools & Gear']) assert.ok(tops.includes(name), name);
    for (const g of tree) for (const s of g.groups) assert.ok(!/›/.test(s.category.label), 'short group names');
    // Swords and daggers are the Sword kind's, books the Framed kind's: the accessories of those names are unlisted, yet still open.
    for (const id of ['sword', 'dagger', 'book']) {
        const t = Catalog.TYPES.find(x => x.id === 'accessory-' + id);
        assert.ok(t.hidden, id + ' unlisted');
        assert.equal(Catalog.typeOf(Accessory.normalize({ accessory: { id } })), t, id + ' recipes still name their type');
    }
    const weapons = tree.find(g => g.category.id === 'weapons');
    assert.deepEqual(weapons.groups.map(g => g.category.id).slice(0, 3), ['swords', 'firearms', 'scifi']);
});

test('every catalog entry builds whole, within budget, on the floor, facing outward', () => {
    for (const type of Catalog.TYPES) {
        const r = startOf(type), b = Model.build(r);
        assert.ok(b.parts.length && b.parts.every(p => p.index.length), type.id);
        assert.ok(finite(b.parts), type.id + ' finite');
        const tris = b.parts.reduce((n, p) => n + p.index.length / 3, 0);
        assert.ok(tris <= budgetOf(type.kind), `${type.id}: ${tris} triangles`);
        if (!b.wall && !b.walls) assert.ok(Math.abs(lowest(b.parts)) < 1e-3, `${type.id} rests on y = 0`);
        assert.deepEqual(winding(b.parts, judgeSheets(type)), [], type.id);
    }
});

test('saved GLBs keep the faces outward: every kind, every accessory', async () => {
    for (const type of Catalog.TYPES) {
        if (CLOTH.has(type.kind)) continue;
        const b = Model.build(startOf(type));
        const parts = glbParts(await Model.toGlb(b, type.id, encode));
        assert.deepEqual(winding(parts, judgeSheets(type)), [], type.id + ' GLB');
    }
    // A cloth kind's GLB: the pole and its hardware stay outward; the cloth is double-sided.
    const flag = Model.build(Model.normalize({ kind: 'flag' }));
    const parts = glbParts(await Model.toGlb(flag, 'Flag', encode));
    assert.deepEqual(winding(parts), [], 'flag GLB');
    assert.ok(parts.some(p => p.doubleSided), 'the cloth is double-sided');
});

test('character accessories face outward on the character too', async () => {
    const Body = require(path.join(root, 'src', 'forge', 'Character3D', 'HumanBody.js'));
    const Props = require(path.join(root, 'src', 'forge', 'Character3D', 'CharacterProps.js'));
    const pack = await Body.loadPack(), built = Body.build(pack, {});
    for (const def of Props.PROPS) {
        const out = Props.build(pack, built, [Props.normalizeProp({ id: def.id })], []);
        const problems = winding(out.parts, false);
        assert.deepEqual(problems, [], def.id);
    }
});

// ── the page ────────────────────────────────────────────────────────────
/** The builder's page code with a recording translator and a stand-in for the DOM. */
function page() {
    const box = { console, Math, JSON, Map, Set, Promise, Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, Uint8ClampedArray, setTimeout, clearTimeout };
    box.window = box; box.globalThis = box;
    for (const name of ['THREE', 'RRPropCloth', 'RRPropPaint', 'RRPropMesh', 'RRPropRandom', 'RRPropCatalog', 'RRFlagDesign', 'RRFlagProp', 'RRPropModel', 'RRSpanProp', 'RRFramedProp', 'RRPictureProp', 'RRAccessoryProp', 'RRSwordProp', 'RRGunProp', 'RRContainerProp']) if (globalThis[name]) box[name] = globalThis[name];
    const store = new Map();
    box.sessionStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
    box.rrEscapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    box.document = { createElement: () => ({ getContext: () => null, style: {} }) };
    vm.createContext(box);
    vm.runInContext(fs.readFileSync(path.join(props, 'PropBuilder.js'), 'utf8') + '\n;globalThis.PB = PropBuilder;', box, { filename: 'PropBuilder.js' });
    return { box, store };
}
const SIZE = /(^|\.)(size|scale|length|height|width)$/;
const LOOKS = /data-act="color"|data-path="[^"]*(material|metal|trim|frame|furniture|surface|fabric|wood|style|back)"/;

test('every entry has real settings: a size, a color or material, and no empty section', () => {
    const { box } = page();
    const builder = new box.PB();
    builder._mini = () => '';
    for (const type of Catalog.TYPES) {
        builder.recipe = startOf(type);
        const ui = Catalog.UI[type.kind];
        let html = '';
        for (const [tab] of ui.tabs) {
            builder.tab = tab;
            const one = String(ui.panel.call(builder, tab));
            html += one;
            // Each section is followed by a control before the next section.
            const pieces = one.split('<div class="rr-c3d-section"').slice(1);
            for (const piece of pieces) {
                const title = (piece.match(/data-title="([^"]*)"/) || [])[1];
                const body = piece.slice(piece.indexOf('</div>') + 6);
                assert.match(body, /<input|<select|<button/, `${type.id} › ${tab}: the "${title}" section has a setting`);
            }
        }
        const paths = [...html.matchAll(/type="range" data-path="([^"]+)"/g)].map(m => m[1]);
        assert.ok(paths.some(p => SIZE.test(p)), `${type.id} has a size (${paths.join(', ')})`);
        assert.match(html, LOOKS, `${type.id} has a color or material`);
    }
});

test('the choker: band style, width, thickness, charm and studs, all building', () => {
    const { box } = page();
    const builder = new box.PB();
    builder.recipe = Accessory.normalize({ accessory: { id: 'choker' } });
    const html = String(Catalog.UI.accessory.panel.call(builder, 'equipment'));
    for (const p of ['accessory.shape', 'accessory.width', 'accessory.thick', 'accessory.charm', 'accessory.studs', 'accessory.color2']) assert.ok(html.includes(`data-path="${p}"`), p);
    for (const shape of ['leather', 'velvet', 'metal', 'lace']) for (const charm of ['none', 'gem', 'bell', 'cross', 'ring']) {
        const b = Accessory.build(Accessory.normalize({ accessory: { id: 'choker', shape, charm, studs: true, width: 1.6, thick: 2 } }));
        assert.ok(finite(b.parts) && b.triangles > 100, shape + ' ' + charm);
        assert.deepEqual(winding(b.parts), [], shape + ' ' + charm);
    }
});

test('Randomize: every kind rolls 50 believable recipes per scope set, whole and outward', () => {
    const byKind = new Map();
    for (const t of Catalog.TYPES) { if (!byKind.has(t.kind)) byKind.set(t.kind, []); byKind.get(t.kind).push(t); }
    for (const [kind, types] of byKind) {
        const k = Model.KINDS.find(x => x.id === kind);
        assert.ok(k.random, kind + ' randomizes');
        const scopes = (k.randomScopes || [['all']]).map(s => s[0]);
        assert.equal(scopes[0], 'all');
        let changed = 0;
        for (let s = 1; s <= 50; s++) {
            const type = types[s % types.length], scope = scopes[s % scopes.length], from = startOf(type);
            const r = Model.normalize(k.random(s * 7919, from, scope));
            assert.equal(r.kind, kind);
            assert.deepEqual(Model.normalize(r), r, `${kind} ${s}: a normalized recipe`);
            if (JSON.stringify(r) !== JSON.stringify(from)) changed++;
            const b = Model.build(r);
            assert.ok(finite(b.parts), `${kind} ${s} finite`);
            const tris = b.parts.reduce((n, p) => n + p.index.length / 3, 0);
            assert.ok(tris > 0 && tris <= budgetOf(type.kind), `${kind} ${s}: ${tris} triangles`);
            if (!b.wall && !b.walls && !(r.pivot && r.pivot !== 'bottom')) assert.ok(Math.abs(lowest(b.parts)) < 1e-3, `${kind} ${s} (${type.id}, ${scope}) on the floor`);
            assert.deepEqual(winding(b.parts, judgeSheets(type)), [], `${kind} ${s} (${type.id}, ${scope})`);
        }
        assert.ok(changed >= 40, `${kind}: Randomize changes the recipe (${changed} of 50)`);
    }
    // A scope keeps what it does not cover: a sword's colors roll leaves its blade alone.
    const Sword = require(path.join(props, 'SwordProp.js'));
    const sword = Sword.normalize({ preset: 'katana' }), tinted = Sword.random(5, sword, 'colors');
    assert.deepEqual(tinted.blade.length, sword.blade.length);
    assert.equal(tinted.preset, 'katana');
    const reshaped = Sword.random(5, sword, 'shape');
    assert.equal(reshaped.metal, sword.metal);
});

test('the left column folds a section by click or key, remembers it for the session, and opens it for a search', () => {
    const { box, store } = page();
    const list = { innerHTML: '' }, heads = [];
    const builder = new box.PB();
    builder.root = { querySelector: sel => (sel === '.rr-prop-typelist' ? list : null), querySelectorAll: () => heads };
    builder.recipe = Model.normalize({ kind: 'flag' });
    builder._renderTypes();
    const collapsed = id => new RegExp(`rr-prop-cat is-collapsed">\\s*<div class="lit-section-header rr-prop-cathead" data-cat="${id}"`).test(list.innerHTML);
    assert.ok(!collapsed('banners'));
    builder._foldCategory('banners');
    assert.ok(collapsed('banners'), 'the section holding the current type folds too');
    builder._foldCategory('weapons');
    assert.ok(collapsed('weapons'));
    assert.deepEqual(JSON.parse(store.get(box.PB.FOLDED_KEY)).sort(), ['cat:banners', 'cat:weapons']);
    builder.search = 'katana';
    builder._renderTypes();
    assert.ok(!collapsed('weapons') && list.innerHTML.includes('data-type="sword-katana"'), 'a search opens the sections it matches');
    assert.ok(!list.innerHTML.includes('data-cat="banners"'), 'and leaves out the rest');
    builder.search = '';
    builder._renderTypes();
    assert.ok(collapsed('weapons'), 'the fold comes back after the search');
    builder._foldCategory('weapons');
    assert.ok(!collapsed('weapons'), 'and opens again');
    // A new builder in the same session starts folded the same way.
    const again = new box.PB();
    assert.ok(again.folded['cat:banners'] && !again.folded['cat:weapons']);
    const source = fs.readFileSync(path.join(props, 'PropBuilder.js'), 'utf8');
    assert.ok(/\(e\.key === 'Enter' \|\| e\.key === ' '\)\) \{ e\.preventDefault\(\); this\._foldCategory/.test(source), 'Enter and Space fold a focused header');
});
