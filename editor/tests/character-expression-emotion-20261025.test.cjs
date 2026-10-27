'use strict';
// Forge › 3D Character Builder › Face › Expression (2026-10-25): the character's own emotion settings (recipe.emotion:
// Expressiveness, Blushing, Blush color) are kept through normalizing, a species change and a saved design; every
// expression reads clearly against the Normal face at the default strength, more at Anime and less at Subtle; the
// saved model's expressions carry the character's strength; the blush only ever darkens the skin toward its tint.
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

let pack;
test.before(async () => { pack = await Body.loadPack(); });
const build = recipe => Model.build(pack, Object.assign({ outfit: [] }, recipe), {}, { quality: 'preview', skinSize: 64 });

/** The most any face vertex moves (mm), and how many move over a millimeter. */
function movement(result, id, emotion) {
    const D = X.field(pack, result, id, 1, emotion).delta;
    let most = 0, over = 0;
    for (let i = 0; i < D.length; i += 3) { const d = Math.hypot(D[i], D[i + 1], D[i + 2]) * 1000; most = Math.max(most, d); if (d > 1) over++; }
    return { most, over };
}

test('the emotion settings are a recipe\'s own: defaults, kept, clamped, carried across a species change', () => {
    const plain = Model.normalize({});
    assert.deepEqual(plain.emotion, { strength: 1, blush: 1, blushColor: '#ee8a8a' });
    const r = Model.normalize({ emotion: { strength: 1.6, blush: 0.4, blushColor: '#C8607A' } });
    assert.deepEqual(r.emotion, { strength: 1.6, blush: 0.4, blushColor: '#c8607a' });
    // As Save Design writes it and reads it back.
    assert.deepEqual(Model.normalize(JSON.parse(JSON.stringify({ builder: 'character3d', version: 2, recipe: r })).recipe).emotion, r.emotion);
    assert.deepEqual(Model.normalize({ emotion: { strength: 9, blush: -1, blushColor: 'red' } }).emotion, { strength: 2, blush: 0, blushColor: '#ee8a8a' });
    assert.deepEqual(Model.withSpecies(r, 'elf').emotion, r.emotion, 'a new species keeps how the face moves');
});

test('every expression reads clearly against Normal at the default strength, on several faces', () => {
    for (const recipe of [{ gender: 1 }, { gender: 0 }, Model.withSpecies({ gender: 0 }, 'elf'), Model.withSpecies({ gender: 1 }, 'orc'), Model.withSpecies({ gender: 0 }, 'tiefling')]) {
        const result = build(recipe), emotion = X.emotionOf(result.recipe);
        assert.ok(X.supports(pack, result), recipe.species || 'human');
        for (const e of X.EXPRESSIONS) {
            if (e.id === 'neutral') continue;
            const m = movement(result, e.id, emotion);
            // A brow or a mouth corner moved a third of a centimeter or more, over a good part of the face.
            assert.ok(m.most > 6 && m.over > 150, `${result.recipe.species} ${e.id}: ${m.most.toFixed(1)} mm, ${m.over} vertices`);
        }
    }
});

test('the expressions differ from each other, not only from Normal', () => {
    const result = build({ gender: 1 }), emotion = X.emotionOf(result.recipe);
    const fields = new Map(X.EXPRESSIONS.filter(e => e.id !== 'neutral').map(e => [e.id, X.field(pack, result, e.id, 1, emotion).delta]));
    for (const sheet of X.SHEETS) {
        const ids = sheet.expressions.filter(id => id !== 'neutral');
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
            const a = fields.get(ids[i]), b = fields.get(ids[j]);
            let most = 0;
            for (let k = 0; k < a.length; k += 3) most = Math.max(most, Math.hypot(a[k] - b[k], a[k + 1] - b[k + 1], a[k + 2] - b[k + 2]));
            assert.ok(most * 1000 > 4, `${sheet.id}: ${ids[i]} and ${ids[j]} differ by ${(most * 1000).toFixed(1)} mm`);
        }
    }
});

