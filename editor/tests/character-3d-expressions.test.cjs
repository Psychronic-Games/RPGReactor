'use strict';
// Forge › 3D Character Builder, faces that move (RRCharacterExpressions): every expression and viseme on many faces
// stays finite, keeps the lids out of the eyeballs and the lips apart where the mouth opens; neutral is the face as
// built; the saved GLB carries every one as a named, sparse morph target the game's reader finds; the game's lip
// sync shapes the mouth letter by letter at the window's own speed, shuts it on a pause and at the end, and leaves
// models without mouth shapes alone.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const repoRoot = path.join(root, '..');
const dir = path.join(root, 'src', 'forge', 'Character3D');
const load = name => require(path.join(dir, name + '.js'));
const Body = load('HumanBody');
for (const name of ['HumanTargets', 'CharacterOutfit', 'CharacterAtlas', 'CharacterWardrobe', 'CharacterProps', 'CharacterSpecies', 'CharacterSkin', 'CharacterHair', 'CreatureBody', 'CharacterGlb', 'CharacterShading', 'CharacterDetail']) load(name);
const X = load('CharacterExpressions');
const Model = load('CharacterModel');

global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

let pack;
const built = new Map();
test.before(async () => { pack = await Body.loadPack(); });

/** The faces the movements must fit: both sexes, other peoples, an old face, a child, and the human-faced species. */
const FACES = {
    man: { gender: 1 },
    woman: { gender: 0 },
    eastAsianWoman: () => Body.withPeople({ gender: 0 }, 'eastAsian'),
    africanMan: () => Body.withPeople({ gender: 1 }, 'subSaharan'),
    oldMan: { gender: 1, age: 78 },
    child: { gender: 0.3, age: 11 },
    bigEyes: { gender: 0, shapes: { eyeSize: 1 }, morph: { eyeWide: 1.6, eyeTall: 1.6 } },
    bearded: { gender: 1, age: 50, hair: { facial: { style: 'fullBeard' } } },
    elf: () => Model.withSpecies({ gender: 0 }, 'elf'),
    orc: () => Model.withSpecies({ gender: 1 }, 'orc'),
    goblin: () => Model.withSpecies({ gender: 1 }, 'goblin'),
    alien: () => Model.withSpecies({ gender: 0.5 }, 'alien')
};
function face(name) {
    if (!built.has(name)) {
        const f = FACES[name], recipe = Object.assign({ outfit: [] }, typeof f === 'function' ? f() : f);
        built.set(name, Model.build(pack, recipe, {}, { quality: 'preview', skinSize: 64 }));
    }
    return built.get(name);
}
const ALL = X.EXPRESSIONS.map(e => e.id).concat(X.VISEMES.map(v => 'viseme_' + v.id), ['blink']);

test('the units are MakeHuman\'s, for each of the three ancestries', () => {
    const U = X.units(pack);
    assert.ok(U, 'data/expressions.json is read');
    assert.deepEqual(U.races, ['african', 'asian', 'caucasian']);
    for (const name of new Set(X.BASE_UNITS.map(n => (U.units.has(n) ? n : n.slice(0, -1))))) {
        assert.ok(U.units.has(name), name);
        for (const race of U.races) assert.ok(U.units.get(name)[race] && U.units.get(name)[race].index.length > 0, `${name} ${race}`);
    }
});

test('the set covers what a face sheet needs, and every sheet preset names real expressions', () => {
    for (const id of ['neutral', 'happy', 'laugh', 'sad', 'angry', 'surprised', 'scared', 'disgusted', 'smirk', 'determined', 'worried', 'embarrassed', 'sleepy', 'crying', 'shouting', 'thinking', 'pain']) assert.ok(X.BY_ID.has(id), id);
    for (const s of X.SHEETS) { assert.equal(s.expressions.length, 8, s.id); for (const id of s.expressions) assert.ok(X.BY_ID.has(id), `${s.id}: ${id}`); }
    for (const v of ['rest', 'aa', 'ee', 'ih', 'oh', 'ou', 'fv', 'mbp', 'l', 'th', 'ch', 's']) assert.ok(X.VISEME_BY_ID.has(v), v);
    // Every unit an expression names exists, on one side or both.
    for (const e of X.EXPRESSIONS.concat(X.VISEMES)) {
        const w = X.weights(e.id === 'rest' ? 'viseme_rest' : e.id, 1);
        assert.equal(Object.keys(w).length >= Object.keys(e.units).length, true, e.id);
        for (const k of Object.keys(w)) assert.ok(X.BASE_UNITS.includes(k) || X.OWN_UNITS.includes(k) || X.BASE_UNITS.includes(k.slice(0, -1)), `${e.id}: ${k}`);
    }
});

