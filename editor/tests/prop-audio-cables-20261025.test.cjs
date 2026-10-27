'use strict';
// Forge › Prop Builder › Winds with real bores, and wires and cables (2026-10-25b). The flute, recorder and ocarina
// are hollow: a look (a ray) goes in at the foot and through the embouchure hole, open keys, window and finger
// holes into the dark bore; the saxophone's bell and bow clear its body; and the cable kind builds whole for every
// style, path, end and wire count, a bundle holding as many wires as it says; the speakers (Stage gear) build whole
// with the woofers, tweeter and grille they say.
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
const Instrument = require(path.join(props, 'InstrumentProp.js'));
const Cable = require(path.join(props, 'CableProp.js'));
const Speaker = require(path.join(props, 'SpeakerProp.js'));

const tris = b => b.parts.reduce((n, p) => n + p.index.length / 3, 0);
const finite = b => b.parts.every(p => p.positions.every(Number.isFinite) && p.normals.every(Number.isFinite) && (!p.uvs || p.uvs.every(Number.isFinite)));
const lowest = b => { let l = Infinity; for (const p of b.parts) for (let i = 1; i < p.positions.length; i += 3) l = Math.min(l, p.positions[i]); return l; };
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

/** The built parts as one THREE scene, for rays. */
function scene(b) {
    const g = new THREE.Group();
    for (const p of b.parts) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(p.positions), 3)); geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(p.index), 1)); g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))); }
    g.updateMatrixWorld(true);
    return g;
}
/** The first thing a ray from `o` along `d` meets: its distance and point (Infinity when nothing). */
function cast(g, o, d) {
    const ray = new THREE.Raycaster(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize(), 0, 10), hit = ray.intersectObject(g, true)[0];
    return hit ? { d: hit.distance, p: hit.point.toArray() } : { d: Infinity };
}
const V = { add: (a, b) => a.map((v, i) => v + b[i]), sub: (a, b) => a.map((v, i) => v - b[i]), mul: (a, s) => a.map(v => v * s), norm: a => { const l = Math.hypot(...a); return a.map(v => v / l); } };
/** Weapon space along a laid instrument: its foot-to-head axis and a point at `x` meters along it (from the markers). */
function axisOf(b, L) {
    const m = b.sidecarExtra.rig.markers, tip = m.tip, gb = m.gripBottom, dir = V.norm(V.sub(tip, gb)), foot = V.sub(tip, V.mul(dir, L * b.recipe.size));
    return { dir, foot, at: x => V.add(foot, V.mul(dir, x * b.recipe.size)) };
}

test('the flute is open: a look goes in at its foot up the bore to the cork, and down through the embouchure hole and the open keys', () => {
    for (const shape of [0, 0.5, 1]) for (const length of [0.8, 1, 1.25]) {
        const r = Instrument.normalize({ preset: 'flute', shape, length }), b = Model.build(r), g = scene(b), L = 0.67 * length, A = axisOf(b, L), what = JSON.stringify({ shape, length });
        const R = 0.0095 * (0.9 + shape * 0.2);
        assert.ok(b.parts.some(p => p.name === 'Dark'), 'a dark bore');
        // In at the foot: nothing until the cork, past the lip plate.
        const end = cast(g, V.sub(A.foot, V.mul(A.dir, 0.05)), A.dir);
        assert.ok(end.d - 0.05 > (L - 0.075) * r.size, `${what}: the bore runs open from the foot (${(end.d - 0.05).toFixed(3)} m)`);
        // Down through the embouchure hole and an open key's ring: into the bore, to its far wall.
        for (const x of [L - 0.075, 0.27 * L, 0.31 * L]) {
            const top = V.add(A.at(x), [0, 0.05, 0]), hit = cast(g, top, [0, -1, 0]);
            assert.ok(hit.p && hit.p[1] < A.at(x)[1] - R * 0.5 * r.size, `${what}: a look at ${x.toFixed(3)} m goes into the bore (${hit.p && hit.p[1].toFixed(4)})`);
        }
        // A closed key stays shut.
        const shut = cast(g, V.add(A.at(0.17 * L), [0, 0.05, 0]), [0, -1, 0]);
        assert.ok(shut.p[1] > A.at(0.17 * L)[1] + R * 0.9 * r.size, what + ': a closed pad covers its hole');
    }
});

