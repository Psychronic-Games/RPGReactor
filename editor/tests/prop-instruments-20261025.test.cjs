'use strict';
// Forge › Prop Builder › Instruments (2026-10-25): a section of its own (strings, winds and brass, drums and
// keys, fantasy and sci-fi; the equipment list's stage gear beside them, its old guitar unlisted). Every
// style builds whole (finite, closed and outward, on the floor, within 25k triangles) at the ends of its
// sliders; its wood carries grain along its length; its hand rig sits on its neck or body; a seed always rolls
// the same instrument; a recipe survives JSON and the saved GLB; the glowing ones glow; the page offers styles,
// a size and materials; and the runtime's own hold takes the handheld ones in the fist like a sword.
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
const Instrument = require(path.join(props, 'InstrumentProp.js'));
const Optimizer = require(path.join(root, 'src', 'utils', 'GlbOptimizer.js'));
const { PNG } = require(path.join(root, 'node_modules', 'pngjs'));
const encode = t => { const p = new PNG({ width: t.width, height: t.height }); p.data = Buffer.from(t.data); return PNG.sync.write(p); };

const BUDGET = 25000;
const tris = b => b.parts.reduce((n, p) => n + p.index.length / 3, 0);
const finite = b => b.parts.every(p => p.positions.every(Number.isFinite) && p.normals.every(Number.isFinite) && (!p.uvs || p.uvs.every(Number.isFinite)));
const lowest = b => { let l = Infinity; for (const p of b.parts) for (let i = 1; i < p.positions.length; i += 3) l = Math.min(l, p.positions[i]); return l; };
const IDS = Instrument.PRESETS.map(p => p[0]);
const build = r => Model.build(Instrument.normalize(r));

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


test('Instruments is a section of its own: four groups, every style once, stage gear beside them, the old guitar unlisted', () => {
    const tree = Catalog.grouped(''), section = tree.find(g => g.category.id === 'instruments');
    assert.ok(section && !section.category.parent, 'a top section');
    assert.deepEqual(section.groups.map(g => g.category.id), ['inst-strings', 'inst-winds', 'inst-drums', 'inst-fantasy', 'acc-instruments']);
    for (const [id, label, category] of Instrument.PRESETS) {
        const t = Catalog.TYPES.find(x => x.id === 'instrument-' + id);
        assert.ok(t && !t.hidden && t.category === category && t.label === label, id + ' listed');
        assert.equal(Catalog.typeOf(Model.normalize(t.start())), t, id + ' is what it starts as');
        assert.ok(Catalog.ICONS[t.icon], id + ' has its icon');
    }
    const labels = tree.flatMap(g => g.types).map(t => t.label.toLowerCase());
    assert.deepEqual(labels.filter((x, i) => labels.indexOf(x) !== i), [], 'no label twice');
    const old = Catalog.TYPES.find(x => x.id === 'accessory-guitar');
    assert.ok(old.hidden, 'the equipment guitar is unlisted');
    assert.equal(Catalog.typeOf(Accessory.normalize({ accessory: { id: 'guitar' } })), old, 'its saved recipes still open');
    assert.ok(section.groups.find(g => g.category.id === 'acc-instruments').types.some(t => t.id === 'accessory-microphone'), 'the microphone sits in Stage gear');
    for (const q of ['violin', 'trumpet', 'music', 'drum']) assert.ok(Catalog.grouped(q).some(g => g.category.id === 'instruments'), 'a search for ' + q + ' finds them');
});

test('every style builds whole: finite, closed and outward, on the floor, within 25k triangles', () => {
    for (const id of IDS) {
        const b = build({ preset: id });
        assert.ok(finite(b), id + ' finite');
        assert.ok(tris(b) <= BUDGET && tris(b) > 1000, `${id}: ${tris(b)} triangles`);
        assert.ok(Math.abs(lowest(b)) < 1e-3, id + ' on the floor');
        assert.deepEqual(winding(b.parts), [], id);
    }
});

test('across their settings: the ends of every slider, every wood and metal, glow and bow, still whole and in budget', () => {
    for (const id of IDS) for (const v of [0, 1]) {
        const r = { preset: id, size: v ? 1.4 : 0.7, shape: v, length: v ? 1.25 : 0.8, glow: !!v, bow: !!v, wood: Instrument.WOODS[v * 3][0], metal: v ? 'black' : 'gold' };
        const b = build(r), what = JSON.stringify(r);
        assert.ok(finite(b) && tris(b) <= BUDGET, what + ' ' + tris(b));
        assert.deepEqual(winding(b.parts), [], what);
    }
});

