'use strict';
// Forge › 3D Character Builder, four-legged body plan (RRCreatureBody): presets build skinned, colored creatures on
// the floor with the Rig tool's quadruped bones, an Idle clip, and a model.json rig the runtime maps onto them.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const Creature = require(path.join(root, 'src', 'forge', 'Character3D', 'CreatureBody.js'));
const Glb = require(path.join(root, 'src', 'forge', 'Character3D', 'CharacterGlb.js'));
const Optimizer = require(path.join(root, 'src', 'utils', 'GlbOptimizer.js'));
const Rigger = require(path.join(root, 'src', 'database', 'ModelRigger.js'));
const Presets = require(path.join(root, 'src', 'database', 'RigMotionPresets.js'));

const bounds = parts => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of parts) for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], p.positions[i + k]); hi[k] = Math.max(hi[k], p.positions[i + k]);
    }
    return { lo, hi };
};

test('a recipe is completed and kept in its extreme range', () => {
    const r = Creature.normalizeRecipe({ size: 99, legLength: -4, ears: 'antennae', pattern: 'stripes', colors: { coat: 'red', light: '#ABCDEF' } });
    assert.equal(r.size, Creature.SLIDERS.find(s => s.key === 'size').max);
    assert.equal(r.legLength, Creature.SLIDERS.find(s => s.key === 'legLength').min);
    assert.equal(r.ears, Creature.DEFAULT_RECIPE.ears);
    assert.equal(r.pattern, 'stripes');
    assert.equal(r.colors.coat, Creature.DEFAULT_RECIPE.colors.coat);
    assert.equal(r.colors.light, '#abcdef');
    for (const s of Creature.SLIDERS) assert.ok(s.natural[0] >= s.min && s.natural[1] <= s.max, s.key);
});

test('every four-legged preset stands on the floor, faces +z and is the size it says', () => {
    for (const kind of Creature.KINDS.filter(k => !k.form)) {
        const built = Creature.build(Creature.kindRecipe(kind.kind), { quality: 'preview' });
        const { lo, hi } = bounds(built.parts.filter(p => p.name === 'Body'));
        assert.ok(Math.abs(lo[1]) < 1e-6, kind.kind + ' floor ' + lo[1]);
        const head = built.bones.find(b => b.name === 'Head'), hips = built.bones.find(b => b.name === 'Hips');
        assert.ok(head.tail[2] > hips.head[2], kind.kind + ' faces +z');
        // Left at +x, mirrored.
        const l = built.bones.find(b => b.name === 'LeftFrontUpperLeg'), r = built.bones.find(b => b.name === 'RightFrontUpperLeg');
        assert.ok(l.head[0] > 0 && Math.abs(l.head[0] + r.head[0]) < 1e-9, kind.kind + ' left at +x');
        assert.ok(hi[1] > 0.1 && hi[1] < 8, kind.kind + ' height ' + hi[1]);
        assert.ok(Math.abs(built.height - Math.max(...built.parts.map(p => bounds([p]).hi[1]))) < 1e-6);
    }
    const cat = Creature.build(Creature.kindRecipe('cat'), { quality: 'preview' }), horse = Creature.build(Creature.kindRecipe('horse'), { quality: 'preview' });
    const withers = b => b.bones.find(x => x.name === 'Chest').tail[1];
    assert.ok(withers(cat) > 0.15 && withers(cat) < 0.45, 'cat at the shoulder ' + withers(cat));
    assert.ok(withers(horse) > 1.2 && withers(horse) < 2.0, 'horse at the shoulder ' + withers(horse));
});