test('the recorder is open: up the bore from the foot to its block, down through the window and its finger holes', () => {
    for (const length of [0.8, 1, 1.25]) {
        const r = Instrument.normalize({ preset: 'recorder', length }), b = Model.build(r), g = scene(b), L = 0.32 * length, A = axisOf(b, L), R = 0.0115;
        const end = cast(g, V.sub(A.foot, V.mul(A.dir, 0.05)), A.dir);
        assert.ok(end.d - 0.05 > L * 0.76 * r.size, `the bore runs open to the window (${(end.d - 0.05).toFixed(3)} m of ${L})`);
        for (const x of [L * 0.785 + 0.0015, 0.4 * L + 0.02, 0.63 * L + 0.02]) {
            const hit = cast(g, V.add(A.at(x), [0, 0.05, 0]), [0, -1, 0]);
            assert.ok(hit.p && hit.p[1] < A.at(x)[1] - R * 0.3, `a look at ${x.toFixed(3)} m goes into the bore`);
        }
    }
});

test('the ocarina is a hollow glazed vessel: its finger holes and voicing window cut through into a dark inside', () => {
    for (const shape of [0, 1]) {
        const b = Model.build(Instrument.normalize({ preset: 'ocarina', shape })), names = b.parts.map(p => p.name);
        assert.ok(names.includes('Dark') && names.includes('Paint'), names.join());
        const paint = b.parts.find(p => p.name === 'Paint');
        assert.ok(paint.texture && b.textures[paint.texture], 'glazed with a picture');
        assert.deepEqual(winding(b.parts), []);
        assert.ok(tris(b) <= 25000, tris(b) + ' triangles');
        // Looking straight down over the top, some looks drop into it past the wall (the holes).
        const g = scene(b), box = new THREE.Box3().setFromObject(g); let deep = 0;
        for (let i = 0; i <= 60; i++) for (let j = 0; j <= 30; j++) {
            const x = box.min.x + (box.max.x - box.min.x) * i / 60, z = box.min.z + (box.max.z - box.min.z) * j / 30, hit = cast(g, [x, box.max.y + 0.05, z], [0, -1, 0]);
            if (hit.p && hit.p[1] < box.min.y + (box.max.y - box.min.y) * 0.35) deep++;
        }
        assert.ok(deep >= 8, `looks fall through the holes into it (${deep})`);
    }
});

test('the saxophone: a conical body standing on its bow, its bell and bow beside the body without passing through it', () => {
    for (const shape of [0, 0.5, 1]) for (const length of [0.8, 1, 1.25]) {
        const r = Instrument.normalize({ preset: 'sax', shape, length }), H = {};
        for (const k of ['Wood', 'Top', 'Varnish', 'Bow', 'Paint', 'Board', 'Dark', 'Ivory', 'Metal', 'String', 'StringC', 'StringF', 'Hair', 'Head', 'Accent', 'Rubber', 'Glow', 'Crystal', 'Gem']) H[k] = [];
        Instrument.BUILD.sax(r, H);
        const { top, bottom, rb, bell } = H._sax, P = bell.positions;
        for (let i = 0; i < P.length; i += 3) {
            const x = P[i], d = Math.hypot(P[i + 1], P[i + 2]);
            if (x > bottom && x < top) assert.ok(d > rb(x) + 0.006, `shape ${shape} length ${length}: the bell at x ${x.toFixed(3)} is ${(d - rb(x)).toFixed(4)} m off the body`);
        }
        // Proportions: a cone much wider at its foot than its top, standing 60-72 cm tall, its bell rim in the lower half.
        assert.ok(rb(bottom) > rb(top) * 2, 'a clearly conical body');
        const b = Model.build(r), hi = Math.max(...b.parts.flatMap(p => Array.from(p.positions).filter((v, i) => i % 3 === 1)));
        assert.ok(hi > 0.58 * length * 1.05 && hi < 0.74 * Math.max(1, length), `${hi.toFixed(3)} m tall`);
    }
});

