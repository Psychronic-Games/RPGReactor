'use strict';
// Forge › 3D Character Builder, Centaur (RRCharacterCentaur): the recipe normalizes (nothing for legs or feet, the
// horse's settings clamped, leaving the species clears them); it builds whole within its triangle budget; the waist band
// meets the skin's cut edge exactly and sits on the horse's waist; the clips loop; the GLB carries the combined rig and
// the gaits; Randomize keeps a centaur a centaur.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'src', 'forge', 'Character3D');
const load = name => require(path.join(dir, name + '.js'));
const Body = load('HumanBody');
for (const name of ['HumanTargets', 'CharacterOutfit', 'CharacterAtlas', 'CharacterWardrobe', 'CharacterProps', 'CharacterSpecies', 'CharacterSkin', 'CharacterHair', 'CreatureBody', 'CharacterGlb', 'CharacterShading', 'CharacterDetail', 'CharacterPoses']) load(name);
const Centaur = load('CharacterCentaur');
const Model = load('CharacterModel');
const Optimizer = require(path.join(root, 'src', 'utils', 'GlbOptimizer.js'));
const { PNG } = require('pngjs');

let pack;
test.before(async () => { pack = await Body.loadPack(); });

const centaur = over => Model.normalize(Object.assign(Model.withSpecies({ gender: (over && over.gender) ?? 1, seed: 5 }, 'centaur'), over || {}, { species: 'centaur' }));
const tris = (result, test) => result.parts.filter(p => test(p.name)).reduce((s, p) => s + p.index.length / 3, 0);
const horsePart = name => /^Horse/.test(name) || name === 'Centaur waist';

test('the recipe normalizes: the horse\'s settings, nothing for legs or feet, and none of it once a person again', () => {
    const r = centaur({ outfit: [{ id: 'tunic' }, { id: 'jeans' }, { id: 'boots' }], props: [{ id: 'spear' }], centaur: { coat: '#123456', pattern: 'nope', size: 9, legLength: -3 } });
    assert.equal(r.species, 'centaur');
    assert.equal(r.centaur.coat, '#123456');
    assert.equal(r.centaur.pattern, Centaur.DEFAULTS.pattern, 'an unknown pattern falls back');
    assert.equal(r.centaur.size, 1.2, 'size clamped to its extreme');
    assert.equal(r.centaur.legLength, 0.9, 'leg length clamped to its extreme');
    assert.deepEqual(r.outfit.map(i => i.id), ['tunic'], 'trousers and boots do not fit a horse\'s legs');
    assert.deepEqual(r.props.map(i => i.id), ['spear'], 'a held weapon stays');
    assert.equal(r.features.tail.type, 'none', 'no second tail at the person\'s hips');
    assert.deepEqual(Model.normalize(r), r, 'normalizing again changes nothing');
    const back = Model.withSpecies(r, 'human');
    assert.equal(back.centaur, undefined, 'a human carries no horse');
    assert.ok(Centaur.fitsGarment('tunic') && !Centaur.fitsGarment('jeans'));
});

test('it builds whole: a horse under the person, every part skinned to a real bone, within the triangle budget', () => {
    for (const gender of [0, 1]) {
        const r = centaur({ gender, outfit: [{ id: 'tunic' }], props: [{ id: 'sword' }] });
        const result = Model.build(pack, r, {}, { quality: 'save' });
        const names = result.parts.map(p => p.name);
        for (const n of ['Horse', 'Centaur waist', 'Body']) assert.ok(names.includes(n), n + ' is built');
        assert.ok(!names.some(n => /Eyes/.test(n) && /Horse/.test(n)), 'the horse brings no head');
        for (const p of result.parts) {
            if (!p.joints) continue;
            for (let i = 0; i < p.joints.length; i++) if (p.weights[i] > 0) assert.ok(p.joints[i] < result.bones.length, p.name + ' skinned to a bone');
            for (let i = 0; i < p.positions.length; i++) assert.ok(Number.isFinite(p.positions[i]), p.name + ' positions finite');
        }
        // Parents before children, and the person's hips hang from the horse's chest.
        result.bones.forEach((b, i) => assert.ok(b.parent < i, b.name + ' after its parent'));
        const hips = result.bones.find(b => b.name === 'Hips');
        assert.equal(result.bones[hips.parent].name, 'HorseChest');
        // Standing on its hooves: the floor at 0, the head well above a horse's back.
        let low = Infinity;
        for (const p of result.parts) for (let i = 1; i < p.positions.length; i += 3) low = Math.min(low, p.positions[i]);
        assert.ok(Math.abs(low) < 0.02, 'stands on the floor: ' + low.toFixed(3));
        assert.ok(result.height > 1.9 && result.height < 2.7, 'height ' + result.height.toFixed(2));
        const added = tris(result, horsePart);
        assert.ok(added < 36000, 'horse body and waist band: ' + added + ' triangles');
        const all = tris(result, () => true);
        assert.ok(all < 100000, 'whole centaur: ' + all + ' triangles');
    }
});

