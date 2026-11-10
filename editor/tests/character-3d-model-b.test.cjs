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

// Every outfit preset and every accessory on an average and two extreme bodies: dealt across
// character-3d-model-presets-*.test.cjs, which run side by side (helpers/character-preset-sweep.cjs).



test('the outfit and skin pictures are kept while the body changes, and repainted when the outfit does', () => {
    const cache = {};
    const a = Model.build(pack, { outfit: [{ id: 'tunic' }], weight: 0.2 }, cache, { quality: 'preview' });
    const b = Model.build(pack, { outfit: [{ id: 'tunic' }], weight: 0.9, muscle: 0.9 }, cache, { quality: 'preview' });
    assert.ok(a.textures['outfit.png'] === b.textures['outfit.png'], 'reuse the outfit picture');
    assert.ok(a.textures['skin.png'] === b.textures['skin.png'], 'reuse the skin picture');
    const c = Model.build(pack, { outfit: [{ id: 'tunic', color: '#123456' }] }, cache, { quality: 'preview' });
    assert.ok(c.textures['outfit.png'] !== a.textures['outfit.png'], 'repaint the changed outfit');
});



test('a four-legged creature saves with its quadruped rig beside it', async () => {
    const result = Model.build(pack, { plan: 'quadruped', kind: 'horse' }, {});
    assert.equal(result.plan, 'quadruped');
    assert.equal(result.sidecar.rig.template, 'quadruped');
    const glb = await Model.toGlb(result, 'Horse', () => new Uint8Array(0));
    const { json } = Optimizer.parseGlb(glb);
    assert.ok(json.skins[0].joints.map(j => json.nodes[j].name).includes('LeftFrontUpperLeg'));
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



test('the poses are motion capture fitted to each body: loops close, feet meet the floor, arms clear the trunk and the face', () => {
    const Poses = require(path.join(root, 'src', 'forge', 'Character3D', 'CharacterPoses.js'));
    const mul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
    const rot = (q, v) => { const c = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], u = [q[0], q[1], q[2]], t = c(u, v).map(x => 2 * x), t2 = c(u, t); return [v[0] + q[3] * t[0] + t2[0], v[1] + q[3] * t[1] + t2[1], v[2] + q[3] * t[2] + t2[2]]; };
    /** Every joint's place at frame f, the body lifted as the clip says. */
    const place = (bones, clip, f) => {
        const local = bones.map(() => [0, 0, 0, 1]), W = [], pos = [];
        for (const t of clip.tracks) if (!t.path) local[t.bone] = Array.from(t.values.slice(f * 4, f * 4 + 4));
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
                if (t.path) {
                    const end = (t.times || clip.times).length - 1;
                    for (let k = 0; k < 3; k++) assert.ok(Math.abs(t.values[k] - t.values[end * 3 + k]) < 1e-3, `${pose.id} ${bones[t.bone].name} moves back to its first frame`);
                    continue;
                }
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

