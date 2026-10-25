'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const Q = require('./helpers/character-quality-matrix.cjs');
const Cloth = require('../src/forge/Character3D/CharacterCloth.js');
const Poses = require('../src/forge/Character3D/CharacterPoses.js');
const Skin = require('../src/forge/Character3D/CharacterSkin.js');
const Gear = require('../src/forge/Character3D/CreatureGear.js');
let pack, eyeSource;
test.before(async () => {
    pack = await Q.Body.loadPack();
    const image = require('pngjs').PNG.sync.read(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/data/eye-brown.png')));
    eyeSource = { width: image.width, height: image.height, data: new Uint8Array(image.data) };
});
const options = () => ({ quality: 'preview', skinSize: 32, eyeSource });
const bare = (gender, patch = {}) => Q.Model.normalize({ age: 32, gender, outfit: [], hair: { style: 'bald' }, ...patch });
const species = (id, gender = 1, patch = {}) => ({ ...Q.Model.withSpecies({ age: 32, gender }, id), outfit: [], hair: { style: 'bald' }, ...patch });
function boundaries(part) {
    const edges = new Map(), bind = part.interpolation;
    const keys = Array.from({ length: part.positions.length / 3 }, (_, i) => {
        const terms = [];
        for (let j = bind.offsets[i]; j < bind.offsets[i + 1]; j++) terms.push([bind.vertices[j], bind.weights[j]]);
        return JSON.stringify(terms.sort((a, b) => a[0] - b[0]));
    });
    for (let t = 0; t < part.index.length; t += 3) for (let k = 0; k < 3; k++) {
        const a = part.index[t + k], b = part.index[t + (k + 1) % 3], key = [keys[a], keys[b]].sort().join(':');
        const e = edges.get(key) || { a, b, count: 0 }; e.count++; edges.set(key, e);
    }
    return [...edges.values()].filter(e => e.count === 1);
}

test('pelvis detail shares unsplit body edges throughout wall climbing, crouching and walking', () => {
    for (const patch of [{}, { weight: 2, cup: 2 }, { height: -0.6, shapes: { hips: 1.5 } }]) {
        const b = Q.Model.build(pack, bare(0, { ...patch, anatomy: { detail: true } }), {}, options());
        const body = b.parts.find(p => p.name === 'Body'), detail = b.parts.find(p => p.name === 'Genital detail');
        const edges = boundaries(detail), bind = detail.interpolation;
        const bodyEdges = new Set();
        for (let t = 0; t < body.index.length; t += 3) for (let k = 0; k < 3; k++) bodyEdges.add([pack.body.source[body.index[t + k]], pack.body.source[body.index[t + (k + 1) % 3]]].sort((a, b) => a - b).join(':'));
        assert.ok(edges.length > 20);
        const originals = new Map(Array.from(pack.body.source, (v, i) => [v, i]));
        for (const e of edges) {
            const vertices = [e.a, e.b].map(i => {
                assert.equal(bind.offsets[i + 1] - bind.offsets[i], 1, 'no skinned T junction at the coarse edge');
                return bind.vertices[bind.offsets[i]];
            });
            assert.ok(bodyEdges.has(vertices.sort((a, b) => a - b).join(':')), 'both surfaces use the same complete edge');
        }
        for (const pose of ['climbWall', 'climbLadder', 'crouch', 'walk']) {
            const clip = Poses.clip(b.bones, pose, body);
            for (const fraction of [0, 0.2, 0.5, 0.8]) {
                const ps = Cloth.pose(b.bones, clip, clip.times.at(-1) * fraction), posedBody = Cloth.skin(body, b.bones, ps), posedDetail = Cloth.skin(detail, b.bones, ps);
                let gap = 0;
                for (const e of edges) for (const i of [e.a, e.b]) {
                    const at = originals.get(bind.vertices[bind.offsets[i]]);
                    for (let k = 0; k < 3; k++) gap = Math.max(gap, Math.abs(posedBody[at * 3 + k] - posedDetail[i * 3 + k]));
                }
                assert.ok(gap < 2e-7, `${pose}/${fraction}: ${gap} m boundary gap`);
            }
        }
        assert.deepEqual(Q.inspect(b, { recipe: b.recipe }, pack).issues, []);
    }
});

test('navels have connected geometry and readable pigment with optional anatomical detail disabled', () => {
    const v = Q.Body.anatomyFields(pack).navel;
    for (const gender of [0, 1]) for (const weight of [0.5, 2]) {
        const recipe = bare(gender, { weight }), b = Q.Model.build(pack, recipe, {}, options());
        assert.equal(b.recipe.anatomy.detail, false);
        const P = b.built.shaped, nb = Q.Body.neighbors(pack), ids = Array.from(nb.flat.subarray(nb.offsets[v], nb.offsets[v + 1]));
        assert.ok(P[v * 3 + 2] < ids.reduce((s, i) => s + P[i * 3 + 2], 0) / ids.length - 0.001, 'an actual depression in the abdominal skin');
        const picture = Skin.paint(pack, recipe.skin, recipe.skinPattern, { size: 512 });
        const at = Array.from(pack.body.source).indexOf(v), uv = pack.body.uv;
        const x = Math.floor(uv[at * 2] * 512), y = Math.floor(uv[at * 2 + 1] * 512);
        const luminance = (dx, dy) => { const k = ((y + dy) * 512 + x + dx) * 4; return picture.data[k] + picture.data[k + 1] + picture.data[k + 2]; };
        let dark = Infinity;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) dark = Math.min(dark, luminance(dx, dy));
        assert.ok(dark < luminance(9, 0) * 0.85, 'the recess remains visible without baked occlusion');
    }
});

