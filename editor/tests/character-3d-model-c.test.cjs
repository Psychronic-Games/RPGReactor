'use strict';
// (One of three files, -b and -c beside it: the tests are dealt between them so the three run at once; the helpers are in each.)
// Forge › 3D Character Builder, the whole character (RRCharacterModel): every species, outfit preset and accessory
// builds on any body, extremes included; garments stay outside the skin they are cut from; the outfit's picture is
// kept while the body changes; the GLB carries its pictures, its skin and its tail; random characters differ.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'src', 'forge', 'Character3D');
const load = name => require(path.join(dir, name + '.js'));
const Body = load('HumanBody');
for (const name of ['HumanTargets', 'CharacterOutfit', 'CharacterAtlas', 'CharacterWardrobe', 'CharacterProps', 'CharacterSpecies', 'CharacterSkin', 'CharacterHair', 'CreatureBody', 'CharacterGlb', 'CharacterShading', 'CharacterDetail']) load(name);
const Model = load('CharacterModel');
const Outfit = load('CharacterOutfit');
const Wardrobe = load('CharacterWardrobe');
const Props = load('CharacterProps');
const Species = load('CharacterSpecies');
const Skin = load('CharacterSkin');
const Optimizer = require(path.join(root, 'src', 'utils', 'GlbOptimizer.js'));
const { PNG } = require('pngjs');
// Keep failures bounded: a mesh/texture diff can otherwise print megabytes.
const sameBytes = (a, b) => a.byteLength === b.byteLength && Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));

let pack, eyeSource;

test.before(async () => {
    pack = await Body.loadPack();
    const png = PNG.sync.read(fs.readFileSync(path.join(dir, 'data', 'eye-brown.png')));
    eyeSource = { width: png.width, height: png.height, data: new Uint8Array(png.data) };
});

const { assertSound } = require('./helpers/character-preset-sweep.cjs');

/** Independent visibility probe: a ray from skin must cross fabric before reaching the viewer. */
function garmentHit(parts, origin, direction, reach = 0.5) {
    for (const part of parts) {
        const P = part.positions, I = part.index;
        for (let i = 0; i < I.length; i += 3) {
            const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
            const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
            const pv = [direction[1] * e2[2] - direction[2] * e2[1], direction[2] * e2[0] - direction[0] * e2[2], direction[0] * e2[1] - direction[1] * e2[0]];
            const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
            if (Math.abs(det) < 1e-12) continue;
            const tv = [origin[0] - P[a], origin[1] - P[a + 1], origin[2] - P[a + 2]], u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det;
            if (u < -1e-6 || u > 1 + 1e-6) continue;
            const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]], v = (direction[0] * qv[0] + direction[1] * qv[1] + direction[2] * qv[2]) / det;
            if (v < -1e-6 || u + v > 1 + 1e-6) continue;
            const t = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det;
            if (t > -0.002 && t < reach) return true;
        }
    }
    return false;
}


test('leaving a species leaves what it brought: its halo, its age, its beard, its skin; what was chosen stays', () => {
    const angel = Model.withSpecies({ gender: 1, props: [{ id: 'glasses' }] }, 'angel');
    assert.ok(angel.props.some(p => p.id === 'halo') && angel.props.some(p => p.id === 'glasses'));
    const grey = Model.withSpecies(angel, 'alien');
    assert.deepEqual(grey.props.map(p => p.id), ['glasses'], 'the halo goes with the angel, the glasses stay');
    assert.equal(grey.features.wings.type, 'none');
    assert.equal(Model.withSpecies(Model.withSpecies({ age: 40 }, 'undead'), 'human').age, Body.DEFAULT_RECIPE.age, 'an undead age is the undead\'s');
    assert.equal(Model.withSpecies({ age: 40 }, 'elf').age, 40, 'an age chosen for a species without its own is kept');
    const elf = Model.withSpecies(Model.withSpecies({ gender: 1 }, 'dwarf'), 'elf');
    assert.notEqual(elf.hair.facial.style, 'longBeard', 'the dwarf\'s beard is the dwarf\'s');
    assert.equal(Model.withSpecies(Model.withSpecies({}, 'orc'), 'human').skin, Body.DEFAULT_RECIPE.skin);
    assert.equal(Model.withSpecies({ skin: '#8a5a3c' }, 'elf').skin, '#8a5a3c', 'a skin tone chosen for a human stays on an elf');
    assert.equal(Model.withSpecies(Model.withSpecies({}, 'lizardfolk'), 'human').skinPattern.type, 'none');
});