test('cables: every style builds whole, on the floor, outward, in budget, listed in Tools & Gear', () => {
    const group = Catalog.grouped('').flatMap(s => s.groups || []).find(g => g.category.id === 'cables');
    assert.ok(group && group.types.length === Cable.PRESETS.length, 'a Wires & Cables group');
    for (const t of group.types) {
        const b = Model.build(Model.normalize(t.start()));
        assert.ok(finite(b) && tris(b) > 100 && tris(b) <= 40000, t.id + ' ' + tris(b));
        assert.ok(Math.abs(lowest(b)) < 1e-3, t.id + ' on the floor');
        assert.deepEqual(winding(b.parts), [], t.id);
    }
    for (const preset of ['bundle', 'cord']) for (const p of Cable.PATHS) for (const e of Cable.ENDS) for (const wires of [1, 7, 24]) for (const jacket of [false, true]) {
        const r = Cable.normalize({ preset, path: p[0], ends: e[0], wires, jacket, length: wires === 24 ? 6 : 1.2, sag: 1, gauge: wires === 24 ? 1 : 0.4 }), b = Model.build(r), what = JSON.stringify(r);
        assert.ok(finite(b) && tris(b) <= 40000, what + ' ' + tris(b));
        assert.ok(Math.abs(lowest(b)) < 1e-3, what + ' on the floor');
        assert.deepEqual(winding(b.parts), [], what);
    }
});

test('a bundle holds the wires it says, packed without crossing, and Randomize rolls whole cables', () => {
    for (let n = 1; n <= 24; n++) {
        const { at, R } = Cable.packing(n, 0.002);
        assert.equal(at.length, n);
        for (let i = 0; i < n; i++) { assert.ok(Math.hypot(...at[i]) + 0.002 <= R + 1e-9, n + ' inside'); for (let j = 0; j < i; j++) assert.ok(Math.hypot(at[i][0] - at[j][0], at[i][1] - at[j][1]) >= 0.004 * 0.88, `${n}: wires ${i} and ${j} apart`); }
        const b = Model.build(Cable.normalize({ preset: 'bundle', wires: n, ends: 'none', coloring: 'random', ties: 0, path: 'straight' }));
        // Each loose wire its own tube: count the separate pieces of the wire parts.
        const wires = b.parts.filter(p => /^Wire\d/.test(p.name));
        let pieces = 0;
        for (const p of wires) { const P = p.positions, I = p.index, par = [...Array(P.length / 3).keys()], f = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; }, key = new Map(); for (let i = 0; i < P.length / 3; i++) { const k = P.slice(i * 3, i * 3 + 3).map(v => Math.round(v * 1e4)).join(); if (key.has(k)) par[f(i)] = f(key.get(k)); else key.set(k, i); } for (let t = 0; t < I.length; t += 3) { par[f(I[t])] = f(I[t + 1]); par[f(I[t + 1])] = f(I[t + 2]); } pieces += new Set([...par.keys()].map(f)).size; }
        assert.equal(pieces, n === 1 ? 1 : n, n + ' wires in the bundle');
    }
    const kind = Model.KINDS.find(k => k.id === 'cable'), scopes = kind.randomScopes.map(s => s[0]);
    let changed = 0;
    for (let s = 1; s <= 40; s++) {
        const from = Cable.normalize({ preset: Cable.PRESETS[s % Cable.PRESETS.length][0] }), r = Model.normalize(kind.random(s * 7919, from, scopes[s % scopes.length]));
        assert.deepEqual(Model.normalize(r), r);
        if (JSON.stringify(r) !== JSON.stringify(from)) changed++;
        const b = Model.build(r), what = s + ' ' + JSON.stringify(r);
        assert.ok(finite(b) && tris(b) <= 40000 && Math.abs(lowest(b)) < 1e-3, what);
        assert.deepEqual(winding(b.parts), [], what);
    }
    assert.ok(changed >= 32, 'Randomize changes it (' + changed + ')');
    const seed = Cable.normalize({ preset: 'cord' });
    assert.deepEqual(Cable.random(5, seed, 'all'), Cable.random(5, seed, 'all'), 'a seed rolls the same cable');
});