test('the bones are the Rig tool\'s quadruped bones, parents first, and the built-in motions find theirs', () => {
    const built = Creature.build(Creature.kindRecipe('dog'), { quality: 'preview' });
    built.bones.forEach((b, i) => assert.ok(b.parent < i, b.name + ' after its parent'));
    const names = new Set(built.bones.map(b => b.name));
    const template = Rigger.bonesFromMarkers(built.rig.markers, 'quadruped');
    for (const b of template) assert.ok(names.has(b.name), b.name);
    for (const key of Rigger.TEMPLATES.quadruped.markers.map(m => m.key)) assert.ok(Array.isArray(built.rig.markers[key]), key);
    // Hips, Spine, Chest and the legs stand where the Rig tool would lay them from these markers.
    for (const name of ['Hips', 'Spine', 'Chest', 'Neck', 'LeftFrontUpperLeg', 'RightRearLowerLeg', 'LeftRearFoot']) {
        const ours = built.bones.find(b => b.name === name).head, theirs = template.find(b => b.name === name).head;
        assert.ok(Math.hypot(ours[0] - theirs[0], ours[1] - theirs[1], ours[2] - theirs[2]) < 1e-6, name);
    }
    // Every bone a built-in quadruped motion turns is one of ours (a rule with no part moves the whole model).
    for (const preset of Presets.forTemplate('quadruped')) for (const rule of preset.rules) if (rule.part && rule.part !== 'Body') assert.ok(names.has(rule.part), preset.id + ' drives ' + rule.part);
});

test('skin: every vertex has weights that sum to one on real bones; legs follow their own bones', () => {
    const built = Creature.build(Creature.kindRecipe('wolf'), { quality: 'preview' });
    for (const part of built.parts) {
        for (let v = 0; v < part.positions.length / 3; v++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) { sum += part.weights[v * 4 + k]; assert.ok(part.joints[v * 4 + k] < built.bones.length); }
            assert.ok(Math.abs(sum - 1) < 1e-4, part.name + ' vertex ' + v + ' sums ' + sum);
        }
    }
    const body = built.parts.find(p => p.name === 'Body');
    const foot = built.bones.findIndex(b => b.name === 'LeftFrontFoot'), rightLeg = new Set(built.bones.map((b, i) => [b, i]).filter(([b]) => b.name.startsWith('Right')).map(([, i]) => i));
    // A vertex at the left front paw is the left front foot's, never a right leg's.
    let checked = 0;
    const fb = built.bones[foot];
    for (let v = 0; v < body.positions.length / 3; v++) {
        const p = [body.positions[v * 3], body.positions[v * 3 + 1], body.positions[v * 3 + 2]];
        if (Math.hypot(p[0] - fb.head[0], p[2] - fb.head[2]) > 0.06 || p[1] > fb.head[1] * 0.6) continue;
        checked++;
        let main = 0;
        for (let k = 1; k < 4; k++) if (body.weights[v * 4 + k] > body.weights[v * 4 + main]) main = k;
        assert.equal(body.joints[v * 4 + main], foot);
        for (let k = 0; k < 4; k++) if (body.weights[v * 4 + k] > 0.01) assert.ok(!rightLeg.has(body.joints[v * 4 + k]));
    }
    assert.ok(checked > 5, 'paw vertices checked ' + checked);
});

test('a seed gives the same creature; options change the shape', () => {
    assert.deepEqual(Creature.randomRecipe(77, 'fox'), Creature.randomRecipe(77, 'fox'));
    assert.notDeepEqual(Creature.randomRecipe(77, 'fox'), Creature.randomRecipe(78, 'fox'));
    assert.equal(Creature.randomRecipe(5).seed, 5);
    const count = r => Creature.build(r, { quality: 'preview' }).parts.reduce((s, p) => s + p.index.length, 0);
    const deer = Creature.kindRecipe('deer');
    assert.ok(count(deer) > count(Object.assign({}, deer, { horns: 'none' })), 'antlers add geometry');
    assert.ok(!Creature.build(Object.assign({}, deer, { horns: 'none' }), { quality: 'preview' }).parts.some(p => p.name === 'Horns'));
    const long = Creature.build(Object.assign(Creature.kindRecipe('dog'), { legLength: 1.6 }), { quality: 'preview' }).height;
    const short = Creature.build(Object.assign(Creature.kindRecipe('dog'), { legLength: 0.5 }), { quality: 'preview' }).height;
    assert.ok(long > short * 1.2, 'leg length ' + long + ' / ' + short);
});