// Every outfit preset and every accessory on an average and two extreme bodies: dealt across
// character-3d-model-presets-*.test.cjs, which run side by side (helpers/character-preset-sweep.cjs).

test('garments stay outside the skin, however far the sliders go', () => {
    for (const body of [{}, { gender: 1, weight: 2.5, muscle: 1.5 }]) {
        const built = Body.build(pack, Body.normalizeRecipe(body));
        const normals = Body.vertexNormals(pack, built.shaped);
        const ids = [...new Set(pack.body.source)];
        const grid = Outfit.pointGrid(built.shaped, new Set(ids), 0.04);
        const out = Wardrobe.build(pack, built, [{ id: 'tshirt' }, { id: 'jeans' }, { id: 'boots' }], {});
        let inside = 0, total = 0;
        for (const p of out.parts) for (let i = 0; i < p.positions.length; i += 3) {
            const q = grid.nearest(p.positions[i], p.positions[i + 1], p.positions[i + 2], 2);
            if (q < 0) continue;
            const P = built.shaped;
            const d = (p.positions[i] - P[q * 3]) * normals[q * 3] + (p.positions[i + 1] - P[q * 3 + 1]) * normals[q * 3 + 1] + (p.positions[i + 2] - P[q * 3 + 2]) * normals[q * 3 + 2];
            total++;
            if (d < -0.004) inside++;
        }
        // The rims fold back to the skin and a few vertices sit at creases: well under one in a hundred.
        assert.ok(inside / total < 0.01, `${inside} of ${total} garment vertices under the skin on ${JSON.stringify(body)}`);
        assert.ok(out.hidden.size > 1000, 'the skin under the clothes is left out');
    }
});



test('lips, eye shadow and markings land where they belong; the iris takes its color, the whites stay white', () => {
    const plain = Skin.paint(pack, '#c69c7f', {}, { size: 256 });
    const made = Skin.paint(pack, '#c69c7f', { lips: '#b02040', type: 'scales', color: '#203020' }, { size: 256 });
    let changed = 0;
    for (let i = 0; i < plain.data.length; i += 4) if (Math.abs(plain.data[i] - made.data[i]) + Math.abs(plain.data[i + 1] - made.data[i + 1]) > 30) changed++;
    assert.ok(changed > 1000, 'markings painted');
    const eyes = Skin.paintEyes(eyeSource.data, eyeSource.width, { color: '#3a8ad8' });
    const at = (u, v) => ((Math.floor(v * eyeSource.width) * eyeSource.width + Math.floor(u * eyeSource.width)) * 4);
    const iris = at(0.708 + 0.07, 0.259), white = at(0.5, 0.5);
    assert.ok(eyes[iris + 2] > eyes[iris], 'the iris turned blue');
    // The whites are lifted from the picture's dim beige, and stay a white.
    const [r, g, b] = eyes.slice(white, white + 3);
    assert.ok(r > eyeSource.data[white] && Math.max(r, g, b) - Math.min(r, g, b) < 30, `whites ${r},${g},${b}`);
});



test('random characters differ, and a bald species stays bald', () => {
    const looks = new Set();
    for (let seed = 1; seed <= 12; seed++) {
        const r = Model.random(seed);
        looks.add(r.outfit.map(i => i.id).join(',') + '|' + r.hair.style);
    }
    assert.ok(looks.size >= 9, 'twelve seeds give ' + looks.size + ' looks');
    assert.deepEqual(Model.random(5), Model.random(5));
    assert.equal(Model.random(3, { species: 'lizardfolk' }).hair.style, 'bald');
    // Leaving a bald species grows hair back.
    assert.notEqual(Model.withSpecies(Model.withSpecies({}, 'lizardfolk'), 'human').hair.style, 'bald');
});



