'use strict';
// Forge › 3D Character Builder, Slimefolk (RRSlimeBody): both ends of the Shape slider build sound, skinned goo on the
// floor; every clip is whole (loops close, one-shots return to rest, the melt ends flat); switching to and from the
// species leaves nothing of the other behind; the GLB carries a blended goo material, opaque eyes and every clip; the
// triangle and picture budgets hold.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'src', 'forge', 'Character3D');
const load = name => require(path.join(dir, name + '.js'));
const Body = load('HumanBody');
for (const name of ['HumanTargets', 'CharacterOutfit', 'CharacterAtlas', 'CharacterWardrobe', 'CharacterProps', 'CharacterSpecies', 'CharacterSkin', 'CharacterHair', 'CreatureBody', 'CharacterGlb', 'CharacterShading', 'CharacterDetail']) load(name);
const Slime = load('SlimeBody');
const Model = load('CharacterModel');
const Species = load('CharacterSpecies');
const Optimizer = require(path.join(root, 'src', 'utils', 'GlbOptimizer.js'));
const { PNG } = require('pngjs');

let pack;
test.before(async () => { pack = await Body.loadPack(); });

const BLOB = { form: 0 }, PERSON = { form: 1, feelers: 'antennae', props: [{ id: 'tophat' }] };
const encode = tex => { const png = new PNG({ width: tex.width, height: tex.height }); png.data = Buffer.from(tex.data); return new Uint8Array(PNG.sync.write(png)); };
const bounds = parts => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of parts) for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p.positions[i + k]); hi[k] = Math.max(hi[k], p.positions[i + k]); }
    return { lo, hi };
};
const triangles = result => result.parts.reduce((s, p) => s + p.index.length / 3, 0);

function assertSound(result, label) {
    assert.ok(result.parts.length >= 2, label + ' has parts');
    for (const p of result.parts) {
        const n = p.positions.length / 3;
        assert.ok(n > 0 && p.index.length > 0, `${label}: ${p.name} has geometry`);
        for (let i = 0; i < p.positions.length; i++) assert.ok(Number.isFinite(p.positions[i]), `${label}: ${p.name} position`);
        for (let i = 0; i < p.normals.length; i++) assert.ok(Number.isFinite(p.normals[i]), `${label}: ${p.name} normal`);
        for (let i = 0; i < p.index.length; i++) assert.ok(p.index[i] < n, `${label}: ${p.name} index`);
        assert.equal(p.joints.length, n * 4, `${label}: ${p.name} joints`);
        for (let v = 0; v < n; v++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) { assert.ok(p.joints[v * 4 + k] < result.bones.length, `${label}: ${p.name} joint`); sum += p.weights[v * 4 + k]; }
            assert.ok(Math.abs(sum - 1) < 1e-3, `${label}: ${p.name} weights at ${v} sum to ${sum}`);
        }
        if (p.uvs) for (let i = 0; i < p.uvs.length; i++) assert.ok(p.uvs[i] >= 0 && p.uvs[i] <= 1, `${label}: ${p.name} uv in the picture`);
        if (p.colors) for (let i = 0; i < p.colors.length; i++) assert.ok(p.colors[i] >= 0 && p.colors[i] <= 1.0001, `${label}: ${p.name} color`);
    }
    result.bones.forEach((b, i) => assert.ok(b.parent < i, b.name + ' after its parent'));
}

test('a recipe is completed and kept in range; only hats are worn', () => {
    const r = Slime.normalizeRecipe({ form: 4, size: -2, color: 'green', core: '#ABCDEF', translucency: 2, feelers: 'wings', eyes: { size: 9 }, props: [{ id: 'tophat' }, { id: 'glasses' }, { id: 'cape' }] });
    assert.equal(r.plan, 'slime');
    assert.equal(r.species, 'slimefolk');
    assert.equal(r.form, 1);
    assert.equal(r.size, 0.4);
    assert.equal(r.color, Slime.DEFAULT_RECIPE.color);
    assert.equal(r.core, '#abcdef');
    assert.equal(r.translucency, 1);
    assert.equal(r.feelers, 'none');
    assert.equal(r.eyes.size, 1.8);
    assert.deepEqual(r.props.map(p => p.id), ['tophat']);
    assert.ok(Species.BY_ID.get('slimefolk'), 'Slimefolk is in the species list');
});