test('the saved creature is a skinned GLB with vertex colors and an Idle clip, and its sidecar rigs it', () => {
    const built = Creature.build(Creature.kindRecipe('horse'));
    const glb = Glb.toGlb(built, { name: 'Horse', clips: built.clips });
    const { json } = Optimizer.parseGlb(glb);
    const names = json.skins[0].joints.map(j => json.nodes[j].name);
    for (const name of ['Hips', 'Chest', 'Head', 'Tail', 'LeftFrontUpperLeg', 'RightRearFoot']) assert.ok(names.includes(name), name);
    for (const mesh of json.meshes) assert.ok(mesh.primitives[0].attributes.COLOR_0 != null, mesh.name + ' colors');
    assert.equal(json.animations.length, 1);
    assert.equal(json.animations[0].name, 'Idle');
    assert.ok(json.animations[0].channels.some(c => json.nodes[c.target.node].name === 'Tail'));
    const tris = built.parts.reduce((s, p) => s + p.index.length / 3, 0);
    assert.ok(tris > 8000 && tris < 45000, 'triangles ' + tris);
    const side = Creature.sidecar(built);
    assert.equal(side.rig.template, 'quadruped');
    assert.equal(side.rig.weightsFile, undefined);
    side.rig.bones.forEach((b, i) => {
        assert.ok(b.parent < i);
        assert.ok(names.includes(b.name));
        const own = built.bones.find(x => x.name === b.name);
        assert.deepEqual(b.head, own.head);
    });
    assert.ok(side.rig.bones.find(b => b.name === 'LeftFrontUpperLeg').parent === side.rig.bones.findIndex(b => b.name === 'Chest'));
    assert.deepEqual(JSON.parse(JSON.stringify(side)), side);
});

test('a preview build is quick enough for a live slider', () => {
    // CPU time, not the clock: the suite runs many files at once, and waiting on them is not the build's cost.
    const start = process.cpuUsage();
    for (const kind of ['dog', 'horse', 'drake']) Creature.build(Creature.kindRecipe(kind), { quality: 'preview' });
    const used = process.cpuUsage(start), ms = (used.user + used.system) / 1000 / 3;
    assert.ok(ms < 400, 'preview ' + Math.round(ms) + ' ms');
});

test('while a slider is dragged the coat picture is half size and quicker; the whole picture on release and on save', () => {
    const Model = require(path.join(root, 'src', 'forge', 'Character3D', 'CharacterModel.js'));
    const coat = built => built.textures['creaturecoat.png'].width;
    for (const kind of ['dog', 'cat']) {
        const r = { plan: 'quadruped', ...Creature.kindRecipe(kind) };
        Model.build(null, r, {}, { quality: 'preview' });
        let start = Date.now();
        const full = Model.build(null, r, {}, { quality: 'preview' }), fullMs = Date.now() - start;
        start = Date.now();
        const draft = Model.build(null, r, {}, { quality: 'preview', draft: true }), draftMs = Date.now() - start;
        assert.equal(coat(draft) * 2, coat(full), kind + ' draft coat ' + coat(draft) + ' / ' + coat(full));
        assert.ok(draftMs < fullMs, kind + ' draft ' + draftMs + ' ms, full ' + fullMs + ' ms');
        assert.deepEqual(draft.bones.map(b => b.name), full.bones.map(b => b.name), 'the same skeleton');
    }
    assert.equal(coat(Creature.build(Creature.kindRecipe('dog'), { quality: 'save', draft: true })), 1536, 'a save is never a draft');
});

test('anatomical detail: off by default, a sex of its own, kept by Randomize', () => {
    const lion = Creature.kindRecipe('lion');
    assert.deepEqual(lion.anatomy, { ...Creature.DEFAULT_RECIPE.anatomy });
    assert.deepEqual(Creature.normalizeRecipe({ anatomy: { detail: 'yes', sex: 'other' } }).anatomy, { ...Creature.DEFAULT_RECIPE.anatomy });
    assert.deepEqual(Creature.normalizeRecipe({ anatomy: { ...Creature.DEFAULT_RECIPE.anatomy, detail: true, sex: 'female' } }).anatomy, { ...Creature.DEFAULT_RECIPE.anatomy, detail: true, sex: 'female' });
    const roll = Creature.randomRecipe(9, 'lion');
    assert.ok(!('anatomy' in roll) && !('gear' in roll), 'a random roll carries no anatomy or gear');
    const kept = Creature.normalizeRecipe(Object.assign({}, lion, { anatomy: { ...Creature.DEFAULT_RECIPE.anatomy, detail: true, sex: 'female' } }, roll));
    assert.deepEqual(kept.anatomy, { ...Creature.DEFAULT_RECIPE.anatomy, detail: true, sex: 'female' });
});