test('speakers sit in Stage gear beside the microphone and build whole with the woofers, tweeter and grille they say', () => {
    const stage = Catalog.grouped('').find(g => g.category.id === 'instruments').groups.find(g => g.category.id === 'acc-instruments');
    for (const [id, label] of Speaker.PRESETS) assert.ok(stage.types.some(t => t.id === 'speaker-' + id && t.label === label), id + ' in Stage gear');
    const shells = (b, name) => { const p = b.parts.find(x => x.name === name); if (!p) return 0; const P = p.positions, I = p.index, par = [...Array(P.length / 3).keys()], f = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; }, key = new Map(); for (let i = 0; i < P.length / 3; i++) { const k = P.slice(i * 3, i * 3 + 3).map(v => Math.round(v * 1e4)).join(); if (key.has(k)) par[f(i)] = f(key.get(k)); else key.set(k, i); } for (let t = 0; t < I.length; t += 3) { par[f(I[t])] = f(I[t + 1]); par[f(I[t + 1])] = f(I[t + 2]); } return new Set([...par.keys()].map(f)).size; };
    for (const [id] of Speaker.PRESETS) {
        const [lo, hi] = Speaker.CONES[id];
        for (let cones = lo; cones <= hi; cones++) for (const grille of [false, true]) for (const tweeter of [false, true]) for (const size of [0.6, 1.6]) {
            const r = Speaker.normalize({ preset: id, cones, grille, tweeter, size }), b = Model.build(r), what = JSON.stringify(r);
            assert.ok(finite(b) && tris(b) > 500 && tris(b) <= 30000, what + ' ' + tris(b));
            assert.ok(Math.abs(lowest(b)) < 1e-3, what + ' on the floor');
            assert.deepEqual(winding(b.parts), [], what);
            assert.equal(shells(b, 'Cone'), cones, what + ': its woofers');
            if (id === 'pod') assert.ok(!b.parts.some(p => p.name === 'Cloth' || p.name === 'Grille'), what + ': no grille on the pod');
            else if (id !== 'wedge') assert.equal(b.parts.some(p => p.name === 'Cloth'), grille, what + ': grille cloth');
            else assert.equal(b.parts.some(p => p.name === 'Grille'), grille, what + ': metal grille');
        }
    }
    const kind = Model.KINDS.find(k => k.id === 'speaker'), scopes = kind.randomScopes.map(s => s[0]);
    for (let s = 1; s <= 30; s++) {
        const r = Model.normalize(kind.random(s * 104729, Speaker.normalize({ preset: Speaker.PRESETS[s % 5][0] }), scopes[s % scopes.length])), b = Model.build(r);
        assert.deepEqual(Model.normalize(r), r);
        assert.ok(finite(b) && tris(b) <= 30000 && Math.abs(lowest(b)) < 1e-3, JSON.stringify(r));
        assert.deepEqual(winding(b.parts), [], JSON.stringify(r));
    }
});