test('the blob and the goo person build on the floor, facing +z, the left at +x', () => {
    for (const [label, recipe, lo, hi] of [['blob', BLOB, 0.55, 0.95], ['person', PERSON, 1.4, 2.0], ['between', { form: 0.5, feelers: 'tendrils' }, 0.9, 1.5]]) {
        const result = Model.build(pack, Object.assign({ plan: 'slime' }, recipe), {}, { quality: 'preview' });
        assert.equal(result.plan, 'slime');
        assertSound(result, label);
        const goo = result.parts.find(p => p.name === 'Goo');
        assert.ok(Math.abs(bounds([goo]).lo[1]) < 1e-4, label + ' stands on the floor');
        assert.ok(result.height > lo && result.height < hi, label + ' height ' + result.height);
        const L = result.bones.find(b => b.name === 'LeftEye'), R = result.bones.find(b => b.name === 'RightEye');
        assert.ok(L.head[0] > 0 && Math.abs(L.head[0] + R.head[0]) < 1e-6, label + ' left eye at +x, mirrored');
        assert.ok(L.head[2] > 0.03, label + ' eyes at the front');
        // The eyes stay at the goo's surface: their front pokes out, their back sits in it.
        const eyes = result.parts.find(p => p.name === 'Eyes');
        let front = -Infinity, cover = -Infinity;
        for (let i = 0; i < eyes.positions.length; i += 3) if (eyes.positions[i] > 0) front = Math.max(front, eyes.positions[i + 2]);
        const r = (bounds([eyes]).hi[1] - bounds([eyes]).lo[1]) / 2;
        for (let i = 0; i < goo.positions.length; i += 3) if (Math.hypot(goo.positions[i] - L.head[0], goo.positions[i + 1] - L.head[1]) < r * 0.3) cover = Math.max(cover, goo.positions[i + 2]);
        assert.ok(front > cover && front - cover < r, label + ' each eye bulges a little out of the goo ' + front + ' / ' + cover);
        const head = result.bones.find(b => b.name === 'Head');
        assert.ok(head.head[1] > 0.1 && head.head[1] < result.height, label + ' head joint inside');
    }
    // The person really is one: arms out at the sides, a head well above the hips.
    const person = Model.build(pack, Object.assign({ plan: 'slime' }, PERSON), {}, { quality: 'preview' });
    const hand = person.bones.find(b => b.name === 'LeftHand'), hips = person.bones.find(b => b.name === 'Body'), head = person.bones.find(b => b.name === 'Head');
    assert.ok(hand.head[0] > 0.2, 'hand out at the side');
    assert.ok(head.head[1] - hips.head[1] > 0.35, 'a torso between hips and head');
    assert.ok(person.parts.some(p => p.name === 'Top hat'), 'the hat is worn');
});

test('a hat sits on top of the goo and sinks a little into it', () => {
    for (const form of [0, 1]) {
        const result = Model.build(pack, { plan: 'slime', form, props: [{ id: 'tophat' }] }, {}, { quality: 'preview' });
        const goo = bounds([result.parts.find(p => p.name === 'Goo')]), hat = bounds([result.parts.find(p => p.name === 'Top hat')]);
        assert.ok(hat.lo[1] < goo.hi[1], form + ': the hat sinks into the top ' + hat.lo[1] + ' < ' + goo.hi[1]);
        assert.ok(hat.lo[1] > goo.hi[1] - 0.2 * Math.max(0.7, goo.hi[1]), form + ': and sits on top, not over the face');
        assert.ok(Math.abs((hat.lo[0] + hat.hi[0]) / 2) < 0.02, form + ': centered');
        const headBone = result.bones.findIndex(b => b.name === 'Head'), part = result.parts.find(p => p.name === 'Top hat');
        for (let v = 0; v < part.positions.length / 3; v++) assert.equal(part.joints[v * 4], headBone, 'the hat rides on the head');
    }
});