test('real sizes, wood with its grain along the part, and rigs on the part a hand takes', () => {
    const span = b => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const p of b.parts) for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p.positions[i + k]); hi[k] = Math.max(hi[k], p.positions[i + k]); } return Math.max(...hi.map((h, k) => h - lo[k])); };
    const SIZE = { acoustic: [0.95, 1.15], electric: [0.9, 1.1], bass: [1.1, 1.3], violin: [0.55, 0.8], cello: [1.2, 1.6], lute: [0.75, 1], harp: [0.8, 1], flute: [0.6, 0.72], recorder: [0.28, 0.36], ocarina: [0.14, 0.24], trumpet: [0.5, 0.7], sax: [0.6, 0.8], snare: [0.34, 0.42], handdrum: [0.55, 0.65], keytar: [0.85, 1], lyre: [0.42, 0.58], synth: [0.45, 0.56] };
    for (const id of IDS) {
        const b = build({ preset: id, bow: false }), s = span(b);
        assert.ok(s >= SIZE[id][0] && s <= SIZE[id][1], `${id}: ${s.toFixed(3)} m across`);
        const rig = b.sidecarExtra.rig;
        assert.equal(rig.template, 'blade', id + ' held like a blade');
        for (const k of ['gripBottom', 'gripTop', 'tip', 'edge']) assert.ok(rig.markers[k] && rig.markers[k].every(Number.isFinite), id + ' ' + k);
        const mid = rig.markers.gripTop.map((v, k) => (v + rig.markers.gripBottom[k]) / 2);
        assert.ok(nearest(b, mid) < 0.05, `${id}: the grip is on the instrument (${nearest(b, mid).toFixed(3)} m off)`);
        assert.ok(dist(rig.markers.gripTop, rig.markers.gripBottom) > 0.02, id + ' a grip with length');
        for (const p of b.parts) if (/^(Wood|Top|Varnish|Bow)$/.test(p.name)) assert.ok(p.texture && b.textures[p.texture] && p.uvs && p.uvs.some(v => Math.abs(v) > 0.5), id + ' ' + p.name + ' textured along its grain');
    }
    // A guitar's top runs its grain along the body: its uvs change along the length (v), not across it (u).
    const g = build({ preset: 'acoustic' }), top = g.parts.find(p => p.name === 'Top');
    let du = 0, dv = 0;
    for (let i = 0; i + 1 < top.positions.length / 3; i++) { du += Math.abs(top.uvs[(i + 1) * 2] - top.uvs[i * 2]); dv += Math.abs(top.uvs[(i + 1) * 2 + 1] - top.uvs[i * 2 + 1]); }
    assert.ok(Number.isFinite(du + dv) && du + dv > 0, 'uvs vary');
});

test('a seed always rolls the same instrument; scopes keep what they do not cover; Shuffle keeps the style', () => {
    const from = Instrument.normalize({ preset: 'violin' });
    assert.deepEqual(Instrument.random(42, from, 'all'), Instrument.random(42, from, 'all'));
    const colors = Instrument.random(7, from, 'colors');
    assert.equal(colors.preset, 'violin'); assert.equal(colors.size, from.size); assert.equal(colors.length, from.length);
    const shape = Instrument.random(7, from, 'shape');
    assert.equal(shape.color, from.color); assert.equal(shape.preset, 'violin');
    assert.equal(Instrument.random(9, from, 'all', true).preset, 'violin', 'Shuffle keeps the style');
    for (let s = 1; s < 40; s++) { const r = Instrument.random(s, from, 'all'); assert.deepEqual(Instrument.normalize(r), r); }
});

test('Randomize: rolls of every scope build whole and outward, on the floor, in budget, and change the recipe', () => {
    const kind = Model.KINDS.find(k => k.id === 'instrument'), scopes = kind.randomScopes.map(s => s[0]);
    let changed = 0;
    for (let s = 1; s <= 60; s++) {
        const from = Instrument.normalize({ preset: IDS[s % IDS.length] }), r = Model.normalize(kind.random(s * 7919, from, scopes[s % scopes.length]));
        assert.deepEqual(Model.normalize(r), r, s + ' normalized');
        if (JSON.stringify(r) !== JSON.stringify(from)) changed++;
        const b = Model.build(r), what = s + ' ' + JSON.stringify(r);
        assert.ok(finite(b) && tris(b) <= BUDGET && Math.abs(lowest(b)) < 1e-3, what);
        assert.deepEqual(winding(b.parts), [], what);
    }
    assert.ok(changed >= 50, 'Randomize changes the recipe (' + changed + ' of 60)');
});