test('every expression and viseme moves every face, and nothing is NaN', () => {
    for (const name of Object.keys(FACES)) {
        const result = face(name);
        assert.ok(X.supports(pack, result), name + ' has a face these fit');
        for (const id of ALL) {
            const p = X.pose(pack, result, id, 1);
            p.positions.forEach((P, k) => { if (P) for (let i = 0; i < P.length; i++) assert.ok(Number.isFinite(P[i]), `${name} ${id} ${result.parts[k].name} ${i}`); });
            p.normals.forEach(N => { if (N) for (let i = 0; i < N.length; i++) assert.ok(Number.isFinite(N[i]), `${name} ${id} normal`); });
            for (const o of p.overlays) for (const x of o.positions) assert.ok(Number.isFinite(x), `${name} ${id} ${o.name}`);
            if (id !== 'neutral' && id !== 'viseme_rest') assert.ok(p.positions[0], `${name} ${id} moves the face`);
        }
    }
});

test('the lids never go into the eyeballs further than they lie at rest', () => {
    for (const name of Object.keys(FACES)) {
        const result = face(name), M = X.measure(pack, result), S = M.S;
        for (const id of ALL) {
            const D = X.field(pack, result, id, 1).delta;
            for (const v of M.F.lidIds) {
                const e = S[v * 3] >= 0 ? M.eyes[0] : M.eyes[1];
                const r = d => Math.hypot(...[0, 1, 2].map(k => (S[v * 3 + k] + (d ? D[v * 3 + k] : 0) - e.c[k]) / e.r[k]));
                const front = (S[v * 3 + 2] + D[v * 3 + 2] - e.c[2]) / e.r[2];
                if (front < -0.2) continue;
                assert.ok(r(true) >= Math.min(r(false), 1.04) - 1e-4, `${name} ${id}: lid vertex ${v} at ${r(true).toFixed(3)} of the eyeball (rest ${r(false).toFixed(3)})`);
            }
        }
    }
});

test('the lips do not cross: open mouths open along their whole width, closed ones meet', () => {
    const OPEN = ['laugh', 'surprised', 'shouting', 'scared', 'viseme_aa', 'viseme_oh', 'viseme_ee', 'viseme_ih', 'viseme_ch'];
    for (const name of Object.keys(FACES)) {
        const result = face(name), M = X.measure(pack, result), S = M.S, F = M.F;
        // The lips' front: each lower-lip point and the upper-lip points right over it (within 1.5 mm across, 2.5 mm deep).
        const lips = [...new Set(pack.body.source)].filter(v => (F.upperLip[v] > 0.5 || F.lowerLip[v] > 0.5) && S[v * 3 + 2] > M.mouth[2] - 0.004);
        const upper = lips.filter(v => F.upperLip[v] > F.lowerLip[v]), lower = lips.filter(v => !(F.upperLip[v] > F.lowerLip[v]));
        const pairs = [];
        for (const a of lower) for (const b of upper) if (Math.abs(S[a * 3] - S[b * 3]) < 0.0015 && Math.abs(S[a * 3 + 2] - S[b * 3 + 2]) < 0.0025) pairs.push([a, b]);
        assert.ok(pairs.length > 20, name + ' lip pairs ' + pairs.length);
        // A lower-lip point risen over an upper-lip point it is not in front of has gone into the upper lip
        // (a pouting lower lip comes up in front of the upper one, which is not crossing).
        const worst = D => {
            let w = Infinity;
            for (const [a, b] of pairs) {
                if (S[a * 3 + 2] + D[a * 3 + 2] > S[b * 3 + 2] + D[b * 3 + 2] + 0.0005) continue;
                w = Math.min(w, (S[b * 3 + 1] + D[b * 3 + 1]) - (S[a * 3 + 1] + D[a * 3 + 1]));
            }
            return w;
        };
        const middle = D => { let up = Infinity, lo = -Infinity; for (const v of lips) { if (Math.abs(S[v * 3] - M.mouth[0]) > 0.003) continue; const y = S[v * 3 + 1] + D[v * 3 + 1]; if (F.upperLip[v] > F.lowerLip[v]) up = Math.min(up, y); else lo = Math.max(lo, y); } return up - lo; };
        const zero = new Float32Array(S.length), rest = Math.min(0, worst(zero)), restGap = middle(zero);
        for (const id of ALL) {
            const D = X.field(pack, result, id, 1).delta;
            const w = worst(D), open = middle(D) > restGap + 0.001;
            // An open mouth: no lip point passes one on the other lip. A closed one: the lips meet, the upper
            // lip's front over the lower's (pressed, pouted) by a few millimeters at most.
            if (open) assert.ok(w > rest - 0.0003, `${name} ${id}: open, the upper lip passes the lower by ${(-w * 1000).toFixed(2)} mm`);
            else assert.ok(w > -0.003, `${name} ${id}: closed, the lips overlap by ${(-w * 1000).toFixed(2)} mm`);
            if (OPEN.includes(id)) assert.ok(open && middle(D) > restGap + 0.004, `${name} ${id} opens the mouth (${(middle(D) * 1000).toFixed(1)} mm)`);
        }
    }
});