test('every clip is whole: loops close, one-shots return to rest, the melt ends flat, no NaNs', () => {
    for (const recipe of [BLOB, PERSON, { form: 0.5, feelers: 'tendrils', size: 1.6 }]) {
        const result = Model.build(pack, Object.assign({ plan: 'slime' }, recipe), {}, { quality: 'preview' });
        const names = result.clips.map(c => c.name);
        assert.deepEqual(names, ['Idle', 'Walk', 'Attack', 'Hit', 'Death', 'Talk']);
        const sig = c => c.tracks.map(t => t.bone + (t.path || 'rotation')).join(',');
        for (const clip of result.clips) {
            assert.equal(sig(clip), sig(result.clips[0]), clip.name + ' sets the same channels as Idle, so clips hand over cleanly');
            const n = clip.times.length;
            assert.ok(n >= 2 && clip.times[0] === 0, clip.name + ' starts at 0');
            for (let i = 1; i < n; i++) assert.ok(clip.times[i] > clip.times[i - 1], clip.name + ' times rise');
            for (const t of clip.tracks) {
                const size = t.path ? 3 : 4;
                assert.equal(t.values.length, n * size, clip.name + ' track length');
                for (let i = 0; i < t.values.length; i++) assert.ok(Number.isFinite(t.values[i]), clip.name + ' finite');
                if (!t.path) for (let i = 0; i < n; i++) assert.ok(Math.abs(Math.hypot(...t.values.slice(i * 4, i * 4 + 4)) - 1) < 1e-4, clip.name + ' unit rotations');
                const first = Array.from(t.values.slice(0, size)), last = Array.from(t.values.slice((n - 1) * size));
                const bone = result.bones[t.bone], rest = bone.parent >= 0 ? bone.head.map((x, k) => x - result.bones[bone.parent].head[k]) : bone.head;
                const at = (vals, want) => vals.every((x, k) => Math.abs(x - want[k]) < 2e-3);
                const restValue = t.path === 'translation' ? rest : t.path === 'scale' ? [1, 1, 1] : [0, 0, 0, 1];
                if (clip.loop) assert.ok(at(last, first), `${clip.name} ${bone.name} ${t.path || 'rotation'} loops: ${first} vs ${last}`);
                if (clip.name === 'Attack' || clip.name === 'Hit') {
                    assert.ok(at(first, restValue), `${clip.name} ${bone.name} ${t.path || 'rotation'} starts at rest`);
                    assert.ok(at(last, restValue), `${clip.name} ${bone.name} ${t.path || 'rotation'} ends at rest: ${last}`);
                }
            }
        }
        assert.ok(result.clips.filter(c => c.loop).map(c => c.name).join() === 'Idle,Walk,Talk', 'Idle, Walk and Talk loop');
        // The melt: the base squashed flat and spread wide at the end.
        const death = result.clips.find(c => c.name === 'Death'), base = result.bones.findIndex(b => b.name === 'Base');
        const scale = death.tracks.find(t => t.bone === base && t.path === 'scale'), n = death.times.length;
        assert.ok(scale.values[(n - 1) * 3 + 1] < 0.2 && scale.values[(n - 1) * 3] > 1.5, 'Death ends as a puddle');
        // The hop leaves the floor; the goo squashes and stretches as it goes.
        const walk = result.clips.find(c => c.name === 'Walk');
        const lift = walk.tracks.find(t => t.bone === base && t.path === 'translation'), squash = walk.tracks.find(t => t.bone === base && t.path === 'scale');
        let up = 0, lo = Infinity, hi = 0;
        for (let i = 0; i < walk.times.length; i++) { up = Math.max(up, lift.values[i * 3 + 1]); lo = Math.min(lo, squash.values[i * 3 + 1]); hi = Math.max(hi, squash.values[i * 3 + 1]); }
        if (recipe.form === 0) { assert.ok(up > 0.08, 'a blob hops ' + up); assert.ok(lo < 0.85 && hi > 1.1, 'and squashes and stretches ' + lo + '..' + hi); }
        else assert.ok(up < 0.05 * (recipe.size || 1), 'a goo person oozes along the floor ' + up);
    }
});

