'use strict';
// 3D Prop Builder › Containers: barrels, drums, canisters, crates, chests and cargo crates build whole and within
// budget, stand on the floor, and a futuristic one's lights and display are a looping "Lights" clip of bones that
// hide each lit part while it is off; the saved GLB carries that clip and its glowing materials.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
global.THREE = require(path.join(root, 'node_modules', 'three'));
const props = path.join(root, 'src', 'forge', 'Props');
const C = require(path.join(props, 'ContainerProp.js'));
const Model = require(path.join(props, 'PropModel.js'));
const Catalog = require(path.join(props, 'PropCatalog.js'));
const Optimizer = require(path.join(root, 'src', 'utils', 'GlbOptimizer.js'));
const { PNG } = require(path.join(root, 'node_modules', 'pngjs'));

// Curved drum rings/valves and rounded fittings replace coarse cylinders.
const BUDGET = 12000;
const encode = t => { const p = new PNG({ width: t.width, height: t.height }); p.data = Buffer.from(t.data); return PNG.sync.write(p); };
const withOver = (id, over) => { const r = C.fromPreset(id); for (const [k, v] of Object.entries(over)) r[k] = v && typeof v === 'object' ? Object.assign({}, r[k], v) : v; return C.normalize(r); };

/** Whole, in budget, on the floor; returns the build. */
function check(recipe, what) {
    const b = Model.build(recipe, {}, { textureSize: 256 });
    const s = Model.stats(b);
    // A stack is that many crates in one model: each within the budget.
    const copies = { one: 1, two: 2, three: 3 }[C.normalize(recipe).stack];
    assert.ok(s.triangles <= BUDGET * copies, `${what}: ${s.triangles} triangles`);
    assert.ok(s.bones <= 128, `${what}: ${s.bones} bones`);
    let low = Infinity;
    for (const p of b.parts) {
        const n = p.positions.length / 3;
        assert.ok(p.index.length > 0, `${what} ${p.name} has faces`);
        for (const k of ['positions', 'normals', 'uvs']) for (let i = 0; i < p[k].length; i++) assert.ok(Number.isFinite(p[k][i]), `${what} ${p.name} ${k}[${i}]`);
        if (p.colors) for (let i = 0; i < p.colors.length; i++) assert.ok(Number.isFinite(p.colors[i]) && p.colors[i] >= 0, `${what} ${p.name} color`);
        assert.equal(p.joints.length, n * 4);
        for (let v = 0; v < n; v++) {
            const w = p.weights[v * 4] + p.weights[v * 4 + 1] + p.weights[v * 4 + 2] + p.weights[v * 4 + 3];
            assert.ok(Math.abs(w - 1) < 1e-5, `${what} ${p.name} weights of ${v}`);
            for (let k = 0; k < 4; k++) assert.ok(p.joints[v * 4 + k] < b.bones.length, `${what} joint in range`);
        }
        for (const i of p.index) assert.ok(i < n, `${what} index in range`);
        for (let i = 1; i < p.positions.length; i += 3) low = Math.min(low, p.positions[i]);
    }
    assert.ok(Math.abs(low) < 1e-6, `${what} rests on y = 0 (lowest ${low})`);
    for (const t of Object.values(b.textures)) if (t) assert.ok(t.width <= 1024 && t.height <= 1024, `${what} picture ${t.width}x${t.height}`);
    return b;
}