test('every module a builder file needs is on the page before it (in the editor, require resolves elsewhere)', () => {
    const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const rel = 'src/forge/Character3D/';
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
        if (file === 'CharacterPreviewBrowserEntry.js') {
            const client = fs.readFileSync(path.join(dir, 'CharacterPreviewBrowser.js'), 'utf8');
            assert.ok(client.includes(file), 'the preview client loads its dedicated worker entry');
            assert.equal(page.includes(rel + file), false, 'the worker entry never executes on the page');
            continue;
        }
        if (file === 'CharacterGameWorker.js' || file === 'CharacterControls.js') {
            const game = fs.readFileSync(path.join(dir, 'CharacterGameWorker.js'), 'utf8');
            assert.ok(game.includes('CharacterControls.js'), 'the in-game builder loads its controls');
            assert.equal(page.includes(rel + file), false, 'the in-game builder runs in a game, never on the editor page');
            continue;
        }
        if (file === 'CharacterPreviewTextures.js') {
            const browser = fs.readFileSync(path.join(dir, 'CharacterPreviewBrowserEntry.js'), 'utf8');
            const desktop = fs.readFileSync(path.join(dir, 'CharacterPreviewWorker.cjs'), 'utf8');
            assert.ok(browser.includes(file) && desktop.includes(file), 'both worker entries load their texture reducer');
            assert.equal(page.includes(rel + file), false, 'worker texture reductions do not load on the page');
            continue;
        }
        const at = page.indexOf(rel + file);
        assert.ok(at > 0, file + ' is loaded');
        for (const m of fs.readFileSync(path.join(dir, file), 'utf8').matchAll(/require\('\.\/([A-Za-z0-9]+)\.js'\)/g)) {
            const need = page.indexOf(rel + m[1] + '.js');
            assert.ok(need > 0 && need < at, `${file} needs ${m[1]}.js loaded before it`);
        }
    }
});



test('eye size reaches big eyes past natural, eyeballs included; width and tallness shape them', () => {
    const span = recipe => {
        const b = Body.build(pack, recipe), eyes = b.parts.find(p => p.name === 'Eyes').positions;
        let mn = [9, 9], mx = [-9, -9];
        for (let i = 0; i < eyes.length; i += 3) if (eyes[i] > 0) { mn[0] = Math.min(mn[0], eyes[i]); mx[0] = Math.max(mx[0], eyes[i]); mn[1] = Math.min(mn[1], eyes[i + 1]); mx[1] = Math.max(mx[1], eyes[i + 1]); }
        return [mx[0] - mn[0], mx[1] - mn[1]];
    };
    const base = span({}), big = span({ shapes: { eyeSize: 4 } }), wide = span({ shapes: { eyeSize: 2 }, morph: { eyeWide: 2 } }), nat = span({ shapes: { eyeSize: 1 } });
    assert.ok(nat[0] > base[0] * 1.08, 'the natural slider grows the eyeballs too');
    assert.ok(big[0] > base[0] * 2, 'big eyes at the far end: ' + (big[0] / base[0]).toFixed(2));
    assert.ok(wide[0] / wide[1] > base[0] / base[1] * 1.4, 'width widens');
});



test('body hair is strands grown out of the skin where its regions say, and covered skin grows none', () => {
    const hairy = Model.build(pack, { gender: 1, bodyHair: { amount: 1, pattern: 'natural' } }, {}, { quality: 'preview' });
    const part = hairy.parts.find(p => p.name === 'Body hair');
    assert.ok(part && part.index.length / 3 > 2000, 'thousands of clumps');
    assert.ok(part.cutout && part.texture === 'bodyhair.png' && part.noShade, 'clumps of strands on their picture, not shaded');
    // Many hairs to a triangle: a full werewolf coat stays well inside a weak GPU's reach.
    const wolf = Model.build(pack, { gender: 1, bodyHair: { amount: 1, pattern: 'werewolf' } }, {}, { quality: 'preview' }).parts.find(p => p.name === 'Body hair');
    assert.ok(wolf.index.length / 3 < 160000, `werewolf body hair ${wolf.index.length / 3} triangles`);
    const dressed = Model.build(pack, { gender: 1, bodyHair: { amount: 1, pattern: 'natural' }, outfit: Wardrobe.PRESETS.find(p => p.id === 'knight').items }, {}, { quality: 'preview' });
    const under = dressed.parts.find(p => p.name === 'Body hair');
    assert.ok(!under || under.index.length < part.index.length * 0.5, 'armor covers most of it');
    assert.ok(!Model.build(pack, { gender: 1 }, {}, { quality: 'preview' }).parts.some(p => p.name === 'Body hair'), 'none by default');
});