test('insectfolk have four articulated arms, two legs and matching motion tracks for the second pair', async () => {
    for (const gender of [0, 1]) {
        const b = Q.Model.build(pack, species('insectfolk', gender), {}, options());
        assert.ok(b.parts.some(p => p.name === 'Secondary arms'));
        assert.equal(b.bones.filter(b => /^(Left|Right)(Secondary)?Arm$/.test(b.name)).length, 4);
        assert.equal(b.bones.filter(b => /^(Left|Right)UpLeg$/.test(b.name)).length, 2);
        assert.equal(b.bones.filter(b => b.motionSource).length, 8);
        for (const side of ['Left', 'Right']) for (const name of ['Arm', 'ForeArm', 'Hand']) {
            const length = bone => Math.hypot(...bone.tail.map((v, k) => v - bone.head[k]));
            const primary = b.bones.find(b => b.name === side + name), secondary = b.bones.find(b => b.name === side + 'Secondary' + name);
            assert.ok(Math.abs(length(primary) - length(secondary)) < 1e-6, 'full-sized secondary ' + name);
        }
        assert.deepEqual(Q.inspect(b, { recipe: b.recipe }, pack).issues, []);
        for (const id of ['walk', 'climbWall']) {
            const clip = Poses.clip(b.bones, id, b.parts[0]);
            for (const [i, bone] of b.bones.entries()) if (bone.motionSource) {
                const source = b.bones.findIndex(b => b.name === bone.motionSource), track = clip.tracks.find(t => t.bone === i), original = clip.tracks.find(t => t.bone === source);
                assert.ok(track && original, `${id}/${bone.name}`);
                assert.equal(track.values === original.values, true, 'reuse immutable source rotations without copying buffers');
            }
            const secondary = b.parts.find(p => p.name === 'Secondary arms'), clipEnd = clip.times.at(-1);
            const start = Cloth.skin(secondary, b.bones, Cloth.pose(b.bones, clip, 0)), end = Cloth.skin(secondary, b.bones, Cloth.pose(b.bones, clip, clipEnd * 0.35));
            let distance = 0;
            for (let i = 0; i < start.length; i++) distance = Math.max(distance, Math.abs(start[i] - end[i]));
            assert.ok(distance > 0.015, 'the extra limbs animate');
        }
        const clips = Poses.gameClips(b.bones, b.parts[0], 'useful');
        const arm = b.bones.findIndex(b => b.name === 'LeftSecondaryArm');
        assert.ok(clips.every(c => c.tracks.some(t => t.bone === arm)), 'saved game clips include secondary chains');
        const human = Q.Model.withSpecies(b.recipe, 'human');
        assert.equal(human.features.arms.type, 'none');
    }
});