test('a container recipe is completed and kept in range', () => {
    const r = C.normalize({ form: 'drum', height: 99, width: -1, ribs: 9, wear: 4, lights: { count: 40 }, marks: { symbol: 'skull', style: 'graffiti' }, stack: 'three', lying: true });
    assert.equal(r.kind, 'container');
    assert.equal(r.height, C.SIZES.drum.height[1]);
    assert.equal(r.width, C.SIZES.drum.width[0]);
    assert.equal(r.ribs, 3);
    assert.equal(r.wear, 1);
    assert.equal(r.marks.symbol, 'none');
    assert.equal(r.marks.style, 'stencil');
    assert.equal(r.lights.count, 0, 'an old-school drum has no lights');
    assert.equal(r.stack, 'one', 'only crates stack');
    assert.ok(r.lying);
    assert.ok(!C.normalize({ form: 'crate', lying: true }).lying, 'a crate does not lie down');
    assert.ok(!C.normalize({ form: 'crate', stack: 'two', open: true }).open, 'a stack keeps its lids shut');
    assert.equal(C.normalize({ form: 'cargo', lights: { count: 40 } }).lights.count, 12);
    assert.deepEqual(C.normalize(C.normalize({ form: 'chest' })), C.normalize({ form: 'chest' }));
    // Every preset is a type in the Containers section, and its recipe says which.
    for (const p of C.PRESETS) {
        const type = Catalog.TYPES.find(t => t.id === 'container-' + p.id);
        assert.ok(type && type.category === 'containers', p.id);
        assert.equal(Catalog.typeOf(type.start()), type, p.id + ' recipe names its type');
    }
});

test('every preset builds whole, under budget, on the floor', () => {
    for (const p of C.PRESETS) check(C.fromPreset(p.id), p.id);
});

test('scoped Randomize keeps authored settings outside its group and never edits the source recipe', () => {
    const shape = new Set(['width', 'height', 'bulge']);
    const colors = new Set(['color', 'trim', 'accent', 'finish', 'lights.color', 'strips.color', 'display.color']);
    const details = new Set(['wear', 'seed', 'hoops', 'ribs', 'brace', 'marks.text', 'marks.hazard', 'marks.symbol',
        'lights.count', 'lights.pattern', 'strips.on', 'strips.pattern']);
    const flatten = (o, prefix = '', out = {}) => {
        for (const [key, value] of Object.entries(o)) {
            const name = prefix + key;
            if (value && typeof value === 'object') flatten(value, name + '.', out);
            else out[name] = value;
        }
        return out;
    };
    for (const preset of C.PRESETS) {
        const source = C.fromPreset(preset.id), before = JSON.stringify(source), fields = flatten(source);
        for (const [scope, allowed] of [['shape', shape], ['colors', colors], ['details', details]]) {
            const result = C.random(123, source, scope), after = flatten(result);
            assert.equal(JSON.stringify(source), before, `${preset.id}: source unchanged`);
            assert.deepEqual(C.random(123, source, scope), result, `${preset.id}: seeded ${scope}`);
            for (const key of Object.keys(fields)) if (!allowed.has(key)) assert.equal(after[key], fields[key], `${preset.id}: ${scope} kept ${key}`);
            assert.ok(Object.keys(fields).some(key => fields[key] !== after[key]), `${preset.id}: ${scope} changes something`);
        }
        // A color roll must preserve the actual mesh, including generated dents.
        const a = Model.build(source, {}, { textureSize: 64 });
        const b = Model.build(C.random(123, source, 'colors'), {}, { textureSize: 64 });
        assert.deepEqual(b.parts.map(p => p.positions), a.parts.map(p => p.positions), `${preset.id}: colors preserve geometry`);
    }
});