test('neutral is the face exactly as built, in data and on a view', () => {
    const result = face('woman');
    const n = X.field(pack, result, 'neutral', 1);
    assert.ok(n.delta.every(x => x === 0));
    const p = X.pose(pack, result, 'neutral', 1);
    assert.ok(p.positions.every(P => P === null) && p.overlays.length === 0);
    const parts = X.posedParts(pack, result, 'neutral', 1);
    parts.forEach((q, k) => assert.equal(q.positions, result.parts[k].positions));
    // Shown and taken back on view meshes: every position exactly as built.
    const view = { meshes: result.parts.map(part => new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(Float32Array.from(part.positions), 3)).setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(part.normals || part.positions), 3)))), group: new THREE.Group() };
    view.meshes.forEach(m => view.group.add(m));
    assert.ok(X.applyToView(view, result, pack, 'crying', 1, THREE));
    assert.ok(view.expressionOverlays.length === 3, 'blush, tears and their shine shown');
    assert.ok(view.meshes[0].geometry.getAttribute('position').array.some((x, i) => x !== result.parts[0].positions[i]));
    X.applyToView(view, result, pack, 'neutral', 1, THREE);
    view.meshes.forEach((m, k) => assert.deepEqual(Array.from(m.geometry.getAttribute('position').array), Array.from(result.parts[k].positions), result.parts[k].name));
    assert.equal(view.expressionOverlays.length, 0);
});

test('an expression costs a few milliseconds once a face is measured, and is kept', () => {
    const result = face('man');
    X.pose(pack, result, 'neutral', 1);
    let worst = 0;
    for (const id of X.EXPRESSIONS.map(e => e.id)) { const t = performance.now(); X.pose(pack, result, id, 0.7); worst = Math.max(worst, performance.now() - t); }
    assert.ok(worst < 60, 'worst ' + worst.toFixed(1) + ' ms');
    assert.equal(X.pose(pack, result, 'happy', 0.7), X.pose(pack, result, 'happy', 0.7), 'cached');
});

test('the mouth has teeth and a tongue, and the jaw carries the lower teeth', () => {
    const result = face('man');
    const teeth = result.parts.find(p => p.name === 'Teeth'), tongue = result.parts.find(p => p.name === 'Tongue');
    assert.ok(teeth && tongue);
    const k = result.parts.indexOf(teeth), p = X.pose(pack, result, 'viseme_aa', 1);
    assert.ok(p.positions[k], 'the teeth move with the jaw');
    const lower = new Set(X.measure(pack, result).F.lowerTeeth);
    let movedUpper = 0, movedLower = 0;
    for (let i = 0; i < teeth.positions.length / 3; i++) {
        const d = Math.abs(p.positions[k][i * 3 + 1] - teeth.positions[i * 3 + 1]);
        if (lower.has(teeth.source[i])) movedLower = Math.max(movedLower, d); else movedUpper = Math.max(movedUpper, d);
    }
    assert.ok(movedLower > 0.004 && movedUpper < 1e-9, `lower ${movedLower}, upper ${movedUpper}`);
    assert.ok(!face('alien').parts.some(q => q.name === 'Teeth') === false, 'a grey has teeth too');
    // A grafted animal head has its own mouth: no teeth added, no expressions.
    const cat = Model.build(pack, Model.withSpecies({ gender: 0 }, 'catfolk'), {}, { quality: 'preview', skinSize: 64 });
    assert.ok(!cat.parts.some(q => q.name === 'Teeth'));
    assert.equal(X.supports(pack, cat), false);
});