test('Expressiveness scales the face (Subtle less, Anime more); speech keeps its own measure; the lids stay out of the eyes', () => {
    const result = build({ gender: 0 }), M = X.measure(pack, result), S = M.S;
    for (const id of ['happy', 'angry', 'sad', 'surprised']) {
        const subtle = movement(result, id, { strength: 0.5 }).most, normal = movement(result, id, { strength: 1 }).most, anime = movement(result, id, { strength: 2 }).most;
        assert.ok(subtle < normal * 0.8 && anime > normal * 1.25, `${id}: ${subtle.toFixed(1)} < ${normal.toFixed(1)} < ${anime.toFixed(1)} mm`);
        const D = X.field(pack, result, id, 1, { strength: 2 }).delta;
        for (const v of M.F.lidIds) {
            const e = S[v * 3] >= 0 ? M.eyes[0] : M.eyes[1];
            const r = d => Math.hypot(...[0, 1, 2].map(k => (S[v * 3 + k] + (d ? D[v * 3 + k] : 0) - e.c[k]) / e.r[k]));
            if ((S[v * 3 + 2] + D[v * 3 + 2] - e.c[2]) / e.r[2] < -0.2) continue;
            assert.ok(r(true) >= Math.min(r(false), 1.04) - 1e-4, `${id} at Anime: lid vertex ${v}`);
        }
    }
    const saved = Model.build(pack, { gender: 0, outfit: [], emotion: { strength: 2 } }, {}, { quality: 'preview', skinSize: 64, morphs: true });
    const plain = Model.build(pack, { gender: 0, outfit: [] }, {}, { quality: 'preview', skinSize: 64, morphs: true });
    const most = (r, name) => { const t = r.morphs.find(m => m.name === name).parts.find(p => p.part === 0); return Math.max(...t.deltas.map(Math.abs)); };
    assert.ok(most(saved, 'expression_happy') > most(plain, 'expression_happy') * 1.2, 'the saved model\'s expressions carry its strength');
    assert.equal(most(saved, 'viseme_aa'), most(plain, 'viseme_aa'), 'its mouth shapes do not');
});

test('the blush is a soft tint the character chooses: it darkens toward the tint and never brightens the skin', () => {
    const result = build({ gender: 0 });
    const view = { meshes: result.parts.map(part => new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(Float32Array.from(part.positions), 3)).setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(part.normals || part.positions), 3)))), group: new THREE.Group() };
    view.meshes.forEach(m => view.group.add(m));
    const shown = emotion => {
        X.applyToView(view, result, pack, 'embarrassed', 1, THREE, emotion);
        return view.expressionOverlays.find(m => m.material.isMeshBasicMaterial);
    };
    const srgb = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
    const blush = shown({ blush: 1, blushColor: '#c8607a' });
    assert.ok(blush, 'the blush is shown');
    assert.equal(blush.material.blendSrc, THREE.DstColorFactor);
    assert.equal(blush.material.blendDst, THREE.ZeroFactor);
    assert.equal(blush.material.blendDstAlpha, THREE.OneFactor, 'a sprite\'s edge keeps its alpha');
    const C = blush.geometry.getAttribute('color').array;
    let reddest = 1;
    for (let i = 0; i < C.length; i += 4) {
        const f = [srgb(C[i]), srgb(C[i + 1]), srgb(C[i + 2])];
        assert.ok(f.every(x => x <= 1 + 1e-6), 'the factor on screen never brightens: ' + f.map(x => x.toFixed(3)));
        // Toward the tint: green held back more than red.
        assert.ok(f[1] <= f[0] + 1e-6);
        reddest = Math.min(reddest, f[1]);
    }
    assert.ok(reddest < 0.85, 'a blush that shows at its middle: ' + reddest.toFixed(2));
    const faint = shown({ blush: 0.3, blushColor: '#c8607a' });
    let faintest = 1;
    const F = faint.geometry.getAttribute('color').array;
    for (let i = 0; i < F.length; i += 4) faintest = Math.min(faintest, srgb(F[i + 1]));
    assert.ok(faintest > reddest, 'less Blushing, a lighter flush');
    assert.ok(!shown({ blush: 0 }), 'no Blushing, no blush');
});

test('the Face tab offers the settings beside the Expression choice, and the face sheet uses them', () => {
    const src = fs.readFileSync(path.join(dir, 'Character3DBuilder.js'), 'utf8');
    const rows = src.slice(src.indexOf('    _expressionRows() {'), src.indexOf('    _showExpression() {'));
    for (const p of ['emotion.strength', 'emotion.blush', 'emotion.blushColor']) assert.ok(rows.includes(`'${p}'`), p);
    assert.ok(/apply\(builder, name, weight = 1\) \{[\s\S]*?emotionOf\(builder\.recipe\)/.test(fs.readFileSync(path.join(dir, 'CharacterExpressions.js'), 'utf8')), 'the face sheet\'s apply reads the builder\'s settings');
});