test('every form at its slider extremes and every switch builds whole, under budget, on the floor', () => {
    const forms = { barrel: 'barrel', drum: 'oil-drum', canister: 'fuel-canister', crate: 'supply-crate', chest: 'treasure-chest', cargo: 'cargo-crate' };
    for (const [form, preset] of Object.entries(forms)) {
        const sz = C.SIZES[form];
        const variants = [];
        for (const width of sz.width.slice(0, 2)) for (const height of (sz.height || [null, null]).slice(0, 2)) for (const wear of [0, 1]) variants.push({ width, height, wear });
        if (form === 'barrel') for (const bulge of [0, 1]) for (const hoops of [2, 8]) for (const top of ['lid', 'open']) for (const lying of [false, true]) variants.push({ bulge, hoops, top, lying, cradle: true, width: sz.width[1], height: sz.height[0] });
        if (form === 'drum') for (const ribs of [0, 3]) for (const top of ['lid', 'open']) for (const lying of [false, true]) variants.push({ ribs, top, lying, wear: 1 });
        if (form === 'canister') for (const caps of ['domed', 'flat']) for (const core of [false, true]) for (const lying of [false, true]) variants.push({ caps, core, lying, valves: !core });
        if (form === 'crate') for (const proportions of ['cube', 'long', 'flat']) for (const brace of ['x', 'diagonal', 'none']) for (const [stack, open] of [['one', false], ['one', true], ['two', false], ['three', false]]) variants.push({ proportions, brace, stack, open, slats: brace === 'x', handles: brace !== 'none', finish: proportions === 'flat' ? 'painted' : 'natural', width: sz.width[1] });
        if (form === 'chest') for (const lid of ['domed', 'flat']) for (const open of [false, true]) variants.push({ lid, open, gold: open, corners: !open, lock: true });
        if (form === 'cargo') for (const proportions of ['cube', 'long', 'flat']) for (const [stack, open] of [['one', false], ['one', true], ['two', false], ['three', false]]) variants.push({ proportions, stack, open, bumpers: stack !== 'two', width: sz.width[1] });
        for (const v of variants) {
            if (v.height === null) delete v.height;
            check(withOver(preset, v), `${form} ${JSON.stringify(v)}`);
        }
    }
    // Lights at their most: twelve of each pattern, strips and bands in each, every display, on both futuristic forms, upright and lying.
    for (const preset of ['cargo-crate', 'fuel-canister', 'coolant-cell', 'data-crate']) for (const pattern of C.PATTERNS.map(p => p[0])) for (const mode of ['none', 'text', 'numbers', 'progress', 'picture']) {
        const r = withOver(preset, { lights: { count: 12, pattern }, strips: { on: true, pattern }, display: { mode, text: 'A LONG LINE OF SCROLLING TEXT 0123456789', style: pattern === 'pulse' ? 'screen' : 'led' } });
        check(r, `${preset} ${pattern} ${mode}`);
        if (preset !== 'cargo-crate') check(Object.assign({}, r, { lying: true }), `${preset} lying ${pattern} ${mode}`);
    }
    // Markings of every kind, with a picture handed in.
    const image = { width: 2, height: 2, data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 0]) };
    for (const [symbol] of require(path.join(props, 'ContainerPaint.js')).SYMBOLS) for (const style of ['stencil', 'label', 'burned']) {
        const b = Model.build(withOver('supply-crate', { marks: { text: 'TOP 1/2 #9: 100%!', symbol, style, image: 'Logo' } }), {}, { textureSize: 256, images: { Logo: image } });
        assert.ok(!b.imageMissing, 'the picture is in');
    }
    assert.equal(Model.build(withOver('oil-drum', { marks: { image: 'Absent' } }), {}, { textureSize: 128 }).imageName, 'Absent', 'a missing picture is asked for');
});

/** Where each bone stands (translation) or how large it is (scale) at time t: { offset, scale } per glow bone. */
function poseAt(b, t) {
    const out = new Map();
    for (const tr of b.clips[0].tracks) {
        const v = C.sampleTrack(tr, t), head = b.bones[tr.bone].head;
        out.set(tr.bone, tr.path === 'translation' ? { off: Math.hypot(v[0] - head[0], v[1] - head[1], v[2] - head[2]), scale: 1 } : { off: 0, scale: Math.min(v[0], v[1], v[2]) });
    }
    return out;
}