test('switching to and from Slimefolk leaves nothing of the other behind', () => {
    const person = Model.withSpecies({ gender: 1, seed: 9, outfit: [{ id: 'tshirt' }], props: [{ id: 'glasses' }, { id: 'tophat' }] }, 'elf');
    const goo = Model.withSpecies(person, 'slimefolk');
    assert.equal(goo.plan, 'slime');
    assert.equal(goo.seed, 9, 'the seed is kept');
    for (const key of ['hair', 'outfit', 'features', 'skin', 'skinPattern', 'gender', 'shapes', 'bodyHair']) assert.ok(!(key in goo), 'no ' + key + ' on the goo');
    assert.deepEqual(goo.props, [], 'nothing worn comes along');
    const built = Model.build(pack, goo, {}, { quality: 'preview' });
    assert.deepEqual(built.parts.map(p => p.kind).sort(), ['bubble', 'eye', 'goo'], 'the goo has goo, eyes and bubbles only');
    assert.deepEqual(Object.keys(built.textures), ['goo.png', 'goo-glow.png']);
    for (const id of ['human', 'elf', 'lizardfolk']) {
        const back = Model.withSpecies(goo, id);
        assert.equal(back.plan, 'human', id);
        assert.equal(back.species, id);
        for (const key of ['form', 'translucency', 'glow', 'bubbles', 'core']) assert.ok(!(key in back), id + ': no ' + key + ' left');
        assert.notEqual(back.hair.style, undefined);
        const result = Model.build(pack, back, {}, { quality: 'preview' });
        assert.ok(!result.parts.some(p => p.kind === 'goo' || p.kind === 'bubble' || p.blend), id + ': no goo on the person');
        assert.ok(!('goo.png' in result.textures) && !('goo-glow.png' in result.textures), id + ': no goo picture');
        assert.ok(result.parts.some(p => p.name === 'Body'), id + ': a body again');
    }
    // A creature and back.
    const dog = Model.normalize({ plan: 'quadruped', kind: 'dog' });
    assert.equal(Model.withSpecies(dog, 'slimefolk').plan, 'slime');
    // A stale recipe naming Slimefolk on a human plan is a human.
    assert.equal(Model.normalize({ plan: 'human', species: 'slimefolk' }).species, 'human');
    // Random goo is goo.
    assert.equal(Model.random(4, { species: 'slimefolk' }).plan, 'slime');
});

test('a color, the translucency or the glow make no new mesh', () => {
    const a = Model.build(pack, { plan: 'slime', form: 0.3 }, {}, { quality: 'preview' });
    const t0 = Date.now();
    const b = Model.build(pack, { plan: 'slime', form: 0.3, color: '#e8a030', core: '#fff2a0', translucency: 0.9, glow: 1 }, {}, { quality: 'preview' });
    assert.ok(Date.now() - t0 < 200, 'a recolor is quick');
    const ga = a.parts.find(p => p.name === 'Goo'), gb = b.parts.find(p => p.name === 'Goo');
    assert.deepEqual(Array.from(gb.positions.slice(0, 300)), Array.from(ga.positions.slice(0, 300)));
    assert.notDeepEqual(Array.from(b.textures['goo.png'].data.slice(0, 64)), Array.from(a.textures['goo.png'].data.slice(0, 64)));
    // More translucent goo lets more through.
    const alpha = r => { const d = r.textures['goo.png'].data; let s = 0; for (let i = 3; i < d.length; i += 4) s += d[i]; return s; };
    assert.ok(alpha(b) < alpha(a));
});

test('the saved GLB: blended goo with its picture, opaque eyes, every clip with scale and position keys', async () => {
    const result = Model.build(pack, Object.assign({ plan: 'slime' }, PERSON), {}, { quality: 'save' });
    const glb = await Model.toGlb(result, 'Goo', encode);
    const { json } = Optimizer.parseGlb(glb);
    const mat = name => json.materials.find(m => m.name === name);
    assert.equal(mat('Goo').alphaMode, 'BLEND');
    assert.ok(mat('Goo').pbrMetallicRoughness.baseColorTexture, 'the goo draws its ramp');
    assert.ok(mat('Goo').pbrMetallicRoughness.roughnessFactor < 0.2, 'glossy');
    assert.equal(mat('Eyes').alphaMode, undefined, 'eyes opaque: they write depth, so the goo over them never hides them');
    assert.equal(mat('Bubbles').alphaMode, undefined, 'bubbles opaque');
    assert.equal(json.images.length, 2, 'two pictures: the ramp and its glow');
    assert.ok(mat('Goo').emissiveTexture && Array.isArray(mat('Goo').emissiveFactor), 'the glow is a standard emissive picture');
    assert.ok(mat('Mouth'), 'a goo person has a mouth');
    assert.deepEqual(json.animations.map(a => a.name), ['Idle', 'Walk', 'Attack', 'Hit', 'Death', 'Talk']);
    for (const a of json.animations) {
        const paths = new Set(a.channels.map(c => c.target.path));
        for (const p of ['rotation', 'translation', 'scale']) assert.ok(paths.has(p), a.name + ' has ' + p);
        for (const c of a.channels) {
            const out = json.accessors[a.samplers[c.sampler].output];
            assert.equal(out.type, c.target.path === 'rotation' ? 'VEC4' : 'VEC3', a.name + ' ' + c.target.path);
        }
    }
    assert.equal(json.skins[0].joints.length, result.bones.length);
    // The goo's mesh comes after the eyes', its core's triangles first: drawn behind the shell in any reader.
    const order = json.meshes.map(m => m.name);
    assert.ok(order.indexOf('Eyes') < order.indexOf('Goo'));
    // model.json: a wet surface, and no rig (only the file's own clips play).
    assert.ok(result.sidecar.surface && result.sidecar.surface.reflect > 0 && result.sidecar.surface.texture === 1);
    assert.ok(!result.sidecar.rig);
});

