'use strict';
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

test('static thumbnail settings do not leak into the main character or its reusable picture caches', async () => {
    const bodyPack = await Body.loadPack();
    const recipe = Model.normalize({ hair: { style: 'bald' }, outfit: [{ id: 'boots' }] });
    const before = JSON.stringify(recipe), cache = {};
    const eyes = size => ({ width: size, height: size, data: new Uint8Array(size * size * 4).fill(255) });
    const small = Model.build(bodyPack, recipe, cache, { quality: 'preview', static: true, skinSize: 32, atlasSize: 64, eyeSource: eyes(8), hairBudget: 0.5 });
    assert.equal(small.clips.length, 0);
    assert.equal(small.textures['eyes.png'].width, 8);
    assert.equal(small.textures['shoes.png'].width, 64);
    const main = Model.build(bodyPack, recipe, cache, { quality: 'preview', skinSize: 32, atlasSize: 64, eyeSource: eyes(16) });
    assert.ok(main.clips.length > 0);
    assert.equal(main.textures['eyes.png'].width, 16);
    assert.equal(main.textures['shoes.png'].width, 1024);
    assert.ok(sameBytes(main.parts[0].positions, small.parts[0].positions), 'thumbnail detail budgets do not reshape the body');
    assert.equal(JSON.stringify(recipe), before);
});
test.before(async () => {
    pack = await Body.loadPack();
    const png = PNG.sync.read(fs.readFileSync(path.join(dir, 'data', 'eye-brown.png')));
    eyeSource = { width: png.width, height: png.height, data: new Uint8Array(png.data) };
});

/** Every part well formed: finite numbers, skin indices in range, weights summing to one. */
function assertSound(result, label) {
    assert.ok(result.parts.length > 0, label + ' has parts');
    for (const p of result.parts) {
        const n = p.positions.length / 3;
        assert.ok(n > 0 && p.index.length > 0, `${label}: ${p.name} has geometry`);
        for (let i = 0; i < p.positions.length; i++) assert.ok(Number.isFinite(p.positions[i]), `${label}: ${p.name} position ${i}`);
        for (let i = 0; i < p.index.length; i++) assert.ok(p.index[i] < n, `${label}: ${p.name} index ${i}`);
        assert.equal(p.joints.length, n * 4, `${label}: ${p.name} joints`);
        for (let v = 0; v < n; v++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) { assert.ok(p.joints[v * 4 + k] < result.bones.length, `${label}: ${p.name} joint`); sum += p.weights[v * 4 + k]; }
            assert.ok(Math.abs(sum - 1) < 0.02, `${label}: ${p.name} weights at ${v} sum to ${sum}`);
        }
        // Tiled finish maps (repeat) take physical coordinates past 0..1; a part with a picture of its own stays inside it.
        const maps = [p.texture, p.normalTexture, p.metallicRoughnessTexture, p.emissiveTexture, p.iridescenceThicknessTexture].filter(Boolean);
        const tiled = maps.length > 0 && maps.every(name => result.textures && result.textures[name] && result.textures[name].repeat);
        if (p.uvs && !tiled) for (let i = 0; i < p.uvs.length; i++) assert.ok(p.uvs[i] >= -1e-6 && p.uvs[i] <= 1 + 1e-6, `${label}: ${p.name} uv in the picture`);
    }
}

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

test('every species builds, with its features and its own bones', () => {
    for (const s of Species.SPECIES) {
        const result = Model.build(pack, Model.withSpecies({}, s.id), {}, { quality: 'preview' });
        assertSound(result, s.id);
        const tail = s.recipe.features && s.recipe.features.tail;
        if (tail && tail.type !== 'none') {
            assert.ok(result.bones.some(b => b.name === 'Tail'), s.id + ' has a tail chain');
            const tailBone = result.bones.findIndex(b => b.name === 'Tail2');
            assert.ok(result.clips[0].tracks.some(t => t.bone === tailBone), s.id + ' sways its tail');
        }
        assert.ok(result.height > 0.6 && result.height < 3.5, s.id + ' height ' + result.height);
    }
});

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

test('furred features wear fur like the body\'s; a reptile\'s tail is scaled; both follow the tail\'s bones', () => {
    const furry = Object.assign(Model.withSpecies({ gender: 1 }, 'human'), { bodyHair: { amount: 1, pattern: 'werewolf', fur: 0.9, length: 1.1, color: '#6a6460' }, features: { ears: { type: 'wolf' }, tail: { type: 'fox' } } });
    const wolf = Model.build(pack, furry, {}, { quality: 'preview' });
    const fur = wolf.parts.filter(p => p.name === 'Feature fur');
    assert.equal(fur.length, 2, 'fur on the ears and on the tail');
    for (const p of fur) {
        assert.equal(p.texture, 'bodyhair.png');
        assert.ok(wolf.textures['bodyhair.png'], 'the body fur picture is there for them');
        assert.equal(p.source.length, p.positions.length / 3, 'each tuft rides a body vertex on the drag path');
    }
    const tail = wolf.bones.findIndex(b => b.name === 'Tail');
    assert.ok(fur.some(p => p.joints.some(j => j >= tail)), 'the tail\'s fur moves with the tail');
    const weak = Model.build(pack, furry, {}, { quality: 'preview', hairBudget: 0.4 });
    const tris = r => r.parts.filter(p => p.name === 'Feature fur').reduce((n, p) => n + p.index.length / 3, 0);
    assert.ok(tris(weak) < tris(wolf) * 0.6, 'a weak budget grows less');
    assert.ok(tris(wolf) < 30000, 'feature fur ' + tris(wolf) + ' triangles');
    const lizard = Model.build(pack, Model.withSpecies({}, 'lizardfolk'), {}, { quality: 'preview' });
    const scaled = lizard.parts.find(p => p.texture === 'scales.png');
    assert.ok(scaled && scaled.uvs && lizard.textures['scales.png'], 'the tail carries the scale picture');
    assert.ok(scaled.joints.some(j => j >= lizard.bones.findIndex(b => b.name === 'Tail')));
});