test('android crown stays joined to the opaque head, contains circuitry, and exports transparent skinned materials', async () => {
    for (const gender of [0, 1]) for (const patch of [{}, { headSize: 1.5, weight: 1.5 }]) {
        const b = Q.Model.build(pack, species('android', gender, patch), {}, options());
        assert.deepEqual(Q.inspect(b, { recipe: b.recipe }, pack).issues, []);
        const cap = b.parts.find(p => p.name === 'Transparent cranial shell'), body = b.parts[0];
        assert.ok(cap && cap.opacity > 0 && cap.opacity < 0.4 && cap.index.length > 100);
        for (const name of ['Circuit brain', 'Android mechanisms', 'Android circuitry']) assert.ok(b.parts.some(p => p.name === name));
        const panels = b.parts.find(p => p.name === 'Recessed android panels');
        assert.ok(panels && panels.index.length > 100);
        const originals = new Map(Array.from(pack.body.source, (v, i) => [v, i]));
        const visible = new Set(Array.from(body.index, i => pack.body.source[i]));
        let internal = 0;
        for (let i = 0; i < panels.source.length; i++) {
            const at = originals.get(panels.source[i]);
            assert.equal(panels.positions[i * 3], body.positions[at * 3]);
            assert.equal(panels.positions[i * 3 + 1], body.positions[at * 3 + 1]);
            const depth = body.positions[at * 3 + 2] - panels.positions[i * 3 + 2];
            assert.ok(depth > 0.006 && depth < 0.025, 'electronics sit inside the original skin');
            if (!visible.has(panels.source[i])) internal++;
        }
        assert.ok(internal > 10, 'apertures remove the original covering triangles');
        const eyes = b.built.parts.find(p => p.name === 'Eyes');
        let eyeY = 0;
        for (let i = 1; i < eyes.positions.length; i += 3) eyeY += eyes.positions[i] / (eyes.positions.length / 3);
        const mechanics = b.parts.find(p => p.name === 'Android mechanisms'), head = b.bones.findIndex(b => b.name === 'Head');
        for (let i = 0; i < mechanics.positions.length / 3; i++) if (mechanics.joints[i * 4] === head && mechanics.weights[i * 4] > 0.99)
            assert.ok(mechanics.positions[i * 3 + 1] > eyeY + 0.005, 'no hardware or wires protruding beside the eyes');
        const capEdges = new Map();
        for (let t = 0; t < cap.index.length; t += 3) for (let k = 0; k < 3; k++) {
            const a = cap.index[t + k], c = cap.index[t + (k + 1) % 3], key = [cap.source[a], cap.source[c]].sort((a, b) => a - b).join(':');
            const edge = capEdges.get(key) || { a, c, n: 0 }; edge.n++; capEdges.set(key, edge);
        }
        let joined = 0, level = null;
        const original = new Map(Array.from(pack.body.source, (v, i) => [v, i]));
        for (const edge of capEdges.values()) if (edge.n === 1) for (const i of [edge.a, edge.c]) {
            for (let k = 0; k < 3; k++) assert.equal(cap.positions[i * 3 + k], body.positions[original.get(cap.source[i]) * 3 + k]);
            level ??= cap.positions[i * 3 + 1];
            assert.ok(Math.abs(level - cap.positions[i * 3 + 1]) < 1e-6, 'smooth level rim'); joined++;
        }
        assert.ok(joined > 20);
        if (gender === 1 && !patch.headSize) {
            const data = await Q.Model.toGlb(b, 'Android', () => new Uint8Array([137, 80, 78, 71]));
            const n = new DataView(data.buffer, data.byteOffset).getUint32(12, true), json = JSON.parse(Buffer.from(data.subarray(20, 20 + n)).toString());
            const material = json.materials.find(m => m.name === cap.name);
            assert.equal(material.alphaMode, 'BLEND');
            assert.ok(json.meshes.find(m => m.name === cap.name).primitives[0].attributes.JOINTS_0 != null);
        }
    }
});

