'use strict';
// Body art (2026-10-24): tattoos, paint, scars and implants painted by body surface; piercings; cyber limbs, eye and features.
const test = require('node:test'), assert = require('node:assert/strict');
const C3 = '../src/forge/Character3D/';
const Body = require(C3 + 'HumanBody.js'), Model = require(C3 + 'CharacterModel.js'), Skin = require(C3 + 'CharacterSkin.js');
const Art = require(C3 + 'CharacterBodyArt.js'), Mods = require(C3 + 'CharacterBodyMods.js'), Motifs = require(C3 + 'CharacterBodyArtMotifs.js');
const Species = require(C3 + 'CharacterSpecies.js');

let pack;
test.before(async () => { pack = await Body.loadPack(); });
const small = { quality: 'preview', skinSize: 64, atlasSize: 64, static: true, hairBudget: 0.1 };
const tris = parts => parts.reduce((a, p) => a + p.index.length / 3, 0);

test('body art normalizes, survives a save round trip and keeps project pictures as names only', () => {
    for (const p of Art.PRESETS) {
        const a = Art.preset(p.id), again = Art.normalize(JSON.parse(JSON.stringify(a)));
        assert.deepEqual(again, a, p.id);
    }
    const bad = Art.normalize({ layers: [{ kind: 'tattoo', motif: 'nope', region: 'nowhere', side: 'up', size: 99, text: 'Ünïcode words that are far too long to fit', picture: '../../etc/passwd' }, { kind: 'scar', motif: 'tribal' }], piercings: [{ spot: 'lobe', side: 'left' }, { spot: 'lobe', side: 'left' }, { spot: 'x' }], limbs: [{ limb: 'armL' }, { limb: 'handL' }, { limb: 'legR', style: 'neon' }] });
    assert.equal(bad.layers[0].region, 'forearm');
    assert.equal(bad.layers[0].size, 3);
    assert.equal(bad.layers[0].picture, '');
    assert.ok(bad.layers[0].text.length <= 24 && /^[\x20-\x7e]*$/.test(bad.layers[0].text));
    assert.equal(bad.layers[1].motif, Motifs.MOTIFS.find(m => m.kind === 'scar').id, 'a motif of another kind falls back to the kind\'s own');
    assert.equal(bad.piercings.length, 1, 'one piercing per spot and side');
    assert.deepEqual(bad.limbs.map(l => l.limb), ['armL', 'legR'], 'a hand on an already replaced arm is dropped');
    const recipe = Model.normalize({ bodyArt: { layers: [{ motif: 'picture', picture: 'Tattoos/rose.png', kind: 'tattoo' }] } });
    assert.equal(recipe.bodyArt.layers[0].picture, 'Tattoos/rose.png');
    const saved = Model.normalize(JSON.parse(JSON.stringify(recipe)));
    assert.deepEqual(saved.bodyArt, recipe.bodyArt);
    // Changing species keeps the person's own body art.
    assert.deepEqual(Model.withSpecies(recipe, 'elf').bodyArt, recipe.bodyArt);
});

test('painting is deterministic, changes only where the art is, and adds relief and glow where asked', () => {
    const layers = [{ kind: 'tattoo', motif: 'skull', region: 'forearm', side: 'left' }, { kind: 'scar', motif: 'cut', region: 'chest', side: 'left' }, { kind: 'implant', motif: 'lines', region: 'face', side: 'left' }];
    const a = Skin.paint(pack, '#c69c7f', {}, { size: 128, bodyArt: layers, detail: { size: 256 } });
    const b = Skin.paint(pack, '#c69c7f', {}, { size: 128, bodyArt: layers, detail: { size: 256 } });
    const plain = Skin.paint(pack, '#c69c7f', {}, { size: 128 });
    assert.ok(Buffer.from(a.data).equals(Buffer.from(b.data)), 'same picture twice');
    assert.ok(Buffer.from(a.detail.data).equals(Buffer.from(b.detail.data)), 'same detail charts twice');
    let changed = 0;
    for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i] - plain.data[i]) > 6) changed++;
    assert.ok(changed > 20 && changed < a.data.length / 4 * 0.12, 'art changes a small part of the skin: ' + changed);
    assert.ok(a.emissive, 'implant lines glow');
    assert.ok(a.detail.normal && a.detail.emissive, 'the detail charts carry relief and glow');
    assert.ok(a.detail.layout.texel < 1.8 / 128 / 2, 'detail charts are finer than the skin: ' + a.detail.layout.texel);
});