test('under a full-face helmet nothing of the mouth shows: no teeth, no tongue, no inside of the mouth', () => {
    for (const helmet of ['greathelm', 'visorhelm', 'powerhelm']) {
        const result = Model.build(pack, { gender: 1, outfit: [{ id: helmet }] }, {}, { quality: 'preview', skinSize: 64 });
        assert.ok(!result.parts.some(p => p.name === 'Teeth' || p.name === 'Tongue'), helmet + ': no teeth or tongue');
        const inside = X.mouthInside(pack, result.built), lips = new Set(X.measure(pack, result).F.lips);
        const body = result.parts[0], src = pack.body.source, I = body.index;
        let shown = 0;
        for (let t = 0; t < I.length; t += 3) if ([0, 1, 2].every(j => inside.has(src[I[t + j]]) || lips.has(src[I[t + j]])) && [0, 1, 2].some(j => inside.has(src[I[t + j]]))) shown++;
        assert.equal(shown, 0, helmet + ': mouth-inside triangles left');
    }
    // Bare-faced, the mouth is all there.
    const open = face('man');
    assert.ok(open.parts.some(p => p.name === 'Teeth') && open.parts.some(p => p.name === 'Tongue'));
});

test('the saved GLB carries every expression and viseme as a named, sparse morph target the game reads', async () => {
    const encode = () => new Uint8Array([137, 80, 78, 71]);
    const save = async recipe => {
        const result = Model.build(pack, Object.assign({ outfit: [] }, recipe), {}, { quality: 'save', skinSize: 64 });
        const glb = await Model.toGlb(result, 'Test', encode);
        const without = await Model.toGlb(Object.assign({}, result, { morphs: [] }), 'Test', encode);
        return { result, glb, bytes: glb.length - without.length };
    };
    const plain = await save(FACES.man);
    assert.equal(plain.result.morphs.length, X.MORPH_NAMES.length);
    assert.ok(plain.bytes > 100000 && plain.bytes < 900000, 'a clean-shaven face\'s morphs: ' + plain.bytes + ' bytes');
    const { glb, bytes } = await save(FACES.bearded);
    assert.ok(bytes < 5000000, 'with a full beard: ' + bytes + ' bytes');
    const dv = new DataView(glb.buffer, glb.byteOffset);
    const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + dv.getUint32(12, true))));
    assert.deepEqual(json.extensionsUsed, ['KHR_mesh_quantization']);
    const morphed = json.meshes.filter(m => m.primitives[0].targets);
    assert.ok(morphed.some(m => m.name === 'Teeth') && morphed.some(m => m.name === 'Facial hair') && morphed.some(m => m.name === 'Lashes') && morphed.some(m => m.name === 'Brows'));
    assert.deepEqual(morphed.find(m => m.name === 'Body').extras.targetNames, X.MORPH_NAMES, 'the face has every one');
    for (const m of morphed) {
        const names = m.extras.targetNames;
        assert.ok(names.length > 0 && names.every(n => X.MORPH_NAMES.includes(n)), m.name);
        assert.equal(m.weights.length, names.length);
        assert.equal(m.primitives[0].targets.length, names.length);
        const count = json.accessors[m.primitives[0].attributes.POSITION].count;
        for (const t of m.primitives[0].targets) {
            const a = json.accessors[t.POSITION];
            assert.equal(a.count, count, m.name);
            assert.ok(a.min && a.max && a.normalized && a.componentType === 5122, m.name);
            assert.ok(a.sparse && a.sparse.count > 0 && a.sparse.count <= count, m.name);
        }
    }
    // The game's reader: each mesh finds its targets by name.
    const ab = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.length);
    const parsed = R.readGlb(ab);
    for (const mat of parsed.json.materials || []) delete mat.pbrMetallicRoughness.baseColorTexture;
    delete parsed.json.images; delete parsed.json.textures;
    const object = R.buildGlbTemplate(parsed.json, parsed.bin, '');
    const named = [];
    object.traverse(o => { if (o.isMesh && o.morphTargetDictionary && o.morphTargetDictionary.viseme_aa != null) named.push(o); });
    assert.ok(named.length >= 3, 'the face, the teeth and the tongue speak');
    let body = null;
    object.traverse(o => { if (o.isMesh && o.morphTargetInfluences && o.morphTargetInfluences.length === X.MORPH_NAMES.length) body = o; });
    assert.ok(body, 'the body has every target');
    // Read back as written: the jaw's drop on the lower teeth.
    const teeth = [];
    object.traverse(o => { if (o.isMesh && o.morphTargetDictionary && o.morphTargetDictionary.viseme_aa != null && o.morphTargetInfluences.length === 12) teeth.push(o); });
    assert.ok(teeth.length >= 1);
    const drop = teeth[0].geometry.morphAttributes.position[teeth[0].morphTargetDictionary.viseme_aa].array;
    assert.ok(Math.min(...drop) < -0.004 && Math.max(...drop.map(Math.abs)) < 0.05, 'the lower teeth drop with the jaw');
    assert.ok(R.Speech.talkRig(object), 'the lip sync finds its shapes');
    // The packed copy a worker makes keeps the sparse values.
    const split = R._workerParts.splitGlb(ab.slice(0));
    const packed = R._workerParts.compactGlb(split.json, ab.slice(0), split.bin.offset, split.bin.length);
    for (const mat of split.json.materials || []) delete mat.pbrMetallicRoughness.baseColorTexture;
    delete split.json.images; delete split.json.textures;
    const again = R.buildGlbTemplate(split.json, new Uint8Array(packed), '');
    let a = null, b = null;
    object.traverse(o => { if (!a && o.isMesh && o.morphTargetInfluences) a = o; });
    again.traverse(o => { if (!b && o.isMesh && o.morphTargetInfluences) b = o; });
    assert.deepEqual(Array.from(b.geometry.morphAttributes.position[3].array), Array.from(a.geometry.morphAttributes.position[3].array));
});