test('budgets: triangles, pictures and build time stay small', () => {
    for (const recipe of [BLOB, PERSON, { form: 0.5, feelers: 'tendrils', bubbles: 1, bubbleSize: 1, size: 2.5 }]) {
        const save = Model.build(pack, Object.assign({ plan: 'slime' }, recipe), {}, { quality: 'save' });
        const preview = Model.build(pack, Object.assign({ plan: 'slime' }, recipe), {}, { quality: 'preview' });
        assert.ok(triangles(save) < 30000, 'saved triangles ' + triangles(save));
        assert.ok(triangles(preview) < 32000, 'view triangles ' + triangles(preview));
        const bytes = Object.values(save.textures).reduce((s, t) => s + t.width * t.height * 4, 0);
        assert.ok(bytes <= 8192, 'pictures ' + bytes + ' bytes');
        assert.ok(save.bones.length <= 30, 'bones ' + save.bones.length);
    }
});

test('random Slimefolk differ and are all sound', () => {
    const seen = new Set();
    for (let seed = 1; seed <= 6; seed++) {
        const r = Slime.randomRecipe(seed);
        seen.add(JSON.stringify([r.color, r.form.toFixed(2)]));
        assertSound(Model.build(pack, r, {}, { quality: 'preview' }), 'seed ' + seed);
    }
    assert.ok(seen.size >= 5, 'seeds differ');
    const kept = Slime.randomRecipe(77, { form: 0.9, size: 1.3 }, 'colors');
    assert.equal(kept.form, 0.9, 'Colors keeps the shape');
    assert.equal(kept.size, 1.3);
});

test('the species controls edit real recipe paths', () => {
    const paths = [];
    const stub = { _section: () => '', _slider: s => { paths.push(s.path); return ''; }, _color: p => { paths.push(p); return ''; }, _select: p => { paths.push(p); return ''; } };
    Slime.panel(stub);
    const r = Slime.normalizeRecipe({});
    for (const p of paths) assert.notEqual(p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), r), undefined, p);
    assert.ok(paths.includes('form') && paths.includes('translucency') && paths.includes('glow') && paths.includes('bubbles') && paths.includes('bubbleSize') && paths.includes('color') && paths.includes('core'));
});

test('a goo person: legs apart to the knee then melting together, a mouth, drips, a faint face; a blob has none of it', () => {
    const person = Model.build(pack, { plan: 'slime', form: 1 }, {}, { quality: 'preview' }), blob = Model.build(pack, { plan: 'slime', form: 0 }, {}, { quality: 'preview' });
    const goo = person.parts.find(p => p.name === 'Goo'), P = goo.positions;
    // Between the thighs (mid-thigh, middle of the body) there is no goo; between the ankles it has run together.
    let gapThigh = true, joinedShin = false;
    for (let i = 0; i < P.length; i += 3) {
        if (Math.abs(P[i]) < 0.015 && Math.abs(P[i + 2]) < 0.04 && P[i + 1] > 0.5 && P[i + 1] < 0.6) gapThigh = false;
        if (Math.abs(P[i]) < 0.015 && P[i + 2] > 0.04 && P[i + 1] > 0.12 && P[i + 1] < 0.22) joinedShin = true;
    }
    assert.ok(gapThigh, 'thighs apart');
    assert.ok(joinedShin, 'shins melted together above the puddle');
    assert.ok(person.parts.some(p => p.name === 'Mouth') && !blob.parts.some(p => p.name === 'Mouth'), 'a mouth on the person only');
    // The drips hang below the hands, the elbows and the chin.
    const handBone = person.bones.find(b => b.name === 'LeftHand');
    let lowest = Infinity;
    for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i] - handBone.head[0]) < 0.06) lowest = Math.min(lowest, P[i + 1]);
    assert.ok(lowest < handBone.head[1] - 0.15, 'the hand runs down into a drip ' + (handBone.head[1] - lowest));
});