test('the lights and the display are a clip that loops, each lit part shown or tucked away in its turn', () => {
    for (const preset of ['cargo-crate', 'fuel-canister', 'coolant-cell', 'data-crate']) for (const pattern of ['blink', 'pulse', 'chase']) {
        const b = Model.build(withOver(preset, { lights: { count: 5, pattern }, strips: { on: true, pattern }, display: { mode: preset === 'data-crate' ? 'text' : 'none' } }), {}, { textureSize: 128 });
        const what = preset + ' ' + pattern;
        assert.equal(b.clips.length, 1, what + ' has its clip');
        const clip = b.clips[0];
        assert.equal(clip.name, 'Lights');
        for (const tr of clip.tracks) {
            const T = tr.times, V = tr.values;
            assert.equal(T[0], 0, what + ' starts at 0');
            assert.ok(Math.abs(T[T.length - 1] - C.LOOP) < 1e-6, what + ' ends at the loop');
            for (let i = 1; i < T.length; i++) assert.ok(T[i] > T[i - 1], what + ' times rise');
            assert.equal(V.length, T.length * 3);
            for (let c = 0; c < 3; c++) assert.ok(Math.abs(V[c] - V[V.length - 3 + c]) < 1e-6, what + ' its end is its start');
            for (const x of V) assert.ok(Number.isFinite(x));
            // A hidden part is gone into the container: moved a centimeter or so in, or shrunk into its axis.
            const moves = new Set(); for (let i = 0; i < T.length; i++) moves.add(V.slice(i * 3, i * 3 + 3).join(','));
            assert.ok(moves.size === 2, what + ' each bone has two places: shown and hidden');
        }
        // Pulse: at every moment one strength of each pulsing part shows, the others are away.
        if (pattern === 'pulse') {
            const levels = clip.tracks.filter(tr => /pulse|core/.test(keyOf(b, tr.bone)));
            for (let t = 0.013; t < C.LOOP; t += 0.137) {
                const pose = poseAt(b, t);
                const shown = levels.filter(tr => { const p = pose.get(tr.bone); return p.off < 1e-6 && p.scale > 0.999; }).length;
                assert.ok(shown >= 1, `${what} something pulses at ${t.toFixed(2)}`);
            }
        }
        // Chase: one lamp at full at a time, walking the row.
        if (pattern === 'chase') {
            const seen = new Set();
            for (let t = 0.011; t < C.LOOP; t += 0.05) seen.add(C.chaseAt(t, 5, 0.22));
            assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4], what + ' every lamp gets its turn');
        }
    }
});

/** The bone's timing key, from the build (kept by name order: Glow_n is the n-th bone). */
function keyOf(b, bone) { return (b.boneKeys && b.boneKeys[bone]) || ''; }

test('a display shows exactly one frame at a time, every frame in its turn', () => {
    for (const mode of ['text', 'numbers', 'progress']) for (const text of ['OK', 'DATA CORE 77-B ENCRYPTED']) {
        const b = Model.build(withOver('data-crate', { lights: { count: 0 }, strips: { on: false }, display: { mode, text } }), {}, { textureSize: 128 });
        const glow = b.parts.find(p => p.name === 'Glow');
        // Frames are the quads on two bones each (half on one of each).
        const frames = new Map();
        for (let v = 0; v < glow.positions.length / 3; v++) {
            if (Math.abs(glow.weights[v * 4] - 0.5) > 1e-6) continue;
            const key = glow.joints[v * 4] + ':' + glow.joints[v * 4 + 1];
            frames.set(key, [glow.joints[v * 4], glow.joints[v * 4 + 1]]);
        }
        const what = mode + ' ' + text;
        if (!frames.size) { assert.ok(mode === 'text' || mode === 'progress', what); continue; }
        const shownAt = t => { const pose = poseAt(b, t); return [...frames].filter(([, [a, c]]) => (pose.get(a).off + pose.get(c).off) / 2 < 1e-6).map(([k]) => k); };
        const order = [];
        // Between the steps (a step lands on a 240th of a second and takes a fifth of a millisecond).
        for (let k = 0; k < C.LOOP * 240; k += 7) {
            const t = (k + 0.5) / 240;
            const shown = shownAt(t);
            assert.equal(shown.length, 1, `${what}: one frame at ${t.toFixed(3)} (${shown.length})`);
            if (order[order.length - 1] !== shown[0]) order.push(shown[0]);
            // Every other frame is pushed back behind the screen, at least half the way.
            const pose = poseAt(b, t);
            for (const [k, [a, c]] of frames) if (k !== shown[0]) assert.ok((pose.get(a).off + pose.get(c).off) / 2 >= 0.0059, what + ' hidden behind the screen');
        }
        assert.equal(new Set(order).size, frames.size, `${what}: every frame shows (${new Set(order).size} of ${frames.size})`);
    }
});