test('a band closes round the limb: the design is continuous across the round\'s seam', () => {
    const art = Art.prepare(pack, [{ kind: 'tattoo', motif: 'tribal', region: 'forearm', side: 'left', band: true }]);
    const inst = art.list[0], S = art.surface;
    assert.ok(inst.wrap, 'band instance');
    const ev = { w: new Float32Array(5) }, loc = { x: 0, y: 0, fade: 1 };
    // Walk round the forearm in small steps at the band's height, through the angle's wrap at the back.
    const s = inst.s, values = [];
    for (let k = 0; k <= 720; k++) {
        const ang = -Math.PI + k / 720 * Math.PI * 2;
        const p = { rest: [0, 0, 0], n: [0, 0, 1], fam: inst.f, s, ang };
        inst.surfaceRef = S;
        assert.ok(Art.locate(inst, p, loc));
        Motifs.evaluate(inst.M, loc.x, loc.y, 0.02, ev);
        values.push(ev.alpha);
    }
    for (let k = 1; k < values.length; k++) assert.ok(Math.abs(values[k] - values[k - 1]) < 0.75, 'continuous at step ' + k);
    assert.ok(Math.abs(values[0] - values[values.length - 1]) < 1e-6, 'the same at -π and π');
    // Several repeats round the limb, all the same size.
    assert.ok(Math.abs(inst.wrap.Pfull / inst.wrap.P - Math.round(inst.wrap.Pfull / inst.wrap.P)) < 1e-6);
});

test('the detail charts unfold the art\'s skin without folds and replace those triangles in the model', () => {
    const recipe = Model.normalize({ gender: 1, outfit: [], hair: { style: 'bald' }, bodyArt: Art.preset('biker') });
    const L = Art.detailLayout(pack, recipe.bodyArt.layers, null, 1024);
    assert.ok(L && L.tris.length > 200);
    assert.ok(L.texel < 0.0012, 'a 1024 detail picture puts the art at about a millimeter a texel (half that at save size): ' + L.texel);
    // Every chart triangle keeps its facing (no folded triangles) and lies inside the picture.
    for (let k = 0; k < L.tris.length; k++) for (let c = 0; c < 3; c++) { const u = L.uv[k * 6 + c * 2], v = L.uv[k * 6 + c * 2 + 1]; assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1); }
    const built = Model.build(pack, recipe, {}, { quality: 'preview', skinSize: 512, atlasSize: 64, hairBudget: 0.1 });
    const plain = Model.build(pack, Object.assign({}, recipe, { bodyArt: {} }), {}, { quality: 'preview', skinSize: 512, atlasSize: 64, hairBudget: 0.1 });
    const art = built.parts.find(p => p.name === 'Body art'), body = built.parts.find(p => p.name === 'Body');
    assert.ok(art && art.source && art.source.length === art.positions.length / 3, 'detail part rides the skin');
    assert.equal(body.index.length + art.index.length, plain.parts.find(p => p.name === 'Body').index.length, 'triangles moved, none lost or doubled');
    assert.ok(built.textures['bodyart.png'] && built.textures['bodyart-relief.png']);
});