test('Talk opens the mouth on each syllable, the goo swelling with it; the melt leaves the eyes round as they sink', () => {
    const r = Model.build(pack, { plan: 'slime', form: 1 }, {}, { quality: 'preview' });
    const talk = r.clips.find(c => c.name === 'Talk'), n = talk.times.length;
    const mouth = r.bones.findIndex(b => b.name === 'Mouth'), base = r.bones.findIndex(b => b.name === 'Base');
    const ms = talk.tracks.find(t => t.bone === mouth && t.path === 'scale'), bs = talk.tracks.find(t => t.bone === base && t.path === 'scale');
    const open = Array.from({ length: n }, (_, i) => ms.values[i * 3 + 1]), swell = Array.from({ length: n }, (_, i) => bs.values[i * 3 + 1]);
    assert.ok(Math.max(...open) > 3 && Math.min(...open) < 1.2, 'the mouth opens and shuts');
    // In step: the more open the mouth, the more the goo swells (a moment after).
    const mean = x => x.reduce((p, q) => p + q, 0) / x.length;
    const corrAt = lag => {
        const a = open.slice(0, n - lag), b = swell.slice(lag), ma = mean(a), mb = mean(b);
        return a.reduce((sum, x, i) => sum + (x - ma) * (b[i] - mb), 0) / Math.sqrt(a.reduce((s2, x) => s2 + (x - ma) ** 2, 0) * b.reduce((s2, y) => s2 + (y - mb) ** 2, 0));
    };
    const corr = Math.max(corrAt(0), corrAt(1), corrAt(2));
    assert.ok(corr > 0.85, 'swell follows the mouth within a frame or two ' + corr);
    // The melt: the eyes' size in the world is round all the way down, and small at the end.
    const death = r.clips.find(c => c.name === 'Death'), m = death.times.length;
    const chain = ['Base', 'Body', 'Chest', 'Head', 'LeftEye'].map(name => r.bones.findIndex(b => b.name === name));
    for (const i of [Math.floor(m / 2), m - 1]) {
        const world = [1, 1, 1];
        for (const bone of chain) { const t = death.tracks.find(x => x.bone === bone && x.path === 'scale'); if (t) for (let k = 0; k < 3; k++) world[k] *= t.values[i * 3 + k]; }
        assert.ok(world[1] / world[0] > 0.75 && world[1] / world[0] < 1.33, 'round, not a disc: ' + world);
        if (i === m - 1) assert.ok(world[0] < 0.1, 'sunk away: ' + world);
    }
});

test('while a slider is dragged a coarse goo is quick; once let go the whole one comes, and a draft never replaces what the view has', () => {
    const draftT = Date.now(), draft = Model.build(pack, { plan: 'slime', form: 0.77 }, {}, { quality: 'preview', draft: true });
    const draftMs = Date.now() - draftT;
    const full = Model.build(pack, { plan: 'slime', form: 0.77 }, {}, { quality: 'preview' });
    assert.ok(triangles(draft) < triangles(full) * 0.6, 'coarser ' + triangles(draft) + ' / ' + triangles(full));
    assertSound(draft, 'draft');
    assert.deepEqual(draft.clips.map(c => c.name), full.clips.map(c => c.name), 'the same moves');
    assert.deepEqual(draft.bones.map(b => b.name), full.bones.map(b => b.name), 'the same skeleton');
    // The whole shape known: a draft build (a color dragged) uses it.
    const again = Model.build(pack, { plan: 'slime', form: 0.77, color: '#3c78e8' }, {}, { quality: 'preview', draft: true });
    assert.equal(triangles(again), triangles(full));
    assert.ok(draftMs < 400, 'draft ' + draftMs + ' ms');
});