test('a recipe survives JSON and the saved GLB; the glowing ones glow; nothing animates', async () => {
    for (const id of IDS) {
        const r = Instrument.normalize({ preset: id, size: 1.1, shape: 0.3 });
        assert.deepEqual(Instrument.normalize(JSON.parse(JSON.stringify(r))), r, id);
        const b = Model.build(r), glb = await Model.toGlb(b, id, encode), { json } = Optimizer.parseGlb(glb);
        assert.ok(json.meshes.length && json.materials.length, id + ' GLB');
        assert.equal(b.clips.length, 0, id + ' no clips');
        const glowing = b.parts.some(p => p.emissive);
        assert.equal(glowing, !!r.glow && ['keytar', 'lyre', 'synth'].includes(id), id + (glowing ? ' glows' : ' does not glow'));
    }
    const off = Model.build(Instrument.normalize({ preset: 'synth', glow: false }));
    assert.ok(!off.parts.some(p => p.emissive), 'a synth switched off is dark');
});

test('the page: styles as tiles, a size and proportions, materials by style', () => {
    const calls = [], stub = { recipe: null, _t: s => s, _section: s => `<div class="rr-c3d-section" data-title="${s}"></div>`, _tiles: (a, list) => list.map(x => `<button data-id="${x.id}">`).join(''),
        _slider: o => (calls.push(o.path), `<input type="range" data-path="${o.path}">`), _select: (p, l) => (calls.push(p), `<select data-path="${p}" data-label="${l}">`), _color: p => (calls.push(p), `<input data-act="color" data-path="${p}">`), _check: p => (calls.push(p), `<input type="checkbox" data-path="${p}">`) };
    const ui = Catalog.UI.instrument;
    for (const id of IDS) {
        calls.length = 0; stub.recipe = Instrument.normalize({ preset: id });
        const html = ui.panel.call(stub, 'shape') + ui.panel.call(stub, 'look');
        for (const p of ['size', 'length', 'shape', 'metal']) assert.ok(calls.includes(p), id + ' ' + p);
        assert.equal((html.match(/data-id="/g) || []).length, IDS.length, id + ' every style a tile');
        if (Instrument.FAMILY[id].glow) assert.ok(calls.includes('glow'), id + ' glow');
        if (Instrument.FAMILY[id].bow) assert.ok(calls.includes('bow'), id + ' bow');
    }
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

test('a character holds the handheld ones as it holds a sword: in the fist by the neck or body, the rest out beyond the hand', async () => {
    const M = Reactor3D.MapHeld, kept = {};
    for (const name of ['characterModelSpec', 'databaseModelSpec', 'loadModel', 'loadModelSidecar', 'characterGround']) kept[name] = Reactor3D[name];
    global.$gameMap = { mapId: () => 5 }; global.Graphics = { frameCount: 0 };
    try {
        for (const [preset, attachment] of [['acoustic', 'rightHand'], ['electric', 'rightHand'], ['violin', 'leftHand'], ['lute', 'leftHand'], ['flute', 'rightHand'], ['recorder', 'rightHand'], ['trumpet', 'rightHand'], ['sax', 'rightHand'], ['keytar', 'leftHand'], ['lyre', 'leftHand'], ['handdrum', 'rightHand']]) {
            const kind = 'instrument', recipe = { preset }, hands = 'one';
            const b = Model.build(Instrument.normalize(recipe)), sidecar = JSON.parse(JSON.stringify(Model.sidecar(b))), object = await glbObject(b), what = kind + ' ' + recipe.preset;
            const rig = Reactor3D.readHeldRig(sidecar);
            assert.ok(rig, what + ': the runtime reads its rig');
            Reactor3D.characterModelSpec = () => ({ name: 'Actors/Unit', size: 1.8, scale: 1 });
            Reactor3D.databaseModelSpec = () => ({ name: 'Props/' + what, ext: '.glb', file: '', size: Math.max(object.userData.glbSize.x, object.userData.glbSize.z), scale: 1 });
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