test('the saved GLB carries the glowing materials, the clip and its sidecar', async () => {
    for (const id of ['data-crate', 'coolant-cell', 'fuel-canister', 'cargo-crate']) {
        const b = Model.build(C.fromPreset(id), {}, { textureSize: 256 });
        const glb = await Model.toGlb(b, id, encode);
        const { json } = Optimizer.parseGlb(glb);
        const glow = json.materials.filter(m => /glow$/i.test(m.name));
        assert.ok(glow.length >= 1, id + ' has glowing materials');
        for (const m of glow) {
            assert.deepEqual(m.emissiveFactor, [1, 1, 1], id + ' ' + m.name + ' glows');
            assert.ok(m.emissiveTexture && json.textures[m.emissiveTexture.index], id + ' ' + m.name + ' glows in its picture');
            assert.ok(m.pbrMetallicRoughness.baseColorTexture, id + ' ' + m.name + ' shows its picture unlit as well');
        }
        const halo = json.materials.find(m => m.name === 'HaloGlow');
        if (halo) assert.equal(halo.alphaMode, 'BLEND', 'halos blend');
        const anim = (json.animations || []).find(a => a.name === 'Lights');
        assert.ok(anim && anim.channels.length === b.clips[0].tracks.length, id + ' carries the Lights clip');
        for (const s of anim.samplers) assert.ok(Math.abs(json.accessors[s.input].max[0] - C.LOOP) < 1e-5, id + ' every channel runs the whole loop');
        assert.ok(anim.channels.every(c => c.target.path === 'translation' || c.target.path === 'scale'));
        const side = Model.sidecar(b);
        assert.deepEqual(side.animations, [{ type: 'clip', trigger: 'always', name: 'Lights', clip: 'Lights', part: '' }], id + ' plays always');
        assert.ok(Math.abs(side.transform.offset[1]) < 1e-6, id + ' its origin on the floor');
    }
    // Old-school ones are still: no clip, no glow.
    const barrel = Model.build(C.fromPreset('wine-barrel'), {}, { textureSize: 128 });
    assert.equal(barrel.clips.length, 0);
    assert.ok(!barrel.parts.some(p => p.emissive));
    const { json } = Optimizer.parseGlb(await Model.toGlb(barrel, 'Wine', encode));
    assert.ok(!json.animations);
});

test('the same recipe builds the same prop; Randomize keeps the form and stays whole', () => {
    const a = Model.build(C.fromPreset('data-crate'), {}, { textureSize: 128 }), b = Model.build(C.fromPreset('data-crate'), {}, { textureSize: 128 });
    assert.deepEqual(Array.from(a.parts[0].positions), Array.from(b.parts[0].positions));
    assert.deepEqual(Array.from(a.textures['body.png'].data.subarray(0, 4096)), Array.from(b.textures['body.png'].data.subarray(0, 4096)));
    for (const p of C.PRESETS) for (let s = 1; s <= 6; s++) {
        const r = C.random(s * 7919 + p.id.length, C.fromPreset(p.id));
        assert.equal(r.form, C.fromPreset(p.id).form);
        assert.equal(r.preset, p.id, 'Randomize keeps the type');
        check(r, p.id + ' random ' + s);
    }
});