test('a bundle\'s wire palette: the standard code by default, saved in the recipe, a swatch each in the panel with + and -, and it colors the wires', () => {
    const colorsOf = b => new Set(b.parts.filter(p => /^Wire\d/.test(p.name)).map(p => p.color.toLowerCase()));
    const coded = Cable.normalize({ preset: 'bundle' });
    assert.deepEqual(coded.wireColors, ['#7a4e2a', '#b8282a', '#e0761c', '#e2c230', '#2f8a3c', '#2456b0', '#7a42a8', '#8c8f94', '#ecebe4', '#1c1c1f'], 'brown, red, orange, yellow, green, blue, violet, grey, white, black');
    assert.deepEqual(Cable.normalize(JSON.parse(JSON.stringify(coded))), coded, 'the palette survives saving');
    // Editing the palette recolors the wires: coded cycles it in order, mixed deals every color before any repeats.
    const mine = ['#ff0000', '#00ff00', '#0000ff'];
    for (const coloring of ['coded', 'random']) {
        const b = Model.build(Cable.normalize({ preset: 'bundle', coloring, wireColors: mine, wires: 6 }));
        assert.deepEqual([...colorsOf(b)].sort(), mine.slice().sort(), coloring + ': the wires take the palette');
        const one = Model.build(Cable.normalize({ preset: 'bundle', coloring, wireColors: ['#123456'], wires: 6 }));
        assert.deepEqual([...colorsOf(one)], ['#123456'], coloring + ': a one-color palette');
    }
    const single = Model.build(Cable.normalize({ preset: 'bundle', coloring: 'one', color: '#abcdef', wireColors: mine }));
    assert.deepEqual([...colorsOf(single)], ['#abcdef'], 'one color: the single picker wins');
    // The jacket has its own color, apart from the wires'.
    const cord = Model.build(Cable.normalize({ preset: 'cord', jacketColor: '#00aa55', color: '#aa0000' }));
    assert.equal(cord.parts.find(p => p.name === 'Jacket').color.toLowerCase(), '#00aa55');
    assert.deepEqual(Cable.normalize({ wireColors: [] }).wireColors.length > 0, true, 'never an empty palette');
    assert.equal(Cable.normalize({ preset: 'bundle', wireColors: Array(20).fill('#111111') }).wireColors.length, Cable.MAX_COLORS);
    // The panel: one picker in single-color mode; a swatch per palette color with + and - otherwise; the jacket's own picker.
    const stub = { recipe: null, _t: s => s, _section: s => `<div class="rr-c3d-section" data-title="${s}"></div>`, _tiles: () => '', _slider: o => `<input type="range" data-path="${o.path}">`, _select: p => `<select data-path="${p}">`, _color: p => `<button data-act="color" data-path="${p}">`, _check: p => `<input type="checkbox" data-path="${p}">` };
    const ui = Catalog.UI.cable;
    stub.recipe = Cable.normalize({ preset: 'bundle' });
    let html = ui.panel.call(stub, 'look');
    for (let i = 0; i < 10; i++) assert.ok(html.includes(`data-path="wireColors.${i}"`), 'swatch ' + i);
    assert.ok(html.includes('data-act="cable-color-add"') && html.includes('data-act="cable-color-remove"'), '+ and -');
    assert.ok(!html.includes('data-path="color"'), 'no single picker in coded mode');
    stub.recipe = Cable.normalize({ preset: 'cord' });
    html = ui.panel.call(stub, 'look');
    assert.ok(html.includes('data-path="color"') && html.includes('data-path="jacketColor"') && !html.includes('wireColors.0'), 'single mode: one wire picker, and the jacket\'s');
    // + adds the next standard color not in it, - takes the last off.
    const host = { recipe: Cable.normalize({ preset: 'bundle', wireColors: ['#7a4e2a', '#b8282a'] }), _set(path, v) { this.recipe = Cable.normalize(Object.assign({}, this.recipe, { [path]: v })); }, _commit() {}, _renderPanel() {}, _queueRebuild() {} };
    ui.act.call(host, 'cable-color-add', {});
    assert.deepEqual(host.recipe.wireColors, ['#7a4e2a', '#b8282a', '#e0761c']);
    ui.act.call(host, 'cable-color-remove', {}); ui.act.call(host, 'cable-color-remove', {}); ui.act.call(host, 'cable-color-remove', {});
    assert.deepEqual(host.recipe.wireColors, ['#7a4e2a'], 'down to one, never none');
    // Randomize rolls palettes.
    const rolled = new Set();
    for (let s = 1; s <= 20; s++) rolled.add(JSON.stringify(Cable.random(s * 31, coded, 'colors').wireColors));
    assert.ok(rolled.size >= 10, 'rolled palettes vary (' + rolled.size + ')');
});