test('royal embroidery and segmented war barding use bounded, skinned geometry on horse and wolf bodies', () => {
    for (const kind of ['horse', 'wolf']) for (const preset of ['royal', 'war']) {
        const r = Q.Model.normalize({ plan: 'quadruped', ...Q.Creature.kindRecipe(kind), gear: Gear.presetGear(preset).filter(g => Gear.fits(g.id, Q.Creature.kindRecipe(kind))) });
        const b = Q.Model.build(pack, r, {}, { quality: 'preview', hairBudget: 0 });
        assert.deepEqual(Q.inspect(b, { recipe: r }, pack).issues, []);
        const gear = b.parts.filter(p => p.name.startsWith('Gear '));
        const triangles = gear.reduce((s, p) => s + p.index.length / 3, 0);
        assert.ok(triangles > 10000 && triangles < 65000, `${kind}/${preset}: ${triangles} gear triangles`);
        for (const p of gear) assert.ok(p.joints.length === p.positions.length / 3 * 4 && p.weights.length === p.joints.length);
        const clip = Q.Creature.poseClip(b.bones, 'walk', r);
        assert.ok(clip);
        for (const p of gear) assert.ok(Cloth.skin(p, b.bones, Cloth.pose(b.bones, clip, clip.times.at(-1) * 0.3)).every(Number.isFinite));
    }
});


test('fairy and insect wings taper to a single rounded tip with a veined membrane', () => {
    for (const id of ['fairy', 'insectfolk']) {
        const b = Q.Model.build(pack, species(id, 0), {}, options()), wings = b.parts.find(p => p.name === 'Wings');
        assert.ok(wings && wings.texture === 'fairywing.png' && b.textures[wings.texture]);
        assert.equal(wings.positions.length / 3, 4 * (32 * 13 + 1));
        for (let wing = 0; wing < 4; wing++) {
            const tip = wing * 417 + 416;
            let triangles = 0;
            for (let t = 0; t < wings.index.length; t += 3) if ([0, 1, 2].some(k => wings.index[t + k] === tip)) triangles++;
            assert.equal(triangles, 12, 'the full membrane closes at one tip');
        }
        assert.deepEqual(Q.inspect(b, { recipe: b.recipe }, pack).issues, []);
    }
});

test('Ferengi nose folds refine connected skin, preserve eyes and clear when changing species', () => {
    for (const gender of [0, 1]) {
        const recipe = species('ferengi', gender), b = Q.Model.build(pack, recipe, {}, options());
        assert.ok(recipe.morph.noseFolds > 0);
        const detail = b.parts.find(p => p.name === 'Forehead detail');
        assert.ok(detail && detail.index.length / 3 <= 12800, 'bounded finer bridge and brow folds');
        const actual = Q.Body.shape(pack, recipe), plain = Q.Body.shape(pack, { ...recipe, morph: { ...recipe.morph, noseFolds: 0 } });
        let displacement = 0;
        for (let i = 2; i < plain.length; i += 3) displacement = Math.max(displacement, Math.abs(actual[i] - plain[i]));
        assert.ok(displacement > 0.002);
        for (const v of Q.Body.headFields(pack).eyeIds) for (let k = 0; k < 3; k++) assert.equal(actual[v * 3 + k], plain[v * 3 + k]);
        assert.equal(Q.Model.withSpecies(recipe, 'human').morph.noseFolds, 0);
    }
});