test('piercings sit on the face\'s own landmarks', () => {
    const spots = ['lobe', 'helix', 'industrial', 'tragus', 'nostril', 'septum', 'eyebrow', 'lip', 'labret', 'bridge'];
    const recipe = Model.normalize({ gender: 0, outfit: [], hair: { style: 'bald' }, bodyArt: { piercings: spots.map(spot => ({ spot, side: 'left' })) } });
    const built = Model.build(pack, recipe, {}, small);
    const jewelry = built.parts.filter(p => p.name === 'Piercings');
    assert.ok(jewelry.length);
    const P = built.built.shaped, ids = [...new Set(pack.body.source)], head = built.bones.findIndex(b => b.name === 'Head');
    let far = 0, total = 0;
    const lift = built.parts[0].positions[1] - P[pack.body.source[0] * 3 + 1];
    for (const part of jewelry) for (let v = 0; v < part.positions.length / 3; v += 7) {
        let best = Infinity;
        for (const q of ids) { const d = Math.hypot(P[q * 3] - part.positions[v * 3], P[q * 3 + 1] + lift - part.positions[v * 3 + 1], P[q * 3 + 2] - part.positions[v * 3 + 2]); if (d < best) best = d; }
        total++; if (best > 0.012) far++;
        assert.equal(part.joints[v * 4], head, 'rides the head');
    }
    assert.ok(far / total < 0.05, 'jewelry sits on the skin: ' + far + '/' + total + ' far');
    assert.ok(tris(jewelry) < 3000, 'all ten spots stay light: ' + tris(jewelry));
    // The lobe ring hangs below the ear's middle.
    const S = Mods.faceSpots(pack), R = require(C3 + 'CharacterOutfit.js').anatomy(pack).rest;
    assert.ok(R[S.lobe * 3 + 1] < R[S.helix * 3 + 1] - 0.03, 'lobe below helix');
    assert.ok(R[S.lobe * 3] > 0.05, 'left ear at +x');
});

test('cyber limbs are rigid per bone, normalized, budgeted, and take the place of the skin they replace', () => {
    for (const style of Art.CYBER_STYLES.map(s => s.id)) {
        const recipe = Model.normalize({ gender: 1, outfit: [], hair: { style: 'bald' }, bodyArt: { limbs: [{ limb: 'armL', style }, { limb: 'shinR', style }, { limb: 'forearmR', style, mode: 'plate' }] } });
        const built = Model.build(pack, recipe, {}, small);
        const cyber = built.parts.filter(p => /^Cyber/.test(p.name));
        assert.ok(cyber.length >= 3, style);
        for (const p of cyber) for (let v = 0; v < p.positions.length / 3; v++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) { sum += p.weights[v * 4 + k]; if (p.weights[v * 4 + k] > 0) assert.ok(p.joints[v * 4 + k] < built.bones.length); }
            assert.ok(Math.abs(sum - 1) < 1e-4, style + ' weights sum to one');
            if (p.name !== 'Cyber cables') assert.ok(p.weights[v * 4] > 0.999, style + ' plates ride one bone');
        }
        const count = tris(cyber);
        assert.ok(count < 16000, style + ' arm, lower leg and plated forearm within budget: ' + count);
        // Each piece on the arm rides an arm bone.
        const armBones = new Set(built.bones.map((b, i) => (/^Left(Arm|ForeArm|Hand)/.test(b.name) ? i : -1)).filter(i => i >= 0));
        const onArm = cyber.some(p => { for (let v = 0; v < p.positions.length / 3; v++) if (armBones.has(p.joints[v * 4])) return true; return false; });
        assert.ok(onArm);
    }
    const hidden = Mods.hiddenSkin(pack, Art.normalize({ limbs: [{ limb: 'armL' }] }), []);
    const an = require(C3 + 'CharacterOutfit.js').anatomy(pack);
    assert.ok(hidden.size > 300);
    for (const v of hidden) assert.ok(an.s[v * 5 + 1] > 1.1, 'only past the shoulder');
    const withArm = Model.build(pack, Model.normalize({ outfit: [], hair: { style: 'bald' }, bodyArt: { limbs: [{ limb: 'armL' }] } }), {}, small);
    const without = Model.build(pack, Model.normalize({ outfit: [], hair: { style: 'bald' } }), {}, small);
    assert.ok(withArm.parts[0].index.length < without.parts[0].index.length - 1000, 'replaced arm\'s skin is left out');
    assert.ok(Mods.skinLayers(Art.normalize({ limbs: [{ limb: 'armL' }] })).length === 1, 'the stump is scarred');
});