test('anatomical detail builds each sex as the species is made, and nothing when off', () => {
    const verts = r => Creature.build(r, { quality: 'preview', hairBudget: 0 }).parts.filter(p => p.name === 'Body' || p.name === 'Anatomy').reduce((sum, p) => sum + p.positions.length / 3, 0);
    for (const kind of ['lion', 'dog', 'horse', 'bull']) {
        const base = Creature.kindRecipe(kind);
        const off = verts(base), male = verts(Object.assign({}, base, { anatomy: { detail: true, sex: 'male' } })), female = verts(Object.assign({}, base, { anatomy: { ...Creature.DEFAULT_RECIPE.anatomy, detail: true, sex: 'female' } }));
        assert.notEqual(male, off, kind + ' male differs');
        assert.notEqual(female, off, kind + ' female differs');
        assert.notEqual(male, female, kind + ' sexes differ');
    }
    // A drake keeps its cloaca hidden: the male has no outer genitalia.
    const drake = Creature.kindRecipe('drake');
    const a = Creature.build(drake, { quality: 'preview' }).parts.find(p => p.name === 'Body').index.length;
    const b = Creature.build(Object.assign({}, drake, { anatomy: { detail: true, sex: 'male' } }), { quality: 'preview' }).parts.find(p => p.name === 'Body').index.length;
    assert.equal(a, b);
});

/** How many separate pieces of skin a part is made of (pieces of a few faces aside); vertices split for a picture's seams count as one. */
const pieces = part => {
    const n = part.positions.length / 3, parent = Int32Array.from({ length: n }, (_, i) => i);
    const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const seen = new Map();
    for (let i = 0; i < n; i++) {
        const key = part.positions[i * 3] + ',' + part.positions[i * 3 + 1] + ',' + part.positions[i * 3 + 2];
        if (seen.has(key)) parent[i] = seen.get(key); else seen.set(key, i);
    }
    for (let t = 0; t < part.index.length; t += 3) { const a = find(part.index[t]), b = find(part.index[t + 1]), c = find(part.index[t + 2]); parent[b] = a; parent[find(c)] = a; }
    const size = new Map();
    for (let i = 0; i < n; i++) { const r = find(i); size.set(r, (size.get(r) || 0) + 1); }
    return [...size.values()].filter(v => v > 60).length;
};

test('a male\'s sheath and scrotum are part of the body\'s skin, never a piece floating apart from it', () => {
    for (const kind of ['lion', 'cat', 'tiger', 'dog', 'horse', 'bull', 'ram', 'boar', 'rabbit', 'deer']) {
        const r = Creature.kindRecipe(kind);
        const count = anatomy => pieces(Creature.build(Object.assign({}, r, { anatomy }), { quality: 'preview', hairBudget: 0 }).parts.find(p => p.name === 'Body'));
        assert.equal(count({ detail: true, sex: 'male' }), count({ ...Creature.DEFAULT_RECIPE.anatomy }), kind);
    }
});

test('the body holds together at the sliders\' ends: hips high or low, the thinnest legs', () => {
    const count = r => pieces(Creature.build(r, { quality: 'preview', hairBudget: 0 }).parts.find(p => p.name === 'Body'));
    for (const [kind, over] of [['dog', { hipHeight: 0.5 }], ['dog', { hipHeight: 1.6 }], ['horse', { hipHeight: 1.6 }], ['horse', { legThickness: 0.3 }], ['bull', { legThickness: 0.3 }], ['bull', { girth: 2.6 }], ['deer', { headSize: 2.6 }], ['drake', { bodyLength: 2.5 }]]) {
        const base = Creature.kindRecipe(kind);
        assert.equal(count(Object.assign({}, base, over)), count(base), kind + ' ' + JSON.stringify(over));
    }
});