test('a top worn with its own skirt reaches under the skirt: no bare waist between them on any body', () => {
    const an = Outfit.anatomy(pack);
    // The trunk from just above the hips to above the navel, where the bodice meets the skirt's waistband.
    const waist = [...new Set(pack.body.source)].filter(v => an.member[v * 5] > 0.9 && an.s[v * 5] > 0.6 && an.s[v * 5] < 1.2);
    for (const body of [{ gender: 0 }, { gender: 0, weight: 1, cup: 1 }, { gender: 1, muscle: 1 }, { gender: 0, extreme: true, weight: 4 }]) {
        const built = Body.build(pack, Body.normalizeRecipe(body));
        for (const id of ['dress', 'gown', 'robe', 'tunic', 'chainmail']) {
            const out = Wardrobe.build(pack, built, [{ id }], {});
            const hips = built.bones.find(b => b.name === 'Hips').head;
            for (const v of waist) {
                const p = Array.from(built.shaped.slice(v * 3, v * 3 + 3)), dx = p[0] - hips[0], dz = p[2] - hips[2], r = Math.hypot(dx, dz);
                assert.ok(garmentHit(out.parts, p, [dx / r, 0, dz / r]), `${id} on ${JSON.stringify(body)}: waist vertex ${v} visible from outside`);
            }
        }
    }
});


const Clothes = load('CharacterClothes');
const MODELED = Wardrobe.GARMENTS.filter(g => g.modeled);


test('a modeled garment shows its own picture until a color is chosen; a color keeps the weave and folds', () => {
    const clothes = Clothes.load(pack);
    const g = clothes.garments.get('mh_tee_jeans');
    const own = Clothes.picture(clothes, g);
    const plain = Model.build(pack, { outfit: [{ id: 'mh_tee_jeans' }] }, {}, { quality: 'preview' });
    assert.ok(plain.textures['cloth-mh_tee_jeans.png'].data === own.data, 'own picture, untouched');
    const red = Model.build(pack, { outfit: [{ id: 'mh_tee_jeans', color: '#b02020', color2: '#6a6a6a' }] }, {}, { quality: 'preview' }).textures['cloth-mh_tee_jeans.png'];
    assert.ok(red.data !== own.data, 'recolor without changing the source picture');
    // Sample the texels the shirt and the trousers use.
    // The denim's weave chart splits the part's vertices (2026-10-30): a vertex finds its region by its painted coordinates.
    const part = plain.parts.find(p => p.name === 'T-shirt and jeans'), size = red.width, regionAt = new Map();
    for (let i = 0; i < g.region.length; i++) regionAt.set(g.uvRaw[i * 2] + ':' + g.uvRaw[i * 2 + 1], g.region[i]);
    const stats = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
    for (let i = 0; i < part.uvs.length / 2; i++) {
        const o = (Math.min(size - 1, Math.floor(part.uvs[i * 2 + 1] * size)) * size + Math.min(size - 1, Math.floor(part.uvs[i * 2] * size))) * 4;
        const r = regionAt.get(Math.round(part.uvs[i * 2] * 65535) + ':' + Math.round(part.uvs[i * 2 + 1] * 65535)), s = stats[r];
        const l = red.data[o] * 0.3 + red.data[o + 1] * 0.59 + red.data[o + 2] * 0.11;
        s[0] += red.data[o]; s[1] += red.data[o + 1]; s[2] += red.data[o + 2]; s[3] += l * l; s[4]++;
    }
    const [shirt, trousers] = stats;
    assert.ok(shirt[0] > shirt[2] * 2 && shirt[0] > shirt[1] * 2, 'the shirt is red: ' + shirt.slice(0, 3).map(x => Math.round(x / shirt[4])));
    // The trousers grey, their faded denim still showing.
    const mean = (trousers[0] * 0.3 + trousers[1] * 0.59 + trousers[2] * 0.11) / trousers[4], spread = Math.sqrt(trousers[3] / trousers[4] - mean * mean);
    assert.ok(Math.abs(trousers[0] - trousers[2]) / trousers[4] < 8, 'the trousers are grey');
    assert.ok(spread > 10, 'the denim keeps its fading, spread ' + spread.toFixed(1));
});