test('beastfolk wear a real animal head: the creature\'s head on the neck, the human head left out, gone again with the species', () => {
    const human = Model.build(pack, Model.withSpecies({ gender: 1 }, 'human'), {}, { quality: 'preview' });
    for (const [id, kind] of [['wolffolk', 'wolf'], ['lizardfolk', 'drake'], ['minotaur', 'bull']]) {
        const r = Model.withSpecies({ gender: 1 }, id);
        assert.equal(r.head.kind, kind);
        const built = Model.build(pack, r, {}, { quality: 'preview' });
        const head = built.parts.find(p => p.name === 'Head Body');
        assert.ok(head && head.index.length > 3000, id + ' has its animal head');
        assert.ok(built.parts.some(p => p.name === 'Head Eyes' && p.kind === 'eye'), id + ' sees with its own eyes');
        assert.ok(!built.parts.some(p => p.name === 'Eyes'), id + ' has no human eyes left');
        assert.ok(built.parts[0].index.length < human.parts[0].index.length * 0.9, id + ' leaves the human head out');
        const headBone = built.bones.findIndex(b => b.name === 'Head');
        assert.ok(head.joints.some(j => j === headBone), id + ' head moves with the Head bone');
        // The head sits on the neck, where the human head was.
        let top = 0;
        for (let i = 1; i < head.positions.length; i += 3) top = Math.max(top, head.positions[i]);
        assert.ok(top > built.bodyHeight * 0.85 && top < built.bodyHeight * 1.2, id + ' head top at ' + top + ' of ' + built.bodyHeight);
    }
    assert.equal(Model.withSpecies(Model.withSpecies({}, 'wolffolk'), 'elf').head, null, 'leaving the species takes its head with it');
    // The Head choice: any body may wear any animal's head, or its own again; a bird's among them.
    const ids = Species.heads().map(h => h[0]);
    for (const id of ['human', 'wolf', 'cat', 'rabbit', 'bull', 'reptile', 'dragon', 'bird']) assert.ok(ids.includes(id), id + ' offered');
    const elf = Model.normalize(Object.assign(Model.withSpecies({ gender: 0 }, 'elf'), { headId: 'cat' }));
    assert.equal(Species.headId(elf.head), 'cat');
    assert.equal(Model.normalize(Object.assign({}, elf, { headId: 'human' })).head, null);
    assert.equal(Species.headId(Model.withSpecies({}, 'birdfolk').head), 'bird');
    const bird = Model.build(pack, Model.withSpecies({ gender: 1 }, 'birdfolk'), {}, { quality: 'preview' });
    assert.ok(bird.parts.some(p => p.name === 'Head Body') && !bird.parts.some(p => p.name === 'Beak'), 'a bird\'s own head and beak, not a beak on a face');
});

test('every outfit preset and every accessory builds on an average and an extreme body', () => {
    const bodies = [{}, { gender: 1, weight: 3, muscle: 2.2, headSize: 1.6 }, { gender: 0, weight: -0.3, height: -0.5, cup: 4 }];
    for (const body of bodies) {
        const cache = {};
        for (const preset of Wardrobe.PRESETS) assertSound(Model.build(pack, Object.assign({}, body, { outfit: preset.items }), cache, { quality: 'preview' }), preset.id + ' on ' + JSON.stringify(body));
        assertSound(Model.build(pack, Object.assign({}, body, { props: Props.PROPS.map(p => ({ id: p.id })) }), cache, { quality: 'preview' }), 'accessories on ' + JSON.stringify(body));
    }
});

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

test('a kept cache lays the outfit on the body built now, not on the one before', () => {
    const outfit = Wardrobe.PRESETS.find(p => p.id === 'winter').items;
    const kept = {};
    Model.build(pack, { outfit }, kept, { quality: 'preview' });
    for (const body of [{ age: 11 }, { cup: 4, gender: 0 }, { weight: 3, gender: 1 }]) {
        const reused = Model.build(pack, Object.assign({ outfit }, body), kept, { quality: 'preview' });
        const fresh = Model.build(pack, Object.assign({ outfit }, body), {}, { quality: 'preview' });
        for (let k = 0; k < fresh.parts.length; k++) assert.ok(sameBytes(reused.parts[k].positions, fresh.parts[k].positions), fresh.parts[k].name + ' on ' + JSON.stringify(body));
    }
});