test('the game reads letters as the builder does', () => {
    const S = R.Speech;
    assert.deepEqual(S.VISEMES, X.VISEMES.filter(v => v.id !== 'rest').map(v => v.id));
    assert.deepEqual(S.LETTER_VISEMES, X.LETTER_VISEMES);
    const shapes = Array.from(S.lineVisemes('Hi, \x1bC[2]Bob\x1bC[0]! Thank you.'), i => (i < 0 ? '.' : S.VISEMES[i]));
    assert.deepEqual(shapes.join(' '), 'aa ih . . . . . . . mbp oh mbp . . . . . . . th th aa s ih . ih oh ou .');
    // Accented letters take their base letter's shape.
    assert.equal(S.VISEMES[S.lineVisemes('é')[0]], 'ee');
});

test('the mouth follows the window\'s printing: each letter at its own frame, shut on a pause and at the end', () => {
    const S = R.Speech;
    const t = { target: new Float32Array(S.VISEMES.length), weight: new Float32Array(S.VISEMES.length + 1), text: null, shapes: null, printed: -1, hold: 0, last: -1, ending: false, time: 0, blinkIn: 99, blinkAt: -1 };
    const text = 'Mama, ooh';
    const aa = S.VISEMES.indexOf('aa'), mbp = S.VISEMES.indexOf('mbp'), ou = S.VISEMES.indexOf('ou');
    const at = [];
    // One letter a frame, as the window prints at its usual speed.
    for (let i = 1; i <= 4; i++) { S.stepTalk(t, text, i, null, 1 / 60); at.push(Array.from(t.weight.slice(0, S.VISEMES.length))); }
    assert.ok(at[0][mbp] > 0.2, 'M closes the lips at once');
    assert.ok(at[1][aa] > at[0][aa] && at[1][aa] > 0.2, 'a opens it the next frame');
    // A slower window: the shape holds while the next letter waits.
    const slow = Object.assign({}, t, { target: new Float32Array(S.VISEMES.length), weight: new Float32Array(S.VISEMES.length + 1), text: null });
    S.stepTalk(slow, text, 2, null, 1 / 60);
    S.stepTalk(slow, text, 2, null, 1 / 60);
    assert.ok(slow.weight[aa] > 0.3, 'held');
    // The comma's pause (the window waits: nothing printed): the mouth shuts within a few frames.
    for (let i = 0; i < 30; i++) S.stepTalk(t, text, -1, null, 1 / 60);
    assert.ok(t.weight.slice(0, S.VISEMES.length).every(w => w < 0.01), 'shut while the window waits');
    // On again.
    S.stepTalk(t, text, 8, null, 1 / 60); S.stepTalk(t, text, 9, null, 1 / 60);
    assert.ok(t.weight[ou] > 0.2, 'ooh rounds the lips');
    // The message ends: the mouth eases shut and the talk lets go.
    t.ending = true;
    let moving = 1, frames = 0;
    while (moving > 0 && frames < 120) { moving = S.stepTalk(t, text, 9, null, 1 / 60); frames++; }
    assert.ok(moving === 0 && frames < 60, 'closed after ' + frames + ' frames');
    // A voice opens it by its loudness instead.
    const v = Object.assign({}, t, { ending: false, target: new Float32Array(S.VISEMES.length), weight: new Float32Array(S.VISEMES.length + 1), text: null });
    for (let i = 0; i < 10; i++) S.stepTalk(v, null, -1, 0.6, 1 / 60);
    assert.ok(v.weight[aa] > 0.6, 'loud voice, open mouth');
    for (let i = 0; i < 30; i++) S.stepTalk(v, null, -1, 0, 1 / 60);
    assert.ok(v.weight[aa] < 0.01, 'silence shuts it');
});