test('a belt goes round over what is under it, unbroken, on a heavy belly too', () => {
    for (const body of [{}, { gender: 0.1, extreme: true, weight: 2.5 }]) {
        const built = Body.build(pack, Body.normalizeRecipe(body));
        const out = Wardrobe.build(pack, built, [{ id: 'robe' }, { id: 'sash' }], {});
        const belt = out.parts.find(p => p.name === 'Belt'), robe = out.parts.filter(p => p.name === 'Robe');
        // Straight out from the middle in front, the belt is the outermost thing at its own height.
        let beltZ = -Infinity, robeZ = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let i = 0; i < belt.positions.length; i += 3) if (Math.abs(belt.positions[i]) < 0.02 && belt.positions[i + 2] > 0) { beltZ = Math.max(beltZ, belt.positions[i + 2]); y0 = Math.min(y0, belt.positions[i + 1]); y1 = Math.max(y1, belt.positions[i + 1]); }
        for (const p of robe) for (let i = 0; i < p.positions.length; i += 3) if (Math.abs(p.positions[i]) < 0.02 && p.positions[i + 1] > y0 && p.positions[i + 1] < y1) robeZ = Math.max(robeZ, p.positions[i + 2]);
        assert.ok(beltZ > robeZ, `belt ${beltZ.toFixed(3)} over the robe ${robeZ.toFixed(3)} on ${JSON.stringify(body)}`);
        assert.ok(out.textures.some(t => t.name === belt.texture), 'the belt has its picture');
    }
});



test('animal skulls keep their closed source shape and join the actual moving neck edge', () => {
    for (const id of ['minotaur', 'rabbitfolk', 'birdfolk', 'catfolk']) {
        const built = Model.build(pack, Model.withSpecies({ gender: 1 }, id), {}, { quality: 'preview', hairBudget: 0 });
        const body = built.parts[0], skull = built.parts.find(p => p.name === 'Head Body'), neck = built.parts.find(p => p.name === 'Head neck');
        assert.ok(neck && neck.index.length > 200, id + ' has a continuous neck');
        const headJoint = built.bones.findIndex(b => b.name === 'Head');
        for (let v = 0; v < skull.positions.length / 3; v++) {
            let rigid = 0;
            for (let k = 0; k < 4; k++) if (skull.joints[v * 4 + k] === headJoint) rigid += skull.weights[v * 4 + k];
            assert.ok(rigid > 0.99999, id + ' closed skull stays rigid through nods and walking');
        }
        assert.ok([...neck.normals].every(Number.isFinite), id + ' smooth neck normals');
        const visible = new Map();
        const key = (p, v) => Array.from(p.positions.subarray(v * 3, v * 3 + 3), x => Math.round(x * 1e6)).join(',');
        for (const v of body.index) visible.set(key(body, v), v);
        const cols = neck.positions.length / 3 / ((neck.neckRows || 12) + 1);
        for (let v = 0; v < cols; v++) {
            const source = visible.get(key(neck, v));
            assert.notEqual(source, undefined, id + ' neck starts exactly on retained skin');
            const influences = p => {
                const result = new Map();
                for (let k = 0; k < 4; k++) result.set(p.joints[p.v * 4 + k], (result.get(p.joints[p.v * 4 + k]) || 0) + p.weights[p.v * 4 + k]);
                return result;
            };
            const a = influences(Object.assign({ v }, neck)), b = influences(Object.assign({ v: source }, body));
            for (const [joint, weight] of a) assert.ok(Math.abs(weight - (b.get(joint) || 0)) < 1e-5, id + ' keeps base skinning');
        }
        for (let v = 0; v < neck.weights.length; v += 4) {
            const total = neck.weights[v] + neck.weights[v + 1] + neck.weights[v + 2] + neck.weights[v + 3];
            assert.ok(Math.abs(total - 1) < 1e-5, id + ' normalized neck skinning');
        }
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (let v = 0; v < skull.positions.length; v += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], skull.positions[v + k]); hi[k] = Math.max(hi[k], skull.positions[v + k]); }
        for (let v = neck.positions.length - cols * 3; v < neck.positions.length; v += 3) for (let k = 0; k < 3; k++) {
            assert.ok(neck.positions[v + k] > lo[k] && neck.positions[v + k] < hi[k], id + ' upper neck terminates inside skull bounds');
        }
        assert.ok(lo[1] > built.bodyHeight * 0.7, id + ' skull does not carry the animal torso');
    }
});