test('selected creatures use sharper coat pictures including plain short-haired coats', () => {
    for (const quality of ['save', 'preview']) {
        const tiger = Creature.build(Creature.kindRecipe('tiger'), { quality, hairBudget: 0 });
        const body = tiger.parts.find(p => p.name === 'Body');
        assert.equal(body.texture, 'creaturecoat.png');
        assert.ok(body.keepColors && body.uvs.length === body.positions.length / 3 * 2);
        const pic = tiger.textures['creaturecoat.png'];
        assert.equal(pic.data.length, pic.width * pic.height * 4);
        for (let i = 0; i < body.uvs.length; i++) assert.ok(body.uvs[i] >= 0 && body.uvs[i] <= 1);
        // The stripes: dark and light texels both.
        let dark = 0, light = 0;
        for (let i = 0; i < pic.data.length; i += 4) { const l = pic.data[i] + pic.data[i + 1]; if (l < 120) dark++; else if (l > 300) light++; }
        assert.ok(dark > 1000 && light > 1000, quality + ' ' + dark + ' / ' + light);
    }
    const horse = Creature.build(Creature.kindRecipe('horse'), { quality: 'preview', hairBudget: 0 });
    assert.equal(horse.parts.find(p => p.name === 'Body').texture, 'creaturecoat.png');
    assert.equal(horse.textures['creaturecoat.png'].width, 768);
});

test('a furred coat grows fine strand cards that follow the hair budget; a furred coat is painted into the coat picture', () => {
    const bear = Creature.kindRecipe('bear');
    const coat = b => b.parts.find(p => p.name === 'Coat fur');
    const full = Creature.build(bear, { quality: 'preview' }), weak = Creature.build(bear, { quality: 'preview', hairBudget: 0.45 }), none = Creature.build(bear, { quality: 'preview', hairBudget: 0 });
    assert.ok(coat(full) && coat(full).texture === 'creaturefur.png' && coat(full).onSkin);
    assert.ok(coat(weak).index.length < coat(full).index.length * 0.6);
    assert.ok(!coat(none));
    const f = coat(full);
    for (let v = 0; v < f.positions.length / 3; v++) assert.ok(Math.abs(f.weights[v * 4] + f.weights[v * 4 + 1] + f.weights[v * 4 + 2] + f.weights[v * 4 + 3] - 1) < 1e-4);
    assert.equal(full.parts.find(p => p.name === 'Body').texture, 'creaturecoat.png');
    // A short-coated horse grows none.
    assert.ok(!coat(Creature.build(Creature.kindRecipe('horse'), { quality: 'preview' })));
});

test('bird heads: a hooked or straight beak, eyes on the sides, a crest by choice; not listed among the creatures', () => {
    assert.ok(!Creature.KINDS.some(k => k.kind === 'bird' || k.kind === 'crow'));
    assert.deepEqual(Creature.HEAD_KINDS.map(k => k.kind), ['bird', 'crow']);
    assert.equal(Creature.kindRecipe('bird').beak, 'hooked');
    assert.equal(Creature.kindRecipe('crow').beak, 'straight');
    assert.equal(Creature.normalizeRecipe({ beak: 'spoon' }).beak, 'hooked');
    const horns = r => Creature.build(r, { quality: 'preview', hairBudget: 0 }).parts.find(p => p.name === 'Horns').index.length;
    const bird = Creature.kindRecipe('bird');
    assert.ok(horns(bird) > 0, 'the beak');
    const plain = Creature.build(bird, { quality: 'preview', hairBudget: 0 }), crested = Creature.build(Object.assign({}, bird, { mane: 'ruff', maneSize: 1 }), { quality: 'preview', hairBudget: 0 });
    const bodyTris = b => b.parts.find(p => p.name === 'Body').index.length;
    assert.ok(bodyTris(crested) > bodyTris(plain), 'the crest');
    const eyes = plain.parts.find(p => p.name === 'Eyes'), head = plain.bones.find(b => b.name === 'Head');
    let x = 0; for (let i = 0; i < eyes.positions.length; i += 3) x = Math.max(x, Math.abs(eyes.positions[i] - head.head[0]));
    assert.ok(x > 0.02, 'eyes on the sides ' + x);
});