test('the outfit and skin pictures are kept while the body changes, and repainted when the outfit does', () => {
    const cache = {};
    const a = Model.build(pack, { outfit: [{ id: 'tunic' }], weight: 0.2 }, cache, { quality: 'preview' });
    const b = Model.build(pack, { outfit: [{ id: 'tunic' }], weight: 0.9, muscle: 0.9 }, cache, { quality: 'preview' });
    assert.ok(a.textures['outfit.png'] === b.textures['outfit.png'], 'reuse the outfit picture');
    assert.ok(a.textures['skin.png'] === b.textures['skin.png'], 'reuse the skin picture');
    const c = Model.build(pack, { outfit: [{ id: 'tunic', color: '#123456' }] }, cache, { quality: 'preview' });
    assert.ok(c.textures['outfit.png'] !== a.textures['outfit.png'], 'repaint the changed outfit');
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

test('the GLB holds the pictures, the skinned parts, the tail and the Idle', async () => {
    const result = Model.build(pack, Object.assign(Model.withSpecies({}, 'dragonborn'), { outfit: Wardrobe.PRESETS.find(p => p.id === 'knight').items, props: [{ id: 'cape' }] }), {}, { eyeSource });
    const glb = await Model.toGlb(result, 'Test', tex => { const png = new PNG({ width: tex.width, height: tex.height }); png.data = Buffer.from(tex.data); return new Uint8Array(PNG.sync.write(png)); });
    const { json } = Optimizer.parseGlb(glb);
    // The skin, outfit and shoe pictures, the scales of the dragon's tail and its animal head's own coat.
    const images = json.images.map(i => i.name);
    for (const name of ['outfit.png', 'skin.png', 'scales.png', 'creaturecoat.png']) assert.ok(images.includes(name), name + ' in ' + images.join(', '));
    const boots = result.parts.find(p => p.name === 'Armored boots');
    assert.ok(boots && /^shoes\d*\.png$/.test(boots.texture), 'the footwear has its own generated picture');
    assert.ok(images.includes(boots.texture), 'the actual footwear picture is embedded, regardless of preceding armor parts');
    assert.equal(json.meshes.length, result.parts.length);
    for (const node of json.nodes.filter(n => n.mesh != null)) assert.equal(node.skin, 0);
    const names = json.skins[0].joints.map(j => json.nodes[j].name);
    assert.ok(names.includes('Tail') && names.includes('Tail5') && names.includes('LeftHandThumb1'));
    assert.equal(json.animations[0].name, 'Idle');
    // Vertex colors only on the parts without a picture, or tinting a gray one (the tail's scales).
    for (const [i, part] of result.parts.entries()) {
        const prim = json.meshes[i].primitives[0];
        assert.equal(prim.attributes.COLOR_0 != null, !!part.colors && (!part.texture || !!part.keepColors), part.name);
    }
});

test('a four-legged creature saves with its quadruped rig beside it', async () => {
    const result = Model.build(pack, { plan: 'quadruped', kind: 'horse' }, {});
    assert.equal(result.plan, 'quadruped');
    assert.equal(result.sidecar.rig.template, 'quadruped');
    const glb = await Model.toGlb(result, 'Horse', () => new Uint8Array(0));
    const { json } = Optimizer.parseGlb(glb);
    assert.ok(json.skins[0].joints.map(j => json.nodes[j].name).includes('LeftFrontUpperLeg'));
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

test('the arms hang clear of a wide body', () => {
    const thin = Model.build(pack, {}, {}, { quality: 'preview' }), wide = Model.build(pack, { weight: 3, muscle: 2 }, {}, { quality: 'preview' });
    assert.ok(Model.armAngle(wide.recipe, wide.built, pack) > Model.armAngle(thin.recipe, thin.built, pack) + 0.4);
});

test('the editor page loads each module after the ones it needs', () => {
    const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(page.indexOf('src/utils/ColorPopover.js') > 0 && page.indexOf('src/utils/ColorPopover.js') < page.indexOf('src/forge/Character3D/Character3DBuilder.js'), 'the color picker is loaded before the builder');
    // Props comes before Wardrobe: the garment-detail and Recon construction modules between them build with its meshes at load.
    const order = ['HumanTargets', 'HumanBody', 'CharacterOutfit', 'CharacterAtlas', 'CharacterProps', 'CharacterWardrobe', 'CharacterSkin', 'CharacterSpecies', 'CharacterHair', 'CreatureBody', 'CharacterGlb', 'CharacterShading', 'CharacterDetail', 'CharacterModel', 'Character3DBuilder'];
    const at = order.map(name => page.indexOf(`src/forge/Character3D/${name}.js`));
    assert.ok(at.every(i => i > 0), 'every module is loaded');
    assert.deepEqual(at.slice().sort((a, b) => a - b), at);
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

test('body hair grows where its pattern says, and never on the palms', () => {
    const K = Skin;
    const at = (fam, s, ang, n, x = 0.05) => ({ fam, s, ang, n, rest: [x, 1, 0], lips: 0, lids: 0, nose: 0 });
    const chest = at(0, 3.0, 0, [0, 0, 1]), back = at(0, 2.0, Math.PI, [0, 0, -1]), face = at(0, 5.0, 1.2, [0.9, 0, 0.4], 0.06);
    const palm = at(1, 3.4, 0, [0, -1, 0]), handBack = at(1, 3.4, 0, [0, 1, 0]), knee = at(3, 1.0, 0, [0, 0, 1]);
    const natural = K.normalizeBodyHair({ pattern: 'natural' }).regions, wolf = K.normalizeBodyHair({ pattern: 'werewolf' }).regions;
    assert.ok(K.hairDensity(natural, chest) > 0.5, 'a natural chest');
    assert.ok(K.hairDensity(natural, back) < 0.1, 'a natural back is bare');
    assert.equal(K.hairDensity(natural, face), 0);
    assert.ok(K.hairDensity(wolf, face) > 0.9, 'a werewolf cheek');
    assert.ok(K.hairDensity(wolf, knee) > 0.9, 'no gap at the knee where thigh and shin meet');
    assert.ok(K.hairDensity(wolf, handBack) > 0.5);
    assert.equal(K.hairDensity(wolf, palm), 0);
    // A region moved by hand keeps its value under the pattern's others.
    assert.equal(K.normalizeBodyHair({ pattern: 'custom', regions: { back: 0.4 } }).regions.back, 0.4);
});

test('toe length lengthens all five toes, and leaves the heel', () => {
    const across = recipe => {
        const b = Body.build(pack, recipe), P = b.shaped;
        const ids = [...new Set(pack.body.source)].filter(v => P[v * 3] > 0.03 && P[v * 3 + 1] < 0.06);
        let mn = 1, mx = 0, heel = 1;
        for (const v of ids) { mn = Math.min(mn, P[v * 3]); mx = Math.max(mx, P[v * 3]); heel = Math.min(heel, P[v * 3 + 2]); }
        const tips = [-1, -1, -1, -1, -1];
        for (const v of ids) { const k = Math.min(4, Math.floor((P[v * 3] - mn) / (mx - mn) * 5)); tips[k] = Math.max(tips[k], P[v * 3 + 2]); }
        return { tips, heel };
    };
    const a = across({}), b = across({ morph: { toes: 2 } });
    a.tips.forEach((t, k) => assert.ok(b.tips[k] - t > 0.03, `strip ${k} grew ${b.tips[k] - t}`));
    assert.ok(Math.abs(b.heel - a.heel) < 0.002, 'the heel stays');
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

test('hidden ears leave ear holes, not nubs', () => {
    const out = recipe => { const P = Body.build(pack, recipe).shaped, F = Body.headFields(pack); let m = 0; for (let v = 0; v < F.ear.length; v++) if (F.ear[v] > 0.6 && P[v * 3] > 0) m = Math.max(m, P[v * 3]); return m; };
    const ears = out({}), hidden = out({ morph: { earsAway: 1 } });
    assert.ok(ears - hidden > 0.015, 'the ear lies flat against the head');
});

test('anatomical detail: one sharp areola patch per nipple, centered on it, and none without the switch', () => {
    const on = Model.build(pack, { gender: 0, anatomy: { detail: true } }, {}, { quality: 'preview' });
    const off = Model.build(pack, { gender: 0 }, {}, { quality: 'preview' });
    assert.ok(!off.parts.some(p => p.name === 'Areolas' || p.name === 'Genitals'), 'nothing anatomical by default');
    const patch = on.parts.find(p => p.name === 'Areolas');
    assert.ok(patch && on.textures['areola.png'].width >= 256, 'a patch with its own picture');
    // Each patch's middle (uv 0.5) is the nipple: the patch vertex nearest it sits on the nipple vertex.
    const F = Body.anatomyFields(pack);
    for (const nip of F.nipples) {
        const bind = patch.interpolation;
        const i = bind ? Array.from({ length: bind.offsets.length - 1 }, (_, i) => i).find(i =>
            bind.offsets[i + 1] - bind.offsets[i] === 1 && bind.vertices[bind.offsets[i]] === nip.v)
            : Array.from(patch.source).indexOf(nip.v);
        assert.ok(i >= 0, 'the nipple is in its patch');
        assert.ok(Math.abs(patch.uvs[i * 2] - 0.5) < 0.02 && Math.abs(patch.uvs[i * 2 + 1] - 0.5) < 0.02, 'centered on it');
    }
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

test('every pose to try a character in plays on the built skeleton, its turns whole quaternions', () => {
    const Poses = require(path.join(root, 'src', 'forge', 'Character3D', 'CharacterPoses.js'));
    const built = Model.build(pack, { gender: 0 }, {}, { quality: 'preview' });
    for (const pose of Poses.POSES) {
        const clip = Poses.clip(built.bones, pose.id);
        assert.ok(clip && clip.tracks.length >= 4, pose.id);
        for (const t of clip.tracks) {
            assert.ok(t.bone >= 0 && t.bone < built.bones.length, `${pose.id} bone`);
            assert.equal(t.values.length, clip.times.length * 4, `${pose.id} track length`);
            for (let i = 0; i < t.values.length; i += 4) assert.ok(Math.abs(Math.hypot(t.values[i], t.values[i + 1], t.values[i + 2], t.values[i + 3]) - 1) < 1e-5, `${pose.id} unit quaternion`);
        }
        assert.ok(Number.isFinite(clip.lift(0.3)), `${pose.id} lift`);
    }
    assert.equal(Poses.clip(built.bones, 'nonsense'), null);
});

test('the poses are motion capture fitted to each body: loops close, feet meet the floor, arms clear the trunk and the face', () => {
    const Poses = require(path.join(root, 'src', 'forge', 'Character3D', 'CharacterPoses.js'));
    const mul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
    const rot = (q, v) => { const c = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], u = [q[0], q[1], q[2]], t = c(u, v).map(x => 2 * x), t2 = c(u, t); return [v[0] + q[3] * t[0] + t2[0], v[1] + q[3] * t[1] + t2[1], v[2] + q[3] * t[2] + t2[2]]; };
    /** Every joint's place at frame f, the body lifted as the clip says. */
    const place = (bones, clip, f) => {
        const local = bones.map(() => [0, 0, 0, 1]), W = [], pos = [];
        for (const t of clip.tracks) local[t.bone] = Array.from(t.values.slice(f * 4, f * 4 + 4));
        bones.forEach((b, i) => {
            if (b.parent < 0) { W[i] = local[i]; pos[i] = [b.head[0], b.head[1] + clip.heights[f], b.head[2]]; return; }
            W[i] = mul(W[b.parent], local[i]);
            const o = rot(W[b.parent], b.head.map((v, k) => v - bones[b.parent].head[k]));
            pos[i] = pos[b.parent].map((v, k) => v + o[k]);
        });
        return { pos, W };
    };
    /** How far the lowest point under either foot (heel, ball, toe tip) is above where it stands at rest. */
    const soleClear = (bones, clip, f) => {
        const { pos, W } = place(bones, clip, f), at = n => bones.findIndex(b => b.name === n);
        const s = Math.max(...bones.map(b => b.head[1])) / 1.7;
        let low = Infinity;
        for (const S of ['Left', 'Right']) for (const [n, o] of [['Foot', [0, -0.065, -0.055]], ['ToeBase', [0, 0, 0]], ['ToeBase', [0, -0.012, 0.06]]]) {
            const i = at(S + n), d = rot(W[i], o.map(v => v * s));
            low = Math.min(low, pos[i][1] + d[1] - (bones[i].head[1] + o[1] * s));
        }
        return low;
    };
    { const built0 = Model.build(pack, { gender: 1 }, {}, { quality: 'preview' }); for (const pose of Poses.POSES) assert.ok(Poses.clip(built0.bones, pose.id), pose.id + ' captured'); }
    for (const recipe of [{ gender: 1 }, { gender: 0, age: 0.3 }, { gender: 1, extreme: true, weight: 4 }]) {
        const built = Model.build(pack, recipe, {}, { quality: 'preview' }), bones = built.bones, body = built.parts.find(p => p.name === 'Body');
        for (const pose of Poses.POSES) {
            const clip = Poses.clip(bones, pose.id, body), last = clip.times.length - 1;
            // A motion played once (a fall, a flip) ends where it ends.
            if (clip.once) continue;
            for (const t of clip.tracks) {
                const a = t.values.slice(0, 4), b = t.values.slice(last * 4, last * 4 + 4);
                assert.ok(Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) > 0.9999, `${pose.id} loops back to its first frame`);
            }
            assert.ok(Math.abs(clip.heights[0] - clip.heights[last]) < 1e-3, `${pose.id} height loops`);
        }
        // Walking and running: some sole on the floor except in a run's flight, never one under it.
        for (const id of ['walk', 'run', 'fight', 'crouch']) {
            const clip = Poses.clip(bones, id, body);
            let flying = 0;
            for (let f = 0; f < clip.times.length; f++) {
                const low = soleClear(bones, clip, f);
                assert.ok(low > -0.01, `${id} frame ${f}: a foot ${low.toFixed(3)} m under the floor`);
                if (low > 0.025) flying++;
            }
            if (id === 'run') assert.ok(flying > 0 && flying < clip.times.length / 2, `run has a short flight (${flying} frames)`);
            else assert.equal(flying, 0, `${id} keeps a foot down`);
        }
        // A boxer's guard keeps the fists off the face, whatever the body's proportions.
        const fight = Poses.clip(bones, 'fight', body), head = bones.findIndex(b => b.name === 'Head'), s = Math.max(...bones.map(b => b.head[1])) / 1.7;
        for (let f = 0; f < fight.times.length; f++) {
            const { pos, W } = place(bones, fight, f), c = rot(W[head], [0, -0.01 * s, 0.03 * s]), face = pos[head].map((v, k) => v + c[k]);
            for (const n of ['LeftHand', 'RightHand', 'LeftHandMiddle1', 'RightHandMiddle1']) assert.ok(Math.hypot(...pos[bones.findIndex(b => b.name === n)].map((v, k) => v - face[k])) > 0.19 * s, `fight frame ${f}: ${n} in the face`);
        }
        // The jump leaves the floor and comes back.
        const jump = Poses.clip(bones, 'jump', body);
        assert.ok(Math.max(...jump.heights) > 0.2 && Math.abs(jump.heights[0]) < 0.1, 'jump rises off the floor');
    }
    // A heavy body's hanging arm is held further from its trunk than a slim one's, as its skin says.
    const out = recipe => {
        const built = Model.build(pack, recipe, {}, { quality: 'preview' }), bones = built.bones, at = n => bones.findIndex(b => b.name === n);
        const clip = Poses.clip(bones, 'walk', built.parts.find(p => p.name === 'Body'));
        let least = Infinity;
        for (let f = 0; f < clip.times.length; f++) { const { pos } = place(bones, clip, f); least = Math.min(least, Math.abs(pos[at('LeftForeArm')][0] - pos[at('Spine1')][0])); }
        return least / Math.abs(bones[at('LeftArm')].head[0]);
    };
    assert.ok(out({ gender: 1, extreme: true, weight: 4 }) > out({ gender: 1 }) + 0.2, 'heavy arms swing out');
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

test('a heavy body stays inside its dress around the hips and upper thighs', () => {
    const built = Body.build(pack, Body.normalizeRecipe({ gender: 0, extreme: true, weight: 4 }));
    const out = Wardrobe.build(pack, built, [{ id: 'dress' }], { atlasSize: 64 }), an = Outfit.anatomy(pack);
    const hips = built.bones.find(b => b.name === 'Hips').head;
    for (const v of new Set(pack.body.source)) {
        const p = Array.from(built.shaped.slice(v * 3, v * 3 + 3));
        if (p[1] < hips[1] * 0.65 || p[1] > hips[1] * 1.05 || an.member[v * 5 + 1] > 0.4 || an.member[v * 5 + 2] > 0.4) continue;
        const dx = p[0] - hips[0], dz = p[2] - hips[2], r = Math.hypot(dx, dz);
        if (r < 0.04) continue;
        assert.ok(garmentHit(out.parts, p, [dx / r, 0, dz / r]), 'hip or upper thigh vertex ' + v + ' stays inside the dress');
    }
});

const Clothes = load('CharacterClothes');
const MODELED = Wardrobe.GARMENTS.filter(g => g.modeled);

test('every modeled garment builds on an average and an extreme body, outside the skin, hiding what it covers', () => {
    assert.ok(MODELED.length >= 10, 'modeled garments in the catalog');
    const clothes = Clothes.load(pack);
    for (const g of MODELED) assert.ok(clothes.garments.has(g.id), g.id + ' is in the clothes pack');
    const bodies = [{}, { extreme: true, weight: 4 }, { gender: 1, extreme: true, muscle: 2, weight: 0.3 }, { gender: 0, cup: 1, weight: 0.8 }];
    for (const body of bodies) {
        const built = Body.build(pack, Body.normalizeRecipe(body));
        const normals = Body.vertexNormals(pack, built.shaped);
        const ids = [...new Set(pack.body.source)];
        const isBody = new Uint8Array(pack.vertexCount);
        for (const v of ids) isBody[v] = 1;
        const grid = Outfit.pointGrid(built.shaped, new Set(ids), 0.04);
        const bare = Model.build(pack, Object.assign({}, body, { outfit: [] }), {}, { quality: 'preview' });
        for (const g of MODELED) {
            const label = `${g.id} on ${JSON.stringify(body)}`;
            const result = Model.build(pack, Object.assign({}, body, { outfit: [{ id: g.id }] }), {}, { quality: 'preview' });
            assertSound(result, label);
            const part = result.parts.find(p => p.name === g.label);
            assert.ok(part, label + ' is worn');
            assert.equal(part.kind, 'cloth', label + ' is cloth to the view');
            assert.ok(result.textures[part.texture] && result.textures[part.texture].data.length === result.textures[part.texture].width * result.textures[part.texture].height * 4, label + ' has its picture');
            // The drag's fast path: each vertex knows the skin vertex it rides on.
            assert.equal(part.source.length, part.positions.length / 3, label + ' source per vertex');
            for (const v of part.source) assert.ok(isBody[v], label + ' rides on the skin');
            // Outside the skin.
            const out = Wardrobe.build(pack, built, [{ id: g.id }], {});
            const P = built.shaped, Q = out.parts[0].positions;
            let inside = 0, total = 0;
            for (let i = 0; i < Q.length; i += 3) {
                const q = grid.nearest(Q[i], Q[i + 1], Q[i + 2], 2);
                if (q < 0) continue;
                const d = (Q[i] - P[q * 3]) * normals[q * 3] + (Q[i + 1] - P[q * 3 + 1]) * normals[q * 3 + 1] + (Q[i + 2] - P[q * 3 + 2]) * normals[q * 3 + 2];
                total++;
                if (d < -0.004) inside++;
            }
            assert.ok(inside / Math.max(1, total) < 0.01, `${label}: ${inside} of ${total} vertices under the skin`);
            // The skin it covers is left out.
            const authored = new Set(clothes.garments.get(g.id).hidden);
            assert.ok(out.hidden.size > 0, label + ' hides covered skin');
            for (const v of out.hidden) assert.ok(authored.has(v), label + ' only hides skin in its authored coverage');
            assert.ok(result.parts[0].index.length < bare.parts[0].index.length, label + ' leaves the covered skin out');
        }
    }
});

test('a modeled garment shows its own picture until a color is chosen; a color keeps the weave and folds', () => {
    const clothes = Clothes.load(pack);
    const g = clothes.garments.get('mh_tee_jeans');
    const own = Clothes.picture(clothes, g);
    const plain = Model.build(pack, { outfit: [{ id: 'mh_tee_jeans' }] }, {}, { quality: 'preview' });
    assert.ok(plain.textures['cloth-mh_tee_jeans.png'].data === own.data, 'own picture, untouched');
    const red = Model.build(pack, { outfit: [{ id: 'mh_tee_jeans', color: '#b02020', color2: '#6a6a6a' }] }, {}, { quality: 'preview' }).textures['cloth-mh_tee_jeans.png'];
    assert.ok(red.data !== own.data, 'recolor without changing the source picture');
    // Sample the texels the shirt and the trousers use.
    const part = plain.parts.find(p => p.name === 'T-shirt and jeans'), size = red.width;
    const stats = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
    for (let i = 0; i < part.uvs.length / 2; i++) {
        const o = (Math.min(size - 1, Math.floor(part.uvs[i * 2 + 1] * size)) * size + Math.min(size - 1, Math.floor(part.uvs[i * 2] * size))) * 4;
        const r = g.region[i], s = stats[r];
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

test('only skin a garment really covers is hidden: every preset and random outfit, on average and extreme bodies', () => {
    // An independent look: from each hidden skin vertex, straight out along its normal, some garment triangle within 10 cm.
    const uncoveredShare = (built, out) => {
        const P = built.shaped, N = Body.vertexNormals(pack, P), cell = 0.04, grid = new Map(), key = (x, y, z) => x + ',' + y + ',' + z, tris = [];
        for (const part of out.parts) for (let k = 0; k < part.index.length; k += 3) {
            const t = [0, 1, 2].map(q => { const i = part.index[k + q] * 3; return [part.positions[i], part.positions[i + 1], part.positions[i + 2]]; });
            const id = tris.push(t) - 1, lo = [0, 1, 2].map(a => Math.floor(Math.min(t[0][a], t[1][a], t[2][a]) / cell)), hi = [0, 1, 2].map(a => Math.floor(Math.max(t[0][a], t[1][a], t[2][a]) / cell));
            if ((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > 4096) continue;
            for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) { const kk = key(x, y, z); (grid.get(kk) || grid.set(kk, []).get(kk)).push(id); }
        }
        const hit = (o, d) => {
            for (let step = -0.006; step <= 0.1; step += 0.01) {
                for (const id of grid.get(key(...[0, 1, 2].map(a => Math.floor((o[a] + d[a] * step) / cell)))) || []) {
                    const [a, b, c] = tris[id], e1 = [0, 1, 2].map(q => b[q] - a[q]), e2 = [0, 1, 2].map(q => c[q] - a[q]);
                    const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
                    if (Math.abs(det) < 1e-12) continue;
                    const tv = [0, 1, 2].map(q => o[q] - a[q]), u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det;
                    if (u < 0 || u > 1) continue;
                    const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]], v = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) / det;
                    if (v < 0 || u + v > 1) continue;
                    const t = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det;
                    if (t > -0.004 && t < 0.1) return true;
                }
            }
            return false;
        };
        let n = 0, bare = 0, k = 0;
        for (const v of out.hidden) {
            if (k++ % 20) continue;
            n++;
            if (!hit([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]])) bare++;
        }
        return n ? bare / n : 0;
    };
    const outfits = Wardrobe.PRESETS.filter(p => p.items.length).map(p => [p.id, p.items]);
    for (let seed = 1; seed <= 24; seed++) outfits.push(['seed ' + seed, Model.random(seed).outfit]);
    for (const body of [{}, { gender: 0, extreme: true, weight: 3 }, { gender: 1, extreme: true, muscle: 2, height: 1.2 }]) {
        const built = Body.build(pack, Body.normalizeRecipe(body)), cache = {};
        for (const [name, items] of body.weight || body.muscle ? outfits.filter((_, i) => i % 5 === 0) : outfits) {
            const share = uncoveredShare(built, Wardrobe.build(pack, built, items, cache));
            // The two looks walk the ray's grid cells differently; at a fingertip or a hem's very edge a few vertices disagree.
            assert.ok(share < 0.01, `${name} on ${JSON.stringify(body)}: ${(share * 100).toFixed(2)}% of the hidden skin has no garment over it`);
        }
    }
});

test('footwear is built round the foot: a sole under it, the foot hidden inside, a boot over the trouser legs', () => {
    const FEET = Wardrobe.GARMENTS.filter(g => g.slot === 'feet' && !g.modeled && !g.transfer);
    for (const body of [{}, { gender: 1, extreme: true, weight: 3, muscle: 2 }, { gender: 0, extreme: true, weight: -0.5, height: -0.4 }]) {
        const built = Body.build(pack, Body.normalizeRecipe(body));
        const an = Outfit.anatomy(pack);
        // The forefoot (a low shoe's throat leaves the instep open).
        const foot = [...new Set(pack.body.source)].filter(v => an.member[v * 5 + 3] > 0.5 && an.s[v * 5 + 3] > 2.7);
        for (const g of FEET) {
            const label = g.id + ' on ' + JSON.stringify(body);
            const out = Wardrobe.build(pack, built, [{ id: 'jeans' }, { id: g.id }], {});
            const part = out.parts.find(p => p.name === g.label && /^shoes/.test(p.texture || ''));
            assert.ok(part, label + ' is a pair of shoes with its own picture');
            assert.ok(out.textures.some(t => t.name === part.texture && t.data.length === t.width * t.height * 4), label + ' picture');
            let low = Infinity;
            for (let i = 1; i < part.positions.length; i += 3) low = Math.min(low, part.positions[i]);
            // A sole of its own thickness under the foot: the character stands on it.
            assert.ok(low < -0.008, `${label}: sole ${low.toFixed(3)} under the foot`);
            if (g.id !== 'sandals') for (const v of foot) {
                // A toe cleft's normal can point inside the foot; its skin stays, below the shoe's upper.
                if (out.hidden.has(v)) continue;
                const p = Array.from(built.shaped.slice(v * 3, v * 3 + 3));
                assert.ok(garmentHit([part], p, [0, 1, 0], 0.3), label + ' encloses forefoot vertex ' + v);
            }
            else assert.ok(foot.filter(v => out.hidden.has(v)).length < foot.length / 2, label + ' shows the foot');
        }
        // A boot's shaft goes over the trouser leg: a ray out from the leg's axis through any trouser point
        // round the shin meets the boot further out.
        const out = Wardrobe.build(pack, built, [{ id: 'jeans', fit: 1 }, { id: 'boots', length: 0.6 }], {});
        const boot = out.parts.find(p => p.name === 'Boots'), cloth = out.parts.find(p => p.name.includes('Trousers'));
        const F = Outfit.footFrame(built, 0), B = boot.positions, I = boot.index;
        const axis = y => { const t = (y - F.ankle[1]) / (F.knee[1] - F.ankle[1]); return [F.ankle[0] + (F.knee[0] - F.ankle[0]) * t, y, F.ankle[2] + (F.knee[2] - F.ankle[2]) * t]; };
        const farthest = (o, dir) => {
            let far = 0;
            for (let t = 0; t < I.length; t += 3) {
                const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
                const e1 = [B[b] - B[a], B[b + 1] - B[a + 1], B[b + 2] - B[a + 2]], e2 = [B[c] - B[a], B[c + 1] - B[a + 1], B[c + 2] - B[a + 2]];
                const pv = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]];
                const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
                if (Math.abs(det) < 1e-12) continue;
                const tv = [o[0] - B[a], o[1] - B[a + 1], o[2] - B[a + 2]], u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det;
                if (u < 0 || u > 1) continue;
                const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]], v = (dir[0] * qv[0] + dir[1] * qv[1] + dir[2] * qv[2]) / det;
                if (v < 0 || u + v > 1) continue;
                far = Math.max(far, (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det);
            }
            return far;
        };
        let top = 0;
        for (let i = 1; i < B.length; i += 3) top = Math.max(top, B[i]);
        let inside = 0, past = 0;
        for (let i = 0; i < cloth.positions.length; i += 3) {
            const q = [cloth.positions[i], cloth.positions[i + 1], cloth.positions[i + 2]];
            if (q[0] < 0 || q[1] < 0.12 || q[1] > top - 0.02) continue;
            const o = axis(q[1]), d = Math.hypot(q[0] - o[0], q[2] - o[2]);
            const far = farthest(o, [(q[0] - o[0]) / d, 0, (q[2] - o[2]) / d]);
            if (d > far + 0.002) past++; else inside++;
        }
        assert.ok(inside > 20 && past === 0, `${past} trouser points out past the boot, ${inside} inside, on ${JSON.stringify(body)}`);
    }
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

test('boots go over trouser legs, shoes under trouser hems', () => {
    const built = Body.build(pack, Body.normalizeRecipe({}));
    const count = list => Wardrobe.build(pack, built, list, {}).parts.map(p => [p.name, p.index.length / 3]);
    const alone = Object.fromEntries(count([{ id: 'mh_jacket_jeans' }]).concat(count([{ id: 'mh_viking_boots' }]), count([{ id: 'mh_sneakers' }])));
    const booted = Object.fromEntries(count([{ id: 'mh_jacket_jeans' }, { id: 'mh_viking_boots' }]));
    assert.ok(booted['Jacket and jeans'] < alone['Jacket and jeans'], 'the trouser legs inside the boots are not drawn');
    assert.equal(booted['Viking boots'], alone['Viking boots'], 'the boots whole');
    const shod = Object.fromEntries(count([{ id: 'mh_jacket_jeans' }, { id: 'mh_sneakers' }]));
    assert.equal(shod['Jacket and jeans'], alone['Jacket and jeans'], 'the trousers whole');
    assert.ok(shod['Running shoes'] < alone['Running shoes'] && shod['Running shoes'] > alone['Running shoes'] * 0.7, 'the socks under the hems are not drawn, the shoes are');
});

test('modeled garments save into the GLB with their pictures', async () => {
    const result = Model.build(pack, { outfit: [{ id: 'mh_suit' }, { id: 'mh_loafers', color: '#3a2a1a' }] }, {}, { eyeSource });
    const glb = await Model.toGlb(result, 'Suit', tex => { const png = new PNG({ width: tex.width, height: tex.height }); png.data = Buffer.from(tex.data); return new Uint8Array(PNG.sync.write(png)); });
    const { json } = Optimizer.parseGlb(glb);
    for (const [name, image] of [['Suit and tie', 'cloth-mh_suit.png'], ['Loafers', 'cloth-mh_loafers.png']]) {
        const mesh = json.meshes.find(m => m.name === name);
        assert.ok(mesh, name + ' mesh saved');
        const material = json.materials[mesh.primitives[0].material];
        const tex = material.pbrMetallicRoughness.baseColorTexture;
        assert.ok(tex, name + ' has a picture');
        assert.equal(json.images[json.textures[tex.index].source].name, image);
        assert.ok(mesh.primitives[0].attributes.JOINTS_0 != null && mesh.primitives[0].attributes.TEXCOORD_0 != null, name + ' skinned and mapped');
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
        const cols = neck.positions.length / 3 / 13;
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