test('the waist join is one surface: the band\'s top row is the skin\'s cut edge, its foot the horse\'s own cut edge, normals matched', () => {
    const r = centaur({ gender: 0 });
    const result = Model.build(pack, r, {}, { quality: 'preview', hairBudget: 0 });
    const band = result.parts.find(p => p.name === 'Centaur waist'), body = result.parts.find(p => p.name === 'Body'), horse = result.parts.find(p => p.name === 'Horse');
    const ring = Centaur.cutOf(pack).ring, n = ring.length, rows = 9;
    // Every top-row point is a kept body vertex's position.
    const bodyAt = new Set();
    for (let i = 0; i < body.positions.length; i += 3) bodyAt.add([0, 1, 2].map(k => body.positions[i + k].toFixed(4)).join(','));
    let onSkin = 0;
    for (let i = 0; i < n; i++) if (bodyAt.has([0, 1, 2].map(k => band.positions[i * 3 + k].toFixed(4)).join(','))) onSkin++;
    assert.ok(onSkin >= n * 0.97, `top row on the skin's edge: ${onSkin}/${n}`);
    // The foot is the horse's own cut edge: its points are the horse's points, and every open edge the horse's waist
    // has is one of the foot's (one closed surface, nothing laid over anything).
    const footFrom = rows * n, foot = band.positions.length / 3 - footFrom;
    assert.ok(foot >= 8, 'a stitched foot: ' + foot + ' points');
    const key = (P, v) => [0, 1, 2].map(k => P[v * 3 + k].toFixed(5)).join(',');
    const horseAt = new Set();
    for (let v = 0; v < horse.positions.length / 3; v++) horseAt.add(key(horse.positions, v));
    let shared = 0;
    for (let k = 0; k < foot; k++) if (horseAt.has(key(band.positions, footFrom + k))) shared++;
    assert.equal(shared, foot, 'every foot point is a horse point');
    const edges = new Map();
    for (let t = 0; t < horse.index.length; t += 3) for (let e = 0; e < 3; e++) {
        const a = key(horse.positions, horse.index[t + e]), b = key(horse.positions, horse.index[t + (e + 1) % 3]);
        const k = a < b ? a + '|' + b : b + '|' + a; edges.set(k, (edges.get(k) || 0) + 1);
    }
    const footAt = new Set(Array.from({ length: foot }, (_, k) => key(band.positions, footFrom + k)));
    let open = 0, openOnFoot = 0;
    for (const [k, c] of edges) if (c === 1) { open++; const [a, b] = k.split('|'); if (footAt.has(a) && footAt.has(b)) openOnFoot++; }
    assert.equal(openOnFoot, open, `the horse's only open edges are the foot's: ${openOnFoot}/${open}`);
    // No step: neighboring rows never jump more than the band's own height out.
    for (let i = 0; i < n; i++) for (let row = 0; row + 1 < rows; row++) {
        const a = (row * n + i) * 3, b = ((row + 1) * n + i) * 3;
        const step = Math.hypot(band.positions[a] - band.positions[b], band.positions[a + 2] - band.positions[b + 2]);
        assert.ok(step < 0.03, 'row ' + row + ' steps ' + step.toFixed(3));
    }
    // Matched light: each foot point's normal is the horse's own there.
    const normalAt = new Map();
    for (let v = 0; v < horse.positions.length / 3; v++) normalAt.set(key(horse.positions, v), [horse.normals[v * 3], horse.normals[v * 3 + 1], horse.normals[v * 3 + 2]]);
    for (let k = 0; k < foot; k++) {
        const q = footFrom + k, h = normalAt.get(key(band.positions, q));
        const d = h[0] * band.normals[q * 3] + h[1] * band.normals[q * 3 + 1] + h[2] * band.normals[q * 3 + 2];
        assert.ok(d > 0.99, 'foot normal matches the horse: ' + d.toFixed(3));
    }
    // The band's colors run from the skin (top) to the coat (bottom).
    const c = band.colors, top = [0, 0, 0], bot = [0, 0, 0];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { top[k] += c[i * 3 + k] / n; bot[k] += c[((rows - 1) * n + i) * 3 + k] / n; }
    assert.ok(Math.abs(top[0] - bot[0]) + Math.abs(top[1] - bot[1]) + Math.abs(top[2] - bot[2]) > 0.05, 'skin and coat differ and blend');
});