test('cyber tail, wings, horns and ears reuse the feature rigs', () => {
    const recipe = Model.normalize({ outfit: [], hair: { style: 'bald' }, features: { tail: { type: 'cyber', style: 'military', tip: 'blade' }, wings: { type: 'cyberVanes', style: 'neon' }, horns: { type: 'cyberAntenna' }, ears: { type: 'cyberAudio', style: 'salvaged' } } });
    assert.equal(recipe.features.tail.style, 'military');
    assert.equal(recipe.features.tail.tip, 'blade');
    assert.equal(Model.normalize({ features: { tail: { type: 'cat', style: 'neon' } } }).features.tail.style, undefined, 'organic features carry no cyber settings');
    const built = Model.build(pack, recipe, {}, small);
    const tailBones = new Set(built.bones.map((b, i) => (/^Tail/.test(b.name) ? i : -1)).filter(i => i >= 0));
    assert.equal(tailBones.size, 5, 'the same five tail bones');
    const cyber = built.parts.filter(p => /^Cyber/.test(p.name));
    let onTail = 0, onSpine = 0, onHead = 0;
    const spine2 = built.bones.findIndex(b => b.name === 'Spine2'), head = built.bones.findIndex(b => b.name === 'Head');
    for (const p of cyber) for (let v = 0; v < p.positions.length / 3; v++) { const j = p.joints[v * 4]; if (tailBones.has(j)) onTail++; if (j === spine2) onSpine++; if (j === head) onHead++; }
    assert.ok(onTail > 200 && onSpine > 200 && onHead > 100, `tail ${onTail}, wings ${onSpine}, head ${onHead}`);
    assert.ok(Object.keys(built.textures).some(k => /^cyber-wear-\d\.png$/.test(k)), 'the plating picture is in the model');
    for (const key of ['tail', 'wings', 'horns', 'ears']) assert.ok(Species.FEATURES[key].types.some(t => /^cyber/.test(t[0])), key + ' has cyber types');
});

test('the cyber styles are exported for other hardware to match', () => {
    assert.deepEqual(Art.CYBER_STYLES.map(s => s.id), ['sleek', 'military', 'salvaged', 'neon']);
    const m = Art.cyberMaterial('military', { glow: '#ff0000', wear: 0.5 });
    assert.equal(m.glowHex, '#ff0000');
    assert.ok(m.base.length === 3 && m.metalness >= 0 && m.roughness > 0);
    const w = Art.wearAt(m, [0.1, 1.2, 0.05]);
    assert.ok(w.scratch >= 0 && w.grime >= 0 && w.rust === 0);
    const tex = Mods.wearTexture(2);
    assert.equal(tex.width, 256);
});

test('every motif draws something in its own box, as an emblem, a band and a sleeve', () => {
    for (const m of Motifs.MOTIFS) {
        const modes = [['emblem']].concat(m.band ? [['band', 2.4]] : []).concat(m.sleeve || m.coil || m.fillSleeve ? [['sleeve', 2.4, 6]] : []);
        for (const [mode, P, H] of modes) {
            const M = Motifs.motif(m.id, { mode, P, H }, 3, 'Word', 0.05), ev = { w: new Float32Array(5) };
            let ink = 0;
            for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) {
                const x = mode === 'emblem' ? (i / 39 * 2 - 1) * m.aspect[0] : i / 39 * P, y = mode === 'sleeve' ? (j / 39 - 0.5) * H : (j / 39 * 2 - 1) * (mode === 'emblem' ? m.aspect[1] : 1);
                Motifs.evaluate(M, x, y, 0.02, ev);
                ink += ev.alpha;
            }
            assert.ok(ink > 8, `${m.id} ${mode}: ${ink}`);
        }
    }
    // The script hand writes every letter it is given.
    const t = Motifs.scriptText('The quick brown fox jumps over 0123456789');
    assert.ok(t.width > 12 && t.shape.prims.length > 30, t.width + ' ' + t.shape.prims.length);
});