test('a model without mouth shapes, or no model at all, is left alone', () => {
    const S = R.Speech;
    const plain = new THREE.Group();
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    geometry.morphAttributes.position = [new THREE.BufferAttribute(new Float32Array(9), 3)];
    geometry.morphAttributes.position[0].name = 'jaw_open';
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    plain.add(mesh);
    assert.equal(S.talkRig(plain), null);
    const character = {};
    S.startTalk(null, character);
    const scene = { _modelInstances: new Map([[R.modelInstanceKey(character), { object: plain }]]) };
    for (let i = 0; i < 5; i++) S.tickTalk(scene);
    assert.equal(mesh.morphTargetInfluences[0], 0, 'its own morph untouched');
    S.endTalk(true);
    // No speaker, no map (a 2D game, a battle): nothing happens.
    S.startTalk(null, null);
    assert.equal(S.talk.character, null);
    S.tickTalk({ _modelInstances: new Map() });
    assert.equal(S.speakerCharacter(), null);
});

test('the Builder talk preview pauses without morph work, resumes its current mouth and cannot restart after stopping', t => {
    const previousRequest = global.requestAnimationFrame, previousCancel = global.cancelAnimationFrame;
    const pending = new Map();
    let sequence = 0, draws = 0;
    global.requestAnimationFrame = callback => { pending.set(++sequence, callback); return sequence; };
    global.cancelAnimationFrame = token => pending.delete(token);
    t.after(() => { global.requestAnimationFrame = previousRequest; global.cancelAnimationFrame = previousCancel; });
    const result = face('man');
    const meshes = result.parts.map(part => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
        return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    });
    t.after(() => { for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); } });
    const controller = X.talk({ meshes }, result, pack, THREE, { draw: () => draws++ });
    assert.ok(controller);
    const step = () => { const callbacks = [...pending.values()]; pending.clear(); for (const callback of callbacks) callback(); };
    for (let frame = 0; frame < 30; frame++) step();
    controller.pause();
    const before = meshes.map(mesh => mesh.morphTargetInfluences?.slice());
    const drawn = draws;
    assert.equal(pending.size, 0);
    for (let frame = 0; frame < 60; frame++) step();
    assert.deepEqual(meshes.map(mesh => mesh.morphTargetInfluences?.slice()), before);
    assert.equal(draws, drawn);
    controller.pause(false); step();
    assert.equal(draws, drawn + 1);
    assert.notDeepEqual(meshes.map(mesh => mesh.morphTargetInfluences?.slice()), before);
    controller.stop(); controller.pause(false);
    assert.equal(pending.size, 0);
    assert.ok(meshes.every(mesh => Object.keys(mesh.geometry.morphAttributes).length === 0));
});