test('the clips loop: Idle, Walk, Trot and Run, the horse\'s legs and the person\'s arms moving', () => {
    const result = Model.build(pack, centaur({ gender: 1 }), {}, { quality: 'preview', hairBudget: 0 });
    assert.deepEqual(result.clips.map(c => c.name), ['Idle', 'Walk', 'Trot', 'Run']);
    const B = name => result.bones.findIndex(b => b.name === name);
    for (const clip of result.clips) {
        for (const t of clip.tracks) {
            const w = t.path === 'translation' || t.path === 'scale' ? 3 : 4, last = clip.times.length - 1;
            for (let k = 0; k < w; k++) assert.ok(Math.abs(t.values[k] - t.values[last * w + k]) < 1e-3 || (w === 4 && Math.abs(t.values[k] + t.values[last * w + k]) < 1e-3), clip.name + ' ' + result.bones[t.bone].name + ' loops');
            for (const v of t.values) assert.ok(Number.isFinite(v));
        }
        if (clip.name === 'Idle') continue;
        for (const n of ['LeftFrontUpperLeg', 'RightRearUpperLeg', 'LeftArm', 'RightArm', 'Hips']) assert.ok(clip.tracks.some(t => t.bone === B(n)), clip.name + ' moves ' + n);
        assert.ok(!clip.tracks.some(t => /^(Left|Right)(UpLeg|Leg|Foot)$/.test(result.bones[t.bone].name)), clip.name + ': the person\'s legs stay out of it');
    }
    // Upper-body poses play on the torso over the standing horse.
    const sword = Centaur.poseClip(result.bones, 'sword', result.parts.find(p => p.name === 'Body'), result.recipe);
    assert.ok(sword && sword.tracks.some(t => t.bone === B('RightArm')), 'a sword swing moves the arm');
});

test('it exports: the GLB carries the horse\'s and the person\'s bones, the gaits and the coat', async () => {
    const result = Model.build(pack, centaur({ gender: 0, outfit: [{ id: 'tunic' }], props: [{ id: 'spear' }] }), {}, { quality: 'preview', hairBudget: 0.3 });
    const glb = await Model.toGlb(result, 'Centaur', tex => { const png = new PNG({ width: tex.width, height: tex.height }); png.data = Buffer.from(tex.data); return new Uint8Array(PNG.sync.write(png)); });
    const { json } = Optimizer.parseGlb(glb);
    const joints = json.skins[0].joints.map(j => json.nodes[j].name);
    for (const n of ['HorseHips', 'HorseChest', 'LeftFrontFoot', 'RightRearFoot', 'HorseTail3', 'Hips', 'Head', 'LeftHand', 'RightHand']) assert.ok(joints.includes(n), n + ' is a bone');
    const chest = json.nodes.findIndex(n => n.name === 'HorseChest');
    assert.ok(json.nodes[chest].children.includes(json.nodes.findIndex(n => n.name === 'Hips')), 'the person rides the horse\'s chest');
    assert.deepEqual(json.animations.map(a => a.name), ['Idle', 'Walk', 'Trot', 'Run']);
    const images = json.images.map(i => i.name);
    for (const n of ['creaturecoat.png', 'skin.png']) assert.ok(images.includes(n), n);
    // The game's own clip names find Idle, Walk and Run.
    const R = {};
    const runtime = fs.readFileSync(path.join(root, '..', 'runtime', 'reactor_3d_models.js'), 'utf8');
    const block = runtime.slice(runtime.indexOf('Reactor3D.CLIP_STATE_NAMES = {'), runtime.indexOf('};', runtime.indexOf('Reactor3D.CLIP_STATE_NAMES = {')) + 2);
    vm.runInNewContext('var Reactor3D = R; ' + block, { R });
    for (const state of ['idle', 'walking']) assert.ok(json.animations.some(a => R.CLIP_STATE_NAMES[state].includes(a.name.toLowerCase())), state + ' has its clip');
    // Saved with the game's humanoid motions: the horse stays standing under them.
    const Poses = load('CharacterPoses');
    const ready = Poses.savedModel(result, 'useful');
    if (ready) for (const c of ready.clips) assert.ok(!c.tracks.some(t => /^(Left|Right)(UpLeg|Leg|Foot|ToeBase)$/.test(result.bones[t.bone].name) || (t.path && result.bones[t.bone].parent < 0)), c.name + ' leaves the horse standing');
});

test('Randomize keeps a centaur a centaur, with a coat of its own and nothing for legs', () => {
    const coats = new Set();
    for (let seed = 1; seed <= 12; seed++) {
        const r = Model.random(seed, { species: 'centaur' });
        assert.equal(r.species, 'centaur', 'seed ' + seed);
        assert.ok(r.centaur && /^#[0-9a-f]{6}$/.test(r.centaur.coat));
        coats.add(r.centaur.coat);
        for (const i of r.outfit) assert.ok(Centaur.fitsGarment(i.id), i.id + ' fits a centaur');
    }
    assert.ok(coats.size >= 3, 'coats vary: ' + [...coats].join(' '));
});