test('a female wears no lion\'s mane and no antlers; the recipe keeps what was chosen', () => {
    const lion = Creature.kindRecipe('lion');
    const fur = b => (b.parts.find(p => p.name === 'Fur') || { index: [] }).index.length;
    const male = Creature.build(lion, { quality: 'preview' }), lioness = Creature.build(Object.assign({}, lion, { anatomy: { detail: false, sex: 'female' } }), { quality: 'preview' });
    assert.ok(fur(lioness) < fur(male) * 0.2, 'mane cards ' + fur(lioness) + ' / ' + fur(male));
    assert.equal(lioness.recipe.mane, 'lion');
    const deer = Creature.kindRecipe('deer');
    assert.ok(Creature.build(deer, { quality: 'preview', hairBudget: 0 }).parts.some(p => p.name === 'Horns'));
    assert.ok(!Creature.build(Object.assign({}, deer, { anatomy: { ...Creature.DEFAULT_RECIPE.anatomy, detail: true, sex: 'female' } }), { quality: 'preview', hairBudget: 0 }).parts.some(p => p.name === 'Horns'));
    // A horse's crest and a wolf's ruff are both sexes'.
    const horse = Creature.kindRecipe('horse');
    const body = r => Creature.build(r, { quality: 'preview', hairBudget: 0 }).parts.find(p => p.name === 'Body').index.length;
    assert.equal(body(Object.assign({}, horse, { anatomy: { detail: false, sex: 'female' } })), body(horse));
});

test('a lion has a mane of strand cards and a tufted tail; the cards follow the hair budget', () => {
    const lion = Creature.kindRecipe('lion');
    const full = Creature.build(lion, { quality: 'preview' }), weak = Creature.build(lion, { quality: 'preview', hairBudget: 0.45 }), none = Creature.build(lion, { quality: 'preview', hairBudget: 0 });
    const fur = b => b.parts.find(p => p.name === 'Fur');
    assert.ok(fur(full) && fur(full).texture === 'creaturefur.png' && full.textures['creaturefur.png'].data.length === 128 * 256 * 4);
    assert.ok(fur(weak).index.length < fur(full).index.length * 0.6, 'a weak budget grows fewer');
    assert.ok(!fur(none));
    for (const b of [full]) {
        const f = fur(b);
        assert.equal(f.uvs.length / 2, f.positions.length / 3);
        for (let v = 0; v < f.positions.length / 3; v++) assert.ok(Math.abs(f.weights[v * 4] + f.weights[v * 4 + 1] + f.weights[v * 4 + 2] + f.weights[v * 4 + 3] - 1) < 1e-4);
    }
    // A lioness without her mane has no mane cards, only the tail's tuft.
    const lioness = Creature.build(Object.assign({}, lion, { mane: 'none' }), { quality: 'preview' });
    assert.ok(fur(lioness).index.length < fur(full).index.length * 0.2);
    // A lion stands at a lion's height: about 1.1 to 1.25 m at the withers.
    const withers = Math.max(...full.parts.find(p => p.name === 'Body').positions.filter((_, i) => i % 3 === 1));
    assert.ok(full.bones.find(b => b.name === 'Chest').tail[1] > 0.7 && withers > 1.0 && withers < 1.5, 'lion height ' + withers);
});

test('the saved body is meshed finer than the preview and reduced to a sane count', () => {
    const lion = Creature.kindRecipe('lion');
    const body = q => Creature.build(lion, { quality: q, hairBudget: 0 }).parts.find(p => p.name === 'Body').index.length / 3;
    const save = body('save'), preview = body('preview');
    assert.ok(save > 20000 && save < 36000, 'save ' + save);
    assert.ok(preview > 15000 && preview < 60000, 'preview ' + preview);
});

test('poses: every pose builds on the creature\'s own bones, in the poses\' clip format, on the floor', () => {
    assert.deepEqual(Creature.posesFor(Creature.kindRecipe('dog')).map(p => p.id), ['walk', 'trot', 'gallop', 'stalk', 'pounce', 'sit', 'lieDown', 'lieSide', 'rear', 'playBow']);
    for (const kind of ['lion', 'horse', 'dog', 'bear']) {
        const r = Creature.kindRecipe(kind), built = Creature.build(r, { quality: 'preview', hairBudget: 0 });
        for (const { id } of Creature.posesFor(r)) {
            const clip = Creature.poseClip(built.bones, id, r);
            if (id === 'rear' && (kind === 'lion' || kind === 'dog')) { assert.equal(clip, null, kind + ' does not rear'); continue; }
            if (id === 'playBow' && kind === 'horse') { assert.equal(clip, null); continue; }
            assert.ok(clip, kind + ' ' + id);
            assert.equal(clip.heights.length, clip.times.length);
            for (const t of clip.tracks) {
                assert.ok(t.bone >= 0 && t.bone < built.bones.length);
                assert.equal(t.values.length, clip.times.length * 4);
                for (let i = 0; i < t.values.length; i += 4) assert.ok(Math.abs(Math.hypot(t.values[i], t.values[i + 1], t.values[i + 2], t.values[i + 3]) - 1) < 1e-4);
            }
            for (const x of [0, 0.3, 1.7]) assert.ok(Number.isFinite(clip.lift(x)));
            assert.equal(typeof clip.skin, 'boolean');
        }
    }
});

test('gaits keep real footfall: a walk sets down left hind, left fore, right hind, right fore; a trot moves diagonal pairs', () => {
    const r = Creature.kindRecipe('dog'), built = Creature.build(r, { quality: 'preview', hairBudget: 0 });
    // The middle of each leg's swing: the paw folded furthest (front) or the stifle bent most (hind).
    const peak = (clip, name) => {
        const bone = /Front/.test(name) ? name.replace('UpperLeg', 'Foot') : name.replace('UpperLeg', 'LowerLeg');
        const tr = clip.tracks.find(t => built.bones[t.bone].name === bone);
        let best = 0, bestX = -Infinity;
        for (let i = 0; i + 1 < clip.times.length; i++) { const x = Math.abs(tr.values[i * 4]); if (x > bestX) { bestX = x; best = i; } }
        return best / (clip.times.length - 1);
    };
    const walk = Creature.poseClip(built.bones, 'walk', r);
    const order = ['LeftRearUpperLeg', 'LeftFrontUpperLeg', 'RightRearUpperLeg', 'RightFrontUpperLeg'].map(n => peak(walk, n));
    const gaps = order.map((p, i) => ((order[(i + 1) % 4] - p) % 1 + 1) % 1);
    for (const g of gaps) assert.ok(Math.abs(g - 0.25) < 0.06, 'walk beats ' + gaps.join(','));
    const trot = Creature.poseClip(built.bones, 'trot', r);
    assert.ok(Math.abs(peak(trot, 'LeftFrontUpperLeg') - peak(trot, 'RightRearUpperLeg')) < 0.04);
    assert.ok(Math.abs(Math.abs(peak(trot, 'LeftFrontUpperLeg') - peak(trot, 'RightFrontUpperLeg')) - 0.5) < 0.06);
});

test('head-only source keeps eyes and head features without carrying the quadruped torso', () => {
    for (const kind of ['bull', 'rabbit', 'bird', 'crow']) {
        const recipe = Creature.kindRecipe(kind), full = Creature.build(recipe, { quality: 'preview', hairBudget: 0 });
        const head = Creature.build(recipe, { quality: 'preview', hairBudget: 0, headOnly: true });
        const a = full.parts.find(p => p.name === 'Body'), b = head.parts.find(p => p.name === 'Body');
        assert.ok(b.index.length < a.index.length, kind + ' omits torso');
        assert.ok(head.height < full.height * 0.8, kind + ' has no low torso');
        const local = (built, part) => { const origin = built.bones.find(b => b.name === 'Head').head; return Array.from(part.positions, (x, i) => x - origin[i % 3]); };
        const equalLocal = (a, b, label) => { assert.equal(a.length, b.length, label); a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-6, label)); };
        equalLocal(local(head, head.parts.find(p => p.name === 'Eyes')), local(full, full.parts.find(p => p.name === 'Eyes')), kind + ' eyes unchanged');
        const features = full.parts.find(p => p.name === 'Horns');
        if (features) {
            const retained = local(head, head.parts.find(p => p.name === 'Horns')), original = local(full, features);
            assert.ok(retained.length > 0, kind + ' retains beak/horns');
            for (let i = 0; i < retained.length; i += 3) {
                let found = false;
                for (let j = 0; j < original.length && !found; j += 3) found = Math.hypot(retained[i] - original[j], retained[i + 1] - original[j + 1], retained[i + 2] - original[j + 2]) < 1e-6;
                assert.ok(found, kind + ' original head feature shape');
            }
        }
        const again = Creature.build(recipe, { quality: 'preview', hairBudget: 0 });
        assert.deepEqual(again.parts.find(p => p.name === 'Body').positions, a.positions, kind + ' regular creature unaffected');
    }
});
